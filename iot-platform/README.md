# Colony IoT Platform for Raspberry Pi 5

A hierarchical IoT platform where ESP32 devices communicate via MQTT through local Raspberry Pi 5 hubs, with optional bridging to a master Pi for multi-location aggregation. Features user authentication, responsive mobile/desktop UI, auto-updates from GitHub, and remote access via No-IP dynamic DNS.

## Architecture

```
ESP32 Sensors/Actuators
        | (MQTT)
        v
Location Raspberry Pi 5
|-- Mosquitto Broker
|-- Flask REST API
|-- React Frontend (responsive mobile + desktop)
|-- PostgreSQL Database
|-- Nginx Reverse Proxy (port 80/443)
|-- No-IP DDNS Client (remote access)
|-- Auto-Update (GitHub sync every 5 min)
+-- MQTT Bridge ----------> Master Raspberry Pi 5
                              |-- Mosquitto Broker
                              +-- Aggregation Services
```

## Tech Stack

- **MQTT Broker**: Mosquitto
- **Backend**: Python Flask REST API with JWT authentication
- **Frontend**: React (Vite) with responsive design (mobile + desktop)
- **Database**: PostgreSQL with JSONB telemetry storage
- **Reverse Proxy**: Nginx
- **Remote Access**: No-IP Dynamic DNS
- **Auto-Update**: Cron-based GitHub pull with automatic service restart

## Device Hierarchy

Devices are organized in a four-level hierarchy:
- **Facility** -> **Building** -> **Unit** -> **Device**

MQTT topics follow the pattern:
```
{facility}/{building}/{unit}/{device_name}/telemetry
{facility}/{building}/{unit}/{device_name}/command
{facility}/{building}/{unit}/{device_name}/status
```

## Quick Start

### Automated Setup (Raspberry Pi 5)

```bash
# Clone the repository
git clone https://github.com/KurtisWilkins/Colony.git && cd Colony/iot-platform

# Copy and edit environment config
cp .env.example .env
nano .env  # Update passwords, SECRET_KEY, and settings

# Run setup (installs everything, creates DB, builds frontend, starts services)
sudo bash setup.sh
```

### First-Time Login

1. Open `http://<pi-ip>` in your browser
2. You'll see a setup screen to create your admin account
3. Only admins can create additional user accounts
4. All other users are blocked by default until you add them

### Remote Access (No-IP)

To access your IoT platform from anywhere:

```bash
# 1. Create a free account at https://www.noip.com/
# 2. Create a hostname (e.g., myhouse.ddns.net)
# 3. Run the No-IP setup script:
sudo bash scripts/setup-noip.sh

# 4. Forward port 80 on your router to the Pi's local IP

# 5. (Optional) Add HTTPS with Let's Encrypt:
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-hostname.ddns.net
```

### Manual Setup

1. **Install dependencies**: PostgreSQL, Mosquitto, Python 3, Node.js, Nginx
2. **Create database**:
   ```bash
   sudo -u postgres createuser iot_user -P
   sudo -u postgres createdb iot_platform -O iot_user
   psql -U iot_user -d iot_platform -f postgres/init.sql
   ```
3. **Set up backend**:
   ```bash
   cd backend
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   python app.py
   ```
4. **Build frontend**:
   ```bash
   cd frontend
   npm install && npm run build
   ```
5. **Start MQTT service** (in a separate terminal):
   ```bash
   cd backend
   source venv/bin/activate
   python mqtt_service.py
   ```

## Authentication

All API endpoints (except `/api/auth/login` and `/api/auth/setup`) require a JWT token in the `Authorization: Bearer <token>` header.

### User Roles

- **Admin**: Full access. Can create, disable, and delete user accounts.
- **User**: Can view devices, telemetry, and issue commands. Cannot manage users.

### First-Time Setup

