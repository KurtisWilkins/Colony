"""
Flask blueprint for manual device control.

Endpoints:
    POST /api/control/<device_id>/fan/on
    POST /api/control/<device_id>/fan/off
    POST /api/control/<device_id>/fan/speed      (body: {speed_pct})
    POST /api/control/<device_id>/mister/on
    POST /api/control/<device_id>/mister/off
    POST /api/control/<device_id>/valve/open
    POST /api/control/<device_id>/valve/close
    POST /api/control/<device_id>/fill/start
    POST /api/control/<device_id>/fill/stop
    POST /api/control/<device_id>/read_now
    GET  /api/control/<device_id>/state
"""

import logging

from flask import Blueprint, jsonify, request

from db.connection import get_session
from models.device import Device

logger = logging.getLogger(__name__)

manual_control_bp = Blueprint("manual_control", __name__)

# Injected by main.py
_command_sender = None
_state_manager = None


def init_manual_control_api(command_sender, state_manager):
    """Inject dependencies from main.py."""
    global _command_sender, _state_manager
    _command_sender = command_sender
    _state_manager = state_manager


def _get_device(device_id):
    """Look up a device by ID, returning (device, error_response)."""
    session = get_session()
    try:
        device = session.query(Device).filter_by(id=device_id).first()
        if not device:
            session.close()
            return None, (jsonify({"error": "Device not found"}), 404)
        session.expunge(device)
        session.close()
        return device, None
    except Exception:
        session.close()
        return None, (jsonify({"error": "Internal server error"}), 500)


@manual_control_bp.route("/api/control/<device_id>/fan/on", methods=["POST"])
def fan_on(device_id):
    """Turn fan on for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    data = request.get_json(silent=True) or {}
    speed_pct = data.get("speed_pct")
    cmd_id = _command_sender.fan_on(device, speed_pct=speed_pct, source="manual")
    return jsonify({"message": "Fan on command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/fan/off", methods=["POST"])
def fan_off(device_id):
    """Turn fan off for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    cmd_id = _command_sender.fan_off(device, source="manual")
    return jsonify({"message": "Fan off command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/fan/speed", methods=["POST"])
def fan_speed(device_id):
    """Set fan speed for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    data = request.get_json()
    if not data or "speed_pct" not in data:
        return jsonify({"error": "speed_pct required in body"}), 400
    speed_pct = int(data["speed_pct"])
    if not 0 <= speed_pct <= 100:
        return jsonify({"error": "speed_pct must be between 0 and 100"}), 400
    cmd_id = _command_sender.set_fan_speed(device, speed_pct, source="manual")
    return jsonify({"message": "Fan speed command sent", "command_id": cmd_id, "speed_pct": speed_pct}), 200


@manual_control_bp.route("/api/control/<device_id>/mister/on", methods=["POST"])
def mister_on(device_id):
    """Turn mister on for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    cmd_id = _command_sender.mister_on(device, source="manual")
    return jsonify({"message": "Mister on command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/mister/off", methods=["POST"])
def mister_off(device_id):
    """Turn mister off for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    cmd_id = _command_sender.mister_off(device, source="manual")
    return jsonify({"message": "Mister off command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/valve/open", methods=["POST"])
def valve_open(device_id):
    """Open valve for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    cmd_id = _command_sender.valve_open(device, source="manual")
    return jsonify({"message": "Valve open command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/valve/close", methods=["POST"])
def valve_close(device_id):
    """Close valve for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    cmd_id = _command_sender.valve_close(device, source="manual")
    return jsonify({"message": "Valve close command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/fill/start", methods=["POST"])
def fill_start(device_id):
    """Start tank fill for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    cmd_id = _command_sender.fill_tank(device, source="manual")
    return jsonify({"message": "Fill start command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/fill/stop", methods=["POST"])
def fill_stop(device_id):
    """Stop tank fill for a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    cmd_id = _command_sender.stop_fill(device, source="manual")
    return jsonify({"message": "Fill stop command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/read_now", methods=["POST"])
def read_now(device_id):
    """Request an immediate sensor reading from a device."""
    device, err = _get_device(device_id)
    if err:
        return err
    cmd_id = _command_sender.read_now(device, source="manual")
    return jsonify({"message": "Read now command sent", "command_id": cmd_id}), 200


@manual_control_bp.route("/api/control/<device_id>/state", methods=["GET"])
def get_state(device_id):
    """Get the current in-memory state of a device."""
    state = _state_manager.get_state(device_id)
    if not state:
        return jsonify({"error": "No state available for this device"}), 404
    return jsonify(state.to_dict()), 200
