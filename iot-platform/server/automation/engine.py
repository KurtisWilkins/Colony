"""
AutomationEngine -- evaluates rules against device state after every telemetry update.
"""

import logging
import time
from datetime import datetime, timezone

from automation.rules import ALL_RULES
from db.connection import get_session
from models.automation_event import AutomationEvent

import config

logger = logging.getLogger(__name__)


class AutomationEngine:
    """
    Core automation engine. Called after every telemetry update.

    Evaluates all rules for a device and dispatches actions via the command sender.
    Respects cooldowns, autonomous mode, and warming-up periods.
    """

    def __init__(self, device_state_manager, threshold_cache, command_sender, alert_manager):
        """
        Args:
            device_state_manager: DeviceStateManager instance.
            threshold_cache: ThresholdCache instance.
            command_sender: CommandSender instance.
            alert_manager: AlertManager instance.
        """
        self._state_manager = device_state_manager
        self._threshold_cache = threshold_cache
        self._command_sender = command_sender
        self._alert_manager = alert_manager
        self._device_cache = {}  # device_id -> Device ORM for command sending

    def set_device_cache(self, device_id, device):
        """Cache a Device ORM instance for command sending."""
        self._device_cache[str(device_id)] = device

    def evaluate(self, device_id):
        """
        Evaluate all automation rules for a device.

        Called after every telemetry update. Uses cached device state only -- no I/O
        during rule evaluation itself.

        Args:
            device_id: UUID of the device to evaluate.
        """
        device_id_str = str(device_id)
        state = self._state_manager.get_state(device_id_str)
        if not state:
            logger.debug("No state found for device %s, skipping evaluation", device_id_str)
            return

        # Skip devices in autonomous mode
        if state.autonomous_mode:
            logger.debug("Device %s is in autonomous mode, skipping automation", state.device_name)
            return

        # Get thresholds for this device
        thresholds = self._threshold_cache.get(device_id_str)

        # Evaluate all rules
        for rule_fn in ALL_RULES:
            try:
                result = rule_fn(state, thresholds)
                if result:
                    self._dispatch_action(device_id, state, result, thresholds)
            except Exception:
                logger.exception(
                    "Error evaluating rule %s for device %s",
                    rule_fn.__name__, state.device_name,
                )

    def _dispatch_action(self, device_id, state, action, thresholds):
        """
        Execute an action returned by a rule.

        Args:
            device_id: Device UUID.
            state: Current DeviceState.
            action: Dict with action, params, rule_name, trigger_value.
            thresholds: Current threshold values.
        """
        action_type = action["action"]
        params = action.get("params", {})
        rule_name = action.get("rule_name", "unknown")
        trigger_value = action.get("trigger_value", {})
        cooldown_type = action.get("cooldown_type")

        # Get the Device ORM instance for command sending
        device = self._device_cache.get(str(device_id))
        if not device and action_type != "alert":
            device = self._load_device(device_id)
            if not device:
                logger.error("Cannot send command: device %s not found in DB", device_id)
                return

        command_sent = None

        # Execute the action
        if action_type == "mister_on":
            self._command_sender.mister_on(device)
            command_sent = {"command_type": "mister_on"}
        elif action_type == "mister_off":
            self._command_sender.mister_off(device)
            command_sent = {"command_type": "mister_off"}
        elif action_type == "fan_on":
            speed = params.get("speed_pct")
            self._command_sender.fan_on(device, speed_pct=speed)
            command_sent = {"command_type": "fan_on", "speed_pct": speed}
        elif action_type == "fan_off":
            self._command_sender.fan_off(device)
            command_sent = {"command_type": "fan_off"}
        elif action_type == "set_fan_speed":
            speed = params.get("speed_pct", 50)
            self._command_sender.set_fan_speed(device, speed)
            command_sent = {"command_type": "set_fan_speed", "speed_pct": speed}
        elif action_type == "fill_tank":
            self._command_sender.fill_tank(device)
            command_sent = {"command_type": "fill_tank"}
        elif action_type == "stop_fill":
            self._command_sender.stop_fill(device)
            command_sent = {"command_type": "stop_fill"}
        elif action_type == "alert":
            alert_type = params.get("alert_type", "unknown")
            message = params.get("message", "")
            self._alert_manager.create_alert(device_id, alert_type, message)

            # Also resolve if condition has cleared
            if alert_type == "temp_high" and state.temperature_c is not None:
                max_temp = thresholds.get("temp_max_c", 30.0)
                if state.temperature_c <= max_temp:
                    self._alert_manager.resolve_alert(device_id, alert_type)
            elif alert_type == "temp_low" and state.temperature_c is not None:
                min_temp = thresholds.get("temp_min_c", 18.0)
                if state.temperature_c >= min_temp:
                    self._alert_manager.resolve_alert(device_id, alert_type)
        else:
            logger.warning("Unknown action type: %s", action_type)
            return

        # Set cooldown if applicable
        if cooldown_type:
            if cooldown_type == "humidity":
                self._state_manager.set_cooldown(device_id, "humidity", config.HUMIDITY_COOLDOWN_S)
            elif cooldown_type == "co2":
                self._state_manager.set_cooldown(device_id, "co2", config.CO2_COOLDOWN_S)
            elif cooldown_type == "valve":
                self._state_manager.set_cooldown(device_id, "valve", thresholds.get("valve_safety_min", 30) * 60)

        # Record the automation event
        self._record_event(device_id, rule_name, trigger_value, action_type, command_sent)

        logger.info(
            "Automation action: %s for device %s (rule=%s)",
            action_type, state.device_name or device_id, rule_name,
        )

    def _record_event(self, device_id, rule_name, trigger_value, action_taken, command_sent):
        """Write an automation event to the audit log."""
        session = get_session()
        try:
            event = AutomationEvent(
                device_id=str(device_id),
                rule_name=rule_name,
                trigger_value=trigger_value,
                action_taken=action_taken,
                command_sent=command_sent,
                autonomous=True,
            )
            session.add(event)
            session.commit()
        except Exception:
            session.rollback()
            logger.exception("Failed to record automation event")
        finally:
            session.close()

    def _load_device(self, device_id):
        """Load a device from the database and cache it."""
        from models.device import Device
        session = get_session()
        try:
            device = session.query(Device).filter_by(id=str(device_id)).first()
            if device:
                # Detach from session so it can be used across threads
                session.expunge(device)
                self._device_cache[str(device_id)] = device
            return device
        except Exception:
            logger.exception("Failed to load device %s", device_id)
            return None
        finally:
            session.close()
