#include "zone_manager.h"
#include "relays.h"
#include "storage.h"
#include "test_mode.h"
#include "config.h"

ZoneManager zoneManager;

extern void logMsg(const char* level, const char* fmt, ...);

// Forward declaration for MQTT zone event publishing
extern void publishZoneEvent(const char* event, uint8_t zone_index, const char* reason);

ZoneManager::ZoneManager()
    : _queue_length(0)
    , _queue_position(0)
    , _queue_running(false)
    , _active_zone(255)
{
}

// ============================================================================
// begin() — Initialize zone structs from storage configuration
// ============================================================================
void ZoneManager::begin() {
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        zones[i].relay_index  = i;
        zones[i].gpio_pin     = relays.pinForZone(i);
        zones[i].name         = storage.data.zones[i].name;
        zones[i].enabled      = storage.data.zones[i].enabled;
        zones[i].runtime_s    = storage.data.zones[i].runtime_s;
        zones[i].group        = storage.data.zones[i].group;
        zones[i].is_open      = false;
        zones[i].opened_at_ms = 0;
        zones[i].daily_runtime_s = 0;
    }
    logMsg("INFO", "Zone manager initialized: %d zones configured", storage.data.zone_count);
}

// ============================================================================
// openZone() — Open a single zone's valve
// ============================================================================
// ACTIVE LOW: openRelay sets pin LOW, energizing the solenoid valve.
// Returns false if zone is disabled, out of range, or already open.
// ============================================================================
bool ZoneManager::openZone(uint8_t zone_index) {
    if (zone_index >= NUM_ZONES) {
        logMsg("ERROR", "openZone: invalid index %d", zone_index);
        return false;
    }

    Zone& z = zones[zone_index];

    if (!z.enabled) {
        logMsg("WARN", "openZone: zone %d (%s) is disabled", zone_index, z.name.c_str());
        return false;
    }

    if (z.is_open) {
        logMsg("WARN", "openZone: zone %d (%s) already open", zone_index, z.name.c_str());
        return false;
    }

    // Check daily runtime limit
    if (z.daily_runtime_s >= storage.data.safety_max_daily_s) {
        logMsg("WARN", "openZone: zone %d (%s) daily limit reached (%us/%us)",
               zone_index, z.name.c_str(), z.daily_runtime_s, storage.data.safety_max_daily_s);
        publishZoneEvent("skip", zone_index, "daily_limit_reached");
        return false;
    }

    if (testMode.isEnabled()) {
        // Virtual open — no physical relay activation
        testMode.setZoneOpen(zone_index, true);
        logMsg("TEST", "Zone %d (%s) OPENED (virtual — no relay activated)", zone_index, z.name.c_str());
    } else {
        // ACTIVE LOW: openRelay sets pin LOW = solenoid energized = valve open
        relays.openRelay(z.gpio_pin);
    }

    z.is_open = true;
    z.opened_at_ms = millis();
    _active_zone = zone_index;

    logMsg("INFO", "Zone %d (%s) OPENED on GPIO %d", zone_index, z.name.c_str(), z.gpio_pin);
    publishZoneEvent("open", zone_index, "command");
    return true;
}

// ============================================================================
// closeZone() — Close a single zone's valve
// ============================================================================
// ACTIVE LOW: closeRelay sets pin HIGH, de-energizing the solenoid valve.
// ============================================================================
bool ZoneManager::closeZone(uint8_t zone_index) {
    if (zone_index >= NUM_ZONES) {
        logMsg("ERROR", "closeZone: invalid index %d", zone_index);
        return false;
    }

    Zone& z = zones[zone_index];

    if (!z.is_open) {
        return false;  // Already closed, no-op
    }

    // Accumulate daily runtime
    if (z.opened_at_ms > 0) {
        unsigned long elapsed_ms = millis() - z.opened_at_ms;
        z.daily_runtime_s += (uint32_t)(elapsed_ms / 1000);
    }

    if (testMode.isEnabled()) {
        testMode.setZoneOpen(zone_index, false);
        logMsg("TEST", "Zone %d (%s) CLOSED (virtual — no relay activated)", zone_index, z.name.c_str());
    } else {
        // ACTIVE LOW: closeRelay sets pin HIGH = solenoid de-energized = valve closed
        relays.closeRelay(z.gpio_pin);
    }

    z.is_open = false;
    z.opened_at_ms = 0;

    if (_active_zone == zone_index) {
        _active_zone = 255;  // No active zone
    }

    logMsg("INFO", "Zone %d (%s) CLOSED on GPIO %d", zone_index, z.name.c_str(), z.gpio_pin);
    publishZoneEvent("close", zone_index, "command");
    return true;
}

