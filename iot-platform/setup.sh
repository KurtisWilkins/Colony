#!/usr/bin/env bash
# =============================================================================
# IoT Platform Setup Script for Raspberry Pi 5 (Raspberry Pi OS / Debian)
#
# This script installs and configures all dependencies:
#   - PostgreSQL, Mosquitto, Python 3, Node.js, Nginx
#   - Creates database, schema, and user
#   - Installs Python and Node dependencies
#   - Builds the React frontend
#   - Sets up systemd services for Flask API and MQTT subscriber
#   - Configures nginx reverse proxy
#   - Sets up auto-update cron job
#
# Usage: sudo bash setup.sh
# =============================================================================

echo ""
echo "========================================"
echo "  Colony IoT Platform - Setup Script"
echo "========================================"
echo ""

# --- Color output helpers (using printf for portability) ---
info()  { printf '\033[0;32m[INFO]\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33m[WARN]\033[0m %s\n' "$1"; }
err()   { printf '\033[0;31m[ERROR]\033[0m %s\n' "$1"; }

# --- Check for root privileges ---
if [ "$(id -u)" -ne 0 ]; then
    err "This script must be run as root."
    echo ""
    echo "  Please run:  sudo bash setup.sh"
    echo ""
    exit 1
fi

info "Running as root - OK"

# --- Determine project directory (where this script lives) ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

info "Project directory: $PROJECT_DIR"

# Verify the project structure exists
if [ ! -f "$PROJECT_DIR/backend/app.py" ]; then
    err "Cannot find backend/app.py in $PROJECT_DIR"
    err "Are you running this script from the correct directory?"
    exit 1
fi

info "Project structure verified - OK"

# --- Load environment variables ---
if [ -f "$PROJECT_DIR/.env" ]; then
    info "Loading configuration from .env"
    set -a
    . "$PROJECT_DIR/.env"
    set +a
else
    if [ -f "$PROJECT_DIR/.env.example" ]; then
        warn ".env file not found - copying from .env.example"
        cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
        set -a
        . "$PROJECT_DIR/.env"
        set +a
        warn "Please review $PROJECT_DIR/.env and update passwords before production use!"
    else
        err "No .env or .env.example file found in $PROJECT_DIR"
        exit 1
    fi
fi

# Set defaults if not in .env
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-iot_platform}"
POSTGRES_USER="${POSTGRES_USER:-iot_user}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme_password}"
MQTT_BROKER_HOST="${MQTT_BROKER_HOST:-localhost}"
MQTT_BROKER_PORT="${MQTT_BROKER_PORT:-1883}"
FLASK_HOST="${FLASK_HOST:-0.0.0.0}"
FLASK_PORT="${FLASK_PORT:-5000}"

info "Configuration loaded"
echo "  PostgreSQL: ${POSTGRES_USER}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"
echo "  MQTT:       ${MQTT_BROKER_HOST}:${MQTT_BROKER_PORT}"
echo "  Flask:      ${FLASK_HOST}:${FLASK_PORT}"
echo ""

# =============================================================================
# Step 1: Install system packages
# =============================================================================
info "Step 1/9: Installing system packages..."

apt-get update -y
if [ $? -ne 0 ]; then
    err "apt-get update failed. Check your internet connection."
    exit 1
fi

apt-get install -y \
    postgresql \
    postgresql-contrib \
    libpq-dev \
    mosquitto \
    mosquitto-clients \
    python3 \
    python3-pip \
    python3-venv \
    nginx \
    curl \
    git

if [ $? -ne 0 ]; then
    err "Failed to install system packages."
    exit 1
fi

