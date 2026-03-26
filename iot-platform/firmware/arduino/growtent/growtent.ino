/*
 * GROW TENT CONTROLLER — COLONY-MAIN
 * ESP32-WROOM-32D Firmware v1.0.0
 *
 * ARDUINO IDE SETUP:
 * Board: ESP32 Dev Module
 * Port: COM5 (or your port)
 * Upload Speed: 921600
 * CPU Frequency: 240MHz
 * Flash Size: 4MB (32Mb)
 * Partition: Default 4MB with spiffs
 *
 * REQUIRED LIBRARIES (install via Tools > Manage Libraries):
 *
 * Adafruit BME280 Library by Adafruit (v2.2.2+)
 *
 * Adafruit Unified Sensor by Adafruit (v1.1.9+)
 *
 * PubSubClient by Nick O'Leary (v2.8+)
 *
 * ArduinoJson by Benoit Blanchot (v6.21.3+)
 *
 * MH-Z19 by Jonathan Dempsey (v1.5.3+)
 *
 * TEST MODE: Currently set to boot in TEST MODE by default.
 * No sensors or relays need to be wired to test communications.
 * Disable via MQTT command: set_test_mode { "enabled": false }
 *
 * UPLOAD: Hold BOOT button when you see "Connecting......"
 * in the output, release when upload percentage appears.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <SPIFFS.h>

#include "config.h"
#include "storage.h"
#include "sensors.h"
#include "actuators.h"
#include "mqtt_client.h"
#include "captive_portal.h"
#include "automation.h"
#include "flow_meter.h"
#include "test_mode.h"

// ============================================================================
// Logging
// ============================================================================
void logMsg(const char* level, const char* fmt, ...) {
    char buf[256];
    va_list args;
    va_start(args, fmt);
    vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);

    unsigned long ms = millis();
    unsigned long secs = ms / 1000;
    int h = (secs / 3600) % 24;
    int m = (secs / 60) % 60;
    int s = secs % 60;

    Serial.printf("[%02d:%02d:%02d] [%-5s] %s\n", h, m, s, level, buf);
}

// ============================================================================
// Timing Variables
// ============================================================================
static unsigned long lastSensorRead   = 0;
static unsigned long lastStatusPub    = 0;
static unsigned long lastFlowReport   = 0;
static unsigned long lastWifiRetry    = 0;
static unsigned long lastMqttRetry    = 0;

static bool wifiConnected    = false;
static bool mqttConnected    = false;
static bool portalMode       = false;
static bool sensorsWarmedUp  = false;

// ============================================================================
// WiFi Connection
// ============================================================================
bool connectWiFi() {
    logMsg("INFO", "Connecting to WiFi: %s", storage.data.wifi_ssid.c_str());

    WiFi.mode(WIFI_STA);
    WiFi.begin(storage.data.wifi_ssid.c_str(), storage.data.wifi_pass.c_str());

    // Non-blocking initial wait (up to 15s in setup only)
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
        delay(250);
        Serial.print(".");
    }
    Serial.println();

    if (WiFi.status() == WL_CONNECTED) {
        logMsg("INFO", "WiFi connected: IP=%s RSSI=%d",
               WiFi.localIP().toString().c_str(), WiFi.RSSI());
        return true;
    }

    logMsg("ERROR", "WiFi connection failed");
    return false;
}

// ============================================================================
// Alert checking
// ============================================================================
void checkSensorAlerts() {
    static bool bme_alerted = false;
    static bool mhz_alerted = false;
    static bool ultra_alerted = false;

    if (sensors.isBme280Alert() && !bme_alerted) {
        mqttClient.publishAlert("sensor_failure", "BME280: 3 consecutive read failures");
        bme_alerted = true;
    } else if (!sensors.isBme280Alert()) {
        bme_alerted = false;
    }

    if (sensors.isMhz19Alert() && !mhz_alerted) {
        mqttClient.publishAlert("sensor_failure", "MH-Z19B: 3 consecutive read failures");
        mhz_alerted = true;
    } else if (!sensors.isMhz19Alert()) {
        mhz_alerted = false;
    }

    if (sensors.isUltrasonicAlert() && !ultra_alerted) {
        mqttClient.publishAlert("sensor_failure", "JSN-SR04T: 3 consecutive read failures");
        ultra_alerted = true;
    } else if (!sensors.isUltrasonicAlert()) {
        ultra_alerted = false;
    }
}

// ============================================================================
// Setup
// ============================================================================
void setup() {
    Serial.begin(115200);
    while (!Serial && millis() < 2000) { }  // Brief wait for serial

    Serial.println();
    Serial.println("=====================================");
    Serial.println(" GROW TENT CONTROLLER v1.0.0");
    Serial.println(" Colony-Main — ESP32-WROOM-32D");
    Serial.println("=====================================");
    Serial.println(" Booting...");
    Serial.println();

    // Initialize SPIFFS
    if (!SPIFFS.begin(true)) {
        logMsg("ERROR", "SPIFFS mount failed");
    } else {
        logMsg("INFO", "SPIFFS mounted");
    }

    // Load configuration from NVS
    storage.begin();
    logMsg("INFO", "Configuration loaded from NVS");
    logMsg("INFO", "Device: %s/%s/%s/%s",
           storage.data.facility.c_str(),
           storage.data.building.c_str(),
           storage.data.unit.c_str(),
           storage.data.device_name.c_str());

    // Load test mode state from NVS (before sensor/actuator init)
    testMode.loadFromNVS();

    // Initialize actuators (safe state first)
    actuators.begin();

    // Initialize sensors
    sensors.begin();

    // Initialize flow meter
    flowMeter.begin();

    // Initialize automation engine
    automation.begin();

    // Check for WiFi credentials
    if (!storage.hasWifiCredentials()) {
        logMsg("INFO", "No WiFi credentials - starting captive portal");
        captivePortal.begin();
        portalMode = true;
        return;  // Skip WiFi/MQTT setup
    }

    // Attempt WiFi connection
    wifiConnected = connectWiFi();

    if (!wifiConnected) {
        logMsg("WARN", "WiFi failed - entering autonomous mode");
        automation.setAutonomous(true);
    } else {
        // Initialize and connect MQTT
        if (storage.data.mqtt_host.length() > 0) {
            mqttClient.begin();
            mqttConnected = mqttClient.connect();
            if (mqttConnected) {
                mqttClient.publishStatus();
                logMsg("INFO", "MQTT connected and status published");
            } else {
                logMsg("WARN", "MQTT connection failed - entering autonomous mode");
                automation.setAutonomous(true);
            }
        } else {
            logMsg("WARN", "No MQTT host configured - entering autonomous mode");
            automation.setAutonomous(true);
        }
    }

    // Set initial fan to default speed
    actuators.fanSetSpeed(storage.data.fan_default_spd);

    logMsg("INFO", "Setup complete. Autonomous=%s", automation.isAutonomous() ? "YES" : "NO");
    logMsg("INFO", "CO2 sensor warmup: %ds remaining", MHZ19_WARMUP_MS / 1000);

    // Initialize timing
    lastSensorRead = millis();
    lastStatusPub  = millis();
    lastFlowReport = millis();
    lastWifiRetry  = millis();
    lastMqttRetry  = millis();

    Serial.println();
    Serial.println("=====================================");
    if (testMode.isEnabled()) {
        Serial.println(" BOOT COMPLETE — TEST MODE ACTIVE");
        Serial.println(" No sensors or relays will be read.");
        Serial.println(" Simulated data will be published.");
    } else {
        Serial.println(" BOOT COMPLETE — NORMAL MODE");
        Serial.println(" Real sensors will be read.");
    }
    Serial.println("=====================================");
    Serial.println();
}

// ============================================================================
// Loop
// ============================================================================
void loop() {
    unsigned long now = millis();

    // ---- Portal Mode ----
    if (portalMode) {
        captivePortal.loop();
        return;
    }

    // ---- WiFi Reconnection ----
    if (WiFi.status() != WL_CONNECTED) {
        if (wifiConnected) {
            logMsg("WARN", "WiFi disconnected");
            wifiConnected = false;
            mqttConnected = false;
            automation.setAutonomous(true);
            automation.setManualOverride(false);
        }

        if (now - lastWifiRetry >= WIFI_RECONNECT_MS) {
            lastWifiRetry = now;
            logMsg("INFO", "Attempting WiFi reconnection...");
            WiFi.reconnect();
        }

        // Check if reconnected
        if (WiFi.status() == WL_CONNECTED) {
            wifiConnected = true;
            logMsg("INFO", "WiFi reconnected: IP=%s", WiFi.localIP().toString().c_str());
        }
    } else if (!wifiConnected) {
        wifiConnected = true;
        logMsg("INFO", "WiFi reconnected: IP=%s", WiFi.localIP().toString().c_str());
    }

    // ---- MQTT Reconnection ----
    if (wifiConnected && storage.data.mqtt_host.length() > 0) {
        if (!mqttClient.isConnected()) {
            if (mqttConnected) {
                logMsg("WARN", "MQTT disconnected");
                mqttConnected = false;
                automation.setAutonomous(true);
                automation.setManualOverride(false);
            }

            if (now - lastMqttRetry >= MQTT_RECONNECT_MS) {
                lastMqttRetry = now;
                if (mqttClient.connect()) {
                    mqttConnected = true;
                    automation.setAutonomous(false);
                    logMsg("INFO", "MQTT reconnected, autonomous mode OFF");
                }
            }
        } else {
            if (!mqttConnected) {
                mqttConnected = true;
                automation.setAutonomous(false);
            }
            mqttClient.loop();
        }
    }

    // ---- Sensor Reading ----
    if (now - lastSensorRead >= storage.data.sensor_interval) {
        lastSensorRead = now;

        sensors.update();

        // Check for sensor alerts
        checkSensorAlerts();

        // Publish telemetry if MQTT connected
        if (mqttConnected) {
            mqttClient.publishTelemetry();
        }

        // Log warmup completion
        if (!sensorsWarmedUp && !sensors.isCo2Warming()) {
            sensorsWarmedUp = true;
            logMsg("INFO", "All sensors ready");
        }
    }

    // ---- Status Heartbeat ----
    if (mqttConnected && (now - lastStatusPub >= STATUS_HEARTBEAT_MS)) {
        lastStatusPub = now;
        mqttClient.publishStatus();
    }

    // ---- Flow Meter Update ----
    flowMeter.update();

    // ---- Flow Reporting ----
    if (actuators.isValveOpen() && (now - lastFlowReport >= FLOW_REPORT_MS)) {
        lastFlowReport = now;
        if (mqttConnected) {
            mqttClient.publishFlow(
                flowMeter.getFlowLPM(),
                flowMeter.getSessionLiters(),
                flowMeter.getTotalLiters()
            );
        }
    }

    // ---- Test Mode Update ----
    testMode.update();

    // ---- Automation ----
    automation.update();

    // ---- Yield ----
    yield();
}
