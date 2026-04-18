#include <Arduino.h>
#include <WiFi.h>

#include "config.h"
#include "storage.h"
#include "relays.h"
#include "zone_manager.h"
#include "ntp_client.h"
#include "scheduler.h"
#include "mqtt_client.h"
#include "captive_portal.h"
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
static unsigned long lastTelemetry   = 0;
static unsigned long lastStatusPub   = 0;
static unsigned long lastWifiRetry   = 0;
static unsigned long lastMqttRetry   = 0;
static unsigned long lastDayCheck    = 0;

static bool wifiConnected    = false;
static bool mqttConnected    = false;
static bool portalMode       = false;

static int lastDay = -1;  // For midnight daily counter reset

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
// Setup
// ============================================================================
void setup() {
    // ========================================================================
    // CRITICAL: Set ALL relay pins HIGH (OFF) IMMEDIATELY on boot.
    // ACTIVE LOW relays: HIGH = de-energized = solenoid valves CLOSED.
    // This MUST happen before Serial, NVS, or anything else to prevent
    // accidental valve activation during ESP32 GPIO initialization.
    // Some ESP32 pins (GPIO 2, 12) can float or glitch during startup.
    // ========================================================================
    relays.initAllRelays();

    // Now safe to initialize serial
    Serial.begin(115200);
    while (!Serial && millis() < 2000) { }

    Serial.println();
    Serial.println("=========================================");
    Serial.println("  ___ ____  ____  ___ ___    __  _____   ");
    Serial.println(" (  _)  _ \\(  _ \\(  _) __)  /__\\(_   _)  ");
    Serial.println("  )(  )   / )   / )(( (_ \\ /(__)\\ )(    ");
    Serial.println(" (___)__\\_)(__\\_)(___)\\___(__)(__)(__)   ");
    Serial.println();
    Serial.println(" IRRIGATION CONTROLLER v" FIRMWARE_VERSION);
    Serial.println(" Colony Platform - ESP32-WROOM-32D");
    Serial.println(" 16-Zone Relay Board (ACTIVE LOW)");
    Serial.println("=========================================");
    Serial.println(" Booting...");
    Serial.println();

    // Load configuration from NVS
    storage.begin();
    logMsg("INFO", "Configuration loaded from NVS");
    logMsg("INFO", "Device: %s/%s/%s/%s",
           storage.data.facility.c_str(),
           storage.data.building.c_str(),
           storage.data.unit.c_str(),
           storage.data.device_name.c_str());
    logMsg("INFO", "Zones: %d configured, safety max=%ds, daily max=%ds",
           storage.data.zone_count,
           storage.data.safety_max_runtime_s,
           storage.data.safety_max_daily_s);

    // Load test mode state from NVS (before zone manager init)
    testMode.loadFromNVS();

    // Initialize zone manager (loads zone configs from storage)
    zoneManager.begin();

    // Initialize scheduler (loads schedules from NVS)
    scheduler.begin();

    // Check for WiFi credentials
    if (!storage.hasWifiCredentials()) {
        logMsg("INFO", "No WiFi credentials — starting captive portal");
        captivePortal.begin();
        portalMode = true;

        Serial.println();
        Serial.println("=========================================");
        Serial.println(" PORTAL MODE — Connect to WiFi:");
        Serial.printf ("   SSID: %s\n", AP_SSID);
        Serial.println("   URL:  http://192.168.4.1");
        Serial.println("=========================================");
        Serial.println();
        return;
    }

    // Attempt WiFi connection
    wifiConnected = connectWiFi();

    if (wifiConnected) {
        // Initialize NTP (requires WiFi)
        ntpClient.begin();

        // Initialize and connect MQTT
        if (storage.data.mqtt_host.length() > 0) {
            mqttClient.begin();
            mqttConnected = mqttClient.connect();
            if (mqttConnected) {
                mqttClient.publishStatus();
                logMsg("INFO", "MQTT connected and status published");
            } else {
                logMsg("WARN", "MQTT connection failed — will retry in loop");
            }
        } else {
            logMsg("WARN", "No MQTT host configured");
        }
    } else {
        logMsg("WARN", "WiFi failed — scheduler and MQTT unavailable until reconnected");
    }

    // Initialize timing
    lastTelemetry = millis();
    lastStatusPub = millis();
    lastWifiRetry = millis();
    lastMqttRetry = millis();
    lastDayCheck  = millis();

    Serial.println();
    Serial.println("=========================================");
    if (testMode.isEnabled()) {
        Serial.println(" BOOT COMPLETE - TEST MODE ACTIVE");
        Serial.println(" No relays will be physically activated.");
        Serial.println(" Virtual zone cycling is running.");
    } else {
        Serial.println(" BOOT COMPLETE - NORMAL MODE");
        Serial.println(" Relays are ACTIVE LOW (LOW=OPEN).");
        Serial.println(" All valves confirmed CLOSED on boot.");
    }
    Serial.printf (" Zones: %d | Safety: %ds max\n",
                   storage.data.zone_count,
                   storage.data.safety_max_runtime_s);
    Serial.println("=========================================");
    Serial.println();
}

