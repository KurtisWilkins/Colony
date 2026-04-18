"""
Blueprint for climate control management, runtime session tracking,
and manual heater/cooling/dehumidifier control.
"""

import json
import uuid
import logging
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
import paho.mqtt.publish as mqtt_publish
from sqlalchemy import func

from models import (
    db, Device, Telemetry, Command,
    DeviceThreshold, ClimateRuntimeSession,
)
from routes.auth import login_required
import config

logger = logging.getLogger(__name__)

climate_bp = Blueprint("climate", __name__)


# ---------------------------------------------------------------------------
# Helper: look up a device or return a 404 JSON response
# ---------------------------------------------------------------------------
def _get_device_or_404(device_id):
    """Return the Device instance or (None, error_response)."""
    device = Device.query.get(device_id)
    if not device:
        return None, (jsonify({"error": "Device not found"}), 404)
    return device, None


# ---------------------------------------------------------------------------
# Helper: publish an MQTT command and record it in the commands table
# ---------------------------------------------------------------------------
def _publish_command(device, command_type, payload=None):
    """
    Build an MQTT message, publish it to the device's command topic,
    and persist a Command row.  Returns the Command object.
    """
    if payload is None:
        payload = {}

    command_id = str(uuid.uuid4())

    # Persist in the database
    cmd = Command(
        device_id=device.id,
        command_type=command_type,
        payload=payload,
    )
    db.session.add(cmd)
    db.session.commit()

    # MQTT topic: {facility}/{building}/{unit}/{device_name}/command
    topic = (
        f"{device.facility}/{device.building}/{device.unit}/"
        f"{device.device_name}/command"
    )

    mqtt_message = json.dumps({
        "command_id": command_id,
        "command": command_type,
        "payload": payload,
    })

    try:
        mqtt_publish.single(
            topic,
            payload=mqtt_message,
            hostname=config.MQTT_BROKER_HOST,
            port=config.MQTT_BROKER_PORT,
        )
        logger.info("Published command %s to MQTT topic %s", command_id, topic)
    except Exception as exc:
        logger.error("Failed to publish command to MQTT: %s", exc)

    return cmd


# ---------------------------------------------------------------------------
# Helper: get or create DeviceThreshold for a device
# ---------------------------------------------------------------------------
def _get_or_create_threshold(device):
    """Return the DeviceThreshold row, creating one with defaults if missing."""
    threshold = DeviceThreshold.query.filter_by(device_id=device.id).first()
    if not threshold:
        threshold = DeviceThreshold(device_id=device.id)
        db.session.add(threshold)
        db.session.commit()
    return threshold


# =========================================================================
#  CLIMATE THRESHOLD CONFIGURATION
# =========================================================================

