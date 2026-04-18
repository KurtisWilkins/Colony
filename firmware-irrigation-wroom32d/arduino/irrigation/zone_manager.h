#ifndef ZONE_MANAGER_H
#define ZONE_MANAGER_H

#include <Arduino.h>
#include "config.h"

// ============================================================================
// Zone State Tracking
// ============================================================================
struct Zone {
    uint8_t  relay_index;       // Index into relay pin table (0-15)
    uint8_t  gpio_pin;          // Actual GPIO pin number
    String   name;              // Human-readable name
    bool     enabled;           // Whether this zone is usable
    uint16_t runtime_s;         // Configured runtime in seconds
    uint8_t  group;             // Group ID (0 = no group)
    bool     is_open;           // Current state: true = valve open
    unsigned long opened_at_ms; // millis() when valve was opened (0 if closed)
    uint32_t daily_runtime_s;   // Accumulated runtime today (seconds)
};

// ============================================================================
// Queue Entry
// ============================================================================
struct QueueEntry {
    uint8_t  zone_index;        // Which zone to run
    uint16_t runtime_s;         // Override runtime (0 = use zone default)
};

class ZoneManager {
public:
    ZoneManager();

    // Initialize zones from storage config
    void begin();

    // Zone control
    bool openZone(uint8_t zone_index);
    bool closeZone(uint8_t zone_index);
    void closeAllZones();

    // Queue system
    bool queueZone(uint8_t zone_index, uint16_t runtime_override_s = 0);
    bool queueProgram(uint8_t group_id);
    void startQueue();
    void stopQueue();
    void clearQueue();

    // Must be called every loop() — runs safety checks and advances queue
    void update();

    // Query state
    uint8_t getActiveZone() const;                  // 255 = none
    bool isZoneOpen(uint8_t zone_index) const;
    bool isQueueRunning() const;
    uint8_t getQueueLength() const;
    uint8_t getQueuePosition() const;
    uint8_t getZonesOpenCount() const;
    unsigned long getZoneRuntime(uint8_t zone_index) const;  // Current run elapsed ms

    // Get zone info
    const Zone& getZone(uint8_t zone_index) const;

    // Reset daily runtime counters (call at midnight)
    void resetDailyCounters();

    // Reload zone configs from storage
    void reloadFromStorage();

    // Zone array (public for telemetry access)
    Zone zones[NUM_ZONES];

private:
    // Queue
    QueueEntry  _queue[MAX_QUEUE_SIZE];
    uint8_t     _queue_length;
    uint8_t     _queue_position;
    bool        _queue_running;
    uint8_t     _active_zone;           // 255 = none

    // Safety check
    void checkSafetyTimers();
    void advanceQueue();
};

extern ZoneManager zoneManager;

#endif // ZONE_MANAGER_H
