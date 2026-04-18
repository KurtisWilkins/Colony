# Grow Tent Firmware — Installation Guide

Automated dependency installer for the Colony-Main ESP32 grow tent controller firmware.

## What This Installer Does

1. Scans all source files to discover required libraries
2. Installs the ESP32 board platform via arduino-cli
3. Installs all third-party Arduino libraries
4. Verifies installation
5. Optionally runs a compile test

## Prerequisites

### 1. Python 3

- **Windows:** Download from [python.org/downloads](https://www.python.org/downloads/) — check "Add Python to PATH" during install
- **Mac:** `brew install python3`
- **Linux:** `sudo apt install python3`

### 2. arduino-cli

- **Windows:** Download from [arduino.github.io/arduino-cli](https://arduino.github.io/arduino-cli/latest/installation/) — extract the .zip and add the folder to your PATH (or copy `arduino-cli.exe` to `C:\Windows\System32\`)
- **Mac:** `brew install arduino-cli`
- **Linux:** `curl -fsSL https://raw.githubusercontent.com/arduino/arduino-cli/master/install.sh | sh` then `sudo mv bin/arduino-cli /usr/local/bin/`

After installing, verify with: `arduino-cli version`

## Running the Installer

### Windows
Double-click `install_dependencies.bat` or run in Command Prompt:
```
cd path\to\firmware
install_dependencies.bat
```

### Mac / Linux
```bash
cd path/to/firmware
./install_dependencies.sh
```

### Direct Python
```bash
python3 install_dependencies.py
```

## Libraries Installed

| Library | Header | Purpose | Version |
|---------|--------|---------|---------|
| Adafruit BME280 Library | Adafruit_BME280.h | Temperature, humidity, pressure sensor | Latest |
| Adafruit Unified Sensor | Adafruit_Sensor.h | Dependency for BME280 library | Latest |
| PubSubClient | PubSubClient.h | MQTT client for server communication | Latest |
| ArduinoJson | ArduinoJson.h | JSON serialization for MQTT payloads | 6.21.3 (pinned) |
| MH-Z19 | MHZ19.h | CO2 sensor UART communication | Latest |

**Note:** ArduinoJson is pinned to version 6.21.3 because version 7.x has breaking API changes.

## Manual Installation (If Installer Fails)

Open Arduino IDE → Tools → Manage Libraries, then search for and install each:

1. **Adafruit BME280** — search "Adafruit BME280", install "Adafruit BME280 Library by Adafruit" (also install "Adafruit Unified Sensor" when prompted)
2. **PubSubClient** — search "PubSubClient", install "PubSubClient by Nick O'Leary"
3. **ArduinoJson** — search "ArduinoJson", install "ArduinoJson by Benoit Blanchon" — **must be version 6.x, not 7.x**
4. **MH-Z19** — search "MH-Z19", install "MH-Z19 by Jonathan Dempsey"

## Board Settings for Arduino IDE

Go to Tools and set:

| Setting | Value |
|---------|-------|
| Board | ESP32 Dev Module |
| Upload Speed | 921600 |
| CPU Frequency | 240MHz |
| Flash Frequency | 80MHz |
| Flash Mode | QIO |
| Flash Size | 4MB (32Mb) |
| Partition Scheme | Default 4MB with spiffs |
| Core Debug Level | None |
| PSRAM | Disabled |
| Port | Your ESP32's COM port |

## Upload Instructions

1. Open `arduino/growtent/growtent.ino` in Arduino IDE
2. All source tabs should appear automatically (sensors, actuators, mqtt_client, etc.)
3. Connect ESP32 via USB
4. Select the correct Port under Tools
5. Click **Upload** (right arrow button)
6. When you see `Connecting......` in the output: **hold the BOOT button** on the ESP32
7. When upload percentages appear: **release BOOT**
8. Wait for "Done uploading"

## Serial Monitor Setup

1. Tools → Serial Monitor
2. Set baud rate to **115200** (bottom-right dropdown)
3. Press the **EN** (reset) button on the ESP32
4. You should see:

```
=====================================
 GROW TENT CONTROLLER v1.0.0
 Colony-Main — ESP32-WROOM-32D
=====================================
 Booting...

 ...initialization messages...

=====================================
 BOOT COMPLETE — TEST MODE ACTIVE
 No sensors or relays will be read.
 Simulated data will be published.
=====================================
```

The firmware boots in **test mode** by default — no sensors or wiring needed to test communication with the Raspberry Pi server.

## Troubleshooting

### "arduino-cli not found"
- Make sure arduino-cli is in your system PATH
- Windows: copy `arduino-cli.exe` to `C:\Windows\System32\`
- Verify: open a new terminal and type `arduino-cli version`

### Library install fails
- Try installing manually via Arduino IDE → Tools → Manage Libraries
- Check your internet connection
- Try: `arduino-cli lib update-index` then retry

### Compile error after install
- Make sure you have ESP32 board support: Tools → Board → Boards Manager → search "esp32" → install "esp32 by Espressif Systems"
- Make sure ArduinoJson is version 6.x, not 7.x
- If you see `ledcSetup not found` — your ESP32 core is version 3.x (correct, the firmware supports it)

### Upload fails / "Connecting......" forever
- Hold the **BOOT** button on the ESP32 while uploading
- Try a different USB cable (some cables are charge-only)
- Try a different USB port
- Check that the correct COM port is selected under Tools → Port
- On some boards, press BOOT then tap EN while still holding BOOT

### Serial monitor shows garbage characters
- Change baud rate to **115200** (bottom-right of Serial Monitor)
- Press EN to reset the ESP32
- Make sure no other program is using the COM port

### "No WiFi credentials - starting captive portal"
- This is normal on first boot! Connect to the "GrowTent-Setup" WiFi network from your phone
- Browse to 192.168.4.1 to configure WiFi and MQTT settings
