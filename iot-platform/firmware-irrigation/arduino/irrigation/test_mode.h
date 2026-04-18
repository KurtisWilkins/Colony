#ifndef TEST_MODE_H
#define TEST_MODE_H

#include <Arduino.h>
#include "config.h"

// ============================================================================
// Virtual Zone States — tracks commanded zone states without physically
// activating any relay. All 16 zones have virtual open/close tracking.
// ============================================================================
struct VirtualZoneState {
    bool     is_open;
    unsigned long opened_at_ms;
};

class TestMode {
public:
    TestMode();

    // Enable or disable test mode
    void enable();
    void disable();
    bool isEnabled() const;

    // Load/save test mode state from/to NVS
    void loadFromNVS();
    void saveToNVS();

    // Virtual zone controls
    void setZoneOpen(uint8_t zone_index, bool open);
    void closeAllVirtualZones();
    bool isVirtualZoneOpen(uint8_t zone_index) const;

    // Update simulation — cycles through zones with 10-second virtual runs
    void update();

    // Get which zone the test cycle is currently running
    uint8_t getCurrentCycleZone() const;

    // Serial output
    void printStatus() const;
    void printCommandReceived(const String& command, const String& payload) const;
    void printPublished(const String& topic, size_t bytes) const;

private:
    bool _enabled;
    unsigned long _enabledAt;
    VirtualZoneState _zones[NUM_ZONES];

    // Auto-cycle state
    uint8_t  _cycle_zone;           // Current zone in the auto-cycle
    unsigned long _cycle_start_ms;  // When current cycle zone started
    bool     _auto_cycling;         // Whether the auto-cycle is running
};

extern TestMode testMode;

#endif // TEST_MODE_H
