#!/usr/bin/env bash
# =============================================================================
# IoT Platform Setup Script for Raspberry Pi 5 (Raspberry Pi OS / Debian)
#
# This script installs and configures all dependencies:
#   - PostgreSQL, Mosquitto, Python 3, Node.js
#   - Creates database, schema, and user
#   - Installs Python and Node dependencies
#   - Builds the React frontend
#   - Sets up systemd services for Flask API and MQTT subscriber
#
# Usage: sudo bash setup.sh
# =============================================================================

set -e  # Exit on any error

# --- Color output helpers ---
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# --- Check for root privileges ---
if [ "$EUID" -ne 0 ]; then
    error "Please run this script as root: sudo bash setup.sh"
fi

# --- Determine project directory (where this script lives) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

info "Project directory: $PROJECT_DIR"

# --- Load environment variables ---
if [ -f "$PROJECT_DIR/.env" ]; then
    info "Loading configuration from .env"
    set -a
    source "$PROJECT_DIR/.env"
    set +a
else
    warn ".env file not found — copying from .env.example"
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    set -a
    source "$PROJECT_DIR/.env"
    set +a
    warn "Please review $PROJECT_DIR/.env and update passwords before production use!"
fi

# =============================================================================
# Step 1: Install system packages
# =============================================================================
info "Step 1: Installing system packages..."

apt-get update -y
apt-get install -y \
    postgresql \
    postgresql-contrib \
    mosquitto \
    mosquitto-clients \
    python3 \
    python3-pip \
    python3-venv \
    curl \
    git

# Install Node.js via NodeSource (LTS version)
if ! command -v node &> /dev/null; then
    info "Installing Node.js LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    info "Node.js already installed: $(node --version)"
fi

info "System packages installed successfully."

# =============================================================================
# Step 2: Configure and start Mosquitto
# =============================================================================
info "Step 2: Configuring Mosquitto..."

# Copy custom mosquitto config
cp "$PROJECT_DIR/mosquitto/mosquitto.conf" /etc/mosquitto/conf.d/iot-platform.conf

# Enable and start Mosquitto
systemctl enable mosquitto
systemctl restart mosquitto

info "Mosquitto configured and running."

# =============================================================================
# Step 3: Configure PostgreSQL
# =============================================================================
info "Step 3: Setting up PostgreSQL..."

# Ensure PostgreSQL is running
systemctl enable postgresql
systemctl start postgresql

# Create database user and database (ignore errors if they already exist)
sudo -u postgres psql -c "CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>/dev/null || warn "User ${POSTGRES_USER} may already exist."
sudo -u postgres psql -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};" 2>/dev/null || warn "Database ${POSTGRES_DB} may already exist."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};"

# Run the schema initialization script
info "Running database schema initialization..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -f "$PROJECT_DIR/postgres/init.sql"

info "PostgreSQL configured and schema created."

# =============================================================================
# Step 4: Set up Python backend
# =============================================================================
info "Step 4: Setting up Python backend..."

# Create virtual environment
python3 -m venv "$PROJECT_DIR/backend/venv"
source "$PROJECT_DIR/backend/venv/bin/activate"

# Install Python dependencies
pip install --upgrade pip
pip install -r "$PROJECT_DIR/backend/requirements.txt"

deactivate

info "Python backend dependencies installed."

# =============================================================================
# Step 5: Build React frontend
# =============================================================================
info "Step 5: Building React frontend..."

cd "$PROJECT_DIR/frontend"
npm install
npm run build

cd "$PROJECT_DIR"

info "React frontend built successfully."

# =============================================================================
# Step 6: Set up systemd services
# =============================================================================
info "Step 6: Creating systemd services..."

# Determine the non-root user who owns the project files
PROJECT_USER=$(stat -c '%U' "$PROJECT_DIR")

# --- Flask API service ---
cat > /etc/systemd/system/iot-flask.service << EOF
[Unit]
Description=IoT Platform Flask API
After=network.target postgresql.service mosquitto.service
Requires=postgresql.service

[Service]
Type=simple
User=${PROJECT_USER}
WorkingDirectory=${PROJECT_DIR}/backend
EnvironmentFile=${PROJECT_DIR}/.env
ExecStart=${PROJECT_DIR}/backend/venv/bin/python app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# --- MQTT Subscriber service ---
cat > /etc/systemd/system/iot-mqtt.service << EOF
[Unit]
Description=IoT Platform MQTT Subscriber Service
After=network.target postgresql.service mosquitto.service
Requires=postgresql.service mosquitto.service

[Service]
Type=simple
User=${PROJECT_USER}
WorkingDirectory=${PROJECT_DIR}/backend
EnvironmentFile=${PROJECT_DIR}/.env
ExecStart=${PROJECT_DIR}/backend/venv/bin/python mqtt_service.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd, enable and start services
systemctl daemon-reload
systemctl enable iot-flask.service
systemctl enable iot-mqtt.service
systemctl start iot-flask.service
systemctl start iot-mqtt.service

info "Systemd services created and started."

# =============================================================================
# Step 7: Final status report
# =============================================================================
echo ""
echo "=============================================="
info "IoT Platform setup complete!"
echo "=============================================="
echo ""
echo "  Flask API:      http://0.0.0.0:${FLASK_PORT}"
echo "  MQTT Broker:    mqtt://0.0.0.0:${MQTT_BROKER_PORT}"
echo "  PostgreSQL:     localhost:${POSTGRES_PORT}/${POSTGRES_DB}"
echo ""
echo "  Services:"
echo "    - iot-flask.service  (Flask API + React frontend)"
echo "    - iot-mqtt.service   (MQTT subscriber)"
echo ""
echo "  Useful commands:"
echo "    systemctl status iot-flask"
echo "    systemctl status iot-mqtt"
echo "    journalctl -u iot-flask -f"
echo "    journalctl -u iot-mqtt -f"
echo ""
echo "  Access the web UI from any device on the LAN:"
echo "    http://<pi-ip-address>:${FLASK_PORT}"
echo ""
warn "Remember to update .env with secure passwords before production use!"
