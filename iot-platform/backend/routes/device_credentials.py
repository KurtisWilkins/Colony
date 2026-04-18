"""
Blueprint for managing MQTT credentials for IoT devices.
Handles credential generation, rotation, status checking, and revocation.
"""

import re
import secrets
import logging

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash

from models import db, Device, DeviceMqttCredential, SecurityEvent
from routes.auth import login_required

logger = logging.getLogger(__name__)

device_credentials_bp = Blueprint("device_credentials", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_admin():
    """Return an error response if the current user is not an admin, else None."""
    from flask_login import current_user
    if not current_user.is_authenticated:
        return jsonify({"error": "Authentication required"}), 401
    if getattr(current_user, "role", None) != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None


def _sanitize_mqtt_username(device):
    """Build a sanitised MQTT username from the device hierarchy."""
    parts = [device.facility, device.building, device.unit, device.device_name]
    raw = "_".join(parts)
    # Lowercase, replace non-alphanumeric (except underscores) with underscores
    sanitized = re.sub(r"[^a-z0-9_]", "_", raw.lower())
    # Collapse multiple underscores
    sanitized = re.sub(r"_+", "_", sanitized).strip("_")
    return f"device_{sanitized}"


def _log_security_event(event_type, user_id=None, details=None):
    """Record a security event."""
    evt = SecurityEvent(
        event_type=event_type,
        user_id=user_id,
        ip_address=request.remote_addr,
        details=details,
    )
    db.session.add(evt)
    db.session.commit()


# ---------------------------------------------------------------------------
# POST /api/devices/<device_id>/credentials/generate
# ---------------------------------------------------------------------------
@device_credentials_bp.route(
    "/api/devices/<device_id>/credentials/generate", methods=["POST"]
)
@login_required
def generate_credentials(device_id):
    """Generate new MQTT credentials for a device. Returns plaintext password once."""
    err = _require_admin()
    if err:
        return err

    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    # Check if active (non-revoked) credentials already exist
    existing = DeviceMqttCredential.query.filter_by(
        device_id=device.id, revoked=False
    ).first()
    if existing:
        return jsonify({"error": "Active credentials already exist. Use /rotate to replace them."}), 409

    mqtt_username = _sanitize_mqtt_username(device)
    plaintext_password = secrets.token_hex(16)

    cred = DeviceMqttCredential(
        device_id=device.id,
        mqtt_username=mqtt_username,
        mqtt_password_hash=generate_password_hash(plaintext_password),
    )
    db.session.add(cred)
    db.session.commit()

    _log_security_event(
        "mqtt_credentials_generated",
        details={"device_id": str(device.id), "mqtt_username": mqtt_username},
    )

    return jsonify({
        "mqtt_username": mqtt_username,
        "mqtt_password": plaintext_password,
        "device_id": str(device.id),
        "message": "Store this password securely. It will not be shown again.",
    }), 201


# ---------------------------------------------------------------------------
# GET /api/devices/<device_id>/credentials/status
# ---------------------------------------------------------------------------
@device_credentials_bp.route(
    "/api/devices/<device_id>/credentials/status", methods=["GET"]
)
@login_required
def credentials_status(device_id):
    """Return credential metadata (never the password)."""
    err = _require_admin()
    if err:
        return err

    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    cred = DeviceMqttCredential.query.filter_by(
        device_id=device.id, revoked=False
    ).first()

    if not cred:
        return jsonify({
            "has_credentials": False,
            "device_id": str(device.id),
        }), 200

    return jsonify({
        "has_credentials": True,
        "device_id": str(device.id),
        "mqtt_username": cred.mqtt_username,
        "created_at": cred.created_at.isoformat() if cred.created_at else None,
        "last_used": cred.last_used.isoformat() if cred.last_used else None,
        "revoked": cred.revoked,
    }), 200


# ---------------------------------------------------------------------------
# POST /api/devices/<device_id>/credentials/rotate
# ---------------------------------------------------------------------------
@device_credentials_bp.route(
    "/api/devices/<device_id>/credentials/rotate", methods=["POST"]
)
@login_required
def rotate_credentials(device_id):
    """Generate a new password, revoke old credentials. Returns new password once."""
    err = _require_admin()
    if err:
        return err

    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    # Revoke all existing credentials for this device
    DeviceMqttCredential.query.filter_by(
        device_id=device.id, revoked=False
    ).update({"revoked": True})

    mqtt_username = _sanitize_mqtt_username(device)
    plaintext_password = secrets.token_hex(16)

    cred = DeviceMqttCredential(
        device_id=device.id,
        mqtt_username=mqtt_username,
        mqtt_password_hash=generate_password_hash(plaintext_password),
    )
    db.session.add(cred)
    db.session.commit()

    _log_security_event(
        "mqtt_credentials_rotated",
        details={"device_id": str(device.id), "mqtt_username": mqtt_username},
    )

    return jsonify({
        "mqtt_username": mqtt_username,
        "mqtt_password": plaintext_password,
        "device_id": str(device.id),
        "message": "Old credentials revoked. Store this password securely.",
    }), 200


# ---------------------------------------------------------------------------
# POST /api/devices/<device_id>/credentials/revoke
# ---------------------------------------------------------------------------
@device_credentials_bp.route(
    "/api/devices/<device_id>/credentials/revoke", methods=["POST"]
)
@login_required
def revoke_credentials(device_id):
    """Revoke all MQTT credentials for a device."""
    err = _require_admin()
    if err:
        return err

    device = Device.query.get(device_id)
    if not device:
        return jsonify({"error": "Device not found"}), 404

    count = DeviceMqttCredential.query.filter_by(
        device_id=device.id, revoked=False
    ).update({"revoked": True})
    db.session.commit()

    _log_security_event(
        "mqtt_credentials_revoked",
        details={"device_id": str(device.id), "credentials_revoked": count},
    )

    return jsonify({
        "message": f"Revoked {count} credential(s)",
        "device_id": str(device.id),
    }), 200
