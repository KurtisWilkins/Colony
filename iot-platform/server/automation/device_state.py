"""
In-memory device state tracking with thread-safe access.
"""

import logging
import threading
import time
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class DeviceState:
    """Complete in-memory state for a single device."""

    # Identity
    device_id: Optional[str] = None
    device_name: Optional[str] = None
    facility: Optional[str] = None
    building: Optional[str] = None
    unit: Optional[str] = None

    # Sensor values
    temperature_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    co2_ppm: Optional[float] = None
    water_level_cm: Optional[float] = None
    water_level_pct: Optional[float] = None
    flow_rate_lpm: Optional[float] = None
    light_lux: Optional[float] = None
    soil_moisture_pct: Optional[float] = None

    # Actuator states
    fan_on: bool = False
    fan_speed_pct: int = 0
    mister_on: bool = False
    valve_open: bool = False
    fill_active: bool = False

    # Connectivity
    is_online: bool = False
    last_seen: Optional[float] = None
    last_telemetry: Optional[float] = None
    last_status: Optional[float] = None

    # Automation tracking
    autonomous_mode: bool = False
    warming_up: bool = False
    warming_up_until: Optional[float] = None

    # Cooldown timestamps (epoch)
    humidity_cooldown_until: float = 0.0
    co2_cooldown_until: float = 0.0
    valve_opened_at: Optional[float] = None
    valve_safety_until: float = 0.0

    # Last command timestamps
    last_mister_command: float = 0.0
    last_fan_command: float = 0.0
    last_valve_command: float = 0.0

    def to_dict(self):
        """Serialise to a JSON-friendly dict."""
        return asdict(self)

    def is_humidity_cooldown_active(self):
        return time.time() < self.humidity_cooldown_until

    def is_co2_cooldown_active(self):
        return time.time() < self.co2_cooldown_until

    def is_valve_safety_active(self):
        return time.time() < self.valve_safety_until

    def is_warming_up_active(self):
        if self.warming_up_until and time.time() < self.warming_up_until:
            return True
        if self.warming_up and self.warming_up_until and time.time() >= self.warming_up_until:
            self.warming_up = False
            self.warming_up_until = None
        return False


