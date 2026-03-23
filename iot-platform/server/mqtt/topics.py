"""
MQTT topic parsing and construction utilities.

Topic format: {facility}/{building}/{unit}/{device_name}/{message_type}
"""

import logging

logger = logging.getLogger(__name__)


def parse_topic(topic):
    """
    Parse an MQTT topic string into its component parts.

    Returns a dict with keys: facility, building, unit, device_name, message_type
    Returns None if the topic format is invalid.
    """
    parts = topic.split("/")
    if len(parts) != 5:
        logger.warning("Unexpected topic format (expected 5 parts): %s", topic)
        return None

    return {
        "facility": parts[0],
        "building": parts[1],
        "unit": parts[2],
        "device_name": parts[3],
        "message_type": parts[4],
    }


def build_command_topic(device):
    """
    Build the command topic for a device.

    Args:
        device: Device ORM instance or dict with facility/building/unit/device_name keys.

    Returns:
        Topic string like 'facility/building/unit/device_name/command'
    """
    if hasattr(device, "facility"):
        return f"{device.facility}/{device.building}/{device.unit}/{device.device_name}/command"
    return f"{device['facility']}/{device['building']}/{device['unit']}/{device['device_name']}/command"


def build_config_topic(device):
    """
    Build the configuration topic for a device.

    Args:
        device: Device ORM instance or dict with facility/building/unit/device_name keys.

    Returns:
        Topic string like 'facility/building/unit/device_name/config'
    """
    if hasattr(device, "facility"):
        return f"{device.facility}/{device.building}/{device.unit}/{device.device_name}/config"
    return f"{device['facility']}/{device['building']}/{device['unit']}/{device['device_name']}/config"


def build_topic(device, message_type):
    """
    Build an arbitrary topic for a device.

    Args:
        device: Device ORM instance or dict.
        message_type: The message type suffix (e.g. 'telemetry', 'status', 'command').

    Returns:
        Full topic string.
    """
    if hasattr(device, "facility"):
        return f"{device.facility}/{device.building}/{device.unit}/{device.device_name}/{message_type}"
    return f"{device['facility']}/{device['building']}/{device['unit']}/{device['device_name']}/{message_type}"
