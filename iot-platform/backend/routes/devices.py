"""
Blueprint for device CRUD operations.
Provides endpoints to list, register, retrieve, update, and delete IoT devices.
Includes auto-discovery endpoints for pending (unclaimed) devices.
"""

from flask import Blueprint, request, jsonify
from models import db, Device
from routes.auth import login_required

devices_bp = Blueprint("devices", __name__)


# ---------------------------------------------------------------------------
# GET /api/devices  -- list all devices with optional filtering
# ---------------------------------------------------------------------------
@devices_bp.route("/api/devices", methods=["GET"])
@login_required
def list_devices():
    """
    Return a list of registered devices (status='active' by default).
    Pass ?status=all to include pending, or ?status=pending for only pending.
    """
    query = Device.query

    status_filter = request.args.get("status", "active")
    if status_filter != "all":
        query = query.filter(Device.status == status_filter)

    facility = request.args.get("facility")
    if facility:
        query = query.filter(Device.facility == facility)

    building = request.args.get("building")
    if building:
        query = query.filter(Device.building == building)

    unit = request.args.get("unit")
    if unit:
        query = query.filter(Device.unit == unit)

    devices = query.order_by(Device.registered_at.desc()).all()
    return jsonify([d.to_dict() for d in devices]), 200


# ---------------------------------------------------------------------------
# GET /api/devices/pending  -- list auto-discovered unclaimed devices
# ---------------------------------------------------------------------------
@devices_bp.route("/api/devices/pending", methods=["GET"])
@login_required
def list_pending_devices():
    """Return all devices with status='pending' (auto-discovered, unclaimed)."""
    devices = Device.query.filter_by(status="pending").order_by(
        Device.last_seen.desc()
    ).all()
    return jsonify([d.to_dict() for d in devices]), 200


# ---------------------------------------------------------------------------
# POST /api/devices/<device_id>/claim  -- promote pending to active
# ---------------------------------------------------------------------------
@devices_bp.route("/api/devices/<device_id>/claim", methods=["POST"])
@login_required
def claim_device(device_id):
    """
    Claim a pending device: set status to 'active' and optionally update
    device_type via JSON body {"device_type": "irrigation"}.
    """
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404
    if device.status != "pending":
        return jsonify({"error": "Device is already active"}), 409

    data = request.get_json(silent=True) or {}
    if data.get("device_type"):
        device.device_type = data["device_type"]

    device.status = "active"
    db.session.commit()

    return jsonify(device.to_dict()), 200


# ---------------------------------------------------------------------------
# DELETE /api/devices/<device_id>/dismiss  -- remove a pending device
# ---------------------------------------------------------------------------
@devices_bp.route("/api/devices/<device_id>/dismiss", methods=["DELETE"])
@login_required
def dismiss_device(device_id):
    """Remove a pending device (ignores it). Only works on pending devices."""
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404
    if device.status != "pending":
        return jsonify({"error": "Cannot dismiss an active device"}), 409

    db.session.delete(device)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# POST /api/devices  -- register a new device
# ---------------------------------------------------------------------------
@devices_bp.route("/api/devices", methods=["POST"])
@login_required
def register_device():
    """
    Register a new IoT device.
    Expects a JSON body with: facility, building, unit, device_name, device_type.
    Returns 201 on success, 400 on validation error, 409 on duplicate.
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    # Validate required fields
    required = ["facility", "building", "unit", "device_name", "device_type"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    # Check for duplicate device at the same location
    existing = Device.query.filter_by(
        facility=data["facility"],
        building=data["building"],
        unit=data["unit"],
        device_name=data["device_name"],
    ).first()
    if existing:
        return jsonify({"error": "A device with this location and name already exists"}), 409

    # Create and persist the new device
    device = Device(
        facility=data["facility"],
        building=data["building"],
        unit=data["unit"],
        device_name=data["device_name"],
        device_type=data["device_type"],
    )
    db.session.add(device)
    db.session.commit()

    return jsonify(device.to_dict()), 201


# ---------------------------------------------------------------------------
# GET /api/devices/<device_id>  -- retrieve a single device
# ---------------------------------------------------------------------------
@devices_bp.route("/api/devices/<device_id>", methods=["GET"])
@login_required
def get_device(device_id):
    """Return a single device by its UUID, or 404 if not found."""
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404
    return jsonify(device.to_dict()), 200


# ---------------------------------------------------------------------------
# PUT /api/devices/<device_id>  -- update device metadata
# ---------------------------------------------------------------------------
@devices_bp.route("/api/devices/<device_id>", methods=["PUT"])
@login_required
def update_device(device_id):
    """
    Update mutable fields on an existing device.
    Accepts any combination of: facility, building, unit, device_name, device_type.
    """
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    # Only update fields that are present in the request body
    updatable_fields = ["facility", "building", "unit", "device_name", "device_type"]
    for field in updatable_fields:
        if field in data:
            setattr(device, field, data[field])

    db.session.commit()
    return jsonify(device.to_dict()), 200


# ---------------------------------------------------------------------------
# DELETE /api/devices/<device_id>  -- remove a device
# ---------------------------------------------------------------------------
@devices_bp.route("/api/devices/<device_id>", methods=["DELETE"])
@login_required
def delete_device(device_id):
    """Delete a device and all associated telemetry, commands, and alerts."""
    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    db.session.delete(device)
    db.session.commit()

    # 204 No Content -- successful deletion with no response body
    return "", 204
