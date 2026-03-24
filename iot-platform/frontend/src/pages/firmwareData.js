const firmwareFiles = {
  'main.cpp': `// Full source: firmware/src/main.cpp
#include <Arduino.h>
#include "config.h"
#include "storage.h"
#include "sensors.h"
#include "actuators.h"
#include "mqtt_client.h"
#include "captive_portal.h"
#include "automation.h"
#include "flow_meter.h"

// --- Timing variables (millis-based, non-blocking) ---
unsigned long lastSensorRead = 0;
unsigned long lastStatusPublish = 0;
unsigned long lastFlowPublish = 0;
unsigned long lastFlowPulseCheck = 0;
unsigned long lastMqttRetry = 0;
unsigned long lastWifiRetry = 0;
unsigned long bootTime = 0;
bool co2WarmedUp = false;

void setup() {
    Serial.begin(115200);
    logInfo("Mushroom Tent Controller v" FIRMWARE_VERSION " booting...");

    // Initialize SPIFFS for captive portal HTML
    if (!SPIFFS.begin(true)) {
        logError("SPIFFS mount failed");
    }

    // Load all configuration from NVS (Non-Volatile Storage)
    storageInit();

    // Initialize hardware
    actuatorsInit();  // Relays HIGH (off), fan PWM channel
    sensorsInit();    // BME280 I2C, MH-Z19B UART, JSN-SR04T pins
    flowMeterInit();  // Interrupt on GPIO34

    // Check for WiFi credentials
    String ssid = storageGetString("wifi_ssid");
    if (ssid.length() == 0) {
        logInfo("No WiFi credentials — starting captive portal");
        startCaptivePortal();  // Blocks until configured, then reboots
    }

    // Connect WiFi
    WiFi.begin(ssid.c_str(), storageGetString("wifi_pass").c_str());
    unsigned long wifiStart = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - wifiStart < 30000) {
        delay(500);
    }

    if (WiFi.status() == WL_CONNECTED) {
        logInfo("WiFi connected: " + WiFi.localIP().toString());
        mqttInit();
        mqttConnect();
    }

    bootTime = millis();
    logInfo("Boot complete");
}

void loop() {
    unsigned long now = millis();

    // Sensor reading timer
    if (now - lastSensorRead >= storageGetUInt("sensor_interval") * 1000UL) {
        lastSensorRead = now;
        readAllSensors();
        if (mqttIsConnected()) {
            mqttPublishTelemetry();
        }
    }

    // Status heartbeat every 60 seconds
    if (now - lastStatusPublish >= 60000) {
        lastStatusPublish = now;
        if (mqttIsConnected()) mqttPublishStatus();
    }

    // Autonomous mode fallback
    if (!mqttIsConnected() || WiFi.status() != WL_CONNECTED) {
        automationRun();  // Uses stored thresholds
    }

    // MQTT loop (non-blocking)
    mqttLoop();

    // Flow meter 1-second pulse snapshot
    if (now - lastFlowPulseCheck >= 1000) {
        lastFlowPulseCheck = now;
        flowMeterUpdate();
    }
}`,

  'config.h': `// Full source: firmware/src/config.h
#ifndef CONFIG_H
#define CONFIG_H

#define FIRMWARE_VERSION "1.0.0"

// --- Pin Definitions ---
// BME280 I2C
#define BME_SDA 21
#define BME_SCL 22

// MH-Z19B CO2 Sensor (UART)
#define MHZ_TX 16  // ESP32 TX2 -> Sensor RX
#define MHZ_RX 17  // ESP32 RX2 -> Sensor TX

// JSN-SR04T Ultrasonic
#define ULTRASONIC_TRIG 18
#define ULTRASONIC_ECHO 19  // Via 1k+2k voltage divider

// YF-S201 Flow Sensor
#define FLOW_PIN 34  // Input-only, external 10k pull-up to 3.3V

// Relay Module (Active LOW: LOW = ON, HIGH = OFF)
#define RELAY_VALVE 26   // CH1: 12V solenoid water valve
#define RELAY_MISTER 27  // CH2: Mist maker power

// Fan PWM
#define FAN_PWM_PIN 25
#define FAN_PWM_CHANNEL 0
#define FAN_PWM_FREQ 1000   // 1kHz
#define FAN_PWM_RES 8       // 8-bit (0-255)
#define FAN_MIN_SPEED 20    // Minimum % when on (prevent stall)

// --- Default Threshold Values ---
#define DEFAULT_HUM_ON 80.0
#define DEFAULT_HUM_OFF 90.0
#define DEFAULT_CO2_HIGH 1000
#define DEFAULT_TEMP_MIN 18.0
#define DEFAULT_TEMP_MAX 24.0
#define DEFAULT_WATER_LOW 10.0
#define DEFAULT_WATER_FULL 5.0
#define DEFAULT_TANK_EMPTY 40.0
#define DEFAULT_TANK_FULL 5.0
#define DEFAULT_SENSOR_INTERVAL 300
#define DEFAULT_FAN_SPEED 50
#define DEFAULT_FLOW_CAL 450.0
#define DEFAULT_MQTT_PORT 1883

// --- Timing Constants ---
#define CO2_WARMUP_MS 180000       // 3 minutes
#define STATUS_INTERVAL_MS 60000   // 1 minute
#define FLOW_PUBLISH_MS 10000      // 10 seconds
#define VALVE_SAFETY_MS 600000     // 10 minutes max open
#define WIFI_RETRY_MS 60000        // 1 minute
#define MQTT_RETRY_MS 30000        // 30 seconds

#endif`,

  'sensors.cpp': `// Full source: firmware/src/sensors.cpp
#include "sensors.h"
#include "config.h"
#include <Adafruit_BME280.h>
#include <MHZ19.h>

Adafruit_BME280 bme;
MHZ19 mhz;
HardwareSerial mhzSerial(2);

static int bmeFailCount = 0;
static bool bmeInitialized = false;

void sensorsInit() {
    // BME280 on I2C
    Wire.begin(BME_SDA, BME_SCL);
    bmeInitialized = bme.begin(0x76);
    if (!bmeInitialized) {
        bmeInitialized = bme.begin(0x77);
    }

    // MH-Z19B on UART2
    mhzSerial.begin(9600, SERIAL_8N1, MHZ_RX, MHZ_TX);
    mhz.begin(mhzSerial);
    mhz.autoCalibration(false);

    // JSN-SR04T pins
    pinMode(ULTRASONIC_TRIG, OUTPUT);
    pinMode(ULTRASONIC_ECHO, INPUT);
}

// Read BME280 — returns false if sensor failed
bool readBME280(float &temp, float &hum, float &pres) {
    if (!bmeInitialized) return false;
    temp = bme.readTemperature();
    hum = bme.readHumidity();
    pres = bme.readPressure() / 100.0F;
    if (isnan(temp) || isnan(hum)) {
        bmeFailCount++;
        return bmeFailCount < 3;  // Alert after 3 consecutive fails
    }
    bmeFailCount = 0;
    return true;
}

// Read CO2 — returns -1 during warmup or on failure
int readCO2(bool warmedUp) {
    if (!warmedUp) return -1;
    int co2 = mhz.getCO2();
    if (co2 <= 0) {
        delay(100);
        co2 = mhz.getCO2();  // Single retry
    }
    return (co2 > 0) ? co2 : -1;
}

// Read tank depth — averages 3 readings, discards outliers
float readTankDepth() {
    float readings[3];
    int valid = 0;
    for (int i = 0; i < 3; i++) {
        digitalWrite(ULTRASONIC_TRIG, LOW);
        delayMicroseconds(2);
        digitalWrite(ULTRASONIC_TRIG, HIGH);
        delayMicroseconds(10);
        digitalWrite(ULTRASONIC_TRIG, LOW);
        long duration = pulseIn(ULTRASONIC_ECHO, HIGH, 30000);
        if (duration > 0) {
            readings[valid++] = duration / 58.0;
        }
        delay(50);
    }
    if (valid == 0) return -1;
    // Sort and take median, discard outliers >20%
    // ... (see full source)
    return readings[0];
}`,

  'actuators.cpp': `// Full source: firmware/src/actuators.cpp
#include "actuators.h"
#include "config.h"

static int currentFanSpeed = 0;  // 0-100%
static bool valveState = false;
static bool misterState = false;
static unsigned long valveOpenedAt = 0;

void actuatorsInit() {
    // Relays: HIGH = OFF (active-low logic)
    pinMode(RELAY_VALVE, OUTPUT);
    pinMode(RELAY_MISTER, OUTPUT);
    digitalWrite(RELAY_VALVE, HIGH);   // Valve closed
    digitalWrite(RELAY_MISTER, HIGH);  // Mister off

    // Fan PWM setup
    ledcSetup(FAN_PWM_CHANNEL, FAN_PWM_FREQ, FAN_PWM_RES);
    ledcAttachPin(FAN_PWM_PIN, FAN_PWM_CHANNEL);
    ledcWrite(FAN_PWM_CHANNEL, 0);
}

void setFanSpeed(int pct) {
    if (pct > 0 && pct < FAN_MIN_SPEED) pct = FAN_MIN_SPEED;
    if (pct > 100) pct = 100;
    currentFanSpeed = pct;
    int duty = map(pct, 0, 100, 0, 255);
    ledcWrite(FAN_PWM_CHANNEL, duty);
}

void fanOff() {
    currentFanSpeed = 0;
    ledcWrite(FAN_PWM_CHANNEL, 0);
    digitalWrite(FAN_PWM_PIN, LOW);  // Explicit LOW
}

void valveOpen() {
    digitalWrite(RELAY_VALVE, LOW);  // LOW = energized = open
    valveState = true;
    valveOpenedAt = millis();
}

void valveClose() {
    digitalWrite(RELAY_VALVE, HIGH);  // HIGH = de-energized = closed
    valveState = false;
    valveOpenedAt = 0;
}

void misterOn() {
    digitalWrite(RELAY_MISTER, LOW);  // LOW = energized = on
    misterState = true;
}

void misterOff() {
    digitalWrite(RELAY_MISTER, HIGH);
    misterState = false;
}`,

  'mqtt_client.cpp': `// Full source: firmware/src/mqtt_client.cpp
// MQTT client wrapper using PubSubClient
// Handles connect, subscribe, publish, and command parsing
// Base topic: {facility}/{building}/{unit}/{device_name}
// Subscribes to: {base}/command, {base}/config
// Publishes to: {base}/telemetry, {base}/status, {base}/flow, {base}/alert, {base}/ack
// See full source for complete implementation including all 12 command handlers`,

  'flow_meter.cpp': `// Full source: firmware/src/flow_meter.cpp
// Interrupt-driven pulse counting for YF-S201 flow sensor
// ISR on GPIO34 RISING edge increments volatile counter
// Every 1 second: snapshot counter, calculate flow rate
// flow_lpm = (pulses / calibration_factor) * 60
// Accumulates session liters and lifetime total
// NVS write rate-limited to once per minute`,

  'automation.cpp': `// Full source: firmware/src/automation.cpp
// Autonomous fallback mode — runs when WiFi/MQTT disconnected
// Humidity: below threshold -> mister+fan ON; above -> mister OFF
// CO2: above high -> fan 100%; below high-100 -> fan default
// Water: depth > low -> valve open; depth <= full -> valve close
// Valve safety: 10-minute maximum open time, force close`,

  'captive_portal.cpp': `// Full source: firmware/src/captive_portal.cpp
// First-time setup WiFi access point "GrowTent-Setup"
// DNS redirect all domains to 192.168.4.1
// Serves portal.html from SPIFFS
// /scan endpoint returns available WiFi networks as JSON
// /save endpoint writes all config to NVS and reboots`,
};

export default firmwareFiles;