When no users exist, the `/api/auth/setup` endpoint is available to create the initial admin account. After that, only admins can create new users through the UI or API.

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/setup` | No | Create initial admin (one-time) |
| POST | `/api/auth/login` | No | Login and get JWT token |
| GET | `/api/auth/me` | Yes | Current user info |
| PUT | `/api/auth/password` | Yes | Change own password |
| GET | `/api/auth/users` | Admin | List all users |
| POST | `/api/auth/users` | Admin | Create new user |
| PUT | `/api/auth/users/<id>` | Admin | Update user role/status |
| DELETE | `/api/auth/users/<id>` | Admin | Delete user |
| GET | `/api/health` | No | Health check |
| GET | `/api/status` | Yes | System status summary |
| GET/POST | `/api/devices` | Yes | List or register devices |
| GET/PUT/DELETE | `/api/devices/<id>` | Yes | Device CRUD |
| GET | `/api/telemetry/<id>` | Yes | Device telemetry history |
| GET | `/api/telemetry/latest/<id>` | Yes | Latest telemetry reading |
| POST | `/api/commands/<id>` | Yes | Issue command to device |
| GET | `/api/commands/<id>` | Yes | Command history |
| GET | `/api/hierarchy` | Yes | Full facility tree |
| GET | `/api/hierarchy/<f>/<b>/<u>` | Yes | Drill-down hierarchy |

## Command Types

- `toggle_relay` -- Toggle a relay on/off
- `set_interval` -- Set sensor polling interval
- `read_now` -- Request immediate sensor reading
- `motor_move` -- Move motor (direction + steps)
- `gripper_open` / `gripper_close` -- Control gripper
- `custom` -- Send arbitrary JSON payload

## Auto-Update

The platform automatically pulls the latest code from GitHub every 5 minutes:

- Detects changes in backend, frontend, and dependencies
- Rebuilds the frontend only when frontend files change
- Reinstalls Python dependencies only when requirements.txt changes
- Restarts only affected services
- Logs to `/var/log/iot-auto-update.log`

To manually trigger an update:
```bash
sudo bash scripts/auto-update.sh
```

## Multi-Location Bridge Setup

To bridge a location Pi to a master Pi:

1. Edit `mosquitto/bridge.conf.template` with the master Pi's IP
2. Save as `/etc/mosquitto/conf.d/bridge.conf`
3. Restart Mosquitto: `sudo systemctl restart mosquitto`

## Project Structure

```
iot-platform/
|-- backend/             # Flask API + MQTT service
|   |-- app.py           # Flask entry point
|   |-- config.py        # Environment configuration
|   |-- models.py        # SQLAlchemy models (Device, Telemetry, Command, Alert, User)
|   |-- mqtt_service.py  # MQTT subscriber service
|   +-- routes/          # API route blueprints
|       |-- auth.py      # Authentication & user management
|       |-- devices.py   # Device CRUD
|       |-- telemetry.py # Telemetry queries
|       |-- commands.py  # Command issuance
|       +-- hierarchy.py # Hierarchy tree
|-- frontend/            # React (Vite) application
|   +-- src/
|       |-- contexts/    # AuthContext for auth state
|       |-- pages/       # Page components (incl. Login, UserManagement)
|       +-- components/  # Reusable components
|-- mosquitto/           # Mosquitto configuration
|-- nginx/               # Nginx reverse proxy config
|-- postgres/            # Database schema
|-- scripts/
|   |-- auto-update.sh   # GitHub auto-update script
|   +-- setup-noip.sh    # No-IP DDNS setup
|-- setup.sh             # Automated setup script
+-- .env.example         # Environment template
```

## Services

The setup script creates systemd services and a cron job:
- `iot-flask` -- Flask API serving the React frontend
- `iot-mqtt` -- MQTT subscriber processing telemetry and status
- `nginx` -- Reverse proxy (port 80 -> Flask)
- `noip2` -- No-IP dynamic DNS client (after running setup-noip.sh)
- Cron: auto-update every 5 minutes

```bash
# Check service status
systemctl status iot-flask
systemctl status iot-mqtt
systemctl status nginx

# View logs
journalctl -u iot-flask -f
journalctl -u iot-mqtt -f
tail -f /var/log/iot-auto-update.log
```
