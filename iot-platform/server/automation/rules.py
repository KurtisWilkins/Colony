"""
Rule definitions and evaluation helpers for the automation engine.

Each rule function takes (state, thresholds) and returns an action dict or None.
Action dicts have the form: {"action": "...", "params": {...}, "rule_name": "..."}
"""

import logging
import time

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Rule: Humidity control (mister)
# ---------------------------------------------------------------------------

def evaluate_humidity(state, thresholds):
    """
    Humidity rule:
    - If humidity < humidity_on_pct and mister is off -> turn mister ON
    - If humidity >= humidity_off_pct and mister is on -> turn mister OFF

    Returns action dict or None.
    """
    if state.humidity_pct is None:
        return None

    if state.is_humidity_cooldown_active():
        return None

    humidity = state.humidity_pct
    on_threshold = thresholds.get("humidity_on_pct", 60.0)
    off_threshold = thresholds.get("humidity_off_pct", 80.0)

    if humidity < on_threshold and not state.mister_on:
        return {
            "action": "mister_on",
            "params": {},
            "rule_name": "humidity_low",
            "trigger_value": {"humidity_pct": humidity, "threshold": on_threshold},
            "cooldown_type": "humidity",
        }
    elif humidity >= off_threshold and state.mister_on:
        return {
            "action": "mister_off",
            "params": {},
            "rule_name": "humidity_high",
            "trigger_value": {"humidity_pct": humidity, "threshold": off_threshold},
            "cooldown_type": "humidity",
        }

    return None


# ---------------------------------------------------------------------------
# Rule: CO2 control (fan)
# ---------------------------------------------------------------------------

def evaluate_co2(state, thresholds):
    """
    CO2 rule:
    - If CO2 > co2_high_ppm -> turn fan ON at co2_speed
    - If CO2 <= co2_normal_ppm and fan was set to co2_speed -> set fan to default_speed

    Skips evaluation if device is warming up.
    Returns action dict or None.
    """
    if state.co2_ppm is None:
        return None

    if state.is_co2_cooldown_active():
        return None

    if state.is_warming_up_active():
        logger.debug("Skipping CO2 rule for %s -- device is warming up", state.device_name)
        return None

    co2 = state.co2_ppm
    high_threshold = thresholds.get("co2_high_ppm", 1200.0)
    normal_threshold = thresholds.get("co2_normal_ppm", 800.0)
    co2_speed = thresholds.get("fan_co2_speed", 100)
    default_speed = thresholds.get("fan_default_speed", 50)

    if co2 > high_threshold:
        return {
            "action": "fan_on",
            "params": {"speed_pct": co2_speed},
            "rule_name": "co2_high",
            "trigger_value": {"co2_ppm": co2, "threshold": high_threshold},
            "cooldown_type": "co2",
        }
    elif co2 <= normal_threshold and state.fan_on and state.fan_speed_pct >= co2_speed:
        return {
            "action": "set_fan_speed",
            "params": {"speed_pct": default_speed},
            "rule_name": "co2_normal",
            "trigger_value": {"co2_ppm": co2, "threshold": normal_threshold},
            "cooldown_type": "co2",
        }

    return None


# ---------------------------------------------------------------------------
# Rule: Water level control (valve)
# ---------------------------------------------------------------------------

def evaluate_water(state, thresholds):
    """
    Water level rule:
    - If water_level_cm < water_low_cm and valve is closed -> open valve (fill)
    - If water_level_cm >= water_full_cm and valve is open -> close valve (stop fill)

    Respects the valve safety timer.
    Returns action dict or None.
    """
    if state.water_level_cm is None:
        return None

    if state.is_valve_safety_active():
        return None

    level = state.water_level_cm
    low_threshold = thresholds.get("water_low_cm", 10.0)
    full_threshold = thresholds.get("water_full_cm", 80.0)

    if level < low_threshold and not state.valve_open and not state.fill_active:
        return {
            "action": "fill_tank",
            "params": {},
            "rule_name": "water_low",
            "trigger_value": {"water_level_cm": level, "threshold": low_threshold},
            "cooldown_type": "valve",
        }
    elif level >= full_threshold and (state.valve_open or state.fill_active):
        return {
            "action": "stop_fill",
            "params": {},
            "rule_name": "water_full",
            "trigger_value": {"water_level_cm": level, "threshold": full_threshold},
            "cooldown_type": "valve",
        }

    return None


# ---------------------------------------------------------------------------
# Rule: Temperature monitoring (alerts only)
# ---------------------------------------------------------------------------

def evaluate_temperature(state, thresholds):
    """
    Temperature rule:
    - If temperature < temp_min_c -> alert (temp_low)
    - If temperature > temp_max_c -> alert (temp_high)

    This rule only generates alerts, no actuator commands.
    Returns action dict or None.
    """
    if state.temperature_c is None:
        return None

    temp = state.temperature_c
    min_temp = thresholds.get("temp_min_c", 18.0)
    max_temp = thresholds.get("temp_max_c", 30.0)

    if temp < min_temp:
        return {
            "action": "alert",
            "params": {
                "alert_type": "temp_low",
                "message": f"Temperature {temp:.1f}C is below minimum {min_temp:.1f}C",
            },
            "rule_name": "temp_low",
            "trigger_value": {"temperature_c": temp, "threshold": min_temp},
        }
    elif temp > max_temp:
        return {
            "action": "alert",
            "params": {
                "alert_type": "temp_high",
                "message": f"Temperature {temp:.1f}C exceeds maximum {max_temp:.1f}C",
            },
            "rule_name": "temp_high",
            "trigger_value": {"temperature_c": temp, "threshold": max_temp},
        }

    return None


# ---------------------------------------------------------------------------
# All rules in evaluation order
# ---------------------------------------------------------------------------

ALL_RULES = [
    evaluate_humidity,
    evaluate_co2,
    evaluate_water,
    evaluate_temperature,
]
