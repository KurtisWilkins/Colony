"""
Blueprint for irrigation controller management.
Provides endpoints for zone configuration, scheduling, seasonal profiles,
weather-based skip logic, zone events, and runtime summaries.
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
    IrrigationZone, IrrigationSchedule, IrrigationSeasonalConfig,
    IrrigationZoneEvent, IrrigationWeather,
)
from routes.auth import login_required
import config

logger = logging.getLogger(__name__)

irrigation_bp = Blueprint("irrigation", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _get_device_or_404(device_id):
    """Return the Device instance or (None, error_response)."""
    device = Device.query.get(device_id)
    if not device:
        return None, (jsonify({"error": "Device not found"}), 404)
    return device, None


def _publish_command(device, command_type, payload=None):
    """
    Build an MQTT message, publish it to the device's command topic,
    and persist a Command row.  Returns the Command object.

    Translates backend command_type names into the names the irrigation
    firmware expects, and flattens payload keys to top-level so the
    firmware's top-level doc[...] reads find them.
    """
    if payload is None:
        payload = {}

    # Map backend-style command names to firmware-expected names
    FIRMWARE_COMMAND_MAP = {
        "zone_open": "open_zone",
        "zone_close": "close_zone",
        "zone_close_all": "close_all",
    }
    # Map backend payload keys to firmware-expected top-level keys
    PAYLOAD_KEY_MAP = {
        "zone_index": "zone",
    }

    firmware_command = FIRMWARE_COMMAND_MAP.get(command_type, command_type)

    command_id = str(uuid.uuid4())

    # Persist in the database (keep backend-style name for our records)
    cmd = Command(
        device_id=device.id,
        command_type=command_type,
        payload=payload,
    )
    db.session.add(cmd)
    db.session.commit()

    topic = (
        f"{device.facility}/{device.building}/{device.unit}/"
        f"{device.device_name}/command"
    )

    # Build the MQTT message: firmware expects params at top level, so
    # flatten payload with key translation. Keep "payload" nested too for
    # any commands that also read from there.
    message = {
        "command_id": command_id,
        "command": firmware_command,
        "payload": payload,
    }
    for k, v in payload.items():
        message[PAYLOAD_KEY_MAP.get(k, k)] = v

    mqtt_message = json.dumps(message)

    try:
        mqtt_publish.single(
            topic,
            payload=mqtt_message,
            hostname=config.MQTT_BROKER_HOST,
            port=config.MQTT_BROKER_PORT,
        )
        logger.info("Published command %s (%s) to MQTT topic %s", command_id, firmware_command, topic)
    except Exception as exc:
        logger.error("Failed to publish command to MQTT: %s", exc)

    return cmd


# =========================================================================
#  ZONE CONFIGURATION
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/zones", methods=["GET"])
@login_required
def get_zones(device_id):
    """Return all irrigation zones for a device, ordered by zone_index."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    zones = (
        IrrigationZone.query
        .filter_by(device_id=device.id)
        .order_by(IrrigationZone.zone_index)
        .all()
    )
    return jsonify([z.to_dict() for z in zones]), 200


