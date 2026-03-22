"""
Blueprint for issuing and querying device commands.
Commands are persisted in the database AND published to the MQTT broker
so the target device receives them in near real-time.
"""

import json
import logging

from flask import Blueprint, request, jsonify
import paho.mqtt.publish as mqtt_publish

from models import db, Device, Command
from routes.auth import login_required
import config

logger = logging.getLogger(__name__)

# Blueprint registered under /api/commands in app.py
commands_bp = Blueprint("commands", __name__)

# Allowed command types -- rejects anything not in this set
VALID_COMMAND_TYPES = {
    "toggle_relay",
    "set_interval",
    "read_now",
    "motor_move",
    "gripper_open",
    "gripper_close",
    "custom",
}


# ---------------------------------------------------------------------------
# POST /api/commands/<device_id>  -- issue a new command
# ---------------------------------------------------------------------------
@commands_bp.route("/api/commands/<device_id>", methods=["POST"])
@login_required
def issue_command(device_id):
    """
    Issue a command to a device.
    Expects JSON body: {"command_type": "...", "payload": {...}}
    The command is stored in the DB and published via MQTT to the device topic.
    Returns 201 on success.
    """
    # Verify the target device exists
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    command_type = data.get("command_type")
    if not command_type:
        return jsonify({"error": "Missing required field: command_type"}), 400

    # Validate command_type against the allowed set
    if command_type not in VALID_COMMAND_TYPES:
        return jsonify({
            "error": f"Invalid command_type '{command_type}'. "
                     f"Must be one of: {', '.join(sorted(VALID_COMMAND_TYPES))}"
        }), 400

    payload = data.get("payload", {})

    # Persist the command record in the database
    cmd = Command(
        device_id=device.id,
        command_type=command_type,
        payload=payload,
    )
    db.session.add(cmd)
    db.session.commit()

    # Build the MQTT topic: {facility}/{building}/{unit}/{device_name}/command
    topic = f"{device.facility}/{device.building}/{device.unit}/{device.device_name}/command"

    # Publish the command to the MQTT broker so the device receives it
    mqtt_message = json.dumps({
        "command_id": cmd.id,
        "command_type": command_type,
        "payload": payload,
    })

    try:
        mqtt_publish.single(
            topic,
            payload=mqtt_message,
            hostname=config.MQTT_BROKER_HOST,
            port=config.MQTT_BROKER_PORT,
        )
        logger.info("Published command %s to MQTT topic %s", cmd.id, topic)
    except Exception as exc:
        # Log the MQTT error but don't fail the HTTP request --
        # the command is already saved in the database.
        logger.error("Failed to publish command to MQTT: %s", exc)

    return jsonify(cmd.to_dict()), 201


# ---------------------------------------------------------------------------
# GET /api/commands/<device_id>  -- command history for a device
# ---------------------------------------------------------------------------
@commands_bp.route("/api/commands/<device_id>", methods=["GET"])
@login_required
def get_commands(device_id):
    """
    Return command history for a device, newest first.
    Query parameters:
      ?limit=  - max number of records (default 50)
    """
    # Verify the device exists
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    # Parse the limit parameter (default 50, max 1000)
    try:
        limit = min(int(request.args.get("limit", 50)), 1000)
    except ValueError:
        limit = 50

    commands = (
        Command.query
        .filter_by(device_id=device_id)
        .order_by(Command.issued_at.desc())
        .limit(limit)
        .all()
    )

    return jsonify([c.to_dict() for c in commands]), 200
