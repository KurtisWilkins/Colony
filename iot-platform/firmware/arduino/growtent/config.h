#ifndef CONFIG_H
#define CONFIG_H

// ============================================================================
// Firmware Identity
// ============================================================================
#define FIRMWARE_VERSION "1.0.0"

// ============================================================================
// Pin Definitions
// ============================================================================

// BME280 (I2C)
#define BME280_SDA          21
#define BME280_SCL          22
#define BME280_ADDR         0x76

// MH-Z19B CO2 Sensor (UART)
#define MHZ19_TX            16
#define MHZ19_RX            17

// JSN-SR04T Ultrasonic Distance Sensor
#define JSN_TRIG            18
#define JSN_ECHO            19

// YF-S201 Flow Meter
#define FLOW_SIGNAL         34

// Relay Outputs (active-LOW)
#define RELAY_VALVE         26   // CH1 - Solenoid valve
#define RELAY_MISTER        27   // CH2 - Mister/humidifier

// Fan PWM
#define FAN_PWM_PIN         25
#define FAN_PWM_FREQ        1000
#define FAN_PWM_RESOLUTION  8    // 8-bit (0-255)
#define FAN_PWM_CHANNEL     0

// ============================================================================
// Default Threshold Values
// ============================================================================
#define DEFAULT_HUM_ON_PCT      85.0f   // Turn mister ON below this humidity %
#define DEFAULT_HUM_OFF_PCT     92.0f   // Turn mister OFF above this humidity %
#define DEFAULT_CO2_HIGH_PPM    1200    // Turn fan to 100% above this CO2 ppm
#define DEFAULT_TEMP_MIN_C      18.0f   // Minimum temperature (C)
#define DEFAULT_TEMP_MAX_C      26.0f   // Maximum temperature (C)
#define DEFAULT_WATER_LOW_CM    30.0f   // Water level low alarm (cm from sensor)
#define DEFAULT_WATER_FULL_CM   10.0f   // Water level full (cm from sensor)

// ============================================================================
// Tank Calibration Defaults
// ============================================================================
#define DEFAULT_TANK_FULL_CM    10.0f   // Distance reading when tank is full
#define DEFAULT_TANK_EMPTY_CM   50.0f   // Distance reading when tank is empty

// ============================================================================
// Flow Meter Calibration
// ============================================================================
#define DEFAULT_FLOW_CAL        7.5f    // Pulses per liter (YF-S201 typical)

// ============================================================================
// Timing Defaults
// ============================================================================
#define DEFAULT_SENSOR_INTERVAL 10000   // Sensor read interval (ms)
#define STATUS_HEARTBEAT_MS     60000   // Status publish interval (ms)
#define FLOW_REPORT_MS          10000   // Flow telemetry interval (ms)
#define MQTT_RECONNECT_MS       5000    // MQTT reconnect interval (ms)
#define WIFI_RECONNECT_MS       10000   // WiFi reconnect interval (ms)
#define VALVE_MAX_OPEN_MS       600000  // 10 minutes max valve open time
#define FLOW_NVS_WRITE_MS       60000   // Write total_liters to NVS max every 60s
#define MHZ19_WARMUP_MS         180000  // 3 minutes warmup for MH-Z19B

// ============================================================================
// Fan Defaults
// ============================================================================
#define DEFAULT_FAN_SPEED       50      // Default fan speed (0-100%)
#define FAN_MIN_SPEED           20      // Minimum fan speed when on (%)

// ============================================================================
// Sensor Reliability
// ============================================================================
#define SENSOR_FAIL_THRESHOLD   3       // Consecutive fails before alert
#define ULTRASONIC_READINGS     3       // Number of readings to average
#define ULTRASONIC_OUTLIER_PCT  20      // Outlier rejection threshold (%)

// ============================================================================
// Network Defaults
// ============================================================================
#define DEFAULT_MQTT_PORT       1883
#define AP_SSID                 "GrowTent-Setup"
#define AP_IP                   IPAddress(192, 168, 4, 1)
#define DNS_PORT                53

// ============================================================================
// Test Mode Defaults
// ============================================================================
#define TEST_MODE_DEFAULT        true
#define TEST_INTERVAL_S          300     // Same as real sensor interval

// Simulated value ranges (realistic mushroom grow tent values)
#define SIM_TEMP_MIN             18.0f   // deg C
#define SIM_TEMP_MAX             26.0f   // deg C
#define SIM_HUMIDITY_MIN         65.0f   // %
#define SIM_HUMIDITY_MAX         98.0f   // %
#define SIM_CO2_MIN              600     // ppm
#define SIM_CO2_MAX              1800    // ppm
#define SIM_PRESSURE_MIN         1008.0f // hPa
#define SIM_PRESSURE_MAX         1020.0f // hPa
#define SIM_TANK_DEPTH_MIN       4.0f    // cm (full)
#define SIM_TANK_DEPTH_MAX       38.0f   // cm (empty)
#define SIM_FLOW_RATE_LPM        2.8f    // L/min when valve open

// Simulation cycle period (seconds) - one full environment cycle
#define SIM_CYCLE_PERIOD_S       3600    // 1 hour full cycle

// ============================================================================
// NVS Namespace
// ============================================================================
#define NVS_NAMESPACE           "growtent"

#endif // CONFIG_H
