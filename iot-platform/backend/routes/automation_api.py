"""
Blueprint for automation, threshold management, manual device control,
water usage tracking, automation events, and alert querying.
"""

import json
import uuid
import logging
from datetime import datetime, timezone, timedelta

from flask import Blueprint, request, jsonify
import paho.mqtt.publish as mqtt_publish
from sqlalchemy import func

from models import (
    db, Device, Telemetry, Command, Alert,
    DeviceThreshold, WaterUsageSession, AutomationEvent,
)
from routes.auth import login_required
import config

logger = logging.getLogger(__name__)

automation_api_bp = Blueprint("automation_api", __name__)


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


# =========================================================================
#  THRESHOLD MANAGEMENT
# =========================================================================

# ---------------------------------------------------------------------------
# GET /api/thresholds/<device_id>
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/thresholds/<device_id>", methods=["GET"])
@login_required
def get_thresholds(device_id):
    """
    Return the threshold configuration for a device.
    If no thresholds exist yet, create a row with defaults.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    threshold = DeviceThreshold.query.filter_by(device_id=device.id).first()
    if not threshold:
        threshold = DeviceThreshold(device_id=device.id)
        db.session.add(threshold)
        db.session.commit()

    return jsonify(threshold.to_dict()), 200


# ---------------------------------------------------------------------------
# PUT /api/thresholds/<device_id>
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/thresholds/<device_id>", methods=["PUT"])
@login_required
def update_thresholds(device_id):
    """
    Update a subset of threshold fields for a device.
    Only fields present in the request body are updated.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    threshold = DeviceThreshold.query.filter_by(device_id=device.id).first()
    if not threshold:
        threshold = DeviceThreshold(device_id=device.id)
        db.session.add(threshold)

    updatable = [
        "humidity_on_pct", "humidity_off_pct",
        "co2_high_ppm", "co2_normal_ppm",
        "temp_min_c", "temp_max_c",
        "water_low_cm", "water_full_cm",
        "fan_default_speed", "fan_co2_speed",
        "sensor_interval_s", "valve_safety_min",
    ]

    for field in updatable:
        if field in data:
            setattr(threshold, field, data[field])

    db.session.commit()
    return jsonify(threshold.to_dict()), 200


# ---------------------------------------------------------------------------
# POST /api/thresholds/<device_id>/reset
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/thresholds/<device_id>/reset", methods=["POST"])
@login_required
def reset_thresholds(device_id):
    """Reset all thresholds for a device back to their defaults."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    threshold = DeviceThreshold.query.filter_by(device_id=device.id).first()
    if threshold:
        db.session.delete(threshold)

    threshold = DeviceThreshold(device_id=device.id)
    db.session.add(threshold)
    db.session.commit()

    return jsonify(threshold.to_dict()), 200


# =========================================================================
#  MANUAL DEVICE CONTROL
# =========================================================================

# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/fan/on
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/fan/on", methods=["POST"])
@login_required
def fan_on(device_id):
    """Turn the fan on at default speed."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    threshold = DeviceThreshold.query.filter_by(device_id=device.id).first()
    default_speed = threshold.fan_default_speed if threshold else 50

    cmd = _publish_command(device, "fan_on", {"speed_pct": default_speed})
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/fan/off
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/fan/off", methods=["POST"])
@login_required
def fan_off(device_id):
    """Turn the fan off."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "fan_off")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/fan/speed
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/fan/speed", methods=["POST"])
@login_required
def fan_speed(device_id):
    """Set the fan to a specific speed percentage."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not data or "speed_pct" not in data:
        return jsonify({"error": "Missing required field: speed_pct"}), 400

    speed_pct = data["speed_pct"]
    if not isinstance(speed_pct, (int, float)) or speed_pct < 0 or speed_pct > 100:
        return jsonify({"error": "speed_pct must be a number between 0 and 100"}), 400

    cmd = _publish_command(device, "fan_speed", {"speed_pct": int(speed_pct)})
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/mister/on
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/mister/on", methods=["POST"])
@login_required
def mister_on(device_id):
    """Turn the mister on."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "mister_on")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/mister/off
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/mister/off", methods=["POST"])
@login_required
def mister_off(device_id):
    """Turn the mister off."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "mister_off")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/valve/open
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/valve/open", methods=["POST"])
@login_required
def valve_open(device_id):
    """Open the water valve."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "valve_open")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/valve/close
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/valve/close", methods=["POST"])
@login_required
def valve_close(device_id):
    """Close the water valve."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "valve_close")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/fill/start
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/fill/start", methods=["POST"])
@login_required
def fill_start(device_id):
    """Start a tank fill operation."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "fill_start")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/fill/stop
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/fill/stop", methods=["POST"])
@login_required
def fill_stop(device_id):
    """Stop a tank fill operation."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "fill_stop")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/read_now
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/read_now", methods=["POST"])
@login_required
def read_now(device_id):
    """Request an immediate sensor reading from the device."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "read_now")
    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/test_mode/on
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/test_mode/on", methods=["POST"])
@login_required
def test_mode_on(device_id):
    """Enable test mode on a device via MQTT command."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "set_test_mode", {"enabled": True})
    return jsonify({"success": True, "message": "Test mode enabled", "command": cmd.to_dict()}), 201


