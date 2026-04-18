#include "scheduler.h"
#include "zone_manager.h"
#include "ntp_client.h"
#include "storage.h"
#include "test_mode.h"
#include <Preferences.h>

Scheduler scheduler;

extern void logMsg(const char* level, const char* fmt, ...);
extern void publishZoneEvent(const char* event, uint8_t zone_index, const char* reason);

Scheduler::Scheduler()
    : _last_check_ms(0)
    , _recent_rainfall_mm(0.0f)
{
}

// ============================================================================
// begin() — Load schedules and seasonal configs from NVS
// ============================================================================
void Scheduler::begin() {
    // Initialize all schedules to defaults
    for (uint8_t i = 0; i < MAX_SCHEDULES; i++) {
        _schedules[i].zone_index = i;
        _schedules[i].enabled = false;
        _schedules[i].runtime_s = DEFAULT_ZONE_RUNTIME_S;
        _schedules[i].days_of_week = 0x7F;  // All days enabled by default
        _schedules[i].seasonal_config_index = 255;  // No seasonal config

        for (uint8_t w = 0; w < MAX_TIME_WINDOWS; w++) {
            _schedules[i].windows[w].start_hour = 6;
            _schedules[i].windows[w].start_minute = 0;
            _schedules[i].windows[w].end_hour = 6;
            _schedules[i].windows[w].end_minute = 30;
            _schedules[i].windows[w].enabled = false;
        }
    }

    // Initialize seasonal configs
    for (uint8_t i = 0; i < MAX_SEASONAL_CONFIGS; i++) {
        _seasonal[i].name = "";
        _seasonal[i].start_month = 0;
        _seasonal[i].start_day = 1;
        _seasonal[i].end_month = 11;
        _seasonal[i].end_day = 31;
        _seasonal[i].runtime_multiplier = 1.0f;
        _seasonal[i].skip_if_rained = false;
        _seasonal[i].rain_threshold_mm = 5.0f;
    }

    loadSchedules();
    loadSeasonalConfigs();

    logMsg("INFO", "Scheduler initialized");
}

// ============================================================================
// update() — Called every loop, checks schedules every 60 seconds
// ============================================================================
void Scheduler::update() {
    unsigned long now = millis();

    if (now - _last_check_ms < SCHEDULE_CHECK_MS) return;
    _last_check_ms = now;

    // Only evaluate schedules if NTP time is synced
    if (!ntpClient.isTimeSynced()) {
        return;
    }

    evaluateSchedules();
}

// ============================================================================
// evaluateSchedules() — Check each schedule and queue zones as needed
// ============================================================================
void Scheduler::evaluateSchedules() {
    int hour    = ntpClient.getCurrentHour();
    int minute  = ntpClient.getCurrentMinute();
    int dow     = ntpClient.getDayOfWeek();
    int month   = ntpClient.getMonth();
    int day     = ntpClient.getDay();

    // Don't schedule if a queue is already running
    if (zoneManager.isQueueRunning()) return;

    bool any_triggered = false;

    for (uint8_t i = 0; i < MAX_SCHEDULES; i++) {
        if (!_schedules[i].enabled) continue;

        uint8_t zi = _schedules[i].zone_index;
        if (zi >= NUM_ZONES) continue;
        if (!zoneManager.zones[zi].enabled) continue;

        // Check day of week
        if (!isDayEnabled(_schedules[i].days_of_week, dow)) continue;

        // Check seasonal config
        uint8_t si = _schedules[i].seasonal_config_index;
        if (si < MAX_SEASONAL_CONFIGS) {
            if (!isInSeason(_seasonal[si], month, day)) continue;
        }

        // Check if any time window matches the current time
        bool window_match = false;
        for (uint8_t w = 0; w < MAX_TIME_WINDOWS; w++) {
            if (!_schedules[i].windows[w].enabled) continue;
            if (isTimeWindowActive(_schedules[i].windows[w], hour, minute)) {
                window_match = true;
                break;
            }
        }

        if (!window_match) continue;

        // Check weather skip
        if (shouldSkipForWeather(si)) {
            logMsg("INFO", "Schedule: skipping zone %d (%s) due to recent rainfall %.1fmm",
                   zi, zoneManager.zones[zi].name.c_str(), _recent_rainfall_mm);
            publishZoneEvent("skip", zi, "weather_skip");
            continue;
        }

        // Calculate effective runtime with seasonal multiplier
        float multiplier = getSeasonalMultiplier(si);
        uint16_t effective_runtime = (uint16_t)(_schedules[i].runtime_s * multiplier);
        if (effective_runtime == 0) effective_runtime = DEFAULT_ZONE_RUNTIME_S;

        // Queue this zone
        if (zoneManager.queueZone(zi, effective_runtime)) {
            any_triggered = true;
            logMsg("INFO", "Schedule: queued zone %d (%s) for %ds (multiplier=%.1f)",
                   zi, zoneManager.zones[zi].name.c_str(), effective_runtime, multiplier);
        }
    }

    // If any zones were queued, start the queue
    if (any_triggered) {
        zoneManager.startQueue();
    }
}