class DeviceStateManager:
    """
    Thread-safe manager for all device states.
    Uses a per-device lock to minimise contention.
    """

    def __init__(self):
        self._states = {}       # device_id (str) -> DeviceState
        self._locks = {}        # device_id (str) -> threading.Lock
        self._global_lock = threading.Lock()

    def _get_lock(self, device_id):
        """Get or create a lock for a specific device."""
        device_id = str(device_id)
        if device_id not in self._locks:
            with self._global_lock:
                if device_id not in self._locks:
                    self._locks[device_id] = threading.Lock()
        return self._locks[device_id]

    def _ensure_state(self, device_id, device_info=None):
        """Ensure a DeviceState exists for this device_id."""
        device_id = str(device_id)
        if device_id not in self._states:
            state = DeviceState(device_id=device_id)
            if device_info:
                state.device_name = device_info.get("device_name")
                state.facility = device_info.get("facility")
                state.building = device_info.get("building")
                state.unit = device_info.get("unit")
            self._states[device_id] = state
        return self._states[device_id]

    def update_from_telemetry(self, device_id, payload, device_info=None):
        """
        Update device state from a telemetry payload.

        Args:
            device_id: UUID of the device.
            payload: Dict of telemetry values.
            device_info: Optional dict with device_name, facility, etc.
        """
        device_id = str(device_id)
        lock = self._get_lock(device_id)
        with lock:
            state = self._ensure_state(device_id, device_info)
            now = time.time()
            state.last_telemetry = now
            state.last_seen = now
            state.is_online = True

            # Map payload fields to state
            if "temperature" in payload or "temperature_c" in payload:
                state.temperature_c = payload.get("temperature_c", payload.get("temperature"))
            if "humidity" in payload or "humidity_pct" in payload:
                state.humidity_pct = payload.get("humidity_pct", payload.get("humidity"))
            if "co2" in payload or "co2_ppm" in payload:
                state.co2_ppm = payload.get("co2_ppm", payload.get("co2"))
            if "water_level" in payload or "water_level_cm" in payload:
                state.water_level_cm = payload.get("water_level_cm", payload.get("water_level"))
            if "water_level_pct" in payload:
                state.water_level_pct = payload["water_level_pct"]
            if "flow_rate" in payload or "flow_rate_lpm" in payload:
                state.flow_rate_lpm = payload.get("flow_rate_lpm", payload.get("flow_rate"))
            if "light" in payload or "light_lux" in payload:
                state.light_lux = payload.get("light_lux", payload.get("light"))
            if "soil_moisture" in payload or "soil_moisture_pct" in payload:
                state.soil_moisture_pct = payload.get("soil_moisture_pct", payload.get("soil_moisture"))

            # Actuator state reported in telemetry
            if "fan_on" in payload:
                state.fan_on = bool(payload["fan_on"])
            if "fan_speed" in payload or "fan_speed_pct" in payload:
                state.fan_speed_pct = int(payload.get("fan_speed_pct", payload.get("fan_speed", 0)))
            if "mister_on" in payload:
                state.mister_on = bool(payload["mister_on"])
            if "valve_open" in payload:
                state.valve_open = bool(payload["valve_open"])
            if "fill_active" in payload:
                state.fill_active = bool(payload["fill_active"])

            return state

    def update_from_status(self, device_id, payload, device_info=None):
        """
        Update device state from a status heartbeat.

        Args:
            device_id: UUID of the device.
            payload: Dict with status fields.
            device_info: Optional dict with device identity fields.
        """
        device_id = str(device_id)
        lock = self._get_lock(device_id)
        with lock:
            state = self._ensure_state(device_id, device_info)
            now = time.time()
            state.last_status = now
            state.last_seen = now
            state.is_online = True

            if "autonomous_mode" in payload:
                state.autonomous_mode = bool(payload["autonomous_mode"])
            if "warming_up" in payload:
                state.warming_up = bool(payload["warming_up"])
                if state.warming_up and "warmup_duration_s" in payload:
                    state.warming_up_until = now + payload["warmup_duration_s"]

            # Update actuator state if reported in status
            if "fan_on" in payload:
                state.fan_on = bool(payload["fan_on"])
            if "mister_on" in payload:
                state.mister_on = bool(payload["mister_on"])
            if "valve_open" in payload:
                state.valve_open = bool(payload["valve_open"])

            return state

    def update_from_flow(self, device_id, payload, device_info=None):
        """
        Update device state from a flow sensor message.

        Args:
            device_id: UUID of the device.
            payload: Dict with flow data.
            device_info: Optional dict with device identity fields.
        """
        device_id = str(device_id)
        lock = self._get_lock(device_id)
        with lock:
            state = self._ensure_state(device_id, device_info)
            state.last_seen = time.time()

            if "flow_rate" in payload or "flow_rate_lpm" in payload:
                state.flow_rate_lpm = payload.get("flow_rate_lpm", payload.get("flow_rate"))
            if "valve_open" in payload:
                state.valve_open = bool(payload["valve_open"])
            if "fill_active" in payload:
                state.fill_active = bool(payload["fill_active"])

            return state

    def get_state(self, device_id):
        """
        Get a snapshot of device state.

        Returns:
            DeviceState or None if not tracked.
        """
        device_id = str(device_id)
        lock = self._get_lock(device_id)
        with lock:
            return self._states.get(device_id)

    def get_all_states(self):
        """
        Get a dict of all device states.

        Returns:
            Dict of device_id -> DeviceState (shallow copy of internal dict).
        """
        with self._global_lock:
            return dict(self._states)

    def mark_offline(self, device_id):
        """Mark a device as offline."""
        device_id = str(device_id)
        lock = self._get_lock(device_id)
        with lock:
            state = self._states.get(device_id)
            if state:
                state.is_online = False
                logger.info("Marked device %s (%s) as offline", state.device_name, device_id)

    def set_cooldown(self, device_id, cooldown_type, duration_s):
        """
        Set a cooldown timer for a device.

        Args:
            device_id: Device UUID.
            cooldown_type: One of 'humidity', 'co2', 'valve'.
            duration_s: Cooldown duration in seconds.
        """
        device_id = str(device_id)
        lock = self._get_lock(device_id)
        with lock:
            state = self._states.get(device_id)
            if not state:
                return
            until = time.time() + duration_s
            if cooldown_type == "humidity":
                state.humidity_cooldown_until = until
            elif cooldown_type == "co2":
                state.co2_cooldown_until = until
            elif cooldown_type == "valve":
                state.valve_safety_until = until
                state.valve_opened_at = time.time()