@irrigation_bp.route("/api/irrigation/<device_id>/zones", methods=["PUT"])
@login_required
def update_zones(device_id):
    """
    Create or update irrigation zones for a device.
    Accepts a JSON list of zone objects, each must include zone_index.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not isinstance(data, list):
        return jsonify({"error": "Request body must be a JSON array of zone objects"}), 400

    results = []
    for zone_data in data:
        zone_index = zone_data.get("zone_index")
        if zone_index is None or not isinstance(zone_index, int) or zone_index < 0 or zone_index > 15:
            return jsonify({"error": f"Invalid or missing zone_index (must be 0-15): {zone_index}"}), 400

        zone = IrrigationZone.query.filter_by(
            device_id=device.id, zone_index=zone_index
        ).first()

        if not zone:
            zone = IrrigationZone(device_id=device.id, zone_index=zone_index)
            db.session.add(zone)

        for field in ("name", "enabled", "runtime_s", "zone_group", "gpio_pin"):
            if field in zone_data:
                setattr(zone, field, zone_data[field])

        results.append(zone)

    db.session.commit()
    return jsonify([z.to_dict() for z in results]), 200


@irrigation_bp.route("/api/irrigation/<device_id>/zones/<int:zone_index>", methods=["PUT"])
@login_required
def update_single_zone(device_id, zone_index):
    """
    Update a single zone's configuration AND push configure_zone to the
    firmware so the device applies the name/runtime/enabled/group in NVS.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    if zone_index < 0 or zone_index > 15:
        return jsonify({"error": "zone_index must be between 0 and 15"}), 400

    data = request.get_json(silent=True) or {}

    zone = IrrigationZone.query.filter_by(
        device_id=device.id, zone_index=zone_index
    ).first()
    if not zone:
        zone = IrrigationZone(device_id=device.id, zone_index=zone_index)
        db.session.add(zone)

    for field in ("name", "enabled", "runtime_s", "zone_group", "gpio_pin"):
        if field in data:
            setattr(zone, field, data[field])

    db.session.commit()

    # Push to firmware so NVS gets updated. configure_zone reads from payload
    # nested object AND top-level keys; _publish_command emits both.
    cfg = {"zone_index": zone_index}
    if "name" in data:      cfg["name"] = data["name"]
    if "runtime_s" in data: cfg["runtime_s"] = int(data["runtime_s"])
    if "enabled" in data:   cfg["enabled"] = bool(data["enabled"])
    if "zone_group" in data:
        try:
            cfg["group"] = int(data["zone_group"])
        except (ValueError, TypeError):
            pass  # firmware expects int; skip non-numeric groups

    _publish_command(device, "configure_zone", cfg)

    return jsonify(zone.to_dict()), 200


# =========================================================================
#  ZONE CONTROL (open / close / close_all)
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/zones/<int:zone_index>/open", methods=["POST"])
@login_required
def open_zone(device_id, zone_index):
    """Open (activate) a specific irrigation zone."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    if zone_index < 0 or zone_index > 15:
        return jsonify({"error": "zone_index must be between 0 and 15"}), 400

    data = request.get_json(silent=True) or {}
    runtime_s = data.get("runtime_s")
    test_mode = data.get("test_mode", False)

    payload = {"zone_index": zone_index}
    if runtime_s is not None:
        payload["runtime_s"] = int(runtime_s)
    if test_mode:
        payload["test_mode"] = True

    cmd = _publish_command(device, "zone_open", payload)

    # Log the event
    zone = IrrigationZone.query.filter_by(
        device_id=device.id, zone_index=zone_index
    ).first()

    event = IrrigationZoneEvent(
        device_id=device.id,
        zone_index=zone_index,
        zone_name=zone.name if zone else None,
        event_type="open",
        trigger_type="manual",
        runtime_s=runtime_s,
        test_mode=test_mode,
    )
    db.session.add(event)
    db.session.commit()

    return jsonify({"success": True, "command": cmd.to_dict(), "event_id": event.id}), 201


@irrigation_bp.route("/api/irrigation/<device_id>/zones/<int:zone_index>/close", methods=["POST"])
@login_required
def close_zone(device_id, zone_index):
    """Close (deactivate) a specific irrigation zone."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    if zone_index < 0 or zone_index > 15:
        return jsonify({"error": "zone_index must be between 0 and 15"}), 400

    cmd = _publish_command(device, "zone_close", {"zone_index": zone_index})

    zone = IrrigationZone.query.filter_by(
        device_id=device.id, zone_index=zone_index
    ).first()

    event = IrrigationZoneEvent(
        device_id=device.id,
        zone_index=zone_index,
        zone_name=zone.name if zone else None,
        event_type="close",
        trigger_type="manual",
    )
    db.session.add(event)
    db.session.commit()

    return jsonify({"success": True, "command": cmd.to_dict(), "event_id": event.id}), 201


