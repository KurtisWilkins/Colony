"""
FlowWorker -- processes flow sensor messages and manages water usage sessions.

Responsibilities:
- Track valve open/close events
- Create and close WaterUsageSession records
- Update DeviceState with flow data
"""

import logging
import threading
from datetime import datetime, timezone

from db.connection import get_session
from models.water_usage import WaterUsageSession

logger = logging.getLogger(__name__)


class FlowWorker:
    """
    Daemon thread worker that consumes flow messages from a Queue
    and manages the lifecycle of water usage sessions.
    """

    def __init__(self, queue, device_state_manager):
        """
        Args:
            queue: threading.Queue with flow messages.
            device_state_manager: DeviceStateManager instance.
        """
        self._queue = queue
        self._state_manager = device_state_manager
        self._thread = None
        self._running = False
        # Track active sessions: device_id -> session_id
        self._active_sessions = {}
        self._session_lock = threading.Lock()

    def start(self):
        """Start the worker thread."""
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="flow-worker")
        self._thread.start()
        logger.info("FlowWorker started")

    def stop(self):
        """Signal the worker to stop."""
        self._running = False

    def _run(self):
        """Main worker loop."""
        while self._running:
            try:
                message = self._queue.get(timeout=1.0)
            except Exception:
                continue

            try:
                self._process(message)
            except Exception:
                logger.exception("Error processing flow message")
            finally:
                self._queue.task_done()

    def _process(self, message):
        """Process a single flow message."""
        payload = message.get("payload", {})
        device_id = message.get("device_id")
        parsed = message.get("parsed", {})

        if not device_id:
            logger.warning("Flow from unknown device: %s", parsed.get("device_name"))
            return

        # Update in-memory state
        device_info = {
            "device_name": parsed.get("device_name"),
            "facility": parsed.get("facility"),
            "building": parsed.get("building"),
            "unit": parsed.get("unit"),
        }
        self._state_manager.update_from_flow(device_id, payload, device_info)

        # Handle session lifecycle
        event_type = payload.get("event")
        valve_open = payload.get("valve_open")

        if event_type == "valve_opened" or (valve_open is True and not self._has_active_session(device_id)):
            self._start_session(device_id, payload)
        elif event_type == "valve_closed" or (valve_open is False and self._has_active_session(device_id)):
            self._end_session(device_id, payload)
        elif self._has_active_session(device_id):
            # Mid-session flow update -- nothing to do at the session level
            logger.debug("Flow update for active session, device %s", device_id)

    def _has_active_session(self, device_id):
        """Check if there's an active (uncompleted) session for this device."""
        with self._session_lock:
            return str(device_id) in self._active_sessions

    def _start_session(self, device_id, payload):
        """Create a new water usage session."""
        device_id_str = str(device_id)
        state = self._state_manager.get_state(device_id_str)

        session = get_session()
        try:
            water_session = WaterUsageSession(
                device_id=device_id,
                trigger_type=payload.get("trigger_type", "manual"),
                trigger_source=payload.get("trigger_source", "flow_event"),
                tank_pct_start=payload.get("tank_pct", state.water_level_pct if state else None),
                completed=False,
            )
            session.add(water_session)
            session.commit()

            with self._session_lock:
                self._active_sessions[device_id_str] = water_session.id

            logger.info(
                "Started water session %d for device %s (trigger: %s)",
                water_session.id, device_id_str, water_session.trigger_type,
            )
        except Exception:
            session.rollback()
            logger.exception("Failed to start water session for device %s", device_id_str)
        finally:
            session.close()

    def _end_session(self, device_id, payload):
        """Close an active water usage session."""
        device_id_str = str(device_id)
        state = self._state_manager.get_state(device_id_str)

        with self._session_lock:
            session_id = self._active_sessions.pop(device_id_str, None)

        if not session_id:
            logger.warning("No active session to close for device %s", device_id_str)
            return

        session = get_session()
        try:
            water_session = session.query(WaterUsageSession).filter_by(id=session_id).first()
            if not water_session:
                logger.warning("Water session %d not found in DB", session_id)
                return

            now = datetime.now(timezone.utc)
            water_session.session_end = now
            water_session.completed = True

            # Calculate duration
            if water_session.session_start:
                delta = now - water_session.session_start
                water_session.duration_s = delta.total_seconds()

            # Update water usage from payload
            water_session.liters_used = payload.get("liters_used", payload.get("total_liters"))
            water_session.tank_pct_end = payload.get("tank_pct", state.water_level_pct if state else None)

            session.commit()
            logger.info(
                "Closed water session %d for device %s (duration=%.1fs, liters=%s)",
                session_id, device_id_str,
                water_session.duration_s or 0,
                water_session.liters_used,
            )
        except Exception:
            session.rollback()
            logger.exception("Failed to close water session %d", session_id)
        finally:
            session.close()

    def get_active_session_id(self, device_id):
        """Return the active session ID for a device, or None."""
        with self._session_lock:
            return self._active_sessions.get(str(device_id))
