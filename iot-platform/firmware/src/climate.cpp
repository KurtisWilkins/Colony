#include "climate.h"
#include "config.h"
#include "test_mode.h"
#include <Preferences.h>
#include <time.h>

ClimateController climateController;

extern void logMsg(const char* level, const char* fmt, ...);

// ============================================================================
// Constructor
// ============================================================================
ClimateController::ClimateController() {
    memset(&_state, 0, sizeof(_state));

    _thresholds.heat_on_c          = DEFAULT_HEAT_ON_C;
    _thresholds.heat_off_c         = DEFAULT_HEAT_OFF_C;
    _thresholds.cool_on_c          = DEFAULT_COOL_ON_C;
    _thresholds.cool_off_c         = DEFAULT_COOL_OFF_C;
    _thresholds.dehumid_on_pct     = DEFAULT_DEHUMID_ON_PCT;
    _thresholds.dehumid_off_pct    = DEFAULT_DEHUMID_OFF_PCT;
    _thresholds.heater_safety_min  = DEFAULT_HEATER_SAFETY_MIN;
    _thresholds.cooling_safety_min = DEFAULT_COOLING_SAFETY_MIN;
    _thresholds.climate_enabled    = DEFAULT_CLIMATE_ENABLED;
    _thresholds.schedule_enabled   = false;
    _thresholds.day_start_hour     = DEFAULT_DAY_START_HOUR;
    _thresholds.night_start_hour   = DEFAULT_NIGHT_START_HOUR;
    _thresholds.night_heat_on_c    = DEFAULT_NIGHT_HEAT_ON_C;
    _thresholds.night_heat_off_c   = DEFAULT_NIGHT_HEAT_OFF_C;
    _thresholds.night_cool_on_c    = DEFAULT_NIGHT_COOL_ON_C;
    _thresholds.night_cool_off_c   = DEFAULT_NIGHT_COOL_OFF_C;
}

// ============================================================================
// begin() — called FIRST in setup() after Serial.begin()
// Sets all 4 climate relay pins as OUTPUT, writes HIGH (relays OFF)
// ============================================================================
void ClimateController::begin() {
    pinMode(RELAY_HEATER_PIN, OUTPUT);
    digitalWrite(RELAY_HEATER_PIN, HIGH);   // OFF

    pinMode(RELAY_COOLING_PIN, OUTPUT);
    digitalWrite(RELAY_COOLING_PIN, HIGH);  // OFF

    pinMode(RELAY_DEHUMID_PIN, OUTPUT);
    digitalWrite(RELAY_DEHUMID_PIN, HIGH);  // OFF

    pinMode(RELAY_SPARE2_PIN, OUTPUT);
    digitalWrite(RELAY_SPARE2_PIN, HIGH);   // OFF

    memset(&_state, 0, sizeof(_state));

    logMsg("INFO", "[CLIMATE] Relay pins initialized: Heater=OFF Cooling=OFF Dehumid=OFF Spare=OFF");
}

