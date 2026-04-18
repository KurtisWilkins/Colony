"""
Flask application entry point for the IoT Platform backend.
- Initialises the database and registers all API blueprints
- Serves React static files from ../frontend/dist when available
- Provides health and status endpoints
"""

import os
import io
import time
import zipfile
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime, timezone

from flask import Flask, jsonify, send_from_directory, send_file
from flask_cors import CORS

import config
from models import db, Device, Telemetry, Facility, Building, Unit

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
    CORS(app, supports_credentials=True)

    # Initialise the shared SQLAlchemy instance with this app
    db.init_app(app)

    # Create tables if they don't already exist
    with app.app_context():
        db.create_all()

    # ------------------------------------------------------------------
    # Initialise Flask-Login for session-based auth
    # ------------------------------------------------------------------
    from routes.auth import auth_bp, login_required, init_login
    init_login(app)

    # ------------------------------------------------------------------
    # Register API blueprints
    # ------------------------------------------------------------------
    from routes.devices import devices_bp
    from routes.telemetry import telemetry_bp
    from routes.commands import commands_bp
    from routes.hierarchy import hierarchy_bp
    from routes.hierarchy_mgmt import hierarchy_mgmt_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(devices_bp)
    app.register_blueprint(telemetry_bp)
    app.register_blueprint(commands_bp)
    app.register_blueprint(hierarchy_bp)
    app.register_blueprint(hierarchy_mgmt_bp)

    from routes.automation_api import automation_api_bp
    app.register_blueprint(automation_api_bp)

    # ------------------------------------------------------------------
    # Health check endpoint
    # ------------------------------------------------------------------
    @app.route("/api/health", methods=["GET"])
    def health():
        """Simple health check -- returns 200 with {"status": "ok"}."""
        return jsonify({"status": "ok"}), 200

    # ------------------------------------------------------------------
    # Firmware download endpoint
    # ------------------------------------------------------------------
    @app.route("/api/firmware/download", methods=["GET"])
    @login_required
    def download_firmware():
        """Zip the firmware src/ directory and return as a downloadable file."""
        firmware_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "firmware")
        )
        src_dir = os.path.join(firmware_dir, "src")

        if not os.path.isdir(src_dir):
            return jsonify({"error": "Firmware source directory not found"}), 404

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # Include PlatformIO source files
            for fname in sorted(os.listdir(src_dir)):
                fpath = os.path.join(src_dir, fname)
                if os.path.isfile(fpath):
                    zf.write(fpath, os.path.join("firmware", "src", fname))

            # Include platformio.ini if present
            pio_ini = os.path.join(firmware_dir, "platformio.ini")
            if os.path.isfile(pio_ini):
                zf.write(pio_ini, os.path.join("firmware", "platformio.ini"))

            # Include data/ directory for SPIFFS
            data_dir = os.path.join(firmware_dir, "data")
            if os.path.isdir(data_dir):
                for fname in sorted(os.listdir(data_dir)):
                    fpath = os.path.join(data_dir, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, os.path.join("firmware", "data", fname))

            # Include Arduino IDE compatible folder (growtent/growtent.ino)
            arduino_dir = os.path.join(firmware_dir, "arduino", "growtent")
            if os.path.isdir(arduino_dir):
                for fname in sorted(os.listdir(arduino_dir)):
                    fpath = os.path.join(arduino_dir, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, os.path.join("growtent", fname))

            # Include Arduino install instructions
            install_md = os.path.join(firmware_dir, "arduino", "INSTALL_LIBRARIES.md")
            if os.path.isfile(install_md):
                zf.write(install_md, "INSTALL_LIBRARIES.md")

        buf.seek(0)
        return send_file(
            buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name="growtent-firmware.zip",
        )

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
        online_count = Device.query.filter_by(is_online=True, status="active").count()
        offline_count = Device.query.filter_by(is_online=False, status="active").count()
        pending_count = Device.query.filter_by(status="pending").count()
        telemetry_count = db.session.query(Telemetry.id).count()
        facility_count = Facility.query.count()
        building_count = Building.query.count()
        unit_count = Unit.query.count()
        uptime_seconds = round(time.time() - _server_start_time, 2)

        return jsonify({
            "online_devices": online_count,
            "offline_devices": offline_count,
            "total_telemetry_records": telemetry_count,
            "total_facilities": facility_count,
            "total_buildings": building_count,
            "total_units": unit_count,
            "pending_devices": pending_count,
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

# ---------------------------------------------------------------------------
# File-based logging for management API requests
# ---------------------------------------------------------------------------
_log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
os.makedirs(_log_dir, exist_ok=True)

_mgmt_file_handler = RotatingFileHandler(
    os.path.join(_log_dir, "management_api.log"),
    maxBytes=5 * 1024 * 1024,  # 5 MB per file
    backupCount=3,
)
_mgmt_file_handler.setLevel(logging.DEBUG)
_mgmt_file_handler.setFormatter(
    logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
)

# Attach the file handler to the hierarchy_mgmt logger
logging.getLogger("routes.hierarchy_mgmt").addHandler(_mgmt_file_handler)

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
