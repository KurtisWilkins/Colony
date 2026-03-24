"""
MQTT publisher -- formats and publishes outbound messages.
"""

import json
import logging
from datetime import datetime, timezone

from mqtt.topics import build_command_topic, build_config_topic

logger = logging.getLogger(__name__)


class MQTTPublisher:
    """
    Formats and publishes outbound MQTT messages through the broker client.
    All publish calls go through the broker's queuing mechanism.
    """

    def __init__(self, broker):
        """
        Args:
            broker: MQTTBroker instance with a publish() method.
        """
        self._broker = broker

    def publish_command(self, device, command_payload):
        """
        Publish a command to a device's command topic.

        Args:
            device: Device ORM instance or dict with topic fields.
            command_payload: Dict with the command data. A timestamp is added automatically.
        """
        topic = build_command_topic(device)
        command_payload.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        self._broker.publish(topic, command_payload, qos=1, retain=False)
        logger.info("Published command to %s: %s", topic, command_payload.get("command_type", "unknown"))

    def publish_config(self, device, config_payload):
        """
        Publish a configuration update to a device's config topic.

        Args:
            device: Device ORM instance or dict with topic fields.
            config_payload: Dict with configuration key-value pairs.
        """
        topic = build_config_topic(device)
        config_payload.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
        self._broker.publish(topic, config_payload, qos=1, retain=True)
        logger.info("Published config to %s", topic)

    def publish_server_status(self, status, details=None):
        """
        Publish the server's own status message.

        Args:
            status: Status string (e.g. 'online', 'offline', 'starting').
            details: Optional dict of additional status information.
        """
        payload = {
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        if details:
            payload.update(details)
        self._broker.publish("server/status", payload, qos=1, retain=True)
        logger.info("Published server status: %s", status)

    def publish_alert(self, device, alert_type, message, severity="warning"):
        """
        Publish an alert notification for a device.

        Args:
            device: Device ORM instance or dict.
            alert_type: Alert type string (e.g. 'temp_high', 'co2_high').
            message: Human-readable alert message.
            severity: Alert severity level.
        """
        if hasattr(device, "facility"):
            topic = f"{device.facility}/{device.building}/{device.unit}/{device.device_name}/server_alert"
        else:
            topic = f"{device['facility']}/{device['building']}/{device['unit']}/{device['device_name']}/server_alert"

        payload = {
            "alert_type": alert_type,
            "message": message,
            "severity": severity,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        self._broker.publish(topic, payload, qos=1, retain=False)
        logger.info("Published alert to %s: %s", topic, alert_type)

    def publish_raw(self, topic, payload, qos=1, retain=False):
        """Publish a raw message to an arbitrary topic."""
        self._broker.publish(topic, payload, qos=qos, retain=retain)
