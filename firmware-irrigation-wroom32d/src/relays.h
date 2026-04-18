#ifndef RELAYS_H
#define RELAYS_H

#include <Arduino.h>
#include "config.h"

// ============================================================================
// Low-Level Relay Control
// ============================================================================
// ACTIVE LOW relay modules:
//   LOW  = relay coil energized  = solenoid valve OPEN  = water flowing
//   HIGH = relay coil off        = solenoid valve CLOSED = no water
//
// On boot, ALL pins must be set HIGH immediately to prevent accidental
// valve activation during ESP32 startup (some GPIOs float during boot).
// ============================================================================

class Relays {
public:
    Relays();

    // Initialize ALL 16 relay pins as OUTPUT and set HIGH (OFF) immediately.
    // This MUST be the very first thing called in setup(), before any other
    // peripheral initialization, to ensure no valves open during boot.
    void initAllRelays();

    // Open a single relay (set pin LOW — ACTIVE LOW — valve opens)
    void openRelay(uint8_t pin);

    // Close a single relay (set pin HIGH — valve closes)
    void closeRelay(uint8_t pin);

    // Emergency: close ALL 16 relays immediately
    void closeAllRelays();

    // Query whether a relay is currently open (pin is LOW)
    bool isRelayOpen(uint8_t pin);

    // Get the GPIO pin for a given zone index (0-15)
    uint8_t pinForZone(uint8_t zone_index);

private:
    // Lookup table: zone index -> GPIO pin
    static const uint8_t zone_pins[NUM_ZONES];

    // Validate that a pin is one of our relay pins
    bool isValidRelayPin(uint8_t pin);
};

extern Relays relays;

#endif // RELAYS_H
