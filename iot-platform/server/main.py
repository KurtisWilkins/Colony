"""
IoT Automation Server -- main entry point.

Responsibilities:
1. Load configuration
2. Initialise database connection and run migrations
3. Initialise all automation components
4. Start worker threads
5. Connect MQTT and subscribe to topics
6. Register Flask API routes and start Flask in a thread
7. Block on MQTT loop
8. Graceful shutdown on SIGINT/SIGTERM
"""

import logging
import os
import signal
import sys
import threading
from queue import Queue

from flask import Flask
from flask_cors import CORS
from sqlalchemy import text

import config
from db.connection import init_session, get_engine, get_session
from models.base import Base

# Import all models so Base.metadata knows about them
from models.device import Device
from models.telemetry import Telemetry
from models.command import Command
from models.threshold import DeviceThreshold
from models.water_usage import WaterUsageSession
from models.automation_event import AutomationEvent
from automation.alert_manager import Alert

from mqtt.broker import MQTTBroker
from mqtt.subscriber import MQTTSubscriber
from mqtt.publisher import MQTTPublisher

from automation.device_state import DeviceStateManager
from automation.thresholds import ThresholdCache
from automation.alert_manager import AlertManager
from automation.command_sender import CommandSender
from automation.engine import AutomationEngine

from workers.telemetry_worker import TelemetryWorker
from workers.status_worker import StatusWorker
from workers.flow_worker import FlowWorker
from workers.command_worker import CommandWorker

from api.thresholds import thresholds_bp, init_thresholds_api
from api.manual_control import manual_control_bp, init_manual_control_api
from api.water_usage import water_usage_bp

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")

# ---------------------------------------------------------------------------
# Globals for shutdown
# ---------------------------------------------------------------------------
_shutdown_event = threading.Event()
_workers = []
_broker = None


def run_migration():
    """Run the SQL migration file to create automation tables."""
    migration_path = os.path.join(
        os.path.dirname(__file__), "db", "migrations", "add_automation_tables.sql"
    )

    if not os.path.isfile(migration_path):
        logger.warning("Migration file not found: %s", migration_path)
        return

    engine = get_engine()
    with open(migration_path, "r") as f:
        sql = f.read()

    with engine.connect() as conn:
        # Execute each statement separately
        for statement in sql.split(";"):
            statement = statement.strip()
            if statement:
                try:
                    conn.execute(text(statement))
                except Exception as exc:
                    # Tables may already exist; log and continue
                    logger.debug("Migration statement skipped (may already exist): %s", exc)
        conn.commit()
    logger.info("Database migration completed")


def create_flask_app():
    """Create the Flask application for the automation API."""
    app = Flask(__name__)
    app.config["SECRET_KEY"] = config.SECRET_KEY
    CORS(app)
    return app


def graceful_shutdown(signum, frame):
    """Handle SIGINT/SIGTERM for graceful shutdown."""
    sig_name = signal.Signals(signum).name if hasattr(signal, "Signals") else signum
    logger.info("Received %s -- initiating graceful shutdown", sig_name)

    # Stop workers
    for worker in _workers:
        worker.stop()

    # Disconnect MQTT
    if _broker:
        _broker.disconnect()

    _shutdown_event.set()
    logger.info("Shutdown complete")
    sys.exit(0)


def main():
    global _broker, _workers

    logger.info("=" * 60)
    logger.info("IoT Automation Server starting")
    logger.info("=" * 60)

    # ------------------------------------------------------------------
    # 1. Register signal handlers
    # ------------------------------------------------------------------
    signal.signal(signal.SIGINT, graceful_shutdown)
    signal.signal(signal.SIGTERM, graceful_shutdown)

    # ------------------------------------------------------------------
    # 2. Initialise database
    # ------------------------------------------------------------------
    logger.info("Initialising database connection...")
    init_session()

    # Create automation-specific tables via migration
    logger.info("Running database migrations...")
    run_migration()

    # Also ensure ORM-managed tables exist
    engine = get_engine()
    Base.metadata.create_all(engine, checkfirst=True)

    # ------------------------------------------------------------------
    # 3. Create message queues
    # ------------------------------------------------------------------
    telemetry_queue = Queue(maxsize=config.QUEUE_MAX_SIZE)
    status_queue = Queue(maxsize=config.QUEUE_MAX_SIZE)
    flow_queue = Queue(maxsize=config.QUEUE_MAX_SIZE)
    command_queue = Queue(maxsize=config.QUEUE_MAX_SIZE)

    # ------------------------------------------------------------------
    # 4. Initialise automation components
    # ------------------------------------------------------------------
    logger.info("Initialising automation components...")

    state_manager = DeviceStateManager()
    threshold_cache = ThresholdCache()
    threshold_cache.load_all()
    alert_manager = AlertManager()

    # MQTT
    _broker = MQTTBroker()
    publisher = MQTTPublisher(_broker)

    # Command sender needs publisher and state manager
    command_sender = CommandSender(publisher, state_manager)

    # Automation engine
    engine = AutomationEngine(state_manager, threshold_cache, command_sender, alert_manager)

    # ------------------------------------------------------------------
    # 5. Initialise and start workers
    # ------------------------------------------------------------------
    logger.info("Starting worker threads...")

    telemetry_worker = TelemetryWorker(telemetry_queue, state_manager, engine, alert_manager)
    status_worker = StatusWorker(status_queue, state_manager)
    flow_worker = FlowWorker(flow_queue, state_manager)
    command_worker = CommandWorker(command_queue)

    _workers = [telemetry_worker, status_worker, flow_worker, command_worker]

    telemetry_worker.start()
    status_worker.start()
    flow_worker.start()
    command_worker.start()

    # ------------------------------------------------------------------
    # 6. Connect MQTT and subscribe
    # ------------------------------------------------------------------
    logger.info("Connecting to MQTT broker...")

    subscriber = MQTTSubscriber(
        _broker, telemetry_queue, status_queue, flow_queue, command_queue,
    )

    _broker.connect()
    subscriber.subscribe()

    # ------------------------------------------------------------------
    # 7. Set up Flask API
    # ------------------------------------------------------------------
    logger.info("Setting up Flask API...")

    app = create_flask_app()

    # Inject dependencies into blueprints
    init_thresholds_api(threshold_cache, command_sender)
    init_manual_control_api(command_sender, state_manager)

    # Register blueprints
    app.register_blueprint(thresholds_bp)
    app.register_blueprint(manual_control_bp)
    app.register_blueprint(water_usage_bp)

    # Health check
    @app.route("/api/health", methods=["GET"])
    def health():
        return {
            "status": "ok",
            "service": "automation-server",
            "mqtt_connected": _broker.connected if _broker else False,
        }, 200

    # Start Flask in a background thread
    flask_thread = threading.Thread(
        target=lambda: app.run(
            host=config.FLASK_HOST,
            port=config.FLASK_PORT,
            debug=False,
            use_reloader=False,
        ),
        daemon=True,
        name="flask-api",
    )
    flask_thread.start()
    logger.info("Flask API started on %s:%s", config.FLASK_HOST, config.FLASK_PORT)

    # ------------------------------------------------------------------
    # 8. Block on main thread
    # ------------------------------------------------------------------
    logger.info("Automation server is running. Press Ctrl+C to stop.")

    try:
        _shutdown_event.wait()
    except KeyboardInterrupt:
        graceful_shutdown(signal.SIGINT, None)


if __name__ == "__main__":
    main()
