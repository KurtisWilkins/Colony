"""
StatusWorker -- processes device status heartbeats.

Responsibilities:
- Update device last_seen and is_online in the database
- Track autonomous_mode changes
- Background thread checks all states every 60s for 5-min offline threshold
"""

import logging
import threading
import time
from datetime import datetime, timezone, timedelta

from db.connection import get_session
from models.device import Device

import config

logger = logging.getLogger(__name__)


class StatusWorker:
    """
    Daemon thread worker that consumes status messages from a Queue
    and runs a periodic offline checker.
    """

    def __init__(self, queue, device_state_manager):
        """
        Args:
            queue: threading.Queue with status messages.
            device_state_manager: DeviceStateManager instance.
        """
        self._queue = queue
        self._state_manager = device_state_manager
        self._thread = None
        self._checker_thread = None
        self._running = False

    def start(self):
        """Start the worker and offline checker threads."""
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="status-worker")
        self._thread.start()
        self._checker_thread = threading.Thread(target=self._offline_checker, daemon=True, name="offline-checker")
        self._checker_thread.start()
        logger.info("StatusWorker started (with offline checker)")

    def stop(self):
        """Signal workers to stop."""
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
                logger.exception("Error processing status message")
            finally:
                self._queue.task_done()

    def _process(self, message):
        """Process a single status message."""
        payload = message.get("payload", {})
        device_id = message.get("device_id")
        parsed = message.get("parsed", {})

        if not device_id:
            logger.warning(
                "Status from unknown device: %s/%s/%s/%s",
                parsed.get("facility"), parsed.get("building"),
                parsed.get("unit"), parsed.get("device_name"),
            )
            return

        # Update database
        session = get_session()
        try:
            device = session.query(Device).filter_by(id=device_id).first()
            if device:
                device.last_seen = datetime.now(timezone.utc)
                device.is_online = True
                session.commit()
                logger.debug("Updated status for device %s -- marked online", device.device_name)
            else:
                logger.warning("Status for device_id %s not found in DB", device_id)
        except Exception:
            session.rollback()
            logger.exception("Failed to update status for device %s", device_id)
        finally:
            session.close()

        # Update in-memory state
        device_info = {
            "device_name": parsed.get("device_name"),
            "facility": parsed.get("facility"),
            "building": parsed.get("building"),
            "unit": parsed.get("unit"),
        }
        old_state = self._state_manager.get_state(device_id)
        old_autonomous = old_state.autonomous_mode if old_state else None

        self._state_manager.update_from_status(device_id, payload, device_info)

        # Log autonomous mode changes
        new_state = self._state_manager.get_state(device_id)
        if old_autonomous is not None and new_state and new_state.autonomous_mode != old_autonomous:
            logger.info(
                "Device %s autonomous_mode changed: %s -> %s",
                parsed.get("device_name"), old_autonomous, new_state.autonomous_mode,
            )

    def _offline_checker(self):
        """
        Background thread that periodically checks all device states
        and marks devices as offline if they haven't been seen recently.
        """
        logger.info(
            "Offline checker started (threshold=%d min, interval=%d sec)",
            config.OFFLINE_THRESHOLD_MIN, config.OFFLINE_CHECK_INTERVAL_S,
        )

        while self._running:
            time.sleep(config.OFFLINE_CHECK_INTERVAL_S)

            try:
                threshold_time = time.time() - (config.OFFLINE_THRESHOLD_MIN * 60)

                # Check in-memory states
                all_states = self._state_manager.get_all_states()
                stale_ids = []
                for device_id, state in all_states.items():
                    if state.is_online and state.last_seen and state.last_seen < threshold_time:
                        self._state_manager.mark_offline(device_id)
                        stale_ids.append(device_id)

                # Also update database for stale devices
                if stale_ids:
                    session = get_session()
                    try:
                        threshold_dt = datetime.now(timezone.utc) - timedelta(minutes=config.OFFLINE_THRESHOLD_MIN)
                        stale_devices = session.query(Device).filter(
                            Device.is_online == True,
                            Device.last_seen < threshold_dt,
                        ).all()
                        for device in stale_devices:
                            device.is_online = False
                            logger.info("Marked device '%s' as offline (last seen: %s)", device.device_name, device.last_seen)
                        session.commit()
                    except Exception:
                        session.rollback()
                        logger.exception("Offline checker DB update error")
                    finally:
                        session.close()

            except Exception:
                logger.exception("Offline checker error")