@irrigation_bp.route("/api/irrigation/<device_id>/close_all", methods=["POST"])
@login_required
def close_all_zones(device_id):
    """Close all irrigation zones on a device."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "zone_close_all", {})

    event = IrrigationZoneEvent(
        device_id=device.id,
        zone_index=-1,
        zone_name="ALL",
        event_type="close",
        trigger_type="manual",
    )
    db.session.add(event)
    db.session.commit()

    return jsonify({"success": True, "command": cmd.to_dict(), "event_id": event.id}), 201


# =========================================================================
#  SCHEDULES
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/schedules", methods=["GET"])
@login_required
def get_schedules(device_id):
    """Return all irrigation schedules for a device."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    schedules = (
        IrrigationSchedule.query
        .filter_by(device_id=device.id)
        .order_by(IrrigationSchedule.zone_index)
        .all()
    )
    return jsonify([s.to_dict() for s in schedules]), 200


@irrigation_bp.route("/api/irrigation/<device_id>/schedules", methods=["PUT"])
@login_required
def update_schedules(device_id):
    """
    Create or update irrigation schedules.
    Accepts a JSON list of schedule objects, each must include zone_index.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not isinstance(data, list):
        return jsonify({"error": "Request body must be a JSON array of schedule objects"}), 400

    results = []
    for sched_data in data:
        zone_index = sched_data.get("zone_index")
        if zone_index is None:
            return jsonify({"error": "Each schedule must include zone_index"}), 400

        schedule = IrrigationSchedule.query.filter_by(
            device_id=device.id, zone_index=zone_index
        ).first()

        if not schedule:
            schedule = IrrigationSchedule(device_id=device.id, zone_index=zone_index)
            db.session.add(schedule)

        for field in ("enabled", "runtime_s", "days_of_week", "times", "seasonal_config_index"):
            if field in sched_data:
                setattr(schedule, field, sched_data[field])

        results.append(schedule)

    db.session.commit()

    # Push updated schedules to the device
    _publish_command(device, "set_schedules", {
        "schedules": [s.to_dict() for s in results]
    })

    return jsonify([s.to_dict() for s in results]), 200


@irrigation_bp.route("/api/irrigation/<device_id>/run_program", methods=["POST"])
@login_required
def run_program(device_id):
    """
    Run a full irrigation program: sequentially open all enabled scheduled zones.
    Optional JSON body: { "zone_indices": [0,1,2] } to run specific zones only.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    zone_indices = data.get("zone_indices")

    query = IrrigationSchedule.query.filter_by(device_id=device.id, enabled=True)
    if zone_indices is not None:
        query = query.filter(IrrigationSchedule.zone_index.in_(zone_indices))

    schedules = query.order_by(IrrigationSchedule.zone_index).all()

    if not schedules:
        return jsonify({"error": "No enabled schedules found"}), 404

    program = []
    for sched in schedules:
        zone = IrrigationZone.query.filter_by(
            device_id=device.id, zone_index=sched.zone_index
        ).first()
        program.append({
            "zone_index": sched.zone_index,
            "zone_name": zone.name if zone else None,
            "runtime_s": sched.runtime_s,
        })

    cmd = _publish_command(device, "run_program", {"program": program})

    # Log events for each zone in the program
    for entry in program:
        event = IrrigationZoneEvent(
            device_id=device.id,
            zone_index=entry["zone_index"],
            zone_name=entry["zone_name"],
            event_type="open",
            trigger_type="program",
            runtime_s=entry["runtime_s"],
        )
        db.session.add(event)

    db.session.commit()

    return jsonify({
        "success": True,
        "command": cmd.to_dict(),
        "program": program,
    }), 201


