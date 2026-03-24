"""
CommandSender -- builds JSON commands and publishes them via MQTT.
Records all commands to the database.
"""

import json
import logging
import uuid
from datetime import datetime, timezone

from db.connection import get_session
from models.command import Command

logger = logging.getLogger(__name__)


class CommandSender:
    """
    Builds and sends device commands through MQTT.
    Each command gets a unique command_id for tracking acknowledgements.
    All commands are recorded in the commands table.
    """

    def __init__(self, publisher, device_state_manager):
        """
        Args:
            publisher: MQTTPublisher instance.
            device_state_manager: DeviceStateManager for updating state after commands.
        """
        self._publisher = publisher
        self._state_manager = device_state_manager

    def _send_command(self, device, command_type, params=None, source="automation"):
        """
        Build and send a command to a device.

        Args:
            device: Device ORM instance.
            command_type: Command type string (e.g. 'mister_on', 'fan_off').
            params: Optional dict of command parameters.
            source: Who initiated the command ('automation', 'manual', 'api').

        Returns:
            The command_id (str UUID) of the sent command.
        """
        command_id = str(uuid.uuid4())
        payload = {
            "command_id": command_id,
            "command_type": command_type,
            "source": source,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if params:
            payload["params"] = params

        # Publish via MQTT
        self._publisher.publish_command(device, payload)

        # Record in database
        self._record_command(device.id, command_type, payload)

        logger.info(
            "Sent command %s to device %s (id=%s, command_id=%s)",
            command_type, device.device_name, device.id, command_id,
        )
        return command_id

    def _record_command(self, device_id, command_type, payload):
        """Write a command record to the database."""
        session = get_session()
        try:
            cmd = Command(
                device_id=device_id,
                command_type=command_type,
                payload=payload,
            )
            session.add(cmd)
            session.commit()
        except Exception:
            session.rollback()
            logger.exception("Failed to record command %s for device %s", command_type, device_id)
        finally:
            session.close()

    # -------------------------------------------------------------------
    # Convenience methods
    # -------------------------------------------------------------------

    def mister_on(self, device, source="automation"):
        """Turn mister on for a device."""
        return self._send_command(device, "mister_on", source=source)

    def mister_off(self, device, source="automation"):
        """Turn mister off for a device."""
        return self._send_command(device, "mister_off", source=source)

    def fan_on(self, device, speed_pct=None, source="automation"):
        """Turn fan on, optionally at a specific speed."""
        params = {}
        if speed_pct is not None:
            params["speed_pct"] = speed_pct
        return self._send_command(device, "fan_on", params=params, source=source)

    def fan_off(self, device, source="automation"):
        """Turn fan off."""
        return self._send_command(device, "fan_off", source=source)

    def set_fan_speed(self, device, speed_pct, source="automation"):
        """Set fan speed without changing on/off state."""
        return self._send_command(
            device, "set_fan_speed",
            params={"speed_pct": speed_pct},
            source=source,
        )

    def valve_open(self, device, source="automation"):
        """Open the valve."""
        return self._send_command(device, "valve_open", source=source)

    def valve_close(self, device, source="automation"):
        """Close the valve."""
        return self._send_command(device, "valve_close", source=source)

    def fill_tank(self, device, source="automation"):
        """Start tank fill (opens valve and activates fill mode)."""
        return self._send_command(device, "fill_tank", source=source)

    def stop_fill(self, device, source="automation"):
        """Stop tank fill (closes valve and deactivates fill mode)."""
        return self._send_command(device, "stop_fill", source=source)

    def read_now(self, device, source="manual"):
        """Request an immediate sensor reading from the device."""
        return self._send_command(device, "read_now", source=source)

    def update_config(self, device, config_params, source="api"):
        """
        Send a configuration update to a device.

        Args:
            device: Device ORM instance.
            config_params: Dict of config key-value pairs.
            source: Command source.
        """
        self._publisher.publish_config(device, config_params)
        self._record_command(device.id, "update_config", config_params)
        logger.info("Sent config update to device %s", device.device_name)
