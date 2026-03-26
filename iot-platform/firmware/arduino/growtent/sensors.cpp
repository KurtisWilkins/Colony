#include "sensors.h"
#include "config.h"
#include "storage.h"
#include "test_mode.h"
#include <Wire.h>

Sensors sensors;

// Forward declaration for logging
extern void logMsg(const char* level, const char* fmt, ...);

Sensors::Sensors()
    : bme280_initialized(false)
    , mhz19_initialized(false)
    , bme280_fail_count(0)
    , mhz19_fail_count(0)
    , ultra_fail_count(0)
    , co2_warming_up(true)
    , warmup_start(0)
{
    memset(&readings, 0, sizeof(readings));
    readings.co2_ppm = -1;
}

void Sensors::begin() {
    // Initialize I2C for BME280
    Wire.begin(BME280_SDA, BME280_SCL);

    // Initialize BME280
    if (bme.begin(BME280_ADDR, &Wire)) {
        bme280_initialized = true;
        bme.setSampling(
            Adafruit_BME280::MODE_NORMAL,
            Adafruit_BME280::SAMPLING_X2,   // temp
            Adafruit_BME280::SAMPLING_X16,  // pressure
            Adafruit_BME280::SAMPLING_X16,  // humidity
            Adafruit_BME280::FILTER_X4,
            Adafruit_BME280::STANDBY_MS_500
        );
        logMsg("INFO", "BME280 initialized at 0x%02X", BME280_ADDR);
    } else {
        logMsg("ERROR", "BME280 not found at 0x%02X", BME280_ADDR);
    }

    // Initialize MH-Z19B on Serial2
    Serial2.begin(9600, SERIAL_8N1, MHZ19_RX, MHZ19_TX);
    mhz.begin(Serial2);
    mhz.autoCalibration(false);
    mhz19_initialized = true;
    warmup_start = millis();
    co2_warming_up = true;
    logMsg("INFO", "MH-Z19B initialized, warmup %ds", MHZ19_WARMUP_MS / 1000);

    // Initialize ultrasonic pins
    pinMode(JSN_TRIG, OUTPUT);
    pinMode(JSN_ECHO, INPUT);
    digitalWrite(JSN_TRIG, LOW);
    logMsg("INFO", "JSN-SR04T initialized (TRIG=%d, ECHO=%d)", JSN_TRIG, JSN_ECHO);
}

void Sensors::update() {
    if (testMode.isEnabled()) {
        // Skip all hardware reads — use simulated data
        SimulatedReadings sim = testMode.generateReadings();
        readings.temperature  = sim.temperature_c;
        readings.humidity     = sim.humidity_pct;
        readings.pressure     = sim.pressure_hpa;
        readings.co2_ppm      = sim.co2_ppm;
        readings.distance_cm  = sim.tank_depth_cm;
        readings.tank_pct     = (float)sim.tank_pct;
        readings.bme280_ok    = true;
        readings.mhz19_ok     = true;
        readings.ultrasonic_ok = true;
        testMode.printStatus(sim);
        return;
    }

    readBME280();
    readMHZ19();
    readUltrasonic();
}

void Sensors::readBME280() {
    if (!bme280_initialized) {
        readings.bme280_ok = false;
        bme280_fail_count++;
        if (bme280_fail_count == SENSOR_FAIL_THRESHOLD) {
            logMsg("ERROR", "BME280 alert: %d consecutive failures", bme280_fail_count);
        }
        return;
    }

    float temp = bme.readTemperature();
    float hum = bme.readHumidity();
    float pres = bme.readPressure() / 100.0f;  // Convert Pa to hPa

    // Check for NaN (read failure)
    if (isnan(temp) || isnan(hum) || isnan(pres)) {
        bme280_fail_count++;
        readings.bme280_ok = false;
        if (bme280_fail_count == SENSOR_FAIL_THRESHOLD) {
            logMsg("ERROR", "BME280 alert: %d consecutive failures", bme280_fail_count);
        }
        logMsg("WARN", "BME280 read failed (count=%d)", bme280_fail_count);
        return;
    }

    // Successful read
    bme280_fail_count = 0;
    readings.temperature = temp;
    readings.humidity = hum;
    readings.pressure = pres;
    readings.bme280_ok = true;

    logMsg("DEBUG", "BME280: T=%.1fC H=%.1f%% P=%.1fhPa", temp, hum, pres);
}