# ---------------------------------------------------------------------------
# GET /api/climate/<device_id>
# ---------------------------------------------------------------------------
@climate_bp.route("/api/climate/<device_id>", methods=["GET"])
@login_required
def get_climate_config(device_id):
    """
    Return climate thresholds, latest telemetry climate fields,
    and today's runtime summary for the device.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    threshold = _get_or_create_threshold(device)

    # Extract climate-specific threshold fields
    climate_fields = [
        "heat_on_c", "heat_off_c", "cool_on_c", "cool_off_c",
        "dehumid_on_pct", "dehumid_off_pct",
        "heater_safety_min", "cooling_safety_min",
        "climate_enabled", "schedule_enabled",
        "day_start_hour", "night_start_hour",
        "night_heat_on_c", "night_heat_off_c",
        "night_cool_on_c", "night_cool_off_c",
    ]
    climate_config = {f: getattr(threshold, f) for f in climate_fields}
    climate_config["device_id"] = str(device.id)

    # Latest telemetry climate-related payload fields
    latest = (
        Telemetry.query
        .filter_by(device_id=device.id)
        .order_by(Telemetry.received_at.desc())
        .first()
    )
    latest_climate = None
    if latest and latest.payload:
        p = latest.payload
        latest_climate = {
            "received_at": latest.received_at.isoformat() if latest.received_at else None,
            "temperature_c": p.get("temperature_c"),
            "humidity_pct": p.get("humidity_pct"),
            "heater_on": p.get("heater_on"),
            "cooling_on": p.get("cooling_on"),
            "dehumidifier_on": p.get("dehumidifier_on"),
        }

    # Today's runtime summary
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    today_sessions = (
        ClimateRuntimeSession.query
        .filter_by(device_id=device.id)
        .filter(ClimateRuntimeSession.session_start >= today_start)
        .all()
    )

    runtime_today = {}
    for s in today_sessions:
        dt = s.device_type
        if dt not in runtime_today:
            runtime_today[dt] = {"total_s": 0, "session_count": 0}
        runtime_today[dt]["total_s"] += s.duration_s or 0
        runtime_today[dt]["session_count"] += 1

    return jsonify({
        "config": climate_config,
        "latest_telemetry": latest_climate,
        "runtime_today": runtime_today,
    }), 200


# ---------------------------------------------------------------------------
# PUT /api/climate/<device_id>
# ---------------------------------------------------------------------------
@climate_bp.route("/api/climate/<device_id>", methods=["PUT"])
@login_required
def update_climate_config(device_id):
    """
    Update climate threshold fields for a device.
    Validates hysteresis relationships before saving.
    Pushes update_climate_config command via MQTT.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    threshold = _get_or_create_threshold(device)

    updatable = [
        "heat_on_c", "heat_off_c", "cool_on_c", "cool_off_c",
        "dehumid_on_pct", "dehumid_off_pct",
        "heater_safety_min", "cooling_safety_min",
        "climate_enabled", "schedule_enabled",
        "day_start_hour", "night_start_hour",
        "night_heat_on_c", "night_heat_off_c",
        "night_cool_on_c", "night_cool_off_c",
    ]

    for field in updatable:
        if field in data:
            setattr(threshold, field, data[field])

    # Validate hysteresis: heat_off must be > heat_on
    if threshold.heat_off_c is not None and threshold.heat_on_c is not None:
        if threshold.heat_off_c <= threshold.heat_on_c:
            return jsonify({"error": "heat_off_c must be greater than heat_on_c"}), 400

    # Validate hysteresis: cool_on must be > cool_off
    if threshold.cool_on_c is not None and threshold.cool_off_c is not None:
        if threshold.cool_on_c <= threshold.cool_off_c:
            return jsonify({"error": "cool_on_c must be greater than cool_off_c"}), 400

    # Validate hysteresis: dehumid_on must be > dehumid_off
    if threshold.dehumid_on_pct is not None and threshold.dehumid_off_pct is not None:
        if threshold.dehumid_on_pct <= threshold.dehumid_off_pct:
            return jsonify({"error": "dehumid_on_pct must be greater than dehumid_off_pct"}), 400

    # Validate night hysteresis as well
    if threshold.night_heat_off_c is not None and threshold.night_heat_on_c is not None:
        if threshold.night_heat_off_c <= threshold.night_heat_on_c:
            return jsonify({"error": "night_heat_off_c must be greater than night_heat_on_c"}), 400

    if threshold.night_cool_on_c is not None and threshold.night_cool_off_c is not None:
        if threshold.night_cool_on_c <= threshold.night_cool_off_c:
            return jsonify({"error": "night_cool_on_c must be greater than night_cool_off_c"}), 400

    db.session.commit()

    # Push updated config to device via MQTT
    climate_payload = {f: getattr(threshold, f) for f in updatable}
    _publish_command(device, "update_climate_config", climate_payload)

    return jsonify(threshold.to_dict()), 200


# ---------------------------------------------------------------------------
# POST /api/climate/<device_id>/enable
# ---------------------------------------------------------------------------
@climate_bp.route("/api/climate/<device_id>/enable", methods=["POST"])
@login_required
def enable_climate(device_id):
    """Enable climate control for a device."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    threshold = _get_or_create_threshold(device)
    threshold.climate_enabled = True
    db.session.commit()

    cmd = _publish_command(device, "set_climate_enabled", {"enabled": True})
    return jsonify({"success": True, "climate_enabled": True, "command": cmd.to_dict()}), 200


# ---------------------------------------------------------------------------
# POST /api/climate/<device_id>/disable
# ---------------------------------------------------------------------------
@climate_bp.route("/api/climate/<device_id>/disable", methods=["POST"])
@login_required
def disable_climate(device_id):
    """Disable climate control for a device."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    threshold = _get_or_create_threshold(device)
    threshold.climate_enabled = False
    db.session.commit()

    cmd = _publish_command(device, "set_climate_enabled", {"enabled": False})
    return jsonify({"success": True, "climate_enabled": False, "command": cmd.to_dict()}), 200


# =========================================================================
#  CLIMATE RUNTIME SESSIONS
# =========================================================================

