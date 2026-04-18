"""
Blueprint for session-based authentication.
Single-user system — credentials are stored in environment variables.
Uses Flask-Login for session management.
"""

import re
import functools
import logging

from flask import Blueprint, request, jsonify
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user
from werkzeug.security import check_password_hash, generate_password_hash

import config

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)

# ---------------------------------------------------------------------------
# Flask-Login setup (initialised with app in create_app via init_login())
# ---------------------------------------------------------------------------
login_manager = LoginManager()


class EnvUser(UserMixin):
    """In-memory user object backed by environment variables."""

    def __init__(self):
        self.id = "1"
        self.username = config.LOGIN_USERNAME
        self.role = "admin"

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
        }


@login_manager.user_loader
def load_user(user_id):
    """Reload user from session — only one user exists."""
    if user_id == "1":
        return EnvUser()
    return None


def init_login(app):
    """Attach Flask-Login to the Flask app and configure session settings."""
    from datetime import timedelta

    app.config["REMEMBER_COOKIE_DURATION"] = timedelta(days=7)
    app.config["REMEMBER_COOKIE_HTTPONLY"] = True
    app.config["REMEMBER_COOKIE_SAMESITE"] = "Lax"
    app.config["SESSION_COOKIE_HTTPONLY"] = True
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

    login_manager.init_app(app)


# ---------------------------------------------------------------------------
# Auth decorator — replaces the old JWT-based login_required
# ---------------------------------------------------------------------------

def login_required(f):
    """Require an active session. API routes get JSON 401; pages redirect."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not current_user.is_authenticated:
            if request.path.startswith("/api/"):
                return jsonify({"error": "Authentication required"}), 401
            # For non-API routes the login_manager will handle redirect
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    """
    Authenticate user with credentials from environment variables.
    Creates a persistent session (remember=True, 7-day expiry).
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    if not config.LOGIN_PASSWORD:
        logger.error("LOGIN_PASSWORD not set in environment")
        return jsonify({"error": "Server authentication not configured"}), 500

    if username != config.LOGIN_USERNAME or password != config.LOGIN_PASSWORD:
        return jsonify({"error": "Invalid username or password"}), 401

    user = EnvUser()
    login_user(user, remember=True)

    return jsonify({"user": user.to_dict()}), 200


# ---------------------------------------------------------------------------
# POST /api/auth/logout
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    """Clear the session immediately."""
    logout_user()
    return jsonify({"message": "Logged out"}), 200


# ---------------------------------------------------------------------------
# GET /api/auth/me — check current session (enhanced with security fields)
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/me", methods=["GET"])
def get_current_user():
    """Return the currently authenticated user's info, or 401."""
    if not current_user.is_authenticated:
        return jsonify({"error": "Not authenticated"}), 401

    result = current_user.to_dict()

    # For DB-backed users, include additional security fields
    if hasattr(current_user, "force_password_change"):
        result["force_password_change"] = current_user.force_password_change
    else:
        result["force_password_change"] = False

    # Include assigned device IDs for non-admin users
    try:
        from models import UserDeviceAssignment
        user_id = current_user.id
        if isinstance(user_id, int):
            assignments = UserDeviceAssignment.query.filter_by(user_id=user_id).all()
            result["assigned_device_ids"] = [str(a.device_id) for a in assignments]
        else:
            result["assigned_device_ids"] = []
    except Exception:
        result["assigned_device_ids"] = []

    return jsonify(result), 200


# ---------------------------------------------------------------------------
# POST /api/auth/change-password — change current user's password
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/change-password", methods=["POST"])
def change_password():
    """
    Change the authenticated user's password.
    Requires current_password validation.
    New password must be >= 12 chars with at least one number and one special char.
    Clears force_password_change flag on success.
    """
    if not current_user.is_authenticated:
        return jsonify({"error": "Authentication required"}), 401

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        return jsonify({"error": "current_password and new_password are required"}), 400

    # For DB-backed users, validate against stored hash
    from models import db, User, SecurityEvent
    user_id = current_user.id

    if isinstance(user_id, int):
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        if not check_password_hash(user.password_hash, current_password):
            return jsonify({"error": "Current password is incorrect"}), 401
    else:
        # EnvUser (single-user mode) — validate against config
        if current_password != config.LOGIN_PASSWORD:
            return jsonify({"error": "Current password is incorrect"}), 401
        return jsonify({"error": "Password change not supported for environment-based accounts"}), 400

    # Validate new password strength
    if len(new_password) < 12:
        return jsonify({"error": "Password must be at least 12 characters"}), 400
    if not re.search(r"\d", new_password):
        return jsonify({"error": "Password must contain at least one number"}), 400
    if not re.search(r"[!@#$%^&*()_+\-=\[\]{};':\"\\|,.<>\/?`~]", new_password):
        return jsonify({"error": "Password must contain at least one special character"}), 400

    user.password_hash = generate_password_hash(new_password)
    user.force_password_change = False
    db.session.commit()

    # Log the event
    evt = SecurityEvent(
        event_type="password_changed",
        user_id=user.id,
        ip_address=request.remote_addr,
        details={"self_service": True},
    )
    db.session.add(evt)
    db.session.commit()

    return jsonify({"message": "Password changed successfully"}), 200
