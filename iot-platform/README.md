# IoT Platform for Raspberry Pi 5

A hierarchical IoT platform where ESP32 devices communicate via MQTT through local Raspberry Pi 5 hubs, with optional bridging to a master Pi for multi-location aggregation.

## Architecture

```
ESP32 Sensors/Actuators
        │ (MQTT)
        ▼
Location Raspberry Pi 5
├── Mosquitto Broker
├── Flask REST API
├── React Frontend
├── PostgreSQL Database
└── MQTT Bridge ──────► Master Raspberry Pi 5
                              ├── Mosquitto Broker
                              └── Aggregation Services
```

## Tech Stack

- **MQTT Broker**: Mosquitto
- **Backend**: Python Flask REST API
- **Frontend**: React (Vite) served as static files via Flask
- **Database**: PostgreSQL with JSONB telemetry storage
- **Bridge**: Mosquitto bridge config for multi-location setups

## Device Hierarchy

Devices are organized in a four-level hierarchy:
- **Facility** → **Building** → **Unit** → **Device**

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
git clone <repo-url> && cd iot-platform

# Copy and edit environment config
cp .env.example .env
nano .env  # Update passwords and settings

# Run setup (installs everything, creates DB, builds frontend, starts services)
sudo bash setup.sh
```

### Manual Setup

1. **Install dependencies**: PostgreSQL, Mosquitto, Python 3, Node.js
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

### Access

Open `http://<pi-ip>:5000` from any device on the LAN.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/status` | System status summary |
| GET/POST | `/api/devices` | List or register devices |
| GET/PUT/DELETE | `/api/devices/<id>` | Device CRUD |
| GET | `/api/telemetry/<id>` | Device telemetry history |
| GET | `/api/telemetry/latest/<id>` | Latest telemetry reading |
| POST | `/api/commands/<id>` | Issue command to device |
| GET | `/api/commands/<id>` | Command history |
| GET | `/api/hierarchy` | Full facility tree |
| GET | `/api/hierarchy/<f>/<b>/<u>` | Drill-down hierarchy |

## Command Types

- `toggle_relay` — Toggle a relay on/off
- `set_interval` — Set sensor polling interval
- `read_now` — Request immediate sensor reading
- `motor_move` — Move motor (direction + steps)
- `gripper_open` / `gripper_close` — Control gripper
- `custom` — Send arbitrary JSON payload

## Multi-Location Bridge Setup

To bridge a location Pi to a master Pi:

1. Edit `mosquitto/bridge.conf.template` with the master Pi's IP
2. Save as `/etc/mosquitto/conf.d/bridge.conf`
3. Restart Mosquitto: `sudo systemctl restart mosquitto`

## Project Structure

```
iot-platform/
├── backend/           # Flask API + MQTT service
│   ├── app.py         # Flask entry point
│   ├── config.py      # Environment configuration
│   ├── models.py      # SQLAlchemy models
│   ├── mqtt_service.py # MQTT subscriber service
│   └── routes/        # API route blueprints
├── frontend/          # React (Vite) application
│   └── src/
│       ├── pages/     # Page components
│       └── components/ # Reusable components
├── mosquitto/         # Mosquitto configuration
├── postgres/          # Database schema
├── setup.sh           # Automated setup script
└── .env.example       # Environment template
```

## Services

The setup script creates two systemd services:
- `iot-flask` — Flask API serving the React frontend
- `iot-mqtt` — MQTT subscriber processing telemetry and status

```bash
# Check service status
systemctl status iot-flask
systemctl status iot-mqtt

# View logs
journalctl -u iot-flask -f
journalctl -u iot-mqtt -f
```