# ---------------------------------------------------------------------------
# POST /api/control/<device_id>/test_mode/off
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/test_mode/off", methods=["POST"])
@login_required
def test_mode_off(device_id):
    """Disable test mode on a device via MQTT command."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "set_test_mode", {"enabled": False})
    return jsonify({"success": True, "message": "Test mode disabled", "command": cmd.to_dict()}), 201


# ---------------------------------------------------------------------------
# GET /api/control/<device_id>/state
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/control/<device_id>/state", methods=["GET"])
@login_required
def get_device_state(device_id):
    """Return device info combined with its most recent telemetry reading."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    latest_telemetry = (
        Telemetry.query
        .filter_by(device_id=device.id)
        .order_by(Telemetry.received_at.desc())
        .first()
    )

    result = device.to_dict()
    result["latest_telemetry"] = latest_telemetry.to_dict() if latest_telemetry else None

    return jsonify(result), 200


# =========================================================================
#  WATER USAGE
# =========================================================================

# ---------------------------------------------------------------------------
# GET /api/water/<device_id>/sessions
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/water/<device_id>/sessions", methods=["GET"])
@login_required
def get_water_sessions(device_id):
    """
    Return paginated water usage sessions for a device.
    Query parameters:
      ?limit=  (default 50, max 500)
      ?offset= (default 0)
      ?since=  ISO 8601 timestamp
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    try:
        limit = min(int(request.args.get("limit", 50)), 500)
    except ValueError:
        limit = 50

    try:
        offset = max(int(request.args.get("offset", 0)), 0)
    except ValueError:
        offset = 0

    query = WaterUsageSession.query.filter_by(device_id=device.id)

    since = request.args.get("since")
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.filter(WaterUsageSession.session_start >= since_dt)
        except ValueError:
            return jsonify({"error": "Invalid 'since' timestamp format. Use ISO 8601."}), 400

    total = query.count()

    sessions = (
        query
        .order_by(WaterUsageSession.session_start.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return jsonify({
        "total": total,
        "limit": limit,
        "offset": offset,
        "sessions": [s.to_dict() for s in sessions],
    }), 200


# ---------------------------------------------------------------------------
# GET /api/water/<device_id>/sessions/<session_id>
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/water/<device_id>/sessions/<int:session_id>", methods=["GET"])
@login_required
def get_water_session(device_id, session_id):
    """Return a single water usage session."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    session = WaterUsageSession.query.filter_by(
        id=session_id, device_id=device.id
    ).first()

    if not session:
        return jsonify({"error": "Water usage session not found"}), 404

    return jsonify(session.to_dict()), 200