# =========================================================================
#  SEASONAL CONFIGS
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/seasonal", methods=["GET"])
@login_required
def get_seasonal_configs(device_id):
    """Return all seasonal configs for a device."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    configs = (
        IrrigationSeasonalConfig.query
        .filter_by(device_id=device.id)
        .order_by(IrrigationSeasonalConfig.config_index)
        .all()
    )
    return jsonify([c.to_dict() for c in configs]), 200


@irrigation_bp.route("/api/irrigation/<device_id>/seasonal", methods=["PUT"])
@login_required
def update_seasonal_configs(device_id):
    """
    Create or update seasonal configs.
    Accepts a JSON list of config objects, each must include config_index.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not isinstance(data, list):
        return jsonify({"error": "Request body must be a JSON array of config objects"}), 400

    results = []
    for cfg_data in data:
        config_index = cfg_data.get("config_index")
        if config_index is None or not isinstance(config_index, int) or config_index < 0 or config_index > 7:
            return jsonify({"error": f"Invalid or missing config_index (must be 0-7): {config_index}"}), 400

        cfg = IrrigationSeasonalConfig.query.filter_by(
            device_id=device.id, config_index=config_index
        ).first()

        if not cfg:
            cfg = IrrigationSeasonalConfig(device_id=device.id, config_index=config_index)
            db.session.add(cfg)

        for field in (
            "name", "start_month", "start_day", "end_month", "end_day",
            "runtime_multiplier", "skip_if_rained", "skip_rain_threshold_mm", "enabled",
        ):
            if field in cfg_data:
                setattr(cfg, field, cfg_data[field])

        results.append(cfg)

    db.session.commit()

    # Push updated seasonal configs to the device
    _publish_command(device, "set_seasonal_configs", {
        "configs": [c.to_dict() for c in results]
    })

    return jsonify([c.to_dict() for c in results]), 200


@irrigation_bp.route("/api/irrigation/<device_id>/seasonal/<int:config_index>", methods=["DELETE"])
@login_required
def delete_seasonal_config(device_id, config_index):
    """Delete a seasonal config by device and config_index."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cfg = IrrigationSeasonalConfig.query.filter_by(
        device_id=device.id, config_index=config_index
    ).first()

    if not cfg:
        return jsonify({"error": "Seasonal config not found"}), 404

    db.session.delete(cfg)
    db.session.commit()

    return jsonify({"success": True, "deleted_config_index": config_index}), 200


# =========================================================================
#  WEATHER
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/weather", methods=["POST"])
@login_required
def post_weather(device_id):
    """Record a weather data snapshot for a device."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    weather = IrrigationWeather(
        device_id=device.id,
        rainfall_24h_mm=data.get("rainfall_24h_mm"),
        temperature_c=data.get("temperature_c"),
        forecast_rain_mm=data.get("forecast_rain_mm"),
        weather_skip_active=data.get("weather_skip_active", False),
    )
    db.session.add(weather)
    db.session.commit()

    return jsonify(weather.to_dict()), 201


@irrigation_bp.route("/api/irrigation/<device_id>/weather", methods=["GET"])
@login_required
def get_weather(device_id):
    """
    Return recent weather records for a device.
    Query parameters:
      ?limit=  (default 24, max 200)
      ?since=  ISO 8601 timestamp
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    try:
        limit = min(int(request.args.get("limit", 24)), 200)
    except ValueError:
        limit = 24

    query = IrrigationWeather.query.filter_by(device_id=device.id)

    since = request.args.get("since")
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.filter(IrrigationWeather.recorded_at >= since_dt)
        except ValueError:
            return jsonify({"error": "Invalid 'since' timestamp format. Use ISO 8601."}), 400

    records = (
        query
        .order_by(IrrigationWeather.recorded_at.desc())
        .limit(limit)
        .all()
    )

    return jsonify([r.to_dict() for r in records]), 200


# =========================================================================
#  ZONE EVENTS
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/events", methods=["GET"])
@login_required
def get_events(device_id):
    """
    Return irrigation zone events for a device with filtering.
    Query parameters:
      ?zone=          filter by zone_index
      ?limit=         max records (default 100, max 1000)
      ?since=         ISO 8601 timestamp
      ?exclude_test=  true/false - exclude test_mode events (default false)
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    try:
        limit = min(int(request.args.get("limit", 100)), 1000)
    except ValueError:
        limit = 100

    query = IrrigationZoneEvent.query.filter_by(device_id=device.id)

    zone = request.args.get("zone")
    if zone is not None:
        try:
            query = query.filter(IrrigationZoneEvent.zone_index == int(zone))
        except ValueError:
            return jsonify({"error": "Invalid 'zone' parameter, must be an integer"}), 400

    since = request.args.get("since")
    if since:
        try:
            since_dt = datetime.fromisoformat(since)
            query = query.filter(IrrigationZoneEvent.timestamp >= since_dt)
        except ValueError:
            return jsonify({"error": "Invalid 'since' timestamp format. Use ISO 8601."}), 400

    exclude_test = request.args.get("exclude_test", "false").lower() in ("true", "1", "yes")
    if exclude_test:
        query = query.filter(IrrigationZoneEvent.test_mode == False)  # noqa: E712

    events = (
        query
        .order_by(IrrigationZoneEvent.timestamp.desc())
        .limit(limit)
        .all()
    )

    return jsonify([e.to_dict() for e in events]), 200