// ============================================================================
// closeAllZones() — Emergency: close every zone immediately
// ============================================================================
void ZoneManager::closeAllZones() {
    // Stop any running queue
    _queue_running = false;
    _queue_length = 0;
    _queue_position = 0;

    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        if (zones[i].is_open) {
            // Accumulate daily runtime before closing
            if (zones[i].opened_at_ms > 0) {
                unsigned long elapsed_ms = millis() - zones[i].opened_at_ms;
                zones[i].daily_runtime_s += (uint32_t)(elapsed_ms / 1000);
            }
            zones[i].is_open = false;
            zones[i].opened_at_ms = 0;
        }
    }

    if (testMode.isEnabled()) {
        testMode.closeAllVirtualZones();
        logMsg("TEST", "ALL ZONES CLOSED (virtual — no relays activated)");
    } else {
        // ACTIVE LOW: closeAllRelays sets all pins HIGH = all valves closed
        relays.closeAllRelays();
    }

    _active_zone = 255;
    logMsg("WARN", "ALL ZONES CLOSED");
    publishZoneEvent("close_all", 255, "emergency");
}

// ============================================================================
// Queue System
// ============================================================================

bool ZoneManager::queueZone(uint8_t zone_index, uint16_t runtime_override_s) {
    if (zone_index >= NUM_ZONES) return false;
    if (!zones[zone_index].enabled) return false;
    if (_queue_length >= MAX_QUEUE_SIZE) {
        logMsg("WARN", "Queue full, cannot add zone %d", zone_index);
        return false;
    }

    _queue[_queue_length].zone_index = zone_index;
    _queue[_queue_length].runtime_s = runtime_override_s;
    _queue_length++;

    logMsg("INFO", "Queued zone %d (%s), queue length=%d",
           zone_index, zones[zone_index].name.c_str(), _queue_length);
    return true;
}

bool ZoneManager::queueProgram(uint8_t group_id) {
    uint8_t count = 0;
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        if (zones[i].enabled && zones[i].group == group_id) {
            if (queueZone(i, 0)) {
                count++;
            }
        }
    }
    logMsg("INFO", "Queued program group %d: %d zones added", group_id, count);
    return count > 0;
}

void ZoneManager::startQueue() {
    if (_queue_length == 0) {
        logMsg("WARN", "Cannot start empty queue");
        return;
    }

    _queue_position = 0;
    _queue_running = true;
    logMsg("INFO", "Queue started: %d zones to run", _queue_length);

    // Open the first zone in the queue
    advanceQueue();
}

void ZoneManager::stopQueue() {
    logMsg("INFO", "Queue stopped at position %d/%d", _queue_position, _queue_length);

    // Close any currently running zone
    if (_active_zone != 255 && zones[_active_zone].is_open) {
        closeZone(_active_zone);
    }

    _queue_running = false;
    _queue_length = 0;
    _queue_position = 0;
}

void ZoneManager::clearQueue() {
    _queue_length = 0;
    _queue_position = 0;
    _queue_running = false;
    logMsg("INFO", "Queue cleared");
}

void ZoneManager::advanceQueue() {
    // Close the current zone if one is open
    if (_active_zone != 255 && zones[_active_zone].is_open) {
        closeZone(_active_zone);
    }

    // Find next enabled zone in queue
    while (_queue_position < _queue_length) {
        uint8_t zi = _queue[_queue_position].zone_index;
        uint16_t rt = _queue[_queue_position].runtime_s;

        if (zi < NUM_ZONES && zones[zi].enabled) {
            // Apply runtime override if specified
            if (rt > 0) {
                zones[zi].runtime_s = rt;
            }

            if (openZone(zi)) {
                logMsg("INFO", "Queue: running zone %d (%s) for %ds [%d/%d]",
                       zi, zones[zi].name.c_str(), zones[zi].runtime_s,
                       _queue_position + 1, _queue_length);
                return;  // Zone opened successfully
            }
        }

        // Skip this entry (disabled or failed to open)
        _queue_position++;
    }

    // Queue complete
    _queue_running = false;
    _queue_length = 0;
    _queue_position = 0;
    logMsg("INFO", "Queue complete — all zones finished");
    publishZoneEvent("queue_complete", 255, "finished");
}

