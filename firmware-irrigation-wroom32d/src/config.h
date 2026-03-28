#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// Firmware Identity
// ============================================================================
#define FIRMWARE_VERSION "1.0.0"
#define CHIP_MODEL       "ESP32-WROOM-32D"
#define BOARD_NAME       "ESP32 DevKit"
#define DEVICE_TYPE      "irrigation_controller"

// ============================================================================
// Number of Zones
// ============================================================================
#define NUM_ZONES           16

// ============================================================================
// Relay GPIO Pin Mapping
// ============================================================================
// ACTIVE LOW relay modules: LOW = relay energized (ON), HIGH = relay off (OFF)
// All 16 GPIOs chosen to avoid input-only pins (34, 35, 36, 39).
//
// NOTE: Some pins have boot-sensitive behavior on ESP32-WROOM-32D:
//   GPIO 2  — Must be LOW/floating for boot (onboard LED on some boards)
//   GPIO 12 — Must be LOW for boot (strapping pin, controls flash voltage)
//   GPIO 5  — Outputs PWM at boot
//   GPIO 14 — Outputs PWM at boot
//   GPIO 15 — Outputs PWM at boot
// These pins are safe for relay use since ACTIVE LOW relays default HIGH (OFF).
//
// Relays 1-8 (first relay board)
#define RELAY_1_PIN         13
#define RELAY_2_PIN         12      // Boot-sensitive: must be LOW at boot
#define RELAY_3_PIN         14      // Outputs PWM at boot
#define RELAY_4_PIN         27
#define RELAY_5_PIN         26
#define RELAY_6_PIN         25
#define RELAY_7_PIN         33
#define RELAY_8_PIN         32

// Relays 9-16 (second relay board)
#define RELAY_9_PIN         23
#define RELAY_10_PIN        22
#define RELAY_11_PIN        21
#define RELAY_12_PIN        19
#define RELAY_13_PIN        18
#define RELAY_14_PIN        5       // Outputs PWM at boot
#define RELAY_15_PIN        4
#define RELAY_16_PIN        2       // Boot-sensitive: onboard LED, must be LOW/floating

// ============================================================================
// Relay Logic
// ============================================================================
// ACTIVE LOW: writing LOW energizes the relay coil (valve OPEN).
//             writing HIGH de-energizes the relay coil (valve CLOSED).
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

#endif // CONFIG_H
