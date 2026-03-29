#pragma once
#include <Arduino.h>
#include "config.h"

struct ClimateState {
    bool heater_on;
    bool cooling_on;
    bool dehumidifier_on;
    bool spare_on;
    unsigned long heater_on_since_ms;
    unsigned long cooling_on_since_ms;
    unsigned long dehumid_on_since_ms;
    bool heater_safety_tripped;
    bool cooling_safety_tripped;
    bool sensor_error;
};

struct ClimateThresholds {
    float heat_on_c;
    float heat_off_c;
    float cool_on_c;
    float cool_off_c;
    float dehumid_on_pct;
    float dehumid_off_pct;
    uint32_t heater_safety_min;
    uint32_t cooling_safety_min;
    bool climate_enabled;
    bool schedule_enabled;
    uint8_t day_start_hour;
    uint8_t night_start_hour;
    float night_heat_on_c;
    float night_heat_off_c;
    float night_cool_on_c;
    float night_cool_off_c;
};

class ClimateController {
public:
    ClimateController();
    void begin();
    void loadFromNVS();
    void saveToNVS();
    void setHeater(bool on);
    void setCooling(bool on);
    void setDehumidifier(bool on);
    void setSpare(bool on);
    void allOff();
    void update();
    bool isDaytime();
    float getActiveHeatOnC();
    float getActiveHeatOffC();
    float getActiveCoolOnC();
    float getActiveCoolOffC();
    ClimateState getState() const;
    ClimateThresholds getThresholds() const;
    void setThresholds(const ClimateThresholds& t);
    void setSensorError(bool err);
private:
    ClimateState _state;
    ClimateThresholds _thresholds;
    void _setRelay(uint8_t pin, bool on);
    void _logStateChange(const char* device, bool on, const char* trigger);
};

extern ClimateController climateController;
