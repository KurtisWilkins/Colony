#!/usr/bin/env bash
# =============================================================================
# No-IP Dynamic DNS Client Setup Script
#
# Installs and configures the No-IP DUC (Dynamic Update Client) so your
# Raspberry Pi's public IP is always mapped to your No-IP hostname.
#
# Prerequisites:
#   - A free account at https://www.noip.com/
#   - A hostname created in your No-IP dashboard (e.g., myhouse.ddns.net)
#
# Usage: sudo bash scripts/setup-noip.sh
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

if [ "$EUID" -ne 0 ]; then
    error "Please run as root: sudo bash scripts/setup-noip.sh"
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Load env
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    source "$PROJECT_DIR/.env"
    set +a
fi

info "Installing No-IP Dynamic Update Client..."

# Install dependencies
apt-get update -y
apt-get install -y build-essential

# Download and build noip2
NOIP_DIR="/usr/local/src/noip"
mkdir -p "$NOIP_DIR"
cd "$NOIP_DIR"

if [ ! -f "/usr/local/bin/noip2" ]; then
    info "Downloading No-IP client..."
    wget -q https://www.noip.com/client/linux/noip-duc-linux.tar.gz -O noip-duc.tar.gz
    tar xzf noip-duc.tar.gz
    cd noip-*

    info "Building No-IP client..."
    make
    make install

    info "No-IP client installed."
else
    info "No-IP client already installed."
fi

# Configure No-IP (interactive -- asks for username, password, hostname)
info "Configuring No-IP client..."
info "You will be prompted for your No-IP account credentials and hostname."
/usr/local/bin/noip2 -C

# Create systemd service for No-IP
cat > /etc/systemd/system/noip2.service << 'EOF'
[Unit]
Description=No-IP Dynamic DNS Update Client
After=network-online.target
Wants=network-online.target

[Service]
Type=forking
ExecStart=/usr/local/bin/noip2
ExecStop=/usr/local/bin/noip2 -K
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable noip2.service
systemctl start noip2.service

info "No-IP DUC is now running and will start on boot."

# Set up nginx if installed
if command -v nginx &> /dev/null; then
    info "Nginx detected. Setting up reverse proxy..."

    cp "$PROJECT_DIR/nginx/iot-platform.conf" /etc/nginx/sites-available/iot-platform
    ln -sf /etc/nginx/sites-available/iot-platform /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    nginx -t && systemctl reload nginx
    info "Nginx reverse proxy configured."
fi

echo ""
echo "=============================================="
info "No-IP Dynamic DNS setup complete!"
echo "=============================================="
echo ""
echo "  Your Pi will now keep its public IP updated with No-IP."
echo "  Make sure port 80 (and 443 for HTTPS) are forwarded"
echo "  on your router to this Pi's local IP address."
echo ""
echo "  To set up HTTPS with Let's Encrypt:"
echo "    sudo apt install certbot python3-certbot-nginx"
echo "    sudo certbot --nginx -d your-hostname.ddns.net"
echo ""
echo "  Useful commands:"
echo "    systemctl status noip2       -- check DUC status"
echo "    noip2 -S                     -- show current config"
echo "    noip2 -C                     -- reconfigure"
echo ""