void Sensors::readMHZ19() {
    if (!mhz19_initialized) {
        readings.mhz19_ok = false;
        return;
    }

    // Check warmup period
    if (co2_warming_up) {
        if (millis() - warmup_start < MHZ19_WARMUP_MS) {
            readings.co2_ppm = -1;
            readings.mhz19_ok = true;
            return;
        }
        co2_warming_up = false;
        logMsg("INFO", "MH-Z19B warmup complete");
    }

    int co2 = mhz.getCO2();

    // Retry once if we get 0 or negative
    if (co2 <= 0) {
        logMsg("WARN", "MH-Z19B returned %d, retrying...", co2);
        delay(100);  // Brief delay for retry (acceptable for sensor comms)
        co2 = mhz.getCO2();
    }

    if (co2 <= 0) {
        mhz19_fail_count++;
        readings.mhz19_ok = false;
        if (mhz19_fail_count == SENSOR_FAIL_THRESHOLD) {
            logMsg("ERROR", "MH-Z19B alert: %d consecutive failures", mhz19_fail_count);
        }
        logMsg("WARN", "MH-Z19B read failed (count=%d)", mhz19_fail_count);
        return;
    }

    // Successful read
    mhz19_fail_count = 0;
    readings.co2_ppm = co2;
    readings.mhz19_ok = true;

    logMsg("DEBUG", "MH-Z19B: CO2=%dppm", co2);
}

float Sensors::measureDistance() {
    // Send 10us trigger pulse
    digitalWrite(JSN_TRIG, LOW);
    delayMicroseconds(2);
    digitalWrite(JSN_TRIG, HIGH);
    delayMicroseconds(10);
    digitalWrite(JSN_TRIG, LOW);

    // Measure echo duration (timeout 30ms ~= 515cm)
    unsigned long duration = pulseIn(JSN_ECHO, HIGH, 30000);

    if (duration == 0) {
        return -1.0f;  // No echo received
    }

    float distance = duration / 58.0f;
    return distance;
}

void Sensors::readUltrasonic() {
    float readings_arr[ULTRASONIC_READINGS];
    int valid_count = 0;

    // Take multiple readings
    for (int i = 0; i < ULTRASONIC_READINGS; i++) {
        float d = measureDistance();
        if (d > 0) {
            readings_arr[valid_count] = d;
            valid_count++;
        }
        if (i < ULTRASONIC_READINGS - 1) {
            delayMicroseconds(500);  // Brief gap between measurements
        }
    }

    if (valid_count == 0) {
        ultra_fail_count++;
        readings.ultrasonic_ok = false;
        if (ultra_fail_count == SENSOR_FAIL_THRESHOLD) {
            logMsg("ERROR", "JSN-SR04T alert: %d consecutive failures", ultra_fail_count);
        }
        logMsg("WARN", "JSN-SR04T read failed (count=%d)", ultra_fail_count);
        return;
    }

    // Find median
    // Simple sort for small array
    for (int i = 0; i < valid_count - 1; i++) {
        for (int j = i + 1; j < valid_count; j++) {
            if (readings_arr[j] < readings_arr[i]) {
                float tmp = readings_arr[i];
                readings_arr[i] = readings_arr[j];
                readings_arr[j] = tmp;
            }
        }
    }
    float median = readings_arr[valid_count / 2];

    // Discard outliers >20% from median, average the rest
    float sum = 0;
    int avg_count = 0;
    for (int i = 0; i < valid_count; i++) {
        float deviation = abs(readings_arr[i] - median) / median * 100.0f;
        if (deviation <= ULTRASONIC_OUTLIER_PCT) {
            sum += readings_arr[i];
            avg_count++;
        }
    }

    if (avg_count == 0) {
        // All readings were outliers relative to median, just use median
        sum = median;
        avg_count = 1;
    }

    float distance = sum / avg_count;

    ultra_fail_count = 0;
    readings.distance_cm = distance;
    readings.tank_pct = calculateTankPercent(distance);
    readings.ultrasonic_ok = true;

    logMsg("DEBUG", "JSN-SR04T: dist=%.1fcm tank=%.0f%%", distance, readings.tank_pct);
}

float Sensors::calculateTankPercent(float distance_cm) {
    float empty = storage.data.tank_empty_cm;
    float full = storage.data.tank_full_cm;

    if (empty <= full) {
        return 0.0f;  // Invalid calibration
    }

    // Closer distance = more water = higher percentage
    float pct = (empty - distance_cm) / (empty - full) * 100.0f;

    // Clamp to 0-100
    if (pct < 0.0f) pct = 0.0f;
    if (pct > 100.0f) pct = 100.0f;

    return pct;
}
