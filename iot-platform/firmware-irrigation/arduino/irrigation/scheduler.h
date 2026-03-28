#ifndef SCHEDULER_H
#define SCHEDULER_H

#include <Arduino.h>
#include "config.h"

// ============================================================================
// Time Window — a start/end time pair for a schedule
// ============================================================================
struct TimeWindow {
    uint8_t start_hour;     // 0-23
    uint8_t start_minute;   // 0-59
    uint8_t end_hour;       // 0-23 (used for display; actual end = start + runtime)
    uint8_t end_minute;     // 0-59
    bool    enabled;
};

// ============================================================================
// Seasonal Configuration — modifies schedule behavior by date range
// ============================================================================
struct SeasonalConfig {
    String  name;               // e.g. "Summer", "Winter"
    uint8_t start_month;        // 0-11 (January=0)
    uint8_t start_day;          // 1-31
    uint8_t end_month;          // 0-11
    uint8_t end_day;            // 1-31
    float   runtime_multiplier; // 1.0 = normal, 1.5 = 50% longer, 0.5 = 50% shorter
    bool    skip_if_rained;     // Skip irrigation if recent rain detected
    float   rain_threshold_mm;  // Rain amount threshold for skip (mm)
};

// ============================================================================
// Zone Schedule — ties a zone to time windows and optional seasonal config
// ============================================================================
struct ZoneSchedule {
    uint8_t       zone_index;
    bool          enabled;
    uint16_t      runtime_s;                            // Default runtime for this schedule
    TimeWindow    windows[MAX_TIME_WINDOWS];            // Up to 4 time windows
    uint8_t       days_of_week;                         // Bitmask: bit0=Sun, bit1=Mon, ... bit6=Sat
    uint8_t       seasonal_config_index;                // Index into seasonal configs (255=none)
};

class Scheduler {
public:
    Scheduler();

    void begin();

    // Called every loop — checks schedules every SCHEDULE_CHECK_MS
    void update();

    // Set schedule for a zone
    void setSchedule(uint8_t zone_index, const ZoneSchedule& schedule);
    const ZoneSchedule& getSchedule(uint8_t zone_index) const;

    // Set seasonal config
    void setSeasonalConfig(uint8_t index, const SeasonalConfig& config);
    const SeasonalConfig& getSeasonalConfig(uint8_t index) const;

    // Weather data (set externally via MQTT)
    void setRecentRainfall(float mm);
    float getRecentRainfall() const;

    // Save/load schedules to/from NVS
    void saveSchedules();
    void loadSchedules();
    void saveSeasonalConfigs();
    void loadSeasonalConfigs();

private:
    ZoneSchedule    _schedules[MAX_SCHEDULES];
    SeasonalConfig  _seasonal[MAX_SEASONAL_CONFIGS];
    unsigned long   _last_check_ms;
    float           _recent_rainfall_mm;

    // Evaluation
    void evaluateSchedules();
    bool isTimeWindowActive(const TimeWindow& tw, int hour, int minute);
    bool isDayEnabled(uint8_t days_bitmask, int day_of_week);
    bool isInSeason(const SeasonalConfig& sc, int month, int day);
    float getSeasonalMultiplier(uint8_t seasonal_index);
    bool shouldSkipForWeather(uint8_t seasonal_index);
};

extern Scheduler scheduler;

#endif // SCHEDULER_H
