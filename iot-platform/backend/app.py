"""
Flask application entry point for the IoT Platform backend.
- Initialises the database and registers all API blueprints
- Serves React static files from ../frontend/dist when available
- Provides health and status endpoints
"""

import os
import time
import logging
from datetime import datetime, timezone

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS

import config
from models import db, Device, Telemetry, User

# Record server start time for uptime reporting
_server_start_time = time.time()

# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app():
    """Create and configure the Flask application."""

    # Determine path for serving the React frontend build
    frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))

    app = Flask(
        __name__,
        static_folder=frontend_dist if os.path.isdir(frontend_dist) else None,
        static_url_path="",
    )

    # Load configuration from config module
    app.config["SQLALCHEMY_DATABASE_URI"] = config.SQLALCHEMY_DATABASE_URI
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = config.SQLALCHEMY_TRACK_MODIFICATIONS
    app.config["SECRET_KEY"] = config.SECRET_KEY

    # Enable CORS so the React dev server can talk to the API
    CORS(app)

    # Initialise the shared SQLAlchemy instance with this app
    db.init_app(app)

    # Create tables if they don't already exist
    with app.app_context():
        db.create_all()

    # ------------------------------------------------------------------
    # Register API blueprints
    # ------------------------------------------------------------------
    from routes.auth import auth_bp, login_required
    from routes.devices import devices_bp
    from routes.telemetry import telemetry_bp
    from routes.commands import commands_bp
    from routes.hierarchy import hierarchy_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(telemetry_bp)
    app.register_blueprint(commands_bp)
    app.register_blueprint(hierarchy_bp)

    # ------------------------------------------------------------------
    # Health check endpoint
    # ------------------------------------------------------------------
    @app.route("/api/health", methods=["GET"])
    def health():
        """Simple health check -- returns 200 with {"status": "ok"}."""
        return jsonify({"status": "ok"}), 200

    # ------------------------------------------------------------------
    # Status endpoint -- aggregate platform statistics
    # ------------------------------------------------------------------
    @app.route("/api/status", methods=["GET"])
    @login_required
    def status():
        """
        Return platform-level statistics:
        - online / offline device counts
        - total telemetry records stored
        - server uptime in seconds
        """
        online_count = Device.query.filter_by(is_online=True).count()
        offline_count = Device.query.filter_by(is_online=False).count()
        telemetry_count = db.session.query(Telemetry.id).count()
        uptime_seconds = round(time.time() - _server_start_time, 2)

        return jsonify({
            "online_devices": online_count,
            "offline_devices": offline_count,
            "total_telemetry_records": telemetry_count,
            "server_uptime_seconds": uptime_seconds,
        }), 200

    # ------------------------------------------------------------------
    # SPA routing -- serve React frontend
    # ------------------------------------------------------------------
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_frontend(path):
        """
        Serve the React SPA.
        - If the requested path matches a static file, serve it directly.
        - Otherwise fall back to index.html for client-side routing.
        """
        # Only attempt to serve if the frontend build directory exists
        if app.static_folder and os.path.isdir(app.static_folder):
            # Try to serve the exact file requested (JS, CSS, images, etc.)
            file_path = os.path.join(app.static_folder, path)
            if path and os.path.isfile(file_path):
                return send_from_directory(app.static_folder, path)
            # Fall back to index.html for SPA client-side routes
            index_path = os.path.join(app.static_folder, "index.html")
            if os.path.isfile(index_path):
                return send_from_directory(app.static_folder, "index.html")

        # No frontend build available -- return a simple JSON message
        return jsonify({"message": "IoT Platform API is running. Frontend not built yet."}), 200

    return app


# ---------------------------------------------------------------------------
# Configure logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# Create the application instance (used by mqtt_service and gunicorn)
app = create_app()

# ---------------------------------------------------------------------------
# Run with the built-in development server
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(
        host=config.FLASK_HOST,
        port=config.FLASK_PORT,
        debug=True,
    )