// ============================================================================
// update() — Called every loop iteration
// ============================================================================
// Checks safety timers and advances the queue when a zone finishes.
// ============================================================================
void ZoneManager::update() {
    checkSafetyTimers();

    // If queue is running and active zone has finished its runtime, advance
    if (_queue_running && _active_zone != 255) {
        Zone& z = zones[_active_zone];
        if (z.is_open && z.opened_at_ms > 0) {
            unsigned long elapsed_ms = millis() - z.opened_at_ms;
            unsigned long runtime_ms = (unsigned long)z.runtime_s * 1000UL;
            if (elapsed_ms >= runtime_ms) {
                logMsg("INFO", "Zone %d (%s) runtime complete (%ds)",
                       _active_zone, z.name.c_str(), z.runtime_s);
                _queue_position++;
                advanceQueue();
            }
        }
    }
}

// ============================================================================
// Safety Timer Check
// ============================================================================
// If any zone has been open longer than the safety maximum, close it
// immediately. This protects against stuck valves or software bugs
// that could cause flooding.
// ============================================================================
void ZoneManager::checkSafetyTimers() {
    unsigned long now = millis();
    uint16_t max_s = storage.data.safety_max_runtime_s;

    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        if (zones[i].is_open && zones[i].opened_at_ms > 0) {
            unsigned long elapsed_ms = now - zones[i].opened_at_ms;
            unsigned long max_ms = (unsigned long)max_s * 1000UL;

            if (elapsed_ms >= max_ms) {
                logMsg("WARN", "SAFETY: Zone %d (%s) exceeded max runtime %ds — forcing close",
                       i, zones[i].name.c_str(), max_s);
                closeZone(i);
                publishZoneEvent("safety", i, "max_runtime_exceeded");

                // If this was the queue's active zone, advance to next
                if (_queue_running && _active_zone == 255) {
                    _queue_position++;
                    advanceQueue();
                }
            }
        }
    }
}

// ============================================================================
// Query Methods
// ============================================================================

uint8_t ZoneManager::getActiveZone() const {
    return _active_zone;
}

bool ZoneManager::isZoneOpen(uint8_t zone_index) const {
    if (zone_index >= NUM_ZONES) return false;
    return zones[zone_index].is_open;
}

bool ZoneManager::isQueueRunning() const {
    return _queue_running;
}

uint8_t ZoneManager::getQueueLength() const {
    return _queue_length;
}

uint8_t ZoneManager::getQueuePosition() const {
    return _queue_position;
}

uint8_t ZoneManager::getZonesOpenCount() const {
    uint8_t count = 0;
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        if (zones[i].is_open) count++;
    }
    return count;
}

unsigned long ZoneManager::getZoneRuntime(uint8_t zone_index) const {
    if (zone_index >= NUM_ZONES) return 0;
    const Zone& z = zones[zone_index];
    if (!z.is_open || z.opened_at_ms == 0) return 0;
    return millis() - z.opened_at_ms;
}

const Zone& ZoneManager::getZone(uint8_t zone_index) const {
    static Zone dummy;
    if (zone_index >= NUM_ZONES) return dummy;
    return zones[zone_index];
}

void ZoneManager::resetDailyCounters() {
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        zones[i].daily_runtime_s = 0;
    }
    logMsg("INFO", "Daily runtime counters reset");
}

void ZoneManager::reloadFromStorage() {
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        zones[i].name       = storage.data.zones[i].name;
        zones[i].enabled    = storage.data.zones[i].enabled;
        zones[i].runtime_s  = storage.data.zones[i].runtime_s;
        zones[i].group      = storage.data.zones[i].group;
    }
    logMsg("INFO", "Zone configs reloaded from storage");
}