// ============================================================================
// NVS Load
// ============================================================================
void ClimateController::loadFromNVS() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);

    _thresholds.heat_on_c          = prefs.getFloat("cl_heat_on",    DEFAULT_HEAT_ON_C);
    _thresholds.heat_off_c         = prefs.getFloat("cl_heat_off",   DEFAULT_HEAT_OFF_C);
    _thresholds.cool_on_c          = prefs.getFloat("cl_cool_on",    DEFAULT_COOL_ON_C);
    _thresholds.cool_off_c         = prefs.getFloat("cl_cool_off",   DEFAULT_COOL_OFF_C);
    _thresholds.dehumid_on_pct     = prefs.getFloat("cl_dehum_on",   DEFAULT_DEHUMID_ON_PCT);
    _thresholds.dehumid_off_pct    = prefs.getFloat("cl_dehum_off",  DEFAULT_DEHUMID_OFF_PCT);
    _thresholds.heater_safety_min  = prefs.getULong("cl_htr_safe",   DEFAULT_HEATER_SAFETY_MIN);
    _thresholds.cooling_safety_min = prefs.getULong("cl_cool_safe",  DEFAULT_COOLING_SAFETY_MIN);
    _thresholds.climate_enabled    = prefs.getBool("cl_enabled",      DEFAULT_CLIMATE_ENABLED);
    _thresholds.schedule_enabled   = prefs.getBool("cl_sched_en",     false);
    _thresholds.day_start_hour     = prefs.getUChar("cl_day_hr",      DEFAULT_DAY_START_HOUR);
    _thresholds.night_start_hour   = prefs.getUChar("cl_night_hr",    DEFAULT_NIGHT_START_HOUR);
    _thresholds.night_heat_on_c    = prefs.getFloat("cl_nheat_on",   DEFAULT_NIGHT_HEAT_ON_C);
    _thresholds.night_heat_off_c   = prefs.getFloat("cl_nheat_off",  DEFAULT_NIGHT_HEAT_OFF_C);
    _thresholds.night_cool_on_c    = prefs.getFloat("cl_ncool_on",   DEFAULT_NIGHT_COOL_ON_C);
    _thresholds.night_cool_off_c   = prefs.getFloat("cl_ncool_off",  DEFAULT_NIGHT_COOL_OFF_C);

    prefs.end();

    logMsg("INFO", "[CLIMATE] Thresholds loaded from NVS: heat_on=%.1fC heat_off=%.1fC cool_on=%.1fC cool_off=%.1fC",
           _thresholds.heat_on_c, _thresholds.heat_off_c,
           _thresholds.cool_on_c, _thresholds.cool_off_c);
    logMsg("INFO", "[CLIMATE] Dehumid ON=%.0f%% OFF=%.0f%% | Schedule=%s | Enabled=%s",
           _thresholds.dehumid_on_pct, _thresholds.dehumid_off_pct,
           _thresholds.schedule_enabled ? "YES" : "NO",
           _thresholds.climate_enabled ? "YES" : "NO");
}

// ============================================================================
// NVS Save
// ============================================================================
void ClimateController::saveToNVS() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);

    prefs.putFloat("cl_heat_on",    _thresholds.heat_on_c);
    prefs.putFloat("cl_heat_off",   _thresholds.heat_off_c);
    prefs.putFloat("cl_cool_on",    _thresholds.cool_on_c);
    prefs.putFloat("cl_cool_off",   _thresholds.cool_off_c);
    prefs.putFloat("cl_dehum_on",   _thresholds.dehumid_on_pct);
    prefs.putFloat("cl_dehum_off",  _thresholds.dehumid_off_pct);
    prefs.putULong("cl_htr_safe",   _thresholds.heater_safety_min);
    prefs.putULong("cl_cool_safe",  _thresholds.cooling_safety_min);
    prefs.putBool("cl_enabled",     _thresholds.climate_enabled);
    prefs.putBool("cl_sched_en",    _thresholds.schedule_enabled);
    prefs.putUChar("cl_day_hr",     _thresholds.day_start_hour);
    prefs.putUChar("cl_night_hr",   _thresholds.night_start_hour);
    prefs.putFloat("cl_nheat_on",   _thresholds.night_heat_on_c);
    prefs.putFloat("cl_nheat_off",  _thresholds.night_heat_off_c);
    prefs.putFloat("cl_ncool_on",   _thresholds.night_cool_on_c);
    prefs.putFloat("cl_ncool_off",  _thresholds.night_cool_off_c);

    prefs.end();

    logMsg("INFO", "[CLIMATE] Thresholds saved to NVS");
}

// ============================================================================
// Relay control — ACTIVE LOW: LOW = ON, HIGH = OFF
// ============================================================================
void ClimateController::_setRelay(uint8_t pin, bool on) {
    if (testMode.isEnabled()) {
        // In test mode, do not actuate real relays
        return;
    }
    digitalWrite(pin, on ? LOW : HIGH);
}

