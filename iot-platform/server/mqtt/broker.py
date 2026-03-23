"""
Persistent paho-mqtt client with auto-reconnect, LWT, and publish queue.
"""

import json
import logging
import threading
import time
from collections import deque

import paho.mqtt.client as mqtt

import config

logger = logging.getLogger(__name__)


class MQTTBroker:
    """
    Manages the MQTT connection lifecycle:
    - Last Will and Testament on server/status
    - Auto-reconnect with exponential backoff (1s to 60s)
    - Re-subscribes on reconnect
    - MQTT network loop in its own thread
    - Publish queue (max 500) that flushes on reconnect
    """

    def __init__(self):
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=config.MQTT_CLIENT_ID,
            clean_session=False,
        )

        # Authentication
        if config.MQTT_USER:
            self._client.username_pw_set(config.MQTT_USER, config.MQTT_PASSWORD)

        # Last Will and Testament
        self._client.will_set(
            "server/status",
            payload=json.dumps({"status": "offline", "client_id": config.MQTT_CLIENT_ID}),
            qos=1,
            retain=True,
        )

        # Callbacks
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

        # Reconnect settings
        self._client.reconnect_delay_set(min_delay=1, max_delay=60)

        # State
        self._connected = False
        self._subscriptions = []
        self._message_callback = None
        self._publish_queue = deque(maxlen=config.PUBLISH_QUEUE_MAX)
        self._lock = threading.Lock()
        self._loop_thread = None

    @property
    def connected(self):
        return self._connected

    def set_message_callback(self, callback):
        """Set the callback for incoming messages: callback(topic, payload_bytes)."""
        self._message_callback = callback

    def add_subscription(self, topic, qos=1):
        """Register a topic subscription. Will subscribe immediately if connected."""
        with self._lock:
            self._subscriptions.append((topic, qos))
        if self._connected:
            self._client.subscribe(topic, qos)
            logger.info("Subscribed to: %s (qos=%d)", topic, qos)

    def connect(self):
        """Connect to the MQTT broker. Non-blocking -- starts the loop thread."""
        logger.info(
            "Connecting to MQTT broker at %s:%s as '%s'",
            config.MQTT_HOST, config.MQTT_PORT, config.MQTT_CLIENT_ID,
        )
        try:
            self._client.connect(config.MQTT_HOST, config.MQTT_PORT, keepalive=60)
        except (ConnectionRefusedError, OSError) as exc:
            logger.error("Initial MQTT connection failed: %s. Will retry automatically.", exc)

        # Start the network loop in a background thread
        self._loop_thread = threading.Thread(target=self._client.loop_forever, daemon=True)
        self._loop_thread.start()
        logger.info("MQTT network loop started in background thread")

    def disconnect(self):
        """Gracefully disconnect from the broker."""
        # Publish offline status before disconnecting
        self.publish(
            "server/status",
            {"status": "offline", "client_id": config.MQTT_CLIENT_ID},
            qos=1,
            retain=True,
        )
        self._client.disconnect()
        logger.info("MQTT client disconnected")

    def publish(self, topic, payload, qos=1, retain=False):
        """
        Publish a message. If not connected, queue it for later delivery.

        Args:
            topic: MQTT topic string.
            payload: Dict or string to publish (dicts are JSON-serialised).
            qos: MQTT QoS level.
            retain: Whether the broker should retain the message.
        """
        if isinstance(payload, dict):
            payload = json.dumps(payload)

        if self._connected:
            result = self._client.publish(topic, payload, qos=qos, retain=retain)
            if result.rc != mqtt.MQTT_ERR_SUCCESS:
                logger.warning("Publish to %s failed (rc=%d), queuing message", topic, result.rc)
                self._queue_message(topic, payload, qos, retain)
        else:
            self._queue_message(topic, payload, qos, retain)

    def loop_forever_blocking(self):
        """Block the main thread on the MQTT loop (use instead of connect() for foreground)."""
        logger.info(
            "Connecting to MQTT broker at %s:%s (blocking mode)",
            config.MQTT_HOST, config.MQTT_PORT,
        )
        try:
            self._client.connect(config.MQTT_HOST, config.MQTT_PORT, keepalive=60)
        except (ConnectionRefusedError, OSError) as exc:
            logger.error("Initial MQTT connection failed: %s. Will retry.", exc)
        self._client.loop_forever()

    # -----------------------------------------------------------------------
    # Internal callbacks
    # -----------------------------------------------------------------------

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            self._connected = True
            logger.info("Connected to MQTT broker at %s:%s", config.MQTT_HOST, config.MQTT_PORT)

            # Publish online status
            client.publish(
                "server/status",
                json.dumps({"status": "online", "client_id": config.MQTT_CLIENT_ID}),
                qos=1,
                retain=True,
            )

            # Re-subscribe to all registered topics
            with self._lock:
                for topic, qos in self._subscriptions:
                    client.subscribe(topic, qos)
                    logger.info("Re-subscribed to: %s", topic)

            # Flush the publish queue
            self._flush_queue()
        else:
            logger.error("MQTT connection failed: reason_code=%s", reason_code)

    def _on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        self._connected = False
        logger.warning("Disconnected from MQTT broker (reason_code=%s). Auto-reconnecting.", reason_code)

    def _on_message(self, client, userdata, msg):
        if self._message_callback:
            try:
                self._message_callback(msg.topic, msg.payload)
            except Exception:
                logger.exception("Error in message callback for topic %s", msg.topic)

    # -----------------------------------------------------------------------
    # Queue management
    # -----------------------------------------------------------------------

    def _queue_message(self, topic, payload, qos, retain):
        with self._lock:
            self._publish_queue.append((topic, payload, qos, retain))
            queue_len = len(self._publish_queue)
        if queue_len >= config.PUBLISH_QUEUE_MAX:
            logger.warning("Publish queue is full (%d messages), oldest messages will be dropped", queue_len)

    def _flush_queue(self):
        flushed = 0
        with self._lock:
            while self._publish_queue:
                topic, payload, qos, retain = self._publish_queue.popleft()
                self._client.publish(topic, payload, qos=qos, retain=retain)
                flushed += 1
        if flushed:
            logger.info("Flushed %d queued messages after reconnect", flushed)