// ============================================================================
// isTimeWindowActive() — Check if current time falls on the start minute
// ============================================================================
// We only trigger at the exact start time (hour:minute match) since the
// scheduler runs every 60 seconds. This prevents re-triggering during
// the window duration.
// ============================================================================
bool Scheduler::isTimeWindowActive(const TimeWindow& tw, int hour, int minute) {
    return (hour == tw.start_hour && minute == tw.start_minute);
}

// ============================================================================
// isDayEnabled() — Check day-of-week bitmask
// ============================================================================
bool Scheduler::isDayEnabled(uint8_t days_bitmask, int day_of_week) {
    return (days_bitmask & (1 << day_of_week)) != 0;
}

// ============================================================================
// isInSeason() — Check if current date is within seasonal date range
// ============================================================================
bool Scheduler::isInSeason(const SeasonalConfig& sc, int month, int day) {
    // Convert to day-of-year for comparison
    int current = month * 31 + day;
    int start   = sc.start_month * 31 + sc.start_day;
    int end     = sc.end_month * 31 + sc.end_day;

    if (start <= end) {
        // Normal range (e.g., March to October)
        return (current >= start && current <= end);
    } else {
        // Wrapping range (e.g., November to February)
        return (current >= start || current <= end);
    }
}

// ============================================================================
// getSeasonalMultiplier() — Get runtime multiplier for active seasonal config
// ============================================================================
float Scheduler::getSeasonalMultiplier(uint8_t seasonal_index) {
    if (seasonal_index >= MAX_SEASONAL_CONFIGS) return 1.0f;

    int month = ntpClient.getMonth();
    int day   = ntpClient.getDay();

    if (isInSeason(_seasonal[seasonal_index], month, day)) {
        return _seasonal[seasonal_index].runtime_multiplier;
    }
    return 1.0f;
}

// ============================================================================
// shouldSkipForWeather() — Check if irrigation should be skipped due to rain
// ============================================================================
bool Scheduler::shouldSkipForWeather(uint8_t seasonal_index) {
    if (seasonal_index >= MAX_SEASONAL_CONFIGS) return false;
    if (!_seasonal[seasonal_index].skip_if_rained) return false;
    return (_recent_rainfall_mm >= _seasonal[seasonal_index].rain_threshold_mm);
}

// ============================================================================
// Setters / Getters
// ============================================================================

void Scheduler::setSchedule(uint8_t zone_index, const ZoneSchedule& schedule) {
    if (zone_index >= MAX_SCHEDULES) return;
    _schedules[zone_index] = schedule;
    saveSchedules();
    logMsg("INFO", "Schedule updated for zone %d", zone_index);
}

const ZoneSchedule& Scheduler::getSchedule(uint8_t zone_index) const {
    static ZoneSchedule dummy;
    if (zone_index >= MAX_SCHEDULES) return dummy;
    return _schedules[zone_index];
}

void Scheduler::setSeasonalConfig(uint8_t index, const SeasonalConfig& config) {
    if (index >= MAX_SEASONAL_CONFIGS) return;
    _seasonal[index] = config;
    saveSeasonalConfigs();
    logMsg("INFO", "Seasonal config %d (%s) updated", index, config.name.c_str());
}

const SeasonalConfig& Scheduler::getSeasonalConfig(uint8_t index) const {
    static SeasonalConfig dummy;
    if (index >= MAX_SEASONAL_CONFIGS) return dummy;
    return _seasonal[index];
}

void Scheduler::setRecentRainfall(float mm) {
    _recent_rainfall_mm = mm;
    logMsg("INFO", "Recent rainfall updated: %.1fmm", mm);
}

float Scheduler::getRecentRainfall() const {
    return _recent_rainfall_mm;
}

// ============================================================================
// NVS Persistence — Schedules
// ============================================================================
// NVS key length limit is 15 chars. We pack schedule data as binary blobs.
// ============================================================================

void Scheduler::saveSchedules() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);

    for (uint8_t i = 0; i < MAX_SCHEDULES; i++) {
        char key[16];

        // Schedule enabled and runtime
        snprintf(key, sizeof(key), "sc%d_en", i);
        prefs.putBool(key, _schedules[i].enabled);

        snprintf(key, sizeof(key), "sc%d_rt", i);
        prefs.putUShort(key, _schedules[i].runtime_s);

        snprintf(key, sizeof(key), "sc%d_days", i);
        prefs.putUChar(key, _schedules[i].days_of_week);

        snprintf(key, sizeof(key), "sc%d_seas", i);
        prefs.putUChar(key, _schedules[i].seasonal_config_index);

        // Time windows packed as 4 bytes each: start_h, start_m, end_h, end_m
        // Plus 1 byte for enabled flags
        for (uint8_t w = 0; w < MAX_TIME_WINDOWS; w++) {
            snprintf(key, sizeof(key), "sc%d_w%d", i, w);
            uint8_t packed[5];
            packed[0] = _schedules[i].windows[w].start_hour;
            packed[1] = _schedules[i].windows[w].start_minute;
            packed[2] = _schedules[i].windows[w].end_hour;
            packed[3] = _schedules[i].windows[w].end_minute;
            packed[4] = _schedules[i].windows[w].enabled ? 1 : 0;
            prefs.putBytes(key, packed, 5);
        }
    }

    prefs.end();
}

