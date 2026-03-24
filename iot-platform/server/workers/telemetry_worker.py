"""
TelemetryWorker -- processes incoming telemetry messages.

Responsibilities:
- Parse and validate telemetry payloads
- Write telemetry records to the database
- Update in-memory DeviceState
- Trigger automation engine evaluation
- Check alert conditions
"""

import logging
import threading

from db.connection import get_session
from models.telemetry import Telemetry

logger = logging.getLogger(__name__)


class TelemetryWorker:
    """
    Daemon thread worker that consumes telemetry messages from a Queue.
    """

    def __init__(self, queue, device_state_manager, engine, alert_manager):
        """
        Args:
            queue: threading.Queue with telemetry messages.
            device_state_manager: DeviceStateManager instance.
            engine: AutomationEngine instance.
            alert_manager: AlertManager instance.
        """
        self._queue = queue
        self._state_manager = device_state_manager
        self._engine = engine
        self._alert_manager = alert_manager
        self._thread = None
        self._running = False

    def start(self):
        """Start the worker thread."""
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="telemetry-worker")
        self._thread.start()
        logger.info("TelemetryWorker started")

    def stop(self):
        """Signal the worker to stop."""
        self._running = False

    def _run(self):
        """Main worker loop -- blocks on queue.get()."""
        while self._running:
            try:
                message = self._queue.get(timeout=1.0)
            except Exception:
                # Queue.get timeout -- loop back and check self._running
                continue

            try:
                self._process(message)
            except Exception:
                logger.exception("Error processing telemetry message")
            finally:
                self._queue.task_done()

    def _process(self, message):
        """Process a single telemetry message."""
        payload = message.get("payload", {})
        device_id = message.get("device_id")
        parsed = message.get("parsed", {})
        device_key = message.get("device_key")
        message_type = parsed.get("message_type", "telemetry")

        # Handle alert messages routed here
        if message_type == "alert":
            self._handle_device_alert(device_id, payload)
            return

        if not device_id:
            logger.warning(
                "Telemetry from unknown device: %s/%s/%s/%s",
                parsed.get("facility"), parsed.get("building"),
                parsed.get("unit"), parsed.get("device_name"),
            )
            return

        # Validate payload
        if not isinstance(payload, dict):
            logger.warning("Invalid telemetry payload for device %s: not a dict", device_id)
            return

        # Write to database
        self._write_to_db(device_id, payload)

        # Update in-memory state
        device_info = {
            "device_name": parsed.get("device_name"),
            "facility": parsed.get("facility"),
            "building": parsed.get("building"),
            "unit": parsed.get("unit"),
        }
        self._state_manager.update_from_telemetry(device_id, payload, device_info)

        # Run automation rules
        self._engine.evaluate(device_id)

        # Check for temperature alert resolution
        self._check_alert_resolution(device_id, payload)

    def _write_to_db(self, device_id, payload):
        """Write a telemetry record to the database."""
        session = get_session()
        try:
            record = Telemetry(
                device_id=device_id,
                payload=payload,
            )
            session.add(record)
            session.commit()
        except Exception:
            session.rollback()
            logger.exception("Failed to write telemetry for device %s", device_id)
        finally:
            session.close()

    def _handle_device_alert(self, device_id, payload):
        """Handle an alert message originating from the device itself."""
        if not device_id:
            return
        alert_type = payload.get("alert_type", "device_alert")
        message = payload.get("message", str(payload))
        self._alert_manager.create_alert(device_id, alert_type, message)

    def _check_alert_resolution(self, device_id, payload):
        """
        Check if conditions have returned to normal and resolve alerts.
        """
        state = self._state_manager.get_state(device_id)
        if not state:
            return

        # Resolve temp_high if temperature is back in range
        if state.temperature_c is not None and state.temperature_c <= 30.0:
            self._alert_manager.resolve_alert(device_id, "temp_high")

        # Resolve temp_low if temperature is back in range
        if state.temperature_c is not None and state.temperature_c >= 18.0:
            self._alert_manager.resolve_alert(device_id, "temp_low")
