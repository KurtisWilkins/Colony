"""
Configuration for the IoT automation server.
Loads all settings from environment variables with sensible defaults.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# PostgreSQL
# ---------------------------------------------------------------------------
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "iot_platform")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")

SQLALCHEMY_DATABASE_URI = (
    f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
    f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
)

# ---------------------------------------------------------------------------
# MQTT broker
# ---------------------------------------------------------------------------
MQTT_HOST = os.getenv("MQTT_HOST", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASSWORD = os.getenv("MQTT_PASSWORD", "")
MQTT_CLIENT_ID = os.getenv("MQTT_CLIENT_ID", "iot-automation-server")

# ---------------------------------------------------------------------------
# Flask API server
# ---------------------------------------------------------------------------
FLASK_HOST = os.getenv("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.getenv("FLASK_PORT", "5001"))
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-to-a-random-secret-in-production")

# ---------------------------------------------------------------------------
# Automation cooldowns (seconds)
# ---------------------------------------------------------------------------
HUMIDITY_COOLDOWN_S = int(os.getenv("HUMIDITY_COOLDOWN_S", "120"))
CO2_COOLDOWN_S = int(os.getenv("CO2_COOLDOWN_S", "300"))
VALVE_SAFETY_MIN = int(os.getenv("VALVE_SAFETY_MIN", "30"))
OFFLINE_THRESHOLD_MIN = int(os.getenv("OFFLINE_THRESHOLD_MIN", "5"))
OFFLINE_CHECK_INTERVAL_S = int(os.getenv("OFFLINE_CHECK_INTERVAL_S", "60"))

# ---------------------------------------------------------------------------
# Default thresholds
# ---------------------------------------------------------------------------
DEFAULT_HUMIDITY_ON_PCT = float(os.getenv("DEFAULT_HUMIDITY_ON_PCT", "60.0"))
DEFAULT_HUMIDITY_OFF_PCT = float(os.getenv("DEFAULT_HUMIDITY_OFF_PCT", "80.0"))
DEFAULT_CO2_HIGH_PPM = float(os.getenv("DEFAULT_CO2_HIGH_PPM", "1200.0"))
DEFAULT_CO2_NORMAL_PPM = float(os.getenv("DEFAULT_CO2_NORMAL_PPM", "800.0"))
DEFAULT_TEMP_MIN_C = float(os.getenv("DEFAULT_TEMP_MIN_C", "18.0"))
DEFAULT_TEMP_MAX_C = float(os.getenv("DEFAULT_TEMP_MAX_C", "30.0"))
DEFAULT_WATER_LOW_CM = float(os.getenv("DEFAULT_WATER_LOW_CM", "10.0"))
DEFAULT_WATER_FULL_CM = float(os.getenv("DEFAULT_WATER_FULL_CM", "80.0"))
DEFAULT_FAN_SPEED = int(os.getenv("DEFAULT_FAN_SPEED", "50"))
DEFAULT_FAN_CO2_SPEED = int(os.getenv("DEFAULT_FAN_CO2_SPEED", "100"))
DEFAULT_SENSOR_INTERVAL_S = int(os.getenv("DEFAULT_SENSOR_INTERVAL_S", "30"))

# ---------------------------------------------------------------------------
# Queue limits
# ---------------------------------------------------------------------------
QUEUE_MAX_SIZE = int(os.getenv("QUEUE_MAX_SIZE", "500"))
PUBLISH_QUEUE_MAX = int(os.getenv("PUBLISH_QUEUE_MAX", "500"))

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
