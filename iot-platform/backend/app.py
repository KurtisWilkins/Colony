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


def _format_uptime(seconds):
    """Format seconds into human-readable uptime string."""
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    mins = int((seconds % 3600) // 60)
    if days > 0:
        return f"{days}d {hours}h {mins}m"
    if hours > 0:
        return f"{hours}h {mins}m"
    return f"{mins}m"

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

    from routes.irrigation import irrigation_bp
    app.register_blueprint(irrigation_bp)

    from routes.climate import climate_bp
    app.register_blueprint(climate_bp)

    from routes.users import users_bp
    from routes.device_credentials import device_credentials_bp
    app.register_blueprint(users_bp)
    app.register_blueprint(device_credentials_bp)

    from routes.mushroom_inventory import inventory_bp
    app.register_blueprint(inventory_bp)

    # ------------------------------------------------------------------
    # Health check endpoint
    # ------------------------------------------------------------------
    @app.route("/api/health", methods=["GET"])
    def health():
        """Simple health check -- returns 200 with {"status": "ok"}."""
        return jsonify({"status": "ok"}), 200

    # ------------------------------------------------------------------
    # Detailed server health endpoint
    # ------------------------------------------------------------------
    @app.route("/api/health/detailed", methods=["GET"])
    @login_required
    def health_detailed():
        """Return detailed server health metrics."""
        import psutil
        import shutil

        # CPU
        cpu_pct = psutil.cpu_percent(interval=0.5)
        cpu_count = psutil.cpu_count()
        cpu_freq = psutil.cpu_freq()
        load_1, load_5, load_15 = psutil.getloadavg()

        # Memory
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()

        # Disk
        disk = shutil.disk_usage("/")

        # Network
        net = psutil.net_io_counters()

        # CPU temperature (Raspberry Pi)
        cpu_temp = None
        try:
            temps = psutil.sensors_temperatures()
            if "cpu_thermal" in temps and temps["cpu_thermal"]:
                cpu_temp = temps["cpu_thermal"][0].current
            elif "cpu-thermal" in temps and temps["cpu-thermal"]:
                cpu_temp = temps["cpu-thermal"][0].current
        except (AttributeError, KeyError):
            pass

        # Process info
        proc = psutil.Process()
        proc_mem = proc.memory_info()

        # Database size
        db_size_bytes = None
        try:
            row = db.session.execute(
                db.text("SELECT pg_database_size(current_database())")
            ).scalar()
            db_size_bytes = row
        except Exception:
            pass

        # Table row counts
        device_count = Device.query.count()
        telemetry_count = db.session.query(Telemetry.id).count()
        facility_count = Facility.query.count()

        # Telemetry rate (records in last 5 minutes)
        from datetime import timedelta
        five_min_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
        recent_telemetry = Telemetry.query.filter(
            Telemetry.received_at >= five_min_ago
        ).count()
        telemetry_per_min = round(recent_telemetry / 5.0, 1)

        # MQTT service check
        mqtt_running = False
        for p in psutil.process_iter(['name', 'cmdline']):
            try:
                cmdline = p.info.get('cmdline') or []
                if any('mqtt_service' in str(c) for c in cmdline):
                    mqtt_running = True
                    break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        # Mosquitto check
        mosquitto_running = False
        for p in psutil.process_iter(['name']):
            try:
                if p.info['name'] == 'mosquitto':
                    mosquitto_running = True
                    break
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass

        uptime_seconds = round(time.time() - _server_start_time, 2)

        return jsonify({
            "server": {
                "uptime_s": uptime_seconds,
                "uptime_human": _format_uptime(uptime_seconds),
            },
            "cpu": {
                "percent": cpu_pct,
                "count": cpu_count,
                "freq_mhz": round(cpu_freq.current) if cpu_freq else None,
                "load_1m": round(load_1, 2),
                "load_5m": round(load_5, 2),
                "load_15m": round(load_15, 2),
                "temperature_c": round(cpu_temp, 1) if cpu_temp else None,
            },
            "memory": {
                "total_mb": round(mem.total / 1048576),
                "used_mb": round(mem.used / 1048576),
                "available_mb": round(mem.available / 1048576),
                "percent": mem.percent,
                "swap_total_mb": round(swap.total / 1048576),
                "swap_used_mb": round(swap.used / 1048576),
                "swap_percent": swap.percent,
            },
            "disk": {
                "total_gb": round(disk.total / 1073741824, 1),
                "used_gb": round(disk.used / 1073741824, 1),
                "free_gb": round(disk.free / 1073741824, 1),
                "percent": round(disk.used / disk.total * 100, 1),
            },
            "network": {
                "bytes_sent_mb": round(net.bytes_sent / 1048576, 1),
                "bytes_recv_mb": round(net.bytes_recv / 1048576, 1),
                "packets_sent": net.packets_sent,
                "packets_recv": net.packets_recv,
                "errors_in": net.errin,
                "errors_out": net.errout,
            },
            "database": {
                "size_mb": round(db_size_bytes / 1048576, 1) if db_size_bytes else None,
                "devices": device_count,
                "telemetry_records": telemetry_count,
                "facilities": facility_count,
                "telemetry_per_min": telemetry_per_min,
            },
            "process": {
                "flask_rss_mb": round(proc_mem.rss / 1048576, 1),
                "flask_vms_mb": round(proc_mem.vms / 1048576, 1),
            },
            "services": {
                "flask": True,
                "mqtt_service": mqtt_running,
                "mosquitto": mosquitto_running,
            },
        }), 200

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

            readme_md = os.path.join(firmware_dir, "arduino", "README_INSTALL.md")
            if os.path.isfile(readme_md):
                zf.write(readme_md, "README_INSTALL.md")

            # Include dependency installer scripts
            for installer in ("install_dependencies.py", "install_dependencies.bat", "install_dependencies.sh"):
                ipath = os.path.join(firmware_dir, installer)
                if os.path.isfile(ipath):
                    zf.write(ipath, installer)

        buf.seek(0)
        return send_file(
            buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name="growtent-firmware.zip",
        )

    # ------------------------------------------------------------------
    # Irrigation firmware download endpoint
    # ------------------------------------------------------------------
    @app.route("/api/firmware/irrigation/download", methods=["GET"])
    @login_required
    def download_irrigation_firmware():
        """Zip the irrigation firmware and return as a downloadable file."""
        firmware_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "firmware-irrigation")
        )
        src_dir = os.path.join(firmware_dir, "src")

        if not os.path.isdir(src_dir):
            return jsonify({"error": "Irrigation firmware directory not found"}), 404

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            # PlatformIO source files
            for fname in sorted(os.listdir(src_dir)):
                fpath = os.path.join(src_dir, fname)
                if os.path.isfile(fpath):
                    zf.write(fpath, os.path.join("firmware-irrigation", "src", fname))

            # platformio.ini
            pio_ini = os.path.join(firmware_dir, "platformio.ini")
            if os.path.isfile(pio_ini):
                zf.write(pio_ini, os.path.join("firmware-irrigation", "platformio.ini"))

            # Arduino IDE folder
            arduino_dir = os.path.join(firmware_dir, "arduino", "irrigation")
            if os.path.isdir(arduino_dir):
                for fname in sorted(os.listdir(arduino_dir)):
                    fpath = os.path.join(arduino_dir, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, os.path.join("irrigation", fname))

        buf.seek(0)
        return send_file(
            buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name="irrigation-firmware.zip",
        )

    # ------------------------------------------------------------------
    # WROOM-32D irrigation firmware download
    # ------------------------------------------------------------------
    @app.route("/api/firmware/irrigation-wroom32d/download", methods=["GET"])
    @login_required
    def download_irrigation_wroom32d():
        """Zip the WROOM-32D irrigation firmware."""
        firmware_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "firmware-irrigation-wroom32d")
        )
        src_dir = os.path.join(firmware_dir, "src")

        if not os.path.isdir(src_dir):
            return jsonify({"error": "WROOM-32D firmware not found"}), 404

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in sorted(os.listdir(src_dir)):
                fpath = os.path.join(src_dir, fname)
                if os.path.isfile(fpath):
                    zf.write(fpath, os.path.join("firmware", "src", fname))
            pio_ini = os.path.join(firmware_dir, "platformio.ini")
            if os.path.isfile(pio_ini):
                zf.write(pio_ini, os.path.join("firmware", "platformio.ini"))
            arduino_dir = os.path.join(firmware_dir, "arduino", "irrigation")
            if os.path.isdir(arduino_dir):
                for fname in sorted(os.listdir(arduino_dir)):
                    fpath = os.path.join(arduino_dir, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, os.path.join("irrigation", fname))

        buf.seek(0)
        return send_file(buf, mimetype="application/zip", as_attachment=True,
                         download_name="irrigation-wroom32d-firmware.zip")

    # ------------------------------------------------------------------
    # ESP32-S2 irrigation firmware download
    # ------------------------------------------------------------------
    @app.route("/api/firmware/irrigation-s2/download", methods=["GET"])
    @login_required
    def download_irrigation_s2():
        """Zip the ESP32-S2 irrigation firmware."""
        firmware_dir = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "firmware-irrigation-s2")
        )
        src_dir = os.path.join(firmware_dir, "src")

        if not os.path.isdir(src_dir):
            return jsonify({"error": "ESP32-S2 firmware not found"}), 404

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for fname in sorted(os.listdir(src_dir)):
                fpath = os.path.join(src_dir, fname)
                if os.path.isfile(fpath):
                    zf.write(fpath, os.path.join("firmware", "src", fname))
            pio_ini = os.path.join(firmware_dir, "platformio.ini")
            if os.path.isfile(pio_ini):
                zf.write(pio_ini, os.path.join("firmware", "platformio.ini"))
            arduino_dir = os.path.join(firmware_dir, "arduino", "irrigation_s2")
            if os.path.isdir(arduino_dir):
                for fname in sorted(os.listdir(arduino_dir)):
                    fpath = os.path.join(arduino_dir, fname)
                    if os.path.isfile(fpath):
                        zf.write(fpath, os.path.join("irrigation_s2", fname))

        buf.seek(0)
        return send_file(buf, mimetype="application/zip", as_attachment=True,
                         download_name="irrigation-s2-firmware.zip")

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
