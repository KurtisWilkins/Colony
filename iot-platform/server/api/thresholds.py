"""
Flask blueprint for device threshold management.

Endpoints:
    GET  /api/thresholds/<device_id>       -- get thresholds (creates defaults if none)
    PUT  /api/thresholds/<device_id>       -- update thresholds, push config via MQTT
    POST /api/thresholds/<device_id>/reset -- reset to defaults
"""

import logging
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request

from db.connection import get_session
from models.device import Device
from models.threshold import DeviceThreshold

import config

logger = logging.getLogger(__name__)

thresholds_bp = Blueprint("thresholds", __name__)

# These will be set by main.py during initialisation
_threshold_cache = None
_command_sender = None


def init_thresholds_api(threshold_cache, command_sender):
    """Inject dependencies from main.py."""
    global _threshold_cache, _command_sender
    _threshold_cache = threshold_cache
    _command_sender = command_sender


@thresholds_bp.route("/api/thresholds/<device_id>", methods=["GET"])
def get_thresholds(device_id):
    """
    Get thresholds for a device. Creates default thresholds if none exist.
    """
    session = get_session()
    try:
        # Verify device exists
        device = session.query(Device).filter_by(id=device_id).first()
        if not device:
            return jsonify({"error": "Device not found"}), 404

        # Look up or create thresholds
        threshold = session.query(DeviceThreshold).filter_by(device_id=device_id).first()
        if not threshold:
            threshold = DeviceThreshold(device_id=device_id)
            session.add(threshold)
            session.commit()
            logger.info("Created default thresholds for device %s", device_id)

        result = threshold.to_dict()
        return jsonify(result), 200

    except Exception:
        session.rollback()
        logger.exception("Error getting thresholds for device %s", device_id)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        session.close()


@thresholds_bp.route("/api/thresholds/<device_id>", methods=["PUT"])
def update_thresholds(device_id):
    """
    Update thresholds for a device and push config to the device via MQTT.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body required"}), 400

    session = get_session()
    try:
        # Verify device exists
        device = session.query(Device).filter_by(id=device_id).first()
        if not device:
            return jsonify({"error": "Device not found"}), 404

        # Get or create thresholds
        threshold = session.query(DeviceThreshold).filter_by(device_id=device_id).first()
        if not threshold:
            threshold = DeviceThreshold(device_id=device_id)
            session.add(threshold)

        # Update only provided fields
        updatable_fields = [
            "humidity_on_pct", "humidity_off_pct",
            "co2_high_ppm", "co2_normal_ppm",
            "temp_min_c", "temp_max_c",
            "water_low_cm", "water_full_cm",
            "fan_default_speed", "fan_co2_speed",
            "sensor_interval_s", "valve_safety_min",
        ]

        updated = {}
        for field in updatable_fields:
            if field in data:
                setattr(threshold, field, data[field])
                updated[field] = data[field]

        threshold.updated_at = datetime.now(timezone.utc)
        session.commit()

        # Update cache
        if _threshold_cache:
            _threshold_cache.update(device_id, updated)

        # Push config to device via MQTT
        if _command_sender and updated:
            config_payload = {
                "config_type": "thresholds",
                **updated,
            }
            _command_sender.update_config(device, config_payload)

        result = threshold.to_dict()
        return jsonify(result), 200

    except Exception:
        session.rollback()
        logger.exception("Error updating thresholds for device %s", device_id)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        session.close()


@thresholds_bp.route("/api/thresholds/<device_id>/reset", methods=["POST"])
def reset_thresholds(device_id):
    """
    Reset thresholds to defaults for a device.
    """
    session = get_session()
    try:
        # Verify device exists
        device = session.query(Device).filter_by(id=device_id).first()
        if not device:
            return jsonify({"error": "Device not found"}), 404

        threshold = session.query(DeviceThreshold).filter_by(device_id=device_id).first()
        if not threshold:
            threshold = DeviceThreshold(device_id=device_id)
            session.add(threshold)
        else:
            threshold.reset_to_defaults()

        session.commit()

        # Invalidate cache so it reloads
        if _threshold_cache:
            _threshold_cache.invalidate(device_id)

        # Push default config to device
        if _command_sender:
            config_payload = {
                "config_type": "thresholds",
                "humidity_on_pct": config.DEFAULT_HUMIDITY_ON_PCT,
                "humidity_off_pct": config.DEFAULT_HUMIDITY_OFF_PCT,
                "co2_high_ppm": config.DEFAULT_CO2_HIGH_PPM,
                "co2_normal_ppm": config.DEFAULT_CO2_NORMAL_PPM,
                "temp_min_c": config.DEFAULT_TEMP_MIN_C,
                "temp_max_c": config.DEFAULT_TEMP_MAX_C,
                "water_low_cm": config.DEFAULT_WATER_LOW_CM,
                "water_full_cm": config.DEFAULT_WATER_FULL_CM,
                "fan_default_speed": config.DEFAULT_FAN_SPEED,
                "fan_co2_speed": config.DEFAULT_FAN_CO2_SPEED,
                "sensor_interval_s": config.DEFAULT_SENSOR_INTERVAL_S,
                "valve_safety_min": config.VALVE_SAFETY_MIN,
            }
            _command_sender.update_config(device, config_payload)

        result = threshold.to_dict()
        return jsonify({"message": "Thresholds reset to defaults", "thresholds": result}), 200

    except Exception:
        session.rollback()
        logger.exception("Error resetting thresholds for device %s", device_id)
        return jsonify({"error": "Internal server error"}), 500
    finally:
        session.close()
