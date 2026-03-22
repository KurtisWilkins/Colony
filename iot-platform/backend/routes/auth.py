"""
Blueprint for user authentication and account management.
Provides login, logout, and admin-only user CRUD endpoints.
"""

import functools
import logging

import jwt
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify, g, current_app
from werkzeug.security import generate_password_hash, check_password_hash

from models import db, User

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__)


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def _create_token(user, expires_hours=24):
    """Create a JWT token for the given user."""
    payload = {
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, current_app.config["SECRET_KEY"], algorithm="HS256")


def _decode_token(token):
    """Decode and validate a JWT token. Returns the payload dict or None."""
    try:
        return jwt.decode(token, current_app.config["SECRET_KEY"], algorithms=["HS256"])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
        return None


# ---------------------------------------------------------------------------
# Auth decorator
# ---------------------------------------------------------------------------

def login_required(f):
    """Decorator that requires a valid JWT in the Authorization header."""
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid authorization header"}), 401

        token = auth_header[7:]
        payload = _decode_token(token)
        if not payload:
            return jsonify({"error": "Invalid or expired token"}), 401

        user = User.query.get(payload["user_id"])
        if not user or not user.is_active:
            return jsonify({"error": "Account not found or disabled"}), 401

        g.current_user = user
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator that requires the current user to be an admin."""
    @functools.wraps(f)
    @login_required
    def decorated(*args, **kwargs):
        if g.current_user.role != "admin":
            return jsonify({"error": "Admin privileges required"}), 403
        return f(*args, **kwargs)
    return decorated


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    """
    Authenticate a user and return a JWT token.
    Expects JSON: {"username": "...", "password": "..."}
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Invalid username or password"}), 401

    if not user.is_active:
        return jsonify({"error": "Account is disabled. Contact an administrator."}), 403

    token = _create_token(user)
    return jsonify({
        "token": token,
        "user": user.to_dict(),
    }), 200


# ---------------------------------------------------------------------------
# GET /api/auth/me  -- get current user info
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/me", methods=["GET"])
@login_required
def get_current_user():
    """Return the currently authenticated user's info."""
    return jsonify(g.current_user.to_dict()), 200


# ---------------------------------------------------------------------------
# PUT /api/auth/password  -- change own password
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/password", methods=["PUT"])
@login_required
def change_password():
    """
    Change the current user's password.
    Expects JSON: {"current_password": "...", "new_password": "..."}
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    current_password = data.get("current_password", "")
    new_password = data.get("new_password", "")

    if not current_password or not new_password:
        return jsonify({"error": "Current and new passwords are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters"}), 400

    if not check_password_hash(g.current_user.password_hash, current_password):
        return jsonify({"error": "Current password is incorrect"}), 401

    g.current_user.password_hash = generate_password_hash(new_password)
    db.session.commit()

    return jsonify({"message": "Password updated successfully"}), 200


# ---------------------------------------------------------------------------
# Admin: GET /api/auth/users  -- list all users
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/users", methods=["GET"])
@admin_required
def list_users():
    """Return all user accounts (admin only)."""
    users = User.query.order_by(User.created_at.desc()).all()
    return jsonify([u.to_dict() for u in users]), 200


# ---------------------------------------------------------------------------
# Admin: POST /api/auth/users  -- create a new user
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/users", methods=["POST"])
@admin_required
def create_user():
    """
    Create a new user account (admin only).
    Expects JSON: {"username": "...", "password": "...", "role": "user"|"admin"}
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")
    role = data.get("role", "user")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    if role not in ("admin", "user"):
        return jsonify({"error": "Role must be 'admin' or 'user'"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": f"Username '{username}' is already taken"}), 409

    user = User(
        username=username,
        password_hash=generate_password_hash(password),
        role=role,
    )
    db.session.add(user)
    db.session.commit()

    return jsonify(user.to_dict()), 201


# ---------------------------------------------------------------------------
# Admin: PUT /api/auth/users/<user_id>  -- update a user
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/users/<int:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    """
    Update a user account (admin only).
    Accepts: {"role": "...", "is_active": true/false, "password": "..."}
    """
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    if "role" in data and data["role"] in ("admin", "user"):
        user.role = data["role"]

    if "is_active" in data:
        user.is_active = bool(data["is_active"])

    if "password" in data and len(data["password"]) >= 6:
        user.password_hash = generate_password_hash(data["password"])

    db.session.commit()
    return jsonify(user.to_dict()), 200


# ---------------------------------------------------------------------------
# Admin: DELETE /api/auth/users/<user_id>  -- delete a user
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/users/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    """Delete a user account (admin only). Cannot delete yourself."""
    if user_id == g.current_user.id:
        return jsonify({"error": "Cannot delete your own account"}), 400

    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    db.session.delete(user)
    db.session.commit()
    return "", 204


# ---------------------------------------------------------------------------
# POST /api/auth/setup  -- initial admin account creation (one-time)
# ---------------------------------------------------------------------------
@auth_bp.route("/api/auth/setup", methods=["POST"])
def initial_setup():
    """
    Create the initial admin account. Only works if no users exist yet.
    Expects JSON: {"username": "...", "password": "..."}
    """
    if User.query.count() > 0:
        return jsonify({"error": "Setup already completed. Users exist."}), 403

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be valid JSON"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    admin = User(
        username=username,
        password_hash=generate_password_hash(password),
        role="admin",
    )
    db.session.add(admin)
    db.session.commit()

    token = _create_token(admin)
    return jsonify({
        "message": "Admin account created successfully",
        "token": token,
        "user": admin.to_dict(),
    }), 201
