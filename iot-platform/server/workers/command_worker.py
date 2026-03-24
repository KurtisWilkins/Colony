"""
CommandWorker -- processes outbound command queue and acknowledgement messages.

Responsibilities:
- Process command acknowledgements from devices
- Update command records in the database
"""

import logging
import threading
from datetime import datetime, timezone

from db.connection import get_session
from models.command import Command

logger = logging.getLogger(__name__)


class CommandWorker:
    """
    Daemon thread worker that processes command acknowledgements.
    Ack messages arrive via the subscriber on +/+/+/+/ack topics.
    """

    def __init__(self, queue):
        """
        Args:
            queue: threading.Queue with ack messages.
        """
        self._queue = queue
        self._thread = None
        self._running = False

    def start(self):
        """Start the worker thread."""
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True, name="command-worker")
        self._thread.start()
        logger.info("CommandWorker started")

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
                logger.exception("Error processing command ack")
            finally:
                self._queue.task_done()

    def _process(self, message):
        """Process a command acknowledgement message."""
        payload = message.get("payload", {})
        device_id = message.get("device_id")
        parsed = message.get("parsed", {})

        if not device_id:
            logger.warning("Ack from unknown device: %s", parsed.get("device_name"))
            return

        command_id = payload.get("command_id")
        if not command_id:
            logger.warning("Ack without command_id from device %s", device_id)
            return

        ack_status = payload.get("status", "acknowledged")
        ack_message = payload.get("message", "")

        # Find and update the command in the database
        session = get_session()
        try:
            # Look up by command_id in the payload JSONB
            commands = session.query(Command).filter_by(
                device_id=device_id,
                acknowledged=False,
            ).all()

            matched = None
            for cmd in commands:
                if cmd.payload and isinstance(cmd.payload, dict):
                    if cmd.payload.get("command_id") == command_id:
                        matched = cmd
                        break

            if matched:
                matched.acknowledged = True
                matched.acknowledged_at = datetime.now(timezone.utc)
                session.commit()
                logger.info(
                    "Command %s acknowledged by device %s (status=%s)",
                    command_id, parsed.get("device_name", device_id), ack_status,
                )
            else:
                logger.warning(
                    "No matching unacknowledged command found for command_id=%s from device %s",
                    command_id, device_id,
                )

            # Handle error acknowledgements
            if ack_status == "error":
                logger.error(
                    "Device %s reported error for command %s: %s",
                    parsed.get("device_name", device_id), command_id, ack_message,
                )

        except Exception:
            session.rollback()
            logger.exception("Failed to process ack for command %s", command_id)
        finally:
            session.close()