# =========================================================================
#  RUNTIME SUMMARY
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/runtime_summary", methods=["GET"])
@login_required
def get_runtime_summary(device_id):
    """
    Return runtime summary per zone for a device.
    Aggregates total runtime and event counts for today, this week, this month, all time.
    Query parameters:
      ?exclude_test=  true/false (default true)
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    exclude_test = request.args.get("exclude_test", "true").lower() in ("true", "1", "yes")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    def _summarise_zones(since=None):
        q = (
            db.session.query(
                IrrigationZoneEvent.zone_index,
                func.coalesce(func.sum(IrrigationZoneEvent.runtime_s), 0),
                func.count(IrrigationZoneEvent.id),
            )
            .filter(
                IrrigationZoneEvent.device_id == device.id,
                IrrigationZoneEvent.event_type == "open",
            )
        )
        if exclude_test:
            q = q.filter(IrrigationZoneEvent.test_mode == False)  # noqa: E712
        if since:
            q = q.filter(IrrigationZoneEvent.timestamp >= since)

        q = q.group_by(IrrigationZoneEvent.zone_index)
        rows = q.all()

        return {
            str(row[0]): {
                "total_runtime_s": int(row[1]),
                "event_count": row[2],
            }
            for row in rows
        }

    return jsonify({
        "device_id": str(device.id),
        "today": _summarise_zones(since=today_start),
        "week": _summarise_zones(since=week_start),
        "month": _summarise_zones(since=month_start),
        "all_time": _summarise_zones(),
    }), 200


@irrigation_bp.route("/api/irrigation/runtime_summary", methods=["GET"])
@login_required
def get_runtime_summary_all():
    """
    Return runtime summary across all irrigation devices.
    Aggregates total runtime and event counts for today, this week, this month, all time.
    """
    exclude_test = request.args.get("exclude_test", "true").lower() in ("true", "1", "yes")

    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=now.weekday())
    month_start = today_start.replace(day=1)

    def _summarise_all(since=None):
        q = (
            db.session.query(
                IrrigationZoneEvent.device_id,
                func.coalesce(func.sum(IrrigationZoneEvent.runtime_s), 0),
                func.count(IrrigationZoneEvent.id),
            )
            .filter(IrrigationZoneEvent.event_type == "open")
        )
        if exclude_test:
            q = q.filter(IrrigationZoneEvent.test_mode == False)  # noqa: E712
        if since:
            q = q.filter(IrrigationZoneEvent.timestamp >= since)

        q = q.group_by(IrrigationZoneEvent.device_id)
        rows = q.all()

        total_runtime = 0
        total_events = 0
        devices = {}
        for row in rows:
            rt = int(row[1])
            ec = row[2]
            total_runtime += rt
            total_events += ec
            devices[str(row[0])] = {
                "total_runtime_s": rt,
                "event_count": ec,
            }

        return {
            "total_runtime_s": total_runtime,
            "total_events": total_events,
            "by_device": devices,
        }

    return jsonify({
        "today": _summarise_all(since=today_start),
        "week": _summarise_all(since=week_start),
        "month": _summarise_all(since=month_start),
        "all_time": _summarise_all(),
    }), 200


# =========================================================================
#  DEVICE STATE
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/state", methods=["GET"])
@login_required
def get_irrigation_state(device_id):
    """
    Return full irrigation state for a device: device info, zones,
    schedules, seasonal configs, latest weather, and latest telemetry.
    """
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    zones = (
        IrrigationZone.query
        .filter_by(device_id=device.id)
        .order_by(IrrigationZone.zone_index)
        .all()
    )

    schedules = (
        IrrigationSchedule.query
        .filter_by(device_id=device.id)
        .order_by(IrrigationSchedule.zone_index)
        .all()
    )

    seasonal = (
        IrrigationSeasonalConfig.query
        .filter_by(device_id=device.id)
        .order_by(IrrigationSeasonalConfig.config_index)
        .all()
    )

    latest_weather = (
        IrrigationWeather.query
        .filter_by(device_id=device.id)
        .order_by(IrrigationWeather.recorded_at.desc())
        .first()
    )

    latest_telemetry = (
        Telemetry.query
        .filter_by(device_id=device.id)
        .order_by(Telemetry.received_at.desc())
        .first()
    )

    return jsonify({
        "device": device.to_dict(),
        "zones": [z.to_dict() for z in zones],
        "schedules": [s.to_dict() for s in schedules],
        "seasonal_configs": [c.to_dict() for c in seasonal],
        "latest_weather": latest_weather.to_dict() if latest_weather else None,
        "latest_telemetry": latest_telemetry.to_dict() if latest_telemetry else None,
    }), 200


# =========================================================================
#  DEVICE CONTROLS (test mode, read now, stop, reboot, factory reset)
# =========================================================================

@irrigation_bp.route("/api/irrigation/<device_id>/test_mode", methods=["POST"])
@login_required
def set_test_mode(device_id):
    """Enable or disable test mode on the irrigation controller."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    if "enabled" not in data:
        return jsonify({"error": "Missing required field: enabled (bool)"}), 400

    enabled = bool(data["enabled"])
    cmd = _publish_command(device, "set_test_mode", {"enabled": enabled})
    return jsonify({"success": True, "enabled": enabled, "command": cmd.to_dict()}), 201


