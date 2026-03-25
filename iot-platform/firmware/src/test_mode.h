#ifndef TEST_MODE_H
#define TEST_MODE_H

#include <Arduino.h>
#include "config.h"

// Simulated sensor data structure — mirrors real sensor readings
struct SimulatedReadings {
    float temperature_c;
    float humidity_pct;
    float pressure_hpa;
    int   co2_ppm;
    float tank_depth_cm;
    int   tank_pct;
    float flow_rate_lpm;
    float session_liters;
};

// Virtual actuator state — tracks commanded state without
// physically activating anything
struct VirtualActuatorState {
    bool  fan_on;
    int   fan_speed_pct;
    bool  mister_on;
    bool  valve_open;
    unsigned long valve_opened_at_ms;
    float session_liters_virtual;
};

class TestMode {
public:
    TestMode();

    // Enable or disable test mode
    void enable();
    void disable();
    bool isEnabled() const;

    // Load/save test mode state from NVS
    void loadFromNVS();
    void saveToNVS();

    // Generate next set of simulated readings
    SimulatedReadings generateReadings();

    // Update virtual actuator state when command received
    void setFanOn(bool on);
    void setFanSpeed(int pct);
    void setMisterOn(bool on);
    void setValveOpen(bool open);
    VirtualActuatorState getActuatorState() const;

    // Update simulation engine each loop iteration
    void update();

    // Get simulation phase description for serial logging
    String getPhaseDescription() const;

    // Get cycle progress 0-100
    int getCycleProgressPct() const;

    // Serial monitor output
    void printStatus(const SimulatedReadings& readings) const;
    void printCommandReceived(const String& command, const String& payload) const;
    void printPublished(const String& topic, size_t bytes) const;

private:
    bool _enabled;
    unsigned long _enabledAt;      // millis() when test mode was enabled
    unsigned long _cycleStartMs;   // millis() when current cycle started
    VirtualActuatorState _actuators;

    // Simulation engine
    float _cycleProgress() const;  // 0.0 to 1.0 through current cycle
    float _sine(float progress, float minVal, float maxVal) const;
    float _simulateHumidity(float progress) const;
    float _simulateCO2(float progress) const;
    float _simulateTemperature(float progress) const;
    float _simulateTankDepth(float progress) const;
    float _simulateFlowRate() const;
    float _simulatePressure(float progress) const;
};

extern TestMode testMode;

#endif // TEST_MODE_H
