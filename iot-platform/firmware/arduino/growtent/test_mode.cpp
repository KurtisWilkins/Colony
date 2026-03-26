#include "test_mode.h"
#include "storage.h"
#include <Preferences.h>
#include <math.h>

TestMode testMode;

extern void logMsg(const char* level, const char* fmt, ...);

TestMode::TestMode()
    : _enabled(false)
    , _enabledAt(0)
    , _cycleStartMs(0)
{
    memset(&_actuators, 0, sizeof(_actuators));
}

void TestMode::enable() {
    _enabled = true;
    _enabledAt = millis();
    _cycleStartMs = millis();
    memset(&_actuators, 0, sizeof(_actuators));
    saveToNVS();

    Serial.println();
    Serial.println("=====================================");
    logMsg("TEST", "TEST MODE ENABLED");
    Serial.println("  All sensor reads bypassed.");
    Serial.println("  All actuator outputs suppressed.");
    Serial.printf("  Simulated data will be published every %ds.\n", TEST_INTERVAL_S);
    Serial.printf("  WiFi: %s | MQTT: %s\n",
                  WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED",
                  "CHECK_MAIN");
    Serial.printf("  Device: %s/%s/%s/%s\n",
                  storage.data.facility.c_str(),
                  storage.data.building.c_str(),
                  storage.data.unit.c_str(),
                  storage.data.device_name.c_str());
    Serial.println("=====================================");
    Serial.println();
}

void TestMode::disable() {
    _enabled = false;
    memset(&_actuators, 0, sizeof(_actuators));
    saveToNVS();

    Serial.println();
    Serial.println("=====================================");
    logMsg("TEST", "TEST MODE DISABLED");
    Serial.println("  Returning to real sensor operation.");
    Serial.println("  Virtual actuator states cleared.");
    Serial.printf("  Next real reading in %lums.\n", storage.data.sensor_interval);
    Serial.println("=====================================");
    Serial.println();
}

bool TestMode::isEnabled() const {
    return _enabled;
}

void TestMode::loadFromNVS() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);
    _enabled = prefs.getBool("test_mode_on", TEST_MODE_DEFAULT);
    prefs.end();

    if (_enabled) {
        _enabledAt = millis();
        _cycleStartMs = millis();
        memset(&_actuators, 0, sizeof(_actuators));

        Serial.println();
        Serial.println("=====================================");
        logMsg("WARN", "DEVICE STARTING IN TEST MODE");
        Serial.println("  Real sensors will NOT be read.");
        Serial.println("  Real actuators will NOT be activated.");
        Serial.println("  Send set_test_mode {enabled:false} to return to normal.");
        Serial.println("=====================================");
        Serial.println();
    }
}

void TestMode::saveToNVS() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);
    prefs.putBool("test_mode_on", _enabled);
    prefs.end();
}

void TestMode::update() {
    // Update virtual flow accumulation when valve is open
    if (_enabled && _actuators.valve_open) {
        unsigned long now = millis();
        unsigned long elapsed_ms = now - _actuators.valve_opened_at_ms;
        // Accumulate liters based on simulated flow rate
        float elapsed_min = elapsed_ms / 60000.0f;
        _actuators.session_liters_virtual = SIM_FLOW_RATE_LPM * elapsed_min;
    }
}

float TestMode::_cycleProgress() const {
    unsigned long elapsed = millis() - _cycleStartMs;
    unsigned long cycle_ms = (unsigned long)SIM_CYCLE_PERIOD_S * 1000UL;
    float progress = (float)(elapsed % cycle_ms) / (float)cycle_ms;
    return progress;
}

int TestMode::getCycleProgressPct() const {
    return (int)(_cycleProgress() * 100.0f);
}

float TestMode::_sine(float progress, float minVal, float maxVal) const {
    // Sine wave mapped to [minVal, maxVal]
    float s = sinf(progress * 2.0f * PI);
    return minVal + (maxVal - minVal) * (s + 1.0f) / 2.0f;
}

// ── Simulation Functions ─────────────────────────────────────────────────

