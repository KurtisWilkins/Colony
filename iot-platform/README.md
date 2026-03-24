# Colony-Main — Mushroom Grow Tent IoT Platform

ESP32-based mushroom grow tent environmental controller with a Raspberry Pi 5 server. Monitors and controls temperature, humidity (mist maker + fan), CO2 levels, water level, and automated tank refill with variable-speed fan control. Accessible remotely via [shroomlord.3utilities.com](https://shroomlord.3utilities.com).

**Sensors:** BME280 (temp/humidity), MH-Z19B (CO2), JSN-SR04T (ultrasonic water level), YF-S201 (flow)
**Actuators:** 4-channel relay (solenoid valve + mist maker), PWM fan speed control

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Prerequisites](#2-prerequisites)
3. [Fresh Pi Setup — Step by Step](#3-fresh-pi-setup--step-by-step)
4. [Environment Variables](#4-environment-variables)
5. [Systemd Services](#5-systemd-services)
6. [ESP32 Device Setup](#6-esp32-device-setup)
7. [Hardware Reference](#7-hardware-reference)
8. [Troubleshooting](#8-troubleshooting)
9. [Maintenance Schedule](#9-maintenance-schedule)
10. [Quick Reference](#10-quick-reference)

---

## 1. System Architecture

```
ESP32 Devices (sensors + actuators)
        ↕
   MQTT (local network)

Raspberry Pi 5
├── Mosquitto MQTT Broker (port 1883, local only)
├── Flask API (port 5000, internal only)
├── PostgreSQL Database (port 5432, internal only)
├── React Frontend (built static files served by Flask)
├── Nginx Reverse Proxy (ports 80/443, public)
└── No-IP DUC v3 (background service)
        ↕
   HTTPS port 443
   shroomlord.3utilities.com
        ↕
   DNS — No-IP Dynamic DNS
        ↕
   Internet (anywhere)
```

**Data flow:** ESP32 devices publish sensor readings via MQTT → Mosquitto broker on the Pi → MQTT subscriber service stores telemetry in PostgreSQL → Flask API serves data to the React frontend → Nginx terminates HTTPS and proxies to Flask → automation engine evaluates rules and sends commands back to ESP32 devices via MQTT.

**MQTT topic pattern:**
```
{facility}/{building}/{unit}/{device_name}/telemetry
{facility}/{building}/{unit}/{device_name}/command
{facility}/{building}/{unit}/{device_name}/status
```

---

## 2. Prerequisites

Before starting setup you need:

- **Raspberry Pi 5** running Raspberry Pi OS (Bookworm)
- **SSH access** to the Pi
- **Home router** with port forwarding capability
- **No-IP account** at [noip.com](https://www.noip.com) (free tier works)
  - No-IP group name: `group-shroomlord`
  - No-IP group username: `ypan1bm`
  - Hostname: `shroomlord.3utilities.com`
  - Domain already configured and pointing correctly

---

## 3. Fresh Pi Setup — Step by Step

### 3a. System Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  nginx certbot python3-certbot-nginx apache2-utils ufw \
  postgresql postgresql-contrib libpq-dev \
  mosquitto mosquitto-clients \
  python3 python3-pip python3-venv \
  curl git
```

Node.js is installed automatically by `setup.sh` (v20.19.0, handles ARM architecture detection).

### 3b. No-IP DUC v3 Installation

The No-IP Dynamic Update Client keeps `shroomlord.3utilities.com` pointed at your home IP.

**If setting up fresh:** Download from [noip.com → Downloads → DUC v3 → Linux ARM](https://www.noip.com/download). The binary should be placed at `/usr/bin/noip-duc`.

**Current installation:** `/usr/bin/noip-duc` (version 3.3.0)

Create the systemd service file:

```bash
sudo nano /etc/systemd/system/noip-duc.service
```

```ini
[Unit]
Description=No-IP Dynamic Update Client v3
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=kurtis
Environment="NOIP_USERNAME=ypan1bm"
Environment="NOIP_PASSWORD=YOUR_NOIP_GROUP_PASSWORD"
Environment="NOIP_HOSTNAMES=shroomlord.3utilities.com"
Environment="NOIP_CHECK_INTERVAL=5m"
ExecStart=/usr/bin/noip-duc
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

> **NOTE:** Replace `YOUR_NOIP_GROUP_PASSWORD` with the actual No-IP group password.

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable noip-duc
sudo systemctl start noip-duc
sudo systemctl status noip-duc
```

Verify the hostname is updating:

```bash
noip-duc --username ypan1bm \
  --password YOUR_NOIP_GROUP_PASSWORD \
  --hostnames shroomlord.3utilities.com \
  --once
```

Expected output: update successful with current public IP shown.

**Important notes:**
- Free No-IP accounts require confirming the hostname **every 30 days** via email
- Set a monthly calendar reminder to click the confirmation email
- If hostname goes offline: log into [noip.com](https://www.noip.com) and reactivate it manually
- The DUC client checks for IP changes every 5 minutes automatically

### 3c. Router Configuration

Set up these port forwarding rules on your home router:

| External Port | Internal IP     | Internal Port | Protocol |
|---------------|-----------------|---------------|----------|
| 80            | 192.168.1.190   | 80            | TCP      |
| 443           | 192.168.1.190   | 443           | TCP      |

**DHCP reservation:** MAC `88:a2:9e:25:ba:85` → `192.168.1.190`

> **NOTE:** If the Pi is replaced or reimaged, update the MAC address and IP reservation to match the new Pi.

### 3d. Clone Repository and Configure Environment

```bash
cd /home/kurtis/Documents/ProgramsForMushrooms
git clone https://github.com/KurtisWilkins/Colony.git Colony-Main
cd Colony-Main/iot-platform
cp .env.example .env
nano .env
```

Update all passwords and the `SECRET_KEY` in the `.env` file. See [Section 4: Environment Variables](#4-environment-variables) for details.

### 3e. Run Automated Setup

```bash
sudo bash setup.sh
```

This script performs 9 steps automatically:
1. Installs system packages (PostgreSQL, Mosquitto, Python 3, Node.js, Nginx)
2. Configures and starts Mosquitto
3. Creates PostgreSQL database, user, and schema
4. Creates Python virtual environment and installs backend dependencies
5. Builds the React frontend (`npm install && npm run build`)
6. Creates systemd services (`iot-flask`, `iot-mqtt`)
7. Configures Nginx reverse proxy
8. Sets up auto-update cron job (pulls from GitHub every 5 minutes)
9. Prints status report

### 3f. SSL Certificate

After `setup.sh` completes and Nginx is running:

```bash
sudo certbot --nginx -d shroomlord.3utilities.com
```

When prompted:
- Email: `kuwilkins@gmail.com`
- Agree to terms: `Y`
- Redirect HTTP to HTTPS: `2`

Certificate locations:
- Full chain: `/etc/letsencrypt/live/shroomlord.3utilities.com/fullchain.pem`
- Private key: `/etc/letsencrypt/live/shroomlord.3utilities.com/privkey.pem`
- Expires: 2026-06-22 (auto-renews via certbot timer)

Verify auto-renewal works:

```bash
sudo certbot renew --dry-run
```

### 3g. Nginx Configuration

Fix the server names hash bucket size (required for long hostnames):

```bash
sudo sed -i '12a\\tserver_names_hash_bucket_size 64;' /etc/nginx/nginx.conf
```

The site config is managed by the setup script:
- Config file: `/etc/nginx/sites-available/iot-platform`
- Symlinked to: `/etc/nginx/sites-enabled/iot-platform`
- The default site (`/etc/nginx/sites-enabled/default`) is removed

The Nginx config proxies all traffic to Flask on port 5000:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 50M;

    # Proxy all requests to Flask
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_valid 200 1d;
        expires 1d;
        add_header Cache-Control "public, immutable";
    }

    # Deny access to hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

> **NOTE:** After running `certbot --nginx`, Certbot will modify this file to add the HTTPS server block (port 443) and HTTP→HTTPS redirect automatically.

Test and reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 3h. Mosquitto Configuration

The setup script copies `mosquitto/mosquitto.conf` to `/etc/mosquitto/conf.d/iot-platform.conf`.

Default config (anonymous access for trusted LAN):

```
listener 1883 0.0.0.0
allow_anonymous true
```

**To enable authentication instead** (recommended if network is shared):

Create a password file:

```bash
sudo mosquitto_passwd -c /etc/mosquitto/passwd mqttuser
```

Then edit `/etc/mosquitto/conf.d/iot-platform.conf`:

```
listener 1883 0.0.0.0
allow_anonymous false
password_file /etc/mosquitto/passwd
```

```bash
sudo systemctl restart mosquitto
```

> **NOTE:** The MQTT password must also be configured on each ESP32 device via the captive portal.

### 3i. Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 3j. Flask Login System

Flask-Login provides session-based authentication for the web UI and API:

- **Single user:** `KurtisWilkins` (configured in `.env`)
- **Password:** Stored as plaintext in `.env` as `LOGIN_PASSWORD`
- **Session duration:** 7 days (persistent cookie with `remember=True`)
- **Login page:** https://shroomlord.3utilities.com/login
- **Logout:** POST to `/api/auth/logout`

Nginx proxies ports 80 and 443 to Flask on port 5000. The login page is served on both HTTP (redirected to HTTPS by Certbot) and HTTPS. All external traffic reaches Flask through Nginx.

To change the password, edit the `.env` file:

```bash
nano /home/kurtis/Documents/ProgramsForMushrooms/Colony-Main/iot-platform/.env
```

Update the `LOGIN_PASSWORD` value, then restart Flask:

```bash
sudo systemctl restart iot-flask
```

---

## 4. Environment Variables

Location: `/home/kurtis/Documents/ProgramsForMushrooms/Colony-Main/iot-platform/.env`

Copy from template: `cp .env.example .env`

```bash
# --- PostgreSQL Database ---
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=iot_platform
POSTGRES_USER=iot_user
POSTGRES_PASSWORD=[SECRET]              # Database password

# --- MQTT Broker (Local Mosquitto) ---
MQTT_BROKER_HOST=localhost
MQTT_BROKER_PORT=1883

# --- Master Pi (for Mosquitto bridge) ---
MASTER_PI_HOST=192.168.1.100
MASTER_PI_PORT=1883

# --- Flask API Server ---
FLASK_HOST=0.0.0.0
FLASK_PORT=5000

# --- Application Secret Key ---
SECRET_KEY=[SECRET]                     # 64+ char random string for session signing

# --- Login Credentials (single-user session auth) ---
LOGIN_USERNAME=KurtisWilkins
LOGIN_PASSWORD=[SECRET]                 # Plaintext password for web login

# --- Git Auto-Update ---
GIT_REPO_URL=https://github.com/KurtisWilkins/Colony.git
GIT_BRANCH=main

# --- Node Environment ---
NODE_ENV=production
```

Generate a secure `SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

## 5. Systemd Services

All services start on boot automatically.

| Service | Description | Config Location |
|---------|-------------|-----------------|
| `noip-duc` | No-IP dynamic DNS updater | `/etc/systemd/system/noip-duc.service` |
| `nginx` | Reverse proxy + HTTPS termination | `/etc/nginx/sites-available/iot-platform` |
| `mosquitto` | MQTT broker | `/etc/mosquitto/conf.d/iot-platform.conf` |
| `postgresql` | Database | Default PostgreSQL config |
| `iot-flask` | Flask API + React frontend | `/etc/systemd/system/iot-flask.service` |
| `iot-mqtt` | MQTT subscriber (telemetry ingestion) | `/etc/systemd/system/iot-mqtt.service` |

Additionally, a **cron job** runs `scripts/auto-update.sh` every 5 minutes to pull from GitHub and restart services if code changed.

### Useful Commands

```bash
# Check all IoT services at once
sudo systemctl status noip-duc nginx mosquitto postgresql iot-flask iot-mqtt

# Restart everything after a config change
sudo systemctl restart iot-flask iot-mqtt mosquitto nginx

# View live logs
sudo journalctl -fu iot-flask
sudo journalctl -fu iot-mqtt
sudo journalctl -fu noip-duc

# Auto-update log
tail -f /var/log/iot-auto-update.log

# Manually trigger an update from GitHub
sudo bash /home/kurtis/Documents/ProgramsForMushrooms/Colony-Main/iot-platform/scripts/auto-update.sh
```

---

## 6. ESP32 Device Setup

### Captive Portal Configuration

1. Power on the ESP32 for the first time
2. Connect phone/laptop to WiFi network: **"GrowTent-Setup"**
3. Open a browser — the captive portal opens automatically
4. Fill in all fields:

| Field | Value |
|-------|-------|
| WiFi SSID | Your home WiFi network name |
| WiFi Password | Your home WiFi password |
| MQTT Broker IP | `192.168.1.190` |
| MQTT Port | `1883` |
| MQTT Username | `mqttuser` (if authentication enabled) |
| MQTT Password | [SECRET] (the password set during Mosquitto setup) |
| Facility | Your facility name |
| Building | Your building name |
| Unit | Your unit name |
| Device Name | Unique device identifier |

5. Device reboots and connects automatically

### MQTT Topics

Once connected, the device communicates on:
- `{facility}/{building}/{unit}/{device_name}/telemetry` — sensor readings (published by device)
- `{facility}/{building}/{unit}/{device_name}/command` — commands (subscribed by device)
- `{facility}/{building}/{unit}/{device_name}/status` — online/offline status

---

## 7. Hardware Reference

### GPIO Pin Map

| GPIO | Direction | Function | Notes |
|------|-----------|----------|-------|
| 21 | Out | BME280 SDA | I2C data |
| 22 | Out | BME280 SCL | I2C clock |
| 16 | Out | MH-Z19B TX2 | UART to sensor RX |
| 17 | In | MH-Z19B RX2 | UART from sensor TX |
| 18 | Out | JSN-SR04T TRIG | 10µs trigger pulse |
| 19 | In | JSN-SR04T ECHO | Via 1kΩ + 2kΩ voltage divider |
| 34 | In | YF-S201 flow pulse | Input-only, 10kΩ pull-up to 3.3V |
| 25 | Out | Fan PWM signal | 1kHz to 0-10V converter |
| 26 | Out | Relay CH1 valve | LOW = valve open |
| 27 | Out | Relay CH2 mister | LOW = mister on |

### Power Requirements

| Component | Voltage | Source |
|-----------|---------|--------|
| ESP32 | 5V via USB | 2A USB adapter |
| BME280 | 3.3V | ESP32 3.3V pin |
| MH-Z19B | 5V | ESP32 VIN pin |
| JSN-SR04T | 5V | ESP32 VIN pin |
| YF-S201 | 5V | ESP32 VIN pin |
| Relay module | 5V | ESP32 VIN pin |
| Solenoid valve | 12V | Dedicated 12V 2A supply |
| Mist maker PSU | 120V AC | Switched via relay CH2 |
| PWM converter | 3.3V | ESP32 3.3V pin |

### Wiring Notes

- **JSN-SR04T ECHO** pin outputs 5V — use a 1kΩ + 2kΩ voltage divider before GPIO 19
- **YF-S201 signal** needs an external 10kΩ pull-up to 3.3V — GPIO 34 has no internal pull-up
- **MH-Z19B** needs 3 minutes warmup after power-on before CO2 readings are valid
- **Relay module** is active-LOW — GPIO LOW = relay energized = load ON
- **Mist maker** 120V AC wiring must be inside a rated junction box

---

## 8. Troubleshooting

### Site Not Loading from Outside Network

1. Check No-IP client: `sudo systemctl status noip-duc`
2. Verify hostname resolves: `nslookup shroomlord.3utilities.com`
3. Check port forwarding in router — ports 80 and 443 to 192.168.1.190
4. Check Nginx: `sudo systemctl status nginx`
5. Check firewall: `sudo ufw status`

### SSL Certificate Error

```bash
sudo certbot certificates
sudo certbot renew --dry-run
```

### MQTT Devices Not Connecting

1. Check Mosquitto is running: `sudo systemctl status mosquitto`
2. Test local connection:
   ```bash
   mosquitto_pub -h localhost -u mqttuser -P PASSWORD -t test -m hello
   ```
3. Verify ESP32 is using IP `192.168.1.190` as broker address
4. Check ESP32 MQTT credentials match `/etc/mosquitto/passwd`

### Flask App Not Responding

```bash
sudo systemctl status iot-flask
sudo journalctl -fu iot-flask --no-pager | tail -50
```

If running Flask manually (not via systemd), use `nohup` to prevent the process from being suspended:

```bash
cd /home/kurtis/Documents/ProgramsForMushrooms/Colony-Main/iot-platform/backend
source venv/bin/activate
nohup python3 app.py > flask.log 2>&1 &
```

### Login Not Working

1. Verify credentials are loading from `.env`:
   ```bash
   cd /home/kurtis/Documents/ProgramsForMushrooms/Colony-Main/iot-platform/backend
   source venv/bin/activate
   python3 -c "from config import LOGIN_PASSWORD; print(repr(LOGIN_PASSWORD))"
   ```
2. Test login directly:
   ```bash
   curl -X POST http://127.0.0.1:5000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"KurtisWilkins","password":"YOUR_PASSWORD"}'
   ```
3. If empty string is returned for password, the `.env` file is not being found. The `load_dotenv()` call searches from the working directory upward.

### No-IP Hostname Expired

1. Log into [noip.com](https://www.noip.com) with your account
2. Go to Dynamic DNS → No-IP Hostnames
3. Click Confirm/Activate next to `shroomlord.3utilities.com`
4. Restart the DUC client: `sudo systemctl restart noip-duc`

### PostgreSQL Connection Issues

```bash
sudo systemctl status postgresql
sudo -u postgres psql -c "\\l"                    # List databases
sudo -u postgres psql -c "\\du"                    # List users
PGPASSWORD=yourpass psql -h localhost -U iot_user -d iot_platform -c "\\dt"  # List tables
```

---

## 9. Maintenance Schedule

| Task | Frequency | How |
|------|-----------|-----|
| Confirm No-IP hostname | Monthly | Check email from No-IP, click confirm link |
| Check SSL certificate | Monthly | `sudo certbot renew --dry-run` |
| Update Pi packages | Monthly | `sudo apt update && sudo apt upgrade` |
| Check all services running | Weekly | `sudo systemctl status noip-duc nginx mosquitto iot-flask iot-mqtt` |
| Review automation logs | Weekly | Dashboard → Automation Log page |
| Check water usage | Weekly | Dashboard → Water Usage page |
| Back up PostgreSQL | Monthly | `pg_dump -U iot_user iot_platform > backup_$(date +%Y%m%d).sql` |

---

## 10. Quick Reference

```
Dashboard URL:      https://shroomlord.3utilities.com
Login username:     KurtisWilkins
Pi local IP:        192.168.1.190
Pi SSH:             ssh kurtis@192.168.1.190
Pi hostname:        raspberrypi
MQTT broker:        192.168.1.190:1883
MQTT user:          mqttuser
No-IP hostname:     shroomlord.3utilities.com
No-IP group user:   ypan1bm
Project path:       /home/kurtis/Documents/ProgramsForMushrooms/Colony-Main/iot-platform
Flask internal:     http://127.0.0.1:5000
```

## Project Structure

```
iot-platform/
├── backend/                    # Flask REST API + MQTT service
│   ├── app.py                  # Flask entry point (also serves React dist/)
│   ├── config.py               # Environment configuration loader
│   ├── models.py               # SQLAlchemy ORM models
│   ├── mqtt_service.py         # MQTT subscriber service
│   ├── requirements.txt        # Python dependencies
│   └── routes/                 # API route blueprints
│       ├── auth.py             # Session auth (Flask-Login)
│       ├── devices.py          # Device CRUD
│       ├── telemetry.py        # Telemetry queries
│       ├── commands.py         # Command issuance
│       ├── hierarchy.py        # Facility/building/unit tree
│       └── automation.py       # Automation rules
├── server/                     # Automation engine (separate process)
│   ├── main.py                 # Entry point
│   ├── config.py               # Automation thresholds and cooldowns
│   ├── automation/             # Rule engine modules
│   ├── workers/                # Background telemetry workers
│   ├── models/                 # ORM models
│   ├── db/                     # Database connection
│   └── automation.service      # Systemd service template
├── frontend/                   # React (Vite) application
│   ├── package.json            # Node dependencies
│   ├── vite.config.js          # Vite build config
│   └── src/
│       ├── main.jsx            # Entry point + router
│       ├── App.jsx             # Route definitions
│       ├── contexts/           # AuthContext for session state
│       ├── pages/              # Page components (Login, Dashboard, etc.)
│       └── components/         # Reusable UI components
├── mosquitto/                  # MQTT broker config
│   └── mosquitto.conf
├── nginx/                      # Reverse proxy config
│   └── iot-platform.conf
├── postgres/                   # Database schema
│   └── init.sql
├── scripts/
│   ├── auto-update.sh          # GitHub auto-pull (cron, every 5 min)
│   └── setup-noip.sh           # No-IP DUC setup helper
├── setup.sh                    # Full automated setup script
├── .env.example                # Environment variable template
└── README.md                   # This file
```

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/login` | No | Login (returns session cookie) |
| POST | `/api/auth/logout` | No | Logout (clears session) |
| GET | `/api/auth/me` | Yes | Current user info |
| GET | `/api/health` | No | Health check |
| GET | `/api/status` | Yes | System status summary |
| GET/POST | `/api/devices` | Yes | List or register devices |
| GET/PUT/DELETE | `/api/devices/<id>` | Yes | Device CRUD |
| GET | `/api/telemetry/<id>` | Yes | Device telemetry history |
| GET | `/api/telemetry/latest/<id>` | Yes | Latest telemetry reading |
| POST | `/api/commands/<id>` | Yes | Issue command to device |
| GET | `/api/commands/<id>` | Yes | Command history |
| GET | `/api/hierarchy` | Yes | Full facility tree |
