#include "test_mode.h"
#include "storage.h"
#include "zone_manager.h"
#include <WiFi.h>
#include <Preferences.h>

TestMode testMode;

extern void logMsg(const char* level, const char* fmt, ...);

TestMode::TestMode()
    : _enabled(false)
    , _enabledAt(0)
    , _cycle_zone(0)
    , _cycle_start_ms(0)
    , _auto_cycling(false)
{
    memset(_zones, 0, sizeof(_zones));
}

// ============================================================================
// enable() — Activate test mode
// ============================================================================
void TestMode::enable() {
    _enabled = true;
    _enabledAt = millis();
    _cycle_zone = 0;
    _cycle_start_ms = millis();
    _auto_cycling = true;
    memset(_zones, 0, sizeof(_zones));
    saveToNVS();

    Serial.println();
    Serial.println("=====================================");
    logMsg("TEST", "TEST MODE ENABLED");
    Serial.println("  All relay outputs SUPPRESSED.");
    Serial.println("  Virtual zone states will be cycled.");
    Serial.printf("  Cycle time: %ds per zone\n", TEST_ZONE_CYCLE_S);
    Serial.printf("  WiFi: %s\n",
                  WiFi.status() == WL_CONNECTED ? "CONNECTED" : "DISCONNECTED");
    Serial.printf("  Device: %s/%s/%s/%s\n",
                  storage.data.facility.c_str(),
                  storage.data.building.c_str(),
                  storage.data.unit.c_str(),
                  storage.data.device_name.c_str());
    Serial.printf("  Active zones: %d of %d\n", storage.data.zone_count, NUM_ZONES);
    Serial.println("=====================================");
    Serial.println();
}

// ============================================================================
// disable() — Deactivate test mode
// ============================================================================
void TestMode::disable() {
    _enabled = false;
    _auto_cycling = false;
    memset(_zones, 0, sizeof(_zones));
    saveToNVS();

    Serial.println();
    Serial.println("=====================================");
    logMsg("TEST", "TEST MODE DISABLED");
    Serial.println("  Returning to normal relay operation.");
    Serial.println("  Virtual zone states cleared.");
    Serial.println("  Real relays will be activated on command.");
    Serial.println("=====================================");
    Serial.println();
}

bool TestMode::isEnabled() const {
    return _enabled;
}

// ============================================================================
// NVS Persistence
// ============================================================================