// ============================================================================
// Loop
// ============================================================================
void loop() {
    unsigned long now = millis();

    // ── Portal Mode ─────────────────────────────────────────────────────
    if (portalMode) {
        captivePortal.loop();
        return;
    }

    // ── WiFi Reconnection ───────────────────────────────────────────────
    if (WiFi.status() != WL_CONNECTED) {
        if (wifiConnected) {
            logMsg("WARN", "WiFi disconnected");
            wifiConnected = false;
            mqttConnected = false;
        }

        if (now - lastWifiRetry >= WIFI_RECONNECT_MS) {
            lastWifiRetry = now;
            logMsg("INFO", "Attempting WiFi reconnection...");
            WiFi.reconnect();
        }

        if (WiFi.status() == WL_CONNECTED) {
            wifiConnected = true;
            logMsg("INFO", "WiFi reconnected: IP=%s", WiFi.localIP().toString().c_str());
            // Re-sync NTP on reconnect
            ntpClient.sync();
        }
    } else if (!wifiConnected) {
        wifiConnected = true;
        logMsg("INFO", "WiFi reconnected: IP=%s", WiFi.localIP().toString().c_str());
        ntpClient.sync();
    }

    // ── MQTT Reconnection ───────────────────────────────────────────────
    if (wifiConnected && storage.data.mqtt_host.length() > 0) {
        if (!mqttClient.isConnected()) {
            if (mqttConnected) {
                logMsg("WARN", "MQTT disconnected");
                mqttConnected = false;
            }

            if (now - lastMqttRetry >= MQTT_RECONNECT_MS) {
                lastMqttRetry = now;
                if (mqttClient.connect()) {
                    mqttConnected = true;
                    logMsg("INFO", "MQTT reconnected");
                }
            }
        } else {
            if (!mqttConnected) {
                mqttConnected = true;
            }
            mqttClient.loop();
        }
    }

    // ── Zone Manager Update (safety checks + queue advancement) ─────────
    zoneManager.update();

    // ── NTP Update (periodic re-sync) ───────────────────────────────────
    ntpClient.update();

    // ── Scheduler Update (evaluate schedules every 60s) ─────────────────
    scheduler.update();

    // ── Telemetry Publish ───────────────────────────────────────────────
    unsigned long telemetry_interval = testMode.isEnabled()
        ? ((unsigned long)TEST_TELEMETRY_S * 1000UL)
        : TELEMETRY_INTERVAL_MS;

    if (mqttConnected && (now - lastTelemetry >= telemetry_interval)) {
        lastTelemetry = now;
        mqttClient.publishTelemetry();

        if (testMode.isEnabled()) {
            testMode.printStatus();
        }
    }

    // ── Status Heartbeat ────────────────────────────────────────────────
    if (mqttConnected && (now - lastStatusPub >= STATUS_HEARTBEAT_MS)) {
        lastStatusPub = now;
        mqttClient.publishStatus();
    }

    // ── Test Mode Update (virtual zone cycling) ─────────────────────────
    testMode.update();

    // ── Daily Counter Reset (at midnight) ───────────────────────────────
    if (ntpClient.isTimeSynced() && (now - lastDayCheck >= 60000)) {
        lastDayCheck = now;
        int today = ntpClient.getDay();
        if (lastDay == -1) {
            lastDay = today;
        } else if (today != lastDay) {
            logMsg("INFO", "Midnight: resetting daily runtime counters");
            zoneManager.resetDailyCounters();
            lastDay = today;
        }
    }

    // ── Yield ───────────────────────────────────────────────────────────
    yield();
}