float TestMode::_simulateHumidity(float progress) const {
    // Base: sine wave from 75% up to 95% and back
    float base;
    if (progress < 0.5f) {
        // First half: rise from 75% to 95%
        base = 75.0f + 20.0f * (progress / 0.5f);
    } else {
        // Second half: fall from 95% to 75%
        base = 95.0f - 20.0f * ((progress - 0.5f) / 0.5f);
    }

    // Mister influence: when on, humidity rises faster toward max
    if (_actuators.mister_on) {
        base = base + (SIM_HUMIDITY_MAX - base) * 0.3f;
    }

    // Fan influence: when on at high speed, humidity drops
    if (_actuators.fan_on && _actuators.fan_speed_pct > 70) {
        base -= 5.0f;
    }

    // Clamp
    if (base < SIM_HUMIDITY_MIN) base = SIM_HUMIDITY_MIN;
    if (base > SIM_HUMIDITY_MAX) base = SIM_HUMIDITY_MAX;

    // Random noise +/- 0.5%
    float noise = ((float)random(-50, 51)) / 100.0f;
    return base + noise;
}

float TestMode::_simulateCO2(float progress) const {
    // Starts at 700, rises to ~1400 near end, then drops
    float base;
    if (progress < 0.75f) {
        // Rise from 700 to 1400 over 75% of cycle
        base = 700.0f + 700.0f * (progress / 0.75f);
    } else {
        // Drop from 1400 back to 700 in last 25%
        base = 1400.0f - 700.0f * ((progress - 0.75f) / 0.25f);
    }

    // Fan influence: high speed drops CO2 faster
    if (_actuators.fan_on && _actuators.fan_speed_pct >= 80) {
        base *= 0.7f;
    } else if (_actuators.fan_on && _actuators.fan_speed_pct >= 50) {
        base *= 0.85f;
    }

    // Clamp
    if (base < (float)SIM_CO2_MIN) base = (float)SIM_CO2_MIN;
    if (base > (float)SIM_CO2_MAX) base = (float)SIM_CO2_MAX;

    // Random noise +/- 15ppm
    float noise = (float)random(-15, 16);
    return base + noise;
}

float TestMode::_simulateTemperature(float progress) const {
    // Gentle sine wave
    float base = _sine(progress, SIM_TEMP_MIN, SIM_TEMP_MAX);

    // Mister cools slightly
    if (_actuators.mister_on) {
        base -= 0.5f;
    }

    // Clamp
    if (base < SIM_TEMP_MIN) base = SIM_TEMP_MIN;
    if (base > SIM_TEMP_MAX) base = SIM_TEMP_MAX;

    // Noise +/- 0.1C
    float noise = ((float)random(-10, 11)) / 100.0f;
    return base + noise;
}

float TestMode::_simulateTankDepth(float progress) const {
    // Starts at 8cm (nearly full), drains to 35cm over cycle
    float base;
    if (progress < 0.8f) {
        // Slow drain from 8 to 35 over 80% of cycle
        base = 8.0f + 27.0f * (progress / 0.8f);
    } else {
        // Refill from 35 back to 8 in last 20%
        base = 35.0f - 27.0f * ((progress - 0.8f) / 0.2f);
    }

    // If valve is open, depth decreases rapidly (filling the tank)
    if (_actuators.valve_open) {
        // Valve open means water is flowing IN, so depth should decrease
        float fill_amount = _actuators.session_liters_virtual * 0.5f; // cm per liter
        base -= fill_amount;
    }

    // Clamp to physical range
    if (base < SIM_TANK_DEPTH_MIN) base = SIM_TANK_DEPTH_MIN;
    if (base > SIM_TANK_DEPTH_MAX) base = SIM_TANK_DEPTH_MAX;

    return base;
}

float TestMode::_simulateFlowRate() const {
    if (!_actuators.valve_open) return 0.0f;
    // Noise +/- 0.2 L/min
    float noise = ((float)random(-20, 21)) / 100.0f;
    return SIM_FLOW_RATE_LPM + noise;
}

float TestMode::_simulatePressure(float progress) const {
    // Very slow gentle variation
    float base = _sine(progress * 0.3f, SIM_PRESSURE_MIN, SIM_PRESSURE_MAX);
    float noise = ((float)random(-10, 11)) / 100.0f;
    return base + noise;
}

SimulatedReadings TestMode::generateReadings() {
    float progress = _cycleProgress();

    SimulatedReadings r;
    r.temperature_c = _simulateTemperature(progress);
    r.humidity_pct  = _simulateHumidity(progress);
    r.pressure_hpa  = _simulatePressure(progress);
    r.co2_ppm       = (int)_simulateCO2(progress);
    r.tank_depth_cm = _simulateTankDepth(progress);
    r.flow_rate_lpm = _simulateFlowRate();
    r.session_liters = _actuators.valve_open ? _actuators.session_liters_virtual : 0.0f;

    // Calculate tank percentage from depth
    float empty = storage.data.tank_empty_cm;
    float full  = storage.data.tank_full_cm;
    if (empty > full) {
        float pct = (empty - r.tank_depth_cm) / (empty - full) * 100.0f;
        if (pct < 0.0f) pct = 0.0f;
        if (pct > 100.0f) pct = 100.0f;
        r.tank_pct = (int)pct;
    } else {
        r.tank_pct = 0;
    }

    return r;
}