void TestMode::loadFromNVS() {
    Preferences prefs;
    prefs.begin(NVS_NAMESPACE, true);
    _enabled = prefs.getBool("test_mode_on", TEST_MODE_DEFAULT);
    prefs.end();

    if (_enabled) {
        _enabledAt = millis();
        _cycle_zone = 0;
        _cycle_start_ms = millis();
        _auto_cycling = true;
        memset(_zones, 0, sizeof(_zones));

        Serial.println();
        Serial.println("=====================================");
        logMsg("WARN", "DEVICE STARTING IN TEST MODE");
        Serial.println("  Real relays will NOT be activated.");
        Serial.println("  Virtual zone cycling is active.");
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

// ============================================================================
// Virtual Zone Controls
// ============================================================================

void TestMode::setZoneOpen(uint8_t zone_index, bool open) {
    if (zone_index >= NUM_ZONES) return;
    _zones[zone_index].is_open = open;
    _zones[zone_index].opened_at_ms = open ? millis() : 0;
}

void TestMode::closeAllVirtualZones() {
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        _zones[i].is_open = false;
        _zones[i].opened_at_ms = 0;
    }
}

bool TestMode::isVirtualZoneOpen(uint8_t zone_index) const {
    if (zone_index >= NUM_ZONES) return false;
    return _zones[zone_index].is_open;
}

// ============================================================================
// update() — Auto-cycle through zones every TEST_ZONE_CYCLE_S seconds
// ============================================================================
// In test mode, this cycles through each configured zone for 10 seconds
// each, simulating a complete irrigation program run. This produces rich
// serial output and MQTT telemetry showing zone transitions.
// ============================================================================
void TestMode::update() {
    if (!_enabled || !_auto_cycling) return;

    unsigned long now = millis();
    unsigned long cycle_ms = (unsigned long)TEST_ZONE_CYCLE_S * 1000UL;

    if (now - _cycle_start_ms >= cycle_ms) {
        // Close current zone
        if (_cycle_zone < NUM_ZONES) {
            _zones[_cycle_zone].is_open = false;
            _zones[_cycle_zone].opened_at_ms = 0;

            logMsg("TEST", "Virtual zone %d (%s) CLOSED after %ds cycle",
                   _cycle_zone,
                   zoneManager.zones[_cycle_zone].name.c_str(),
                   TEST_ZONE_CYCLE_S);
        }

        // Advance to next enabled zone
        uint8_t start = _cycle_zone;
        do {
            _cycle_zone++;
            if (_cycle_zone >= storage.data.zone_count) {
                _cycle_zone = 0;
            }
            // Break if we've wrapped around completely
            if (_cycle_zone == start) break;
        } while (!zoneManager.zones[_cycle_zone].enabled);

        // Open the new zone
        _zones[_cycle_zone].is_open = true;
        _zones[_cycle_zone].opened_at_ms = now;
        _cycle_start_ms = now;

        Serial.println();
        logMsg("TEST", "Virtual zone %d (%s) OPENED — cycling [%d/%d]",
               _cycle_zone,
               zoneManager.zones[_cycle_zone].name.c_str(),
               _cycle_zone + 1,
               storage.data.zone_count);
        Serial.printf("  GPIO pin  : %d (not activated in test mode)\n",
                      zoneManager.zones[_cycle_zone].gpio_pin);
        Serial.printf("  Runtime   : %ds (virtual)\n", TEST_ZONE_CYCLE_S);
        Serial.printf("  Group     : %d\n", zoneManager.zones[_cycle_zone].group);
        Serial.printf("  Publishing: %s/%s/%s/%s/telemetry\n",
                      storage.data.facility.c_str(),
                      storage.data.building.c_str(),
                      storage.data.unit.c_str(),
                      storage.data.device_name.c_str());
    }
}

uint8_t TestMode::getCurrentCycleZone() const {
    return _cycle_zone;
}

// ============================================================================
// Serial Output
// ============================================================================

void TestMode::printStatus() const {
    Serial.println();
    logMsg("TEST", "VIRTUAL ZONE STATUS");

    uint8_t open_count = 0;
    for (uint8_t i = 0; i < storage.data.zone_count; i++) {
        if (_zones[i].is_open) {
            open_count++;
            unsigned long elapsed = (millis() - _zones[i].opened_at_ms) / 1000;
            Serial.printf("  Zone %2d (%s): OPEN for %lus (virtual)\n",
                          i, zoneManager.zones[i].name.c_str(), elapsed);
        }
    }

    if (open_count == 0) {
        Serial.println("  All zones CLOSED (virtual)");
    }

    Serial.printf("  Auto-cycling: %s | Current: Zone %d | Cycle: %ds\n",
                  _auto_cycling ? "YES" : "NO",
                  _cycle_zone,
                  TEST_ZONE_CYCLE_S);
}

void TestMode::printCommandReceived(const String& command, const String& payload) const {
    Serial.println();
    Serial.println("=====================================");
    logMsg("TEST", "COMMAND RECEIVED");
    Serial.printf("  Command   : %s\n", command.c_str());
    if (payload.length() > 0) {
        Serial.printf("  Payload   : %s\n", payload.c_str());
    }
}

void TestMode::printPublished(const String& topic, size_t bytes) const {
    logMsg("TEST", "Published telemetry (%d bytes) to %s", bytes, topic.c_str());
    logMsg("TEST", "Awaiting next publish in %ds", TEST_TELEMETRY_S);
}
