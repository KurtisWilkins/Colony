"""
Blueprint for session-based authentication.
Single-user system — credentials are stored in environment variables.
Uses Flask-Login for session management.
"""

import functools
import logging

from flask import Blueprint, request, jsonify
from flask_login import LoginManager, UserMixin, login_user, logout_user, current_user

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
# GET /api/auth/me — check current session
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/me", methods=["GET"])
def get_current_user():
    """Return the currently authenticated user's info, or 401."""
    if not current_user.is_authenticated:
        return jsonify({"error": "Not authenticated"}), 401
    return jsonify(current_user.to_dict()), 200
