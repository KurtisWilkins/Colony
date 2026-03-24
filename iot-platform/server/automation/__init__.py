"""Automation package -- rules engine, device state, command sender, thresholds, alerts."""

from automation.device_state import DeviceState, DeviceStateManager
from automation.engine import AutomationEngine
from automation.command_sender import CommandSender
from automation.thresholds import ThresholdCache
from automation.alert_manager import AlertManager