# Install Node.js LTS
if ! command -v node > /dev/null 2>&1; then
    NODE_VERSION="20.19.0"
    # Use dpkg architecture (not uname -m) because Raspberry Pi OS can run
    # a 64-bit kernel (aarch64) with 32-bit userspace (armhf).
    # NodeSource checks dpkg arch, so we must match that.
    DPKG_ARCH=$(dpkg --print-architecture 2>/dev/null || echo "unknown")
    UNAME_ARCH=$(uname -m)
    info "Detected architecture: dpkg=$DPKG_ARCH, uname=$UNAME_ARCH"

    if [ "$DPKG_ARCH" = "armhf" ] || [ "$UNAME_ARCH" = "armv7l" ] || [ "$UNAME_ARCH" = "armv6l" ]; then
        # Raspberry Pi 32-bit userspace - NodeSource does not support armhf
        # Use the uname arch for the Node.js binary download URL
        if [ "$UNAME_ARCH" = "aarch64" ]; then
            # 64-bit kernel with 32-bit userspace — need armv7l binary
            NODE_ARCH="armv7l"
        else
            NODE_ARCH="$UNAME_ARCH"
        fi
        info "Installing Node.js v${NODE_VERSION} from official ARM binaries (${NODE_ARCH})..."
        NODE_TARBALL="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
        NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"

        cd /tmp
        curl -fSL "$NODE_URL" -o "$NODE_TARBALL"
        if [ $? -ne 0 ]; then
            err "Failed to download Node.js from $NODE_URL"
            exit 1
        fi

        tar -xJf "$NODE_TARBALL" -C /usr/local --strip-components=1
        rm -f "$NODE_TARBALL"
        cd "$PROJECT_DIR"

        if ! command -v node > /dev/null 2>&1; then
            err "Node.js installation failed."
            exit 1
        fi
        info "Node.js $(node --version) installed successfully."
    else
        # amd64 or arm64 (true 64-bit userspace) - use NodeSource
        info "Installing Node.js LTS via NodeSource..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
        if [ $? -ne 0 ]; then
            err "Failed to install Node.js via NodeSource."
            exit 1
        fi
    fi
else
    info "Node.js already installed: $(node --version)"
fi

info "System packages installed successfully."
echo ""

# =============================================================================
# Step 2: Configure and start Mosquitto
# =============================================================================
info "Step 2/9: Configuring Mosquitto..."

cp "$PROJECT_DIR/mosquitto/mosquitto.conf" /etc/mosquitto/conf.d/iot-platform.conf

systemctl enable mosquitto
systemctl restart mosquitto

if systemctl is-active --quiet mosquitto; then
    info "Mosquitto is running."
else
    warn "Mosquitto may not have started correctly. Check: systemctl status mosquitto"
fi
echo ""

# =============================================================================
# Step 3: Configure PostgreSQL
# =============================================================================
info "Step 3/9: Setting up PostgreSQL..."

systemctl enable postgresql
systemctl start postgresql

if ! systemctl is-active --quiet postgresql; then
    err "PostgreSQL failed to start. Check: systemctl status postgresql"
    exit 1
fi

# Create database user and database (ignore errors if they already exist)
sudo -u postgres psql -c "CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';" 2>/dev/null || warn "User ${POSTGRES_USER} may already exist."
sudo -u postgres psql -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};" 2>/dev/null || warn "Database ${POSTGRES_DB} may already exist."
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};"

# Run the schema initialization script
info "Running database schema initialization..."
PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -f "$PROJECT_DIR/postgres/init.sql"

if [ $? -ne 0 ]; then
    err "Database schema initialization failed."
    err "Check PostgreSQL authentication in /etc/postgresql/*/main/pg_hba.conf"
    err "You may need to add: local all ${POSTGRES_USER} md5"
    exit 1
fi

info "PostgreSQL configured and schema created."
echo ""

# =============================================================================
# Step 4: Set up Python backend
# =============================================================================
info "Step 4/9: Setting up Python backend..."

python3 -m venv "$PROJECT_DIR/backend/venv"
if [ $? -ne 0 ]; then
    err "Failed to create Python virtual environment."
    exit 1
fi

. "$PROJECT_DIR/backend/venv/bin/activate"

pip install --upgrade pip
pip install -r "$PROJECT_DIR/backend/requirements.txt"

if [ $? -ne 0 ]; then
    err "Failed to install Python dependencies."
    deactivate
    exit 1
fi

deactivate

info "Python backend dependencies installed."
echo ""

# =============================================================================
# Step 5: Build React frontend
# =============================================================================
info "Step 5/9: Building React frontend..."

cd "$PROJECT_DIR/frontend"
npm install
if [ $? -ne 0 ]; then
    err "npm install failed."
    cd "$PROJECT_DIR"
    exit 1
fi