@irrigation_bp.route("/api/irrigation/<device_id>/read_now", methods=["POST"])
@login_required
def read_now(device_id):
    """Force the device to publish a fresh telemetry snapshot."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "read_now", {})
    return jsonify({"success": True, "command": cmd.to_dict()}), 201


@irrigation_bp.route("/api/irrigation/<device_id>/stop_program", methods=["POST"])
@login_required
def stop_program(device_id):
    """Stop the currently running program / queue on the device."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "stop_program", {})
    return jsonify({"success": True, "command": cmd.to_dict()}), 201


@irrigation_bp.route("/api/irrigation/<device_id>/reboot", methods=["POST"])
@login_required
def reboot_device(device_id):
    """Reboot the irrigation controller."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    cmd = _publish_command(device, "reboot", {})
    return jsonify({"success": True, "command": cmd.to_dict()}), 201


@irrigation_bp.route("/api/irrigation/<device_id>/factory_reset", methods=["POST"])
@login_required
def factory_reset(device_id):
    """Factory reset the irrigation controller (wipes all stored config)."""
    device, err = _get_device_or_404(device_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    if data.get("confirm") != "FACTORY_RESET":
        return jsonify({"error": "Must send confirm='FACTORY_RESET' to proceed"}), 400

    cmd = _publish_command(device, "factory_reset", {})
    return jsonify({"success": True, "command": cmd.to_dict()}), 201
