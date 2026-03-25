"""
Standalone MQTT subscriber service for the IoT Platform.
Connects to a Mosquitto broker and processes incoming telemetry and status
messages from IoT devices. Runs as a persistent background service.

Usage:
    python mqtt_service.py
"""

import json
import logging
import threading
import time
from datetime import datetime, timezone, timedelta

import paho.mqtt.client as mqtt

import config

# Configure module-level logger
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("mqtt_service")

# How long a device can go without a status update before being marked offline
OFFLINE_THRESHOLD_MINUTES = 5

# How often the offline-checker runs (in seconds)
OFFLINE_CHECK_INTERVAL = 60


# ---------------------------------------------------------------------------
# Topic parsing helper
# ---------------------------------------------------------------------------

def parse_topic(topic):
    """
    Parse an MQTT topic of the form:
        {facility}/{building}/{unit}/{device_name}/{message_type}
    Returns a dict with the parsed components, or None if the format is invalid.
    """
    parts = topic.split("/")
    if len(parts) != 5:
        logger.warning("Unexpected topic format (expected 5 parts): %s", topic)
        return None

    return {
        "facility": parts[0],
        "building": parts[1],
        "unit": parts[2],
        "device_name": parts[3],
        "message_type": parts[4],
    }


# ---------------------------------------------------------------------------
# MQTT callback handlers
# ---------------------------------------------------------------------------

def on_connect(client, userdata, flags, reason_code, properties=None):
    """
    Called when the client connects to the MQTT broker.
    Subscribes to telemetry and status topics using wildcards.
    Re-subscribes on every connect so subscriptions survive reconnects.
    """
    if reason_code == 0:
        logger.info("Connected to MQTT broker at %s:%s", config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT)
        # +/+/+/+ matches any four-level prefix (facility/building/unit/device)
        client.subscribe("+/+/+/+/telemetry")
        client.subscribe("+/+/+/+/status")
        logger.info("Subscribed to +/+/+/+/telemetry and +/+/+/+/status")
    else:
        logger.error("MQTT connection failed with reason code: %s", reason_code)


def on_disconnect(client, userdata, flags, reason_code, properties=None):
    """Log disconnection events. Paho will auto-reconnect if loop_forever is used."""
    logger.warning("Disconnected from MQTT broker (reason code: %s). Will attempt reconnect.", reason_code)


def on_message(client, userdata, msg):
    """
    Dispatch incoming messages to the appropriate handler based on topic suffix.
    Uses Flask app context so SQLAlchemy can access the database.
    """
    # Import here to avoid circular imports at module load time
    from app import app
    from models import db, Device, Telemetry

    parsed = parse_topic(msg.topic)
    if not parsed:
        return  # Malformed topic, already logged in parse_topic

    message_type = parsed["message_type"]

    # Use the Flask application context for database access
    with app.app_context():
        if message_type == "telemetry":
            _handle_telemetry(db, Device, Telemetry, parsed, msg.payload)
        elif message_type == "status":
            _handle_status(db, Device, parsed, msg.payload)
        else:
            logger.debug("Ignoring message with unknown type: %s", message_type)


# ---------------------------------------------------------------------------
# Message handlers
# ---------------------------------------------------------------------------

def _handle_telemetry(db, Device, Telemetry, parsed, raw_payload):
    """
    Process a telemetry message:
    1. Look up the device by its location fields.
    2. If found, insert a new Telemetry record with the JSON payload.
    3. If device not found, log a warning but don't crash.
    """
    device = Device.query.filter_by(
        facility=parsed["facility"],
        building=parsed["building"],
        unit=parsed["unit"],
        device_name=parsed["device_name"],
    ).first()

    if not device:
        logger.warning(
            "Telemetry received for unknown device: %s/%s/%s/%s",
            parsed["facility"], parsed["building"], parsed["unit"], parsed["device_name"],
        )
        return

    # Parse the payload as JSON; store raw string if parsing fails
    try:
        payload_data = json.loads(raw_payload)
    except (json.JSONDecodeError, TypeError):
        logger.warning("Non-JSON telemetry payload from %s, storing as raw string", parsed["device_name"])
        payload_data = {"raw": raw_payload.decode("utf-8", errors="replace") if isinstance(raw_payload, bytes) else str(raw_payload)}

    # Ensure test_mode flag is preserved at top level of stored payload
    is_test = payload_data.get("test_mode", False) if isinstance(payload_data, dict) else False
    if is_test:
        logger.info(
            "[TEST] Storing test-mode telemetry for device %s",
            device.device_name,
        )

    # Insert the telemetry record
    record = Telemetry(
        device_id=device.id,
        payload=payload_data,
    )
    db.session.add(record)
    db.session.commit()

    logger.debug("Stored telemetry for device %s (id=%s)%s",
                 device.device_name, device.id,
                 " [TEST]" if is_test else "")