npm run build
if [ $? -ne 0 ]; then
    err "Frontend build failed."
    cd "$PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"

info "React frontend built successfully."
echo ""

# =============================================================================
# Step 6: Set up systemd services
# =============================================================================
info "Step 6/9: Creating systemd services..."

# Determine the non-root user who owns the project files
PROJECT_USER=$(stat -c '%U' "$PROJECT_DIR")
info "Services will run as user: ${PROJECT_USER}"

# --- Flask API service ---
cat > /etc/systemd/system/iot-flask.service << SERVICEEOF
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
SERVICEEOF

# --- MQTT Subscriber service ---
cat > /etc/systemd/system/iot-mqtt.service << SERVICEEOF
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
SERVICEEOF

systemctl daemon-reload
systemctl enable iot-flask.service
systemctl enable iot-mqtt.service
systemctl start iot-flask.service
systemctl start iot-mqtt.service

sleep 2

if systemctl is-active --quiet iot-flask; then
    info "iot-flask service is running."
else
    warn "iot-flask may not have started. Check: journalctl -u iot-flask -n 20"
fi

if systemctl is-active --quiet iot-mqtt; then
    info "iot-mqtt service is running."
else
    warn "iot-mqtt may not have started. Check: journalctl -u iot-mqtt -n 20"
fi

info "Systemd services created."
echo ""

# =============================================================================
# Step 7: Configure Nginx reverse proxy
# =============================================================================
info "Step 7/9: Configuring Nginx reverse proxy..."

cp "$PROJECT_DIR/nginx/iot-platform.conf" /etc/nginx/sites-available/iot-platform
ln -sf /etc/nginx/sites-available/iot-platform /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

if nginx -t 2>/dev/null; then
    systemctl enable nginx
    systemctl reload nginx
    info "Nginx reverse proxy configured (port 80 -> Flask port ${FLASK_PORT})."
else
    warn "Nginx configuration test failed. Check: nginx -t"
fi
echo ""

# =============================================================================
# Step 8: Set up auto-update cron job
# =============================================================================
info "Step 8/9: Setting up auto-update cron job..."

CRON_FILE="/etc/cron.d/iot-auto-update"

cat > "$CRON_FILE" << CRONEOF
# Auto-update Colony IoT Platform from GitHub every 5 minutes
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/5 * * * * root ${PROJECT_DIR}/scripts/auto-update.sh >> /var/log/iot-auto-update.log 2>&1
CRONEOF

chmod 644 "$CRON_FILE"

info "Auto-update cron job installed (runs every 5 minutes)."
echo ""

# =============================================================================
# Step 9: Final status report
# =============================================================================
echo ""
echo "========================================"
info "IoT Platform setup complete!"
echo "========================================"
echo ""
echo "  Web UI:         http://0.0.0.0:80 (via Nginx)"
echo "  Flask API:      http://0.0.0.0:${FLASK_PORT} (direct)"
echo "  MQTT Broker:    mqtt://0.0.0.0:${MQTT_BROKER_PORT}"
echo "  PostgreSQL:     localhost:${POSTGRES_PORT}/${POSTGRES_DB}"
echo ""
echo "  Services:"
echo "    - iot-flask.service  (Flask API + React frontend)"
echo "    - iot-mqtt.service   (MQTT subscriber)"
echo "    - nginx              (reverse proxy)"
echo ""
echo "  Auto-Update:"
echo "    - Pulls from GitHub every 5 minutes"
echo "    - Logs: /var/log/iot-auto-update.log"
echo ""
echo "  First-time setup:"
echo "    1. Open http://<pi-ip> in your browser"
echo "    2. Create your admin account on the setup screen"
echo "    3. Only you can add additional users"
echo ""
echo "  Remote access (No-IP):"
echo "    sudo bash ${PROJECT_DIR}/scripts/setup-noip.sh"
echo "    Then forward port 80 on your router to this Pi."
echo ""
warn "Remember to update .env with a secure SECRET_KEY and passwords!"
echo ""
echo "  Useful commands:"
echo "    systemctl status iot-flask"
echo "    systemctl status iot-mqtt"
echo "    systemctl status nginx"
echo "    journalctl -u iot-flask -f"
echo "    journalctl -u iot-mqtt -f"
echo ""
