"""
MQTT subscriber -- subscribes to wildcard topics and routes messages
to worker queues via non-blocking threading.Queue puts.
"""

import json
import logging
import threading

from mqtt.topics import parse_topic
from db.connection import get_session
from models.device import Device

logger = logging.getLogger(__name__)


class MQTTSubscriber:
    """
    Subscribes to device topics and routes incoming messages to worker queues.

    Wildcard subscriptions:
        +/+/+/+/telemetry
        +/+/+/+/status
        +/+/+/+/flow
        +/+/+/+/alert
        +/+/+/+/ack
    """

    # Topics to subscribe to
    SUBSCRIPTIONS = [
        ("+/+/+/+/telemetry", 1),
        ("+/+/+/+/status", 1),
        ("+/+/+/+/flow", 1),
        ("+/+/+/+/alert", 1),
        ("+/+/+/+/ack", 1),
    ]

    def __init__(self, broker, telemetry_queue, status_queue, flow_queue, command_queue):
        """
        Args:
            broker: MQTTBroker instance.
            telemetry_queue: threading.Queue for telemetry messages.
            status_queue: threading.Queue for status messages.
            flow_queue: threading.Queue for flow messages.
            command_queue: threading.Queue for ack messages (routed to command worker).
        """
        self._broker = broker
        self._telemetry_queue = telemetry_queue
        self._status_queue = status_queue
        self._flow_queue = flow_queue
        self._command_queue = command_queue

        # Cache device lookups: (facility, building, unit, device_name) -> device_id
        self._device_cache = {}
        self._cache_lock = threading.Lock()

    def subscribe(self):
        """Register all wildcard subscriptions with the broker."""
        self._broker.set_message_callback(self._on_message)
        for topic, qos in self.SUBSCRIPTIONS:
            self._broker.add_subscription(topic, qos)
        logger.info("Subscriber registered %d wildcard subscriptions", len(self.SUBSCRIPTIONS))

    def _on_message(self, topic, payload_bytes):
        """Route an incoming message to the appropriate worker queue."""
        parsed = parse_topic(topic)
        if not parsed:
            return

        # Decode payload
        try:
            payload = json.loads(payload_bytes)
        except (json.JSONDecodeError, TypeError):
            payload = {
                "raw": payload_bytes.decode("utf-8", errors="replace")
                if isinstance(payload_bytes, bytes)
                else str(payload_bytes)
            }

        message_type = parsed["message_type"]

        # Look up device_id
        device_key = (parsed["facility"], parsed["building"], parsed["unit"], parsed["device_name"])
        device_id = self._lookup_device_id(device_key)

        message = {
            "topic": topic,
            "parsed": parsed,
            "device_id": device_id,
            "device_key": device_key,
            "payload": payload,
        }

        # Route to appropriate queue (non-blocking)
        try:
            if message_type == "telemetry":
                self._telemetry_queue.put_nowait(message)
            elif message_type == "status":
                self._status_queue.put_nowait(message)
            elif message_type == "flow":
                self._flow_queue.put_nowait(message)
            elif message_type == "alert":
                # Alert messages go to telemetry worker for alert processing
                self._telemetry_queue.put_nowait(message)
            elif message_type == "ack":
                self._command_queue.put_nowait(message)
            else:
                logger.debug("Ignoring unknown message type: %s", message_type)
        except Exception:
            logger.warning("Queue full, dropping %s message for %s", message_type, parsed["device_name"])

    def _lookup_device_id(self, device_key):
        """
        Look up device_id from cache or database.
        Returns UUID or None if device not found.
        """
        with self._cache_lock:
            if device_key in self._device_cache:
                return self._device_cache[device_key]

        # Cache miss -- query database
        try:
            session = get_session()
            device = session.query(Device).filter_by(
                facility=device_key[0],
                building=device_key[1],
                unit=device_key[2],
                device_name=device_key[3],
            ).first()

            device_id = device.id if device else None

            if device_id:
                with self._cache_lock:
                    self._device_cache[device_key] = device_id

            session.close()
            return device_id
        except Exception:
            logger.exception("Error looking up device: %s", device_key)
            return None

    def invalidate_cache(self):
        """Clear the device ID cache."""
        with self._cache_lock:
            self._device_cache.clear()
        logger.info("Device ID cache cleared")