# ---------------------------------------------------------------------------
# GET /api/climate/<device_id>/sessions
# ---------------------------------------------------------------------------
@climate_bp.route("/api/climate/<device_id>/sessions", methods=["GET"])
@login_required
def get_climate_sessions(device_id):
    """
    Return climate runtime sessions for a device, newest first.
    Query parameters:
      ?device_type= - filter by device type (heater, cooling, dehumidifier)
      ?limit=       - max records (default 50, max 500)
      ?since=       - ISO 8601 timestamp; only records after this time
      ?exclude_test - exclude test mode sessions (true/false)
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    query = ClimateRuntimeSession.query.filter_by(device_id=device.id)

    # Filter by device type
    device_type = request.args.get("device_type")
    if device_type:
        query = query.filter(ClimateRuntimeSession.device_type == device_type)

    # Filter by time
    since = request.args.get("since")
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.filter(ClimateRuntimeSession.session_start >= since_dt)
        except ValueError:
            return jsonify({"error": "Invalid 'since' timestamp format. Use ISO 8601."}), 400

    # Exclude test mode sessions
    exclude_test = request.args.get("exclude_test", "false").lower() in ("true", "1", "yes")
    if exclude_test:
        query = query.filter(ClimateRuntimeSession.test_mode == False)  # noqa: E712

    # Limit
    try:
        limit = min(int(request.args.get("limit", 50)), 500)
    except ValueError:
        limit = 50

    sessions = (
        query
        .order_by(ClimateRuntimeSession.session_start.desc())
        .limit(limit)
        .all()
    )

    return jsonify([s.to_dict() for s in sessions]), 200


# ---------------------------------------------------------------------------
# GET /api/climate/<device_id>/summary
# ---------------------------------------------------------------------------
@climate_bp.route("/api/climate/<device_id>/summary", methods=["GET"])
@login_required
def get_climate_summary(device_id):
    """
    Return per-device-type runtime totals for today, week, month, and all time.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    def _summarise(since=None):
        """Compute runtime totals grouped by device_type."""
        q = ClimateRuntimeSession.query.filter_by(device_id=device.id)
        if since:
            q = q.filter(ClimateRuntimeSession.session_start >= since)

        rows = (
            q.with_entities(
                ClimateRuntimeSession.device_type,
                func.coalesce(func.sum(ClimateRuntimeSession.duration_s), 0),
                func.count(ClimateRuntimeSession.id),
                func.sum(
                    db.case(
                        (ClimateRuntimeSession.safety_cutoff == True, 1),  # noqa: E712
                        else_=0,
                    )
                ),
            )
            .group_by(ClimateRuntimeSession.device_type)
            .all()
        )

        result = {}
        for device_type, total_s, count, safety_count in rows:
            result[device_type] = {
                "total_duration_s": int(total_s),
                "session_count": count,
                "safety_cutoff_count": int(safety_count or 0),
            }
        return result

    return jsonify({
        "device_id": str(device.id),
        "today": _summarise(since=today_start),
        "week": _summarise(since=week_start),
        "month": _summarise(since=month_start),
        "all_time": _summarise(),
    }), 200


# =========================================================================
#  MANUAL CLIMATE DEVICE CONTROL
# =========================================================================

# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/heater/on
# ---------------------------------------------------------------------------
@climate_bp.route("/api/control/<device_id>/heater/on", methods=["POST"])
@login_required
def heater_on(device_id):
    """Turn the heater on."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "heater_on")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/heater/off
# ---------------------------------------------------------------------------
@climate_bp.route("/api/control/<device_id>/heater/off", methods=["POST"])
@login_required
def heater_off(device_id):
    """Turn the heater off."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "heater_off")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/cooling/on
# ---------------------------------------------------------------------------
@climate_bp.route("/api/control/<device_id>/cooling/on", methods=["POST"])
@login_required
def cooling_on(device_id):
    """Turn the cooling system on."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "cooling_on")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/cooling/off
# ---------------------------------------------------------------------------
@climate_bp.route("/api/control/<device_id>/cooling/off", methods=["POST"])
@login_required
def cooling_off(device_id):
    """Turn the cooling system off."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "cooling_off")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/dehumidifier/on
# ---------------------------------------------------------------------------
@climate_bp.route("/api/control/<device_id>/dehumidifier/on", methods=["POST"])
@login_required
def dehumidifier_on(device_id):
    """Turn the dehumidifier on."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "dehumidifier_on")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/dehumidifier/off
# ---------------------------------------------------------------------------
@climate_bp.route("/api/control/<device_id>/dehumidifier/off", methods=["POST"])
@login_required
def dehumidifier_off(device_id):
    """Turn the dehumidifier off."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "dehumidifier_off")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/climate/all_off
# ---------------------------------------------------------------------------
@climate_bp.route("/api/control/<device_id>/climate/all_off", methods=["POST"])
@login_required
def climate_all_off(device_id):
    """Turn off all climate devices (heater, cooling, dehumidifier)."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "climate_all_off")
    return jsonify(cmd.to_dict()), 201