// ============================================================================
// State change logging
// ============================================================================
void ClimateController::_logStateChange(const char* device, bool on, const char* trigger) {
    unsigned long ms = millis();
    unsigned long secs = ms / 1000;
    int h = (secs / 3600) % 24;
    int m = (secs / 60) % 60;
    int s = secs % 60;

    Serial.printf("[%02d:%02d:%02d] [CLIMATE] %s %s (%s)\n",
                  h, m, s, device, on ? "ON" : "OFF", trigger);
}

// ============================================================================
// Heater control — mutual exclusion with cooling
// ============================================================================
void ClimateController::setHeater(bool on) {
    if (on && _state.cooling_on) {
        // Mutual exclusion: turn off cooling first
        setCooling(false);
    }

    if (on && !_state.heater_on) {
        _setRelay(RELAY_HEATER_PIN, true);
        _state.heater_on = true;
        _state.heater_on_since_ms = millis();
        _state.heater_safety_tripped = false;
        _logStateChange("Heater", true, "command");
        logMsg("INFO", "[CLIMATE] Heater ON");
    } else if (!on && _state.heater_on) {
        _setRelay(RELAY_HEATER_PIN, false);
        _state.heater_on = false;
        _state.heater_on_since_ms = 0;
        _logStateChange("Heater", false, "command");
        logMsg("INFO", "[CLIMATE] Heater OFF");
    }
}

// ============================================================================
// Cooling control — mutual exclusion with heater
// ============================================================================
void ClimateController::setCooling(bool on) {
    if (on && _state.heater_on) {
        // Mutual exclusion: turn off heater first
        setHeater(false);
    }

    if (on && !_state.cooling_on) {
        _setRelay(RELAY_COOLING_PIN, true);
        _state.cooling_on = true;
        _state.cooling_on_since_ms = millis();
        _state.cooling_safety_tripped = false;
        _logStateChange("Cooling", true, "command");
        logMsg("INFO", "[CLIMATE] Cooling ON");
    } else if (!on && _state.cooling_on) {
        _setRelay(RELAY_COOLING_PIN, false);
        _state.cooling_on = false;
        _state.cooling_on_since_ms = 0;
        _logStateChange("Cooling", false, "command");
        logMsg("INFO", "[CLIMATE] Cooling OFF");
    }
}

// ============================================================================
// Dehumidifier control — simple relay
// ============================================================================
void ClimateController::setDehumidifier(bool on) {
    if (on && !_state.dehumidifier_on) {
        _setRelay(RELAY_DEHUMID_PIN, true);
        _state.dehumidifier_on = true;
        _state.dehumid_on_since_ms = millis();
        _logStateChange("Dehumidifier", true, "command");
        logMsg("INFO", "[CLIMATE] Dehumidifier ON");
    } else if (!on && _state.dehumidifier_on) {
        _setRelay(RELAY_DEHUMID_PIN, false);
        _state.dehumidifier_on = false;
        _state.dehumid_on_since_ms = 0;
        _logStateChange("Dehumidifier", false, "command");
        logMsg("INFO", "[CLIMATE] Dehumidifier OFF");
    }
}

// ============================================================================
// Spare relay control — simple relay
// ============================================================================
void ClimateController::setSpare(bool on) {
    if (on && !_state.spare_on) {
        _setRelay(RELAY_SPARE2_PIN, true);
        _state.spare_on = true;
        _logStateChange("Spare", true, "command");
        logMsg("INFO", "[CLIMATE] Spare relay ON");
    } else if (!on && _state.spare_on) {
        _setRelay(RELAY_SPARE2_PIN, false);
        _state.spare_on = false;
        _logStateChange("Spare", false, "command");
        logMsg("INFO", "[CLIMATE] Spare relay OFF");
    }
}

