#pragma once

// ============================================================================
// Firmware Identity
// ============================================================================
#define FIRMWARE_VERSION "1.0.0"
#define DEVICE_TYPE "irrigation_controller"
#define CHIP_MODEL "ESP32-S2"
#define BOARD_NAME "Olimex ESP32-S2-DevKit-Lipo"

// ============================================================================
// Number of Zones
// ============================================================================
#define NUM_ZONES           16

// ============================================================================
// Relay GPIO Pin Mapping
// ============================================================================
// GPIO 1-16 sequential mapping for ESP32-S2
// ACTIVE LOW relay modules: LOW = relay energized (ON), HIGH = relay off (OFF)
//
#define RELAY_1_PIN   1
#define RELAY_2_PIN   2
#define RELAY_3_PIN   3
#define RELAY_4_PIN   4
#define RELAY_5_PIN   5
#define RELAY_6_PIN   6
#define RELAY_7_PIN   7
#define RELAY_8_PIN   8
#define RELAY_9_PIN   9
#define RELAY_10_PIN  10
#define RELAY_11_PIN  11
#define RELAY_12_PIN  12
#define RELAY_13_PIN  13
#define RELAY_14_PIN  14
#define RELAY_15_PIN  15
#define RELAY_16_PIN  16

const uint8_t RELAY_PINS[16] = {1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16};

// ============================================================================
// Relay Logic
// ============================================================================
// ACTIVE LOW: writing LOW energizes the relay coil (valve OPEN).
//             writing HIGH de-energizes the relay coil (valve CLOSED).
#define RELAY_ACTIVE_STATE   LOW
#define RELAY_INACTIVE_STATE HIGH
#define RELAY_ON            LOW
#define RELAY_OFF           HIGH

// ============================================================================
// Safety Defaults
// ============================================================================
#define SAFETY_MAX_RUNTIME_S    1800    // Max single zone runtime (seconds)
#define SAFETY_MAX_DAILY_S      7200    // Max total daily runtime per zone (seconds)

// ============================================================================
// Queue Defaults
// ============================================================================
#define MAX_QUEUE_SIZE          16      // Maximum zones in run queue

// ============================================================================
// Scheduler Defaults
// ============================================================================
#define MAX_SCHEDULES           16      // One schedule per zone
#define MAX_TIME_WINDOWS        4       // Time windows per schedule
#define MAX_SEASONAL_CONFIGS    4       // Seasonal override configs
#define SCHEDULE_CHECK_MS       60000   // Check schedules every 60 seconds
#define DEFAULT_ZONE_RUNTIME_S  300     // Default zone runtime (5 minutes)

// ============================================================================
// Timing Defaults
// ============================================================================
#define TELEMETRY_INTERVAL_MS   30000   // Telemetry publish interval (ms)
#define STATUS_HEARTBEAT_MS     60000   // Status publish interval (ms)
#define MQTT_RECONNECT_MS       5000    // MQTT reconnect interval (ms)
#define WIFI_RECONNECT_MS       10000   // WiFi reconnect interval (ms)
#define NTP_SYNC_INTERVAL_MS    86400000UL  // NTP re-sync every 24 hours

// ============================================================================
// Network Defaults
// ============================================================================
#define DEFAULT_MQTT_PORT       1883
#define AP_SSID                 "Irrigation-Setup"
#define AP_IP                   IPAddress(192, 168, 4, 1)
#define DNS_PORT                53

// ============================================================================
// NTP Defaults
// ============================================================================
#define NTP_SERVER_1            "pool.ntp.org"
#define NTP_SERVER_2            "time.nist.gov"
#define DEFAULT_TIMEZONE        "EST5EDT,M3.2.0,M11.1.0"

// ============================================================================
// Test Mode Defaults
// ============================================================================
#define TEST_MODE_DEFAULT       true
#define TEST_ZONE_CYCLE_S       10      // Virtual zone run duration in test mode
#define TEST_TELEMETRY_S        10      // Telemetry interval in test mode (seconds)

// ============================================================================
// NVS Namespace
// ============================================================================
#define NVS_NAMESPACE           "irrigation"