def _handle_status(db, Device, parsed, raw_payload):
    """
    Process a status message:
    Update the device's last_seen timestamp and mark it as online.
    If device not found, log a warning.
    """
    device = Device.query.filter_by(
        facility=parsed["facility"],
        building=parsed["building"],
        unit=parsed["unit"],
        device_name=parsed["device_name"],
    ).first()

    if not device:
        logger.warning(
            "Status received for unknown device: %s/%s/%s/%s",
            parsed["facility"], parsed["building"], parsed["unit"], parsed["device_name"],
        )
        return

    # Update the device status fields
    device.last_seen = datetime.now(timezone.utc)
    device.is_online = True
    db.session.commit()

    logger.debug("Updated status for device %s -- marked online", device.device_name)


# ---------------------------------------------------------------------------
# Background offline checker
# ---------------------------------------------------------------------------

def _offline_checker():
    """
    Periodically scan all devices and mark any as offline if their
    last_seen timestamp is older than the threshold.
    Runs in a background thread on a fixed interval.
    """
    from app import app
    from models import db, Device

    logger.info(
        "Offline checker started (threshold=%d min, interval=%d sec)",
        OFFLINE_THRESHOLD_MINUTES, OFFLINE_CHECK_INTERVAL,
    )

    while True:
        time.sleep(OFFLINE_CHECK_INTERVAL)

        try:
            with app.app_context():
                threshold = datetime.now(timezone.utc) - timedelta(minutes=OFFLINE_THRESHOLD_MINUTES)

                # Find devices that are marked online but haven't been seen recently
                stale_devices = Device.query.filter(
                    Device.is_online == True,  # noqa: E712 -- SQLAlchemy requires == for filters
                    Device.last_seen < threshold,
                ).all()

                if stale_devices:
                    for device in stale_devices:
                        device.is_online = False
                        logger.info("Marked device '%s' as offline (last seen: %s)", device.device_name, device.last_seen)
                    db.session.commit()
        except Exception as exc:
            # Don't let the checker thread die on transient errors
            logger.error("Offline checker encountered an error: %s", exc)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main():
    """
    Start the MQTT subscriber service:
    1. Launch the offline checker in a background daemon thread.
    2. Connect to the MQTT broker with automatic reconnection.
    3. Block on loop_forever() -- the service runs until terminated.
    """
    # Start the background thread that marks devices as offline
    checker_thread = threading.Thread(target=_offline_checker, daemon=True)
    checker_thread.start()

    # Create the MQTT client (paho-mqtt v2 API uses CallbackAPIVersion)
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="iot-platform-backend",
    )

    # Register callback handlers
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message

    # Enable automatic reconnection (paho handles backoff internally)
    client.reconnect_delay_set(min_delay=1, max_delay=30)

    logger.info("Connecting to MQTT broker at %s:%s ...", config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT)

    try:
        client.connect(config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT, keepalive=60)
    except ConnectionRefusedError:
        logger.error(
            "Could not connect to MQTT broker at %s:%s. "
            "Make sure Mosquitto is running. Retrying...",
            config.MQTT_BROKER_HOST, config.MQTT_BROKER_PORT,
        )

    # Blocking loop -- processes network events and dispatches callbacks.
    # Automatically reconnects if the connection drops.
    client.loop_forever()


if __name__ == "__main__":
    main()
