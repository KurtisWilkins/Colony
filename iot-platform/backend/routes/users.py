"""
Blueprint for user management and security event querying.
All user management endpoints require admin role.
"""

import secrets
import logging
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash

from models import db, User, Device, UserDeviceAssignment, UserSession, SecurityEvent
from routes.auth import login_required

logger = logging.getLogger(__name__)

users_bp = Blueprint("users", __name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_admin():
    """Return an error response if the current user is not an admin, else None."""
    from flask_login import current_user
    if not current_user.is_authenticated:
        return jsonify({"error": "Authentication required"}), 401
    # EnvUser (single-user mode) always has role='admin'
    if getattr(current_user, "role", None) != "admin":
        return jsonify({"error": "Admin access required"}), 403
    return None


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
# GET /api/users — list all users (admin only)
# ---------------------------------------------------------------------------
@users_bp.route("/api/users", methods=["GET"])
@login_required
def list_users():
    """Return all users. Admin only."""
    err = _require_admin()
    if err:
        return err

    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([u.to_dict() for u in users]), 200


# ---------------------------------------------------------------------------
# POST /api/users — create a new user (admin only)
# ---------------------------------------------------------------------------
@users_bp.route("/api/users", methods=["POST"])
@login_required
def create_user():
    """Create a new user with a temporary password."""
    err = _require_admin()
    if err:
        return err

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip() or None
    role = (data.get("role") or "viewer").strip()

    if not username:
        return jsonify({"error": "Username is required"}), 400

    if role not in ("admin", "operator", "viewer"):
        return jsonify({"error": "Role must be admin, operator, or viewer"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 409

    temp_password = secrets.token_urlsafe(12)

    from flask_login import current_user
    user = User(
        username=username,
        email=email,
        password_hash=generate_password_hash(temp_password),
        role=role,
        is_active=True,
        force_password_change=True,
        created_by=getattr(current_user, "id", None) if hasattr(current_user, "id") and isinstance(getattr(current_user, "id", None), int) else None,
    )
    db.session.add(user)
    db.session.commit()

    _log_security_event("user_created", user_id=user.id, details={"username": username, "role": role})

    result = user.to_dict()
    result["temporary_password"] = temp_password
    return jsonify(result), 201


# ---------------------------------------------------------------------------
# GET /api/users/<user_id> — get user details (admin only)
# ---------------------------------------------------------------------------
@users_bp.route("/api/users/<int:user_id>", methods=["GET"])
@login_required
def get_user(user_id):
    """Return a single user with assigned device count."""
    err = _require_admin()
    if err:
        return err

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    result = user.to_dict()
    result["assigned_device_count"] = UserDeviceAssignment.query.filter_by(user_id=user.id).count()
    return jsonify(result), 200


# ---------------------------------------------------------------------------
# PUT /api/users/<user_id> — update user (admin only)
# ---------------------------------------------------------------------------
@users_bp.route("/api/users/<int:user_id>", methods=["PUT"])
@login_required
def update_user(user_id):
    """Update user fields. Cannot change own role."""
    err = _require_admin()
    if err:
        return err

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    from flask_login import current_user

    # Prevent changing own role
    if "role" in data:
        is_self = (hasattr(current_user, "id") and isinstance(current_user.id, int) and current_user.id == user_id)
        if is_self:
            return jsonify({"error": "Cannot change your own role"}), 400
        new_role = data["role"]
        if new_role not in ("admin", "operator", "viewer"):
            return jsonify({"error": "Role must be admin, operator, or viewer"}), 400
        user.role = new_role

    if "username" in data:
        new_username = (data["username"] or "").strip()
        if not new_username:
            return jsonify({"error": "Username cannot be empty"}), 400
        existing = User.query.filter_by(username=new_username).first()
        if existing and existing.id != user.id:
            return jsonify({"error": "Username already exists"}), 409
        user.username = new_username

    if "email" in data:
        user.email = (data["email"] or "").strip() or None

    if "is_active" in data:
        user.is_active = bool(data["is_active"])

    db.session.commit()

    _log_security_event("user_updated", user_id=user.id, details={"fields": list(data.keys())})

    return jsonify(user.to_dict()), 200


# ---------------------------------------------------------------------------
# DELETE /api/users/<user_id> — deactivate user (admin only)
# ---------------------------------------------------------------------------
@users_bp.route("/api/users/<int:user_id>", methods=["DELETE"])
@login_required
def delete_user(user_id):
    """Deactivate a user and revoke all sessions. Cannot delete self."""
    err = _require_admin()
    if err:
        return err

    from flask_login import current_user
    is_self = (hasattr(current_user, "id") and isinstance(current_user.id, int) and current_user.id == user_id)
    if is_self:
        return jsonify({"error": "Cannot deactivate your own account"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.is_active = False
    # Revoke all active sessions
    UserSession.query.filter_by(user_id=user.id, revoked=False).update({"revoked": True})
    db.session.commit()

    _log_security_event("user_deactivated", user_id=user.id, details={"username": user.username})

    return jsonify({"message": "User deactivated", "user": user.to_dict()}), 200


# ---------------------------------------------------------------------------
# POST /api/users/<user_id>/reset-password — generate new temp password
# ---------------------------------------------------------------------------
@users_bp.route("/api/users/<int:user_id>/reset-password", methods=["POST"])
@login_required
def reset_password(user_id):
    """Generate a new temporary password for the user."""
    err = _require_admin()
    if err:
        return err

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    temp_password = secrets.token_urlsafe(12)
    user.password_hash = generate_password_hash(temp_password)
    user.force_password_change = True

    # Revoke existing sessions
    UserSession.query.filter_by(user_id=user.id, revoked=False).update({"revoked": True})
    db.session.commit()

    _log_security_event("password_reset", user_id=user.id, details={"admin_initiated": True})

    return jsonify({"message": "Password reset", "temporary_password": temp_password}), 200


# ---------------------------------------------------------------------------
# GET /api/users/<user_id>/devices — get assigned devices
# ---------------------------------------------------------------------------
@users_bp.route("/api/users/<int:user_id>/devices", methods=["GET"])
@login_required
def get_user_devices(user_id):
    """Return devices assigned to a user."""
    err = _require_admin()
    if err:
        return err

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    assignments = (
        db.session.query(UserDeviceAssignment, Device)
        .join(Device, UserDeviceAssignment.device_id == Device.id)
        .filter(UserDeviceAssignment.user_id == user.id)
        .all()
    )

    result = []
    for assignment, device in assignments:
        d = device.to_dict()
        d["assigned_at"] = assignment.assigned_at.isoformat() if assignment.assigned_at else None
        d["assigned_by"] = assignment.assigned_by
        result.append(d)

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# POST /api/users/<user_id>/devices — assign device to user
# ---------------------------------------------------------------------------
@users_bp.route("/api/users/<int:user_id>/devices", methods=["POST"])
@login_required
def assign_device(user_id):
    """Assign a device to a user."""
    err = _require_admin()
    if err:
        return err

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True)
    if not data or not data.get("device_id"):
        return jsonify({"error": "device_id is required"}), 400

    device = Device.query.get(data["device_id"])
    if not device:
        return jsonify({"error": "Device not found"}), 404

    existing = UserDeviceAssignment.query.filter_by(
        user_id=user.id, device_id=device.id
    ).first()
    if existing:
        return jsonify({"error": "Device already assigned to this user"}), 409

    from flask_login import current_user
    assignment = UserDeviceAssignment(
        user_id=user.id,
        device_id=device.id,
        assigned_by=getattr(current_user, "id", None) if hasattr(current_user, "id") and isinstance(getattr(current_user, "id", None), int) else None,
    )
    db.session.add(assignment)
    db.session.commit()

    _log_security_event(
        "device_assigned",
        user_id=user.id,
        details={"device_id": str(device.id), "device_name": device.device_name},
    )

    return jsonify(assignment.to_dict()), 201


# ---------------------------------------------------------------------------
# DELETE /api/users/<user_id>/devices/<device_id> — remove assignment
# ---------------------------------------------------------------------------
@users_bp.route("/api/users/<int:user_id>/devices/<device_id>", methods=["DELETE"])
@login_required
def unassign_device(user_id, device_id):
    """Remove a device assignment from a user."""
    err = _require_admin()
    if err:
        return err

    assignment = UserDeviceAssignment.query.filter_by(
        user_id=user_id, device_id=device_id
    ).first()
    if not assignment:
        return jsonify({"error": "Assignment not found"}), 404

    db.session.delete(assignment)
    db.session.commit()

    _log_security_event(
        "device_unassigned",
        user_id=user_id,
        details={"device_id": device_id},
    )

    return jsonify({"message": "Device assignment removed"}), 200


# ---------------------------------------------------------------------------
# GET /api/security/events — query security events (admin only)
# ---------------------------------------------------------------------------
@users_bp.route("/api/security/events", methods=["GET"])
@login_required
def list_security_events():
    """Query security events with optional filters."""
    err = _require_admin()
    if err:
        return err

    limit = request.args.get("limit", 100, type=int)
    limit = min(limit, 1000)  # Cap at 1000

    query = SecurityEvent.query.order_by(SecurityEvent.event_time.desc())

    user_id = request.args.get("user_id", type=int)
    if user_id is not None:
        query = query.filter(SecurityEvent.user_id == user_id)

    event_type = request.args.get("event_type")
    if event_type:
        query = query.filter(SecurityEvent.event_type == event_type)

    since = request.args.get("since")
    if since:
        try:
            since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            query = query.filter(SecurityEvent.event_time >= since_dt)
        except (ValueError, TypeError):
            return jsonify({"error": "Invalid 'since' datetime format"}), 400

    events = query.limit(limit).all()
    return jsonify([e.to_dict() for e in events]), 200