// ============================================================================
// All off — turn off all 4 climate relays
// ============================================================================
void ClimateController::allOff() {
    setHeater(false);
    setCooling(false);
    setDehumidifier(false);
    setSpare(false);
    logMsg("INFO", "[CLIMATE] All climate relays OFF");
}

// ============================================================================
// update() — safety timer checks
// ============================================================================
void ClimateController::update() {
    unsigned long now = millis();

    // Heater safety: if sensor_error and heater has been on > safety limit, trip
    if (_state.heater_on && _state.sensor_error) {
        unsigned long on_ms = now - _state.heater_on_since_ms;
        unsigned long limit_ms = (unsigned long)_thresholds.heater_safety_min * 60000UL;
        if (on_ms > limit_ms) {
            _setRelay(RELAY_HEATER_PIN, false);
            _state.heater_on = false;
            _state.heater_on_since_ms = 0;
            _state.heater_safety_tripped = true;
            _logStateChange("Heater", false, "SAFETY: sensor error timeout");
            logMsg("WARN", "[CLIMATE] Heater SAFETY OFF — sensor error for >%lu min",
                   _thresholds.heater_safety_min);
        }
    }

    // Cooling safety: if sensor_error and cooling has been on > safety limit, trip
    if (_state.cooling_on && _state.sensor_error) {
        unsigned long on_ms = now - _state.cooling_on_since_ms;
        unsigned long limit_ms = (unsigned long)_thresholds.cooling_safety_min * 60000UL;
        if (on_ms > limit_ms) {
            _setRelay(RELAY_COOLING_PIN, false);
            _state.cooling_on = false;
            _state.cooling_on_since_ms = 0;
            _state.cooling_safety_tripped = true;
            _logStateChange("Cooling", false, "SAFETY: sensor error timeout");
            logMsg("WARN", "[CLIMATE] Cooling SAFETY OFF — sensor error for >%lu min",
                   _thresholds.cooling_safety_min);
        }
    }
}

// ============================================================================
// isDaytime() — check schedule, default true if NTP not synced
// ============================================================================
bool ClimateController::isDaytime() {
    if (!_thresholds.schedule_enabled) {
        return true;  // Default to daytime thresholds when schedule disabled
    }

    struct tm timeinfo;
    if (!getLocalTime(&timeinfo, 0)) {
        // NTP not synced — default to daytime
        return true;
    }

    uint8_t hour = timeinfo.tm_hour;
    uint8_t dayStart = _thresholds.day_start_hour;
    uint8_t nightStart = _thresholds.night_start_hour;

    if (dayStart < nightStart) {
        // Normal: day=6, night=22 → daytime is 6..21
        return (hour >= dayStart && hour < nightStart);
    } else {
        // Inverted: day=22, night=6 → daytime is 22..5
        return (hour >= dayStart || hour < nightStart);
    }
}

// ============================================================================
// Active threshold getters — return day or night values
// ============================================================================
float ClimateController::getActiveHeatOnC() {
    return isDaytime() ? _thresholds.heat_on_c : _thresholds.night_heat_on_c;
}

float ClimateController::getActiveHeatOffC() {
    return isDaytime() ? _thresholds.heat_off_c : _thresholds.night_heat_off_c;
}

float ClimateController::getActiveCoolOnC() {
    return isDaytime() ? _thresholds.cool_on_c : _thresholds.night_cool_on_c;
}

float ClimateController::getActiveCoolOffC() {
    return isDaytime() ? _thresholds.cool_off_c : _thresholds.night_cool_off_c;
}

// ============================================================================
// Getters / Setters
// ============================================================================
ClimateState ClimateController::getState() const {
    return _state;
}

ClimateThresholds ClimateController::getThresholds() const {
    return _thresholds;
}

void ClimateController::setThresholds(const ClimateThresholds& t) {
    _thresholds = t;
}

void ClimateController::setSensorError(bool err) {
    _state.sensor_error = err;
}