// ── Virtual Actuator Controls ────────────────────────────────────────────

void TestMode::setFanOn(bool on) {
    _actuators.fan_on = on;
    if (!on) _actuators.fan_speed_pct = 0;
}

void TestMode::setFanSpeed(int pct) {
    if (pct <= 0) {
        _actuators.fan_on = false;
        _actuators.fan_speed_pct = 0;
    } else {
        _actuators.fan_on = true;
        _actuators.fan_speed_pct = pct;
    }
}

void TestMode::setMisterOn(bool on) {
    _actuators.mister_on = on;
}

void TestMode::setValveOpen(bool open) {
    if (open && !_actuators.valve_open) {
        _actuators.valve_open = true;
        _actuators.valve_opened_at_ms = millis();
        _actuators.session_liters_virtual = 0.0f;
    } else if (!open && _actuators.valve_open) {
        _actuators.valve_open = false;
        _actuators.valve_opened_at_ms = 0;
    }
}

VirtualActuatorState TestMode::getActuatorState() const {
    return _actuators;
}

// ── Phase Description ────────────────────────────────────────────────────

String TestMode::getPhaseDescription() const {
    float progress = _cycleProgress();

    String humPhase;
    if (progress < 0.5f) {
        humPhase = "humidity rising";
    } else {
        humPhase = "humidity falling";
    }

    String co2Phase;
    if (progress < 0.75f) {
        co2Phase = "CO2 building";
    } else {
        co2Phase = "CO2 venting";
    }

    String tankPhase;
    if (progress < 0.8f) {
        tankPhase = "tank draining";
    } else {
        tankPhase = "tank refilling";
    }

    return humPhase + " / " + co2Phase + " / " + tankPhase;
}

// ── Serial Output ────────────────────────────────────────────────────────

void TestMode::printStatus(const SimulatedReadings& r) const {
    Serial.println();
    logMsg("TEST", "SIMULATED READING");
    Serial.printf("  Cycle progress : %d%% (%s)\n",
                  getCycleProgressPct(), getPhaseDescription().c_str());
    Serial.printf("  Temperature    : %.1f%cC\n", r.temperature_c, 0xB0);
    Serial.printf("  Humidity       : %.1f%% [threshold ON:%.0f%% OFF:%.0f%%]\n",
                  r.humidity_pct, storage.data.hum_on_pct, storage.data.hum_off_pct);
    Serial.printf("  CO2            : %dppm [threshold HIGH:%dppm]\n",
                  r.co2_ppm, storage.data.co2_high_ppm);
    Serial.printf("  Tank depth     : %.1fcm [%d%% full]\n",
                  r.tank_depth_cm, r.tank_pct);
    Serial.printf("  Pressure       : %.1fhPa\n", r.pressure_hpa);
    Serial.printf("  Fan            : %s%s (virtual)\n",
                  _actuators.fan_on ? "ON" : "OFF",
                  _actuators.fan_on ? (String(" @ ") + String(_actuators.fan_speed_pct) + "%").c_str() : "");
    Serial.printf("  Mister         : %s (virtual)\n",
                  _actuators.mister_on ? "ON" : "OFF");
    Serial.printf("  Valve          : %s (virtual)\n",
                  _actuators.valve_open ? "OPEN" : "CLOSED");
    if (_actuators.valve_open) {
        Serial.printf("  Flow rate      : %.1f L/min | Session: %.2f L\n",
                      r.flow_rate_lpm, r.session_liters);
    }
    Serial.printf("  Publishing to  : %s/%s/%s/%s/telemetry\n",
                  storage.data.facility.c_str(),
                  storage.data.building.c_str(),
                  storage.data.unit.c_str(),
                  storage.data.device_name.c_str());
}

void TestMode::printCommandReceived(const String& command, const String& payload) const {
    Serial.println();
    Serial.println("=====================================");
    logMsg("TEST", "COMMAND RECEIVED");
    Serial.printf("  Command   : %s\n", command.c_str());
    Serial.printf("  Payload   : %s\n", payload.c_str());
}

void TestMode::printPublished(const String& topic, size_t bytes) const {
    logMsg("TEST", "Published telemetry (%d bytes)", bytes);
    unsigned long next_s = storage.data.sensor_interval / 1000;
    logMsg("TEST", "Awaiting next reading in %lus", next_s);
}