void Scheduler::loadSchedules() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);

    for (uint8_t i = 0; i < MAX_SCHEDULES; i++) {
        char key[16];

        _schedules[i].zone_index = i;

        snprintf(key, sizeof(key), "sc%d_en", i);
        _schedules[i].enabled = prefs.getBool(key, false);

        snprintf(key, sizeof(key), "sc%d_rt", i);
        _schedules[i].runtime_s = prefs.getUShort(key, DEFAULT_ZONE_RUNTIME_S);

        snprintf(key, sizeof(key), "sc%d_days", i);
        _schedules[i].days_of_week = prefs.getUChar(key, 0x7F);

        snprintf(key, sizeof(key), "sc%d_seas", i);
        _schedules[i].seasonal_config_index = prefs.getUChar(key, 255);

        for (uint8_t w = 0; w < MAX_TIME_WINDOWS; w++) {
            snprintf(key, sizeof(key), "sc%d_w%d", i, w);
            uint8_t packed[5] = {6, 0, 6, 30, 0};  // Defaults
            prefs.getBytes(key, packed, 5);
            _schedules[i].windows[w].start_hour   = packed[0];
            _schedules[i].windows[w].start_minute  = packed[1];
            _schedules[i].windows[w].end_hour      = packed[2];
            _schedules[i].windows[w].end_minute    = packed[3];
            _schedules[i].windows[w].enabled       = (packed[4] != 0);
        }
    }

    prefs.end();
    logMsg("INFO", "Schedules loaded from NVS");
}

// ============================================================================
// NVS Persistence — Seasonal Configs
// ============================================================================

void Scheduler::saveSeasonalConfigs() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, false);

    for (uint8_t i = 0; i < MAX_SEASONAL_CONFIGS; i++) {
        char key[16];

        snprintf(key, sizeof(key), "ss%d_name", i);
        prefs.putString(key, _seasonal[i].name);

        // Pack date range + settings into a blob
        snprintf(key, sizeof(key), "ss%d_data", i);
        uint8_t packed[10];
        packed[0] = _seasonal[i].start_month;
        packed[1] = _seasonal[i].start_day;
        packed[2] = _seasonal[i].end_month;
        packed[3] = _seasonal[i].end_day;
        packed[4] = _seasonal[i].skip_if_rained ? 1 : 0;

        // Pack multiplier as fixed-point (multiply by 100)
        uint16_t mult_fp = (uint16_t)(_seasonal[i].runtime_multiplier * 100.0f);
        packed[5] = (uint8_t)(mult_fp >> 8);
        packed[6] = (uint8_t)(mult_fp & 0xFF);

        // Pack rain threshold as fixed-point (multiply by 10)
        uint16_t rain_fp = (uint16_t)(_seasonal[i].rain_threshold_mm * 10.0f);
        packed[7] = (uint8_t)(rain_fp >> 8);
        packed[8] = (uint8_t)(rain_fp & 0xFF);

        packed[9] = 0;  // Reserved

        prefs.putBytes(key, packed, 10);
    }

    prefs.end();
}

void Scheduler::loadSeasonalConfigs() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);

    for (uint8_t i = 0; i < MAX_SEASONAL_CONFIGS; i++) {
        char key[16];

        snprintf(key, sizeof(key), "ss%d_name", i);
        _seasonal[i].name = prefs.getString(key, "");

        snprintf(key, sizeof(key), "ss%d_data", i);
        uint8_t packed[10] = {0, 1, 11, 31, 0, 0, 100, 0, 50, 0};  // Defaults
        prefs.getBytes(key, packed, 10);

        _seasonal[i].start_month = packed[0];
        _seasonal[i].start_day   = packed[1];
        _seasonal[i].end_month   = packed[2];
        _seasonal[i].end_day     = packed[3];
        _seasonal[i].skip_if_rained = (packed[4] != 0);

        uint16_t mult_fp = ((uint16_t)packed[5] << 8) | packed[6];
        _seasonal[i].runtime_multiplier = mult_fp / 100.0f;
        if (_seasonal[i].runtime_multiplier < 0.1f) _seasonal[i].runtime_multiplier = 1.0f;

        uint16_t rain_fp = ((uint16_t)packed[7] << 8) | packed[8];
        _seasonal[i].rain_threshold_mm = rain_fp / 10.0f;
    }

    prefs.end();
    logMsg("INFO", "Seasonal configs loaded from NVS");
}
