# Arduino IDE Library Installation

Before uploading the firmware, install these libraries in Arduino IDE.
Go to Tools > Manage Libraries, search for each name, and install.

## Required Libraries

### 1. Adafruit BME280 Library
- Search: Adafruit BME280
- Install: Adafruit BME280 Library by Adafruit
- Version: 2.2.2 or newer
- This will also prompt to install Adafruit Unified Sensor - install it

### 2. PubSubClient
- Search: PubSubClient
- Install: PubSubClient by Nick O'Leary
- Version: 2.8 or newer

### 3. ArduinoJson
- Search: ArduinoJson
- Install: ArduinoJson by Benoit Blanchon
- Version: 6.21.3 or newer (must be version 6, not version 5)

### 4. MH-Z19
- Search: MH-Z19
- Install: MH-Z19 by Jonathan Dempsey
- Version: 1.5.3 or newer

## Board Settings

Go to Tools and set exactly:

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
| Port | COM5 (yours may differ) |

## Upload Process

1. Open arduino/growtent/growtent.ino in Arduino IDE
2. All tabs should appear automatically (sensors, actuators, etc.)
3. Click the Upload button (right arrow)
4. When you see Connecting...... in the output:
   Hold the BOOT button on the ESP32
5. Release BOOT when you see upload percentages appear
6. Wait for Done uploading
7. Open Tools > Serial Monitor
8. Set baud rate to 115200
9. Press EN button on ESP32 to reset
10. You should see TEST MODE ENABLED in the serial monitor