# ---------------------------------------------------------------------------
# GET /api/water/<device_id>/summary
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/water/<device_id>/summary", methods=["GET"])
@login_required
def get_water_summary(device_id):
    """
    Return water usage summary for a device:
    totals and averages for today, this week, this month, and all time.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    def _summarise(since=None):
        """Compute liters total, session count, and average per session."""
        q = WaterUsageSession.query.filter_by(device_id=device.id, completed=True)
        if since:
            q = q.filter(WaterUsageSession.session_start >= since)

        row = q.with_entities(
            func.coalesce(func.sum(WaterUsageSession.liters_used), 0.0),
            func.count(WaterUsageSession.id),
            func.coalesce(func.avg(WaterUsageSession.liters_used), 0.0),
            func.coalesce(func.sum(WaterUsageSession.duration_s), 0),
        ).first()

        return {
            "total_liters": round(float(row[0]), 2),
            "session_count": row[1],
            "avg_liters_per_session": round(float(row[2]), 2),
            "total_duration_s": int(row[3]),
        }

    return jsonify({
        "device_id": str(device.id),
        "today": _summarise(since=today_start),
        "week": _summarise(since=week_start),
        "month": _summarise(since=month_start),
        "all_time": _summarise(),
    }), 200


# ---------------------------------------------------------------------------
# GET /api/water/summary
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/water/summary", methods=["GET"])
@login_required
def get_water_summary_all():
    """
    Return water usage summary across all devices:
    totals and averages for today, this week, this month, and all time.
    """
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    def _summarise(since=None):
        q = WaterUsageSession.query.filter_by(completed=True)
        if since:
            q = q.filter(WaterUsageSession.session_start >= since)

        row = q.with_entities(
            func.coalesce(func.sum(WaterUsageSession.liters_used), 0.0),
            func.count(WaterUsageSession.id),
            func.coalesce(func.avg(WaterUsageSession.liters_used), 0.0),
            func.coalesce(func.sum(WaterUsageSession.duration_s), 0),
        ).first()

        return {
            "total_liters": round(float(row[0]), 2),
            "session_count": row[1],
            "avg_liters_per_session": round(float(row[2]), 2),
            "total_duration_s": int(row[3]),
        }

    return jsonify({
        "today": _summarise(since=today_start),
        "week": _summarise(since=week_start),
        "month": _summarise(since=month_start),
        "all_time": _summarise(),
    }), 200


# =========================================================================
#  AUTOMATION EVENTS
# =========================================================================

# ---------------------------------------------------------------------------
# GET /api/automation/<device_id>/events
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/automation/<device_id>/events", methods=["GET"])
@login_required
def get_automation_events(device_id):
    """
    Return automation events for a device, newest first.
    Query parameters:
      ?limit= (default 50, max 500)
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    try:
        limit = min(int(request.args.get("limit", 50)), 500)
    except ValueError:
        limit = 50

    events = (
        AutomationEvent.query
        .filter_by(device_id=device.id)
        .order_by(AutomationEvent.event_time.desc())
        .limit(limit)
        .all()
    )

    return jsonify([e.to_dict() for e in events]), 200


# =========================================================================
#  ALERTS (extended query)
# =========================================================================

# ---------------------------------------------------------------------------
# GET /api/alerts
# ---------------------------------------------------------------------------
@automation_api_bp.route("/api/alerts", methods=["GET"])
@login_required
def get_alerts():
    """
    Return alerts with optional filtering.
    Query parameters:
      ?device_id= - filter by device UUID
      ?resolved=  - filter by resolved status (true/false)
      ?limit=     - max records (default 100, max 1000)
    """
    query = Alert.query

    device_id = request.args.get("device_id")
    if device_id:
        query = query.filter(Alert.device_id == device_id)

    resolved_param = request.args.get("resolved")
    if resolved_param is not None:
        resolved = resolved_param.lower() in ("true", "1", "yes")
        query = query.filter(Alert.resolved == resolved)

    try:
        limit = min(int(request.args.get("limit", 100)), 1000)
    except ValueError:
        limit = 100

    alerts = (
        query
        .order_by(Alert.triggered_at.desc())
        .limit(limit)
        .all()
    )

    return jsonify([a.to_dict() for a in alerts]), 200
