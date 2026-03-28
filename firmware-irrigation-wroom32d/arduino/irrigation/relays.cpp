#include "relays.h"
#include "config.h"

Relays relays;

extern void logMsg(const char* level, const char* fmt, ...);

// ============================================================================
// GPIO Pin Lookup Table
// ============================================================================
// Maps zone index (0-15) to GPIO pin number.
// Avoids input-only pins 34, 35, 36, 39.
// ACTIVE LOW: LOW = ON (valve open), HIGH = OFF (valve closed)
// ============================================================================
const uint8_t Relays::zone_pins[NUM_ZONES] = {
    RELAY_1_PIN,   // Zone 0  -> GPIO 13
    RELAY_2_PIN,   // Zone 1  -> GPIO 12
    RELAY_3_PIN,   // Zone 2  -> GPIO 14
    RELAY_4_PIN,   // Zone 3  -> GPIO 27
    RELAY_5_PIN,   // Zone 4  -> GPIO 26
    RELAY_6_PIN,   // Zone 5  -> GPIO 25
    RELAY_7_PIN,   // Zone 6  -> GPIO 33
    RELAY_8_PIN,   // Zone 7  -> GPIO 32
    RELAY_9_PIN,   // Zone 8  -> GPIO 23
    RELAY_10_PIN,  // Zone 9  -> GPIO 22
    RELAY_11_PIN,  // Zone 10 -> GPIO 21
    RELAY_12_PIN,  // Zone 11 -> GPIO 19
    RELAY_13_PIN,  // Zone 12 -> GPIO 18
    RELAY_14_PIN,  // Zone 13 -> GPIO 5
    RELAY_15_PIN,  // Zone 14 -> GPIO 4
    RELAY_16_PIN   // Zone 15 -> GPIO 2
};

Relays::Relays() {}

// ============================================================================
// initAllRelays() — MUST be called first in setup()
// ============================================================================
// Sets every relay pin to OUTPUT mode and drives HIGH (OFF) to ensure
// no solenoid valves are energized during the ESP32 boot sequence.
// Some ESP32 GPIOs (especially GPIO 2, 12) can float or glitch during
// boot, so we force them all OFF as the very first action.
// ============================================================================
void Relays::initAllRelays() {
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        // ACTIVE LOW: HIGH = relay OFF = valve closed
        pinMode(zone_pins[i], OUTPUT);
        digitalWrite(zone_pins[i], RELAY_OFF);  // HIGH — valve closed
    }
    logMsg("INFO", "All %d relay pins initialized HIGH (OFF/CLOSED)", NUM_ZONES);
}

// ============================================================================
// openRelay() — Set pin LOW to energize relay (ACTIVE LOW)
// ============================================================================
void Relays::openRelay(uint8_t pin) {
    if (!isValidRelayPin(pin)) {
        logMsg("ERROR", "openRelay: invalid pin %d", pin);
        return;
    }
    // ACTIVE LOW: LOW = relay energized = solenoid valve OPEN
    digitalWrite(pin, RELAY_ON);  // LOW
    logMsg("INFO", "Relay pin %d -> LOW (OPEN/ON)", pin);
}

// ============================================================================
// closeRelay() — Set pin HIGH to de-energize relay (ACTIVE LOW)
// ============================================================================
void Relays::closeRelay(uint8_t pin) {
    if (!isValidRelayPin(pin)) {
        logMsg("ERROR", "closeRelay: invalid pin %d", pin);
        return;
    }
    // ACTIVE LOW: HIGH = relay off = solenoid valve CLOSED
    digitalWrite(pin, RELAY_OFF);  // HIGH
    logMsg("INFO", "Relay pin %d -> HIGH (CLOSED/OFF)", pin);
}

// ============================================================================
// closeAllRelays() — Emergency shutoff: close every relay immediately
// ============================================================================
void Relays::closeAllRelays() {
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        // ACTIVE LOW: HIGH = relay off = valve closed
        digitalWrite(zone_pins[i], RELAY_OFF);  // HIGH
    }
    logMsg("WARN", "ALL RELAYS CLOSED (emergency shutoff)");
}

// ============================================================================
// isRelayOpen() — Returns true if pin is LOW (relay energized, valve open)
// ============================================================================
bool Relays::isRelayOpen(uint8_t pin) {
    if (!isValidRelayPin(pin)) return false;
    // ACTIVE LOW: if digitalRead returns LOW, the relay is ON (open)
    return (digitalRead(pin) == RELAY_ON);
}

// ============================================================================
// pinForZone() — Get GPIO pin number for a zone index
// ============================================================================
uint8_t Relays::pinForZone(uint8_t zone_index) {
    if (zone_index >= NUM_ZONES) return 0;
    return zone_pins[zone_index];
}

// ============================================================================
// isValidRelayPin() — Confirm a pin is in our relay pin table
// ============================================================================
bool Relays::isValidRelayPin(uint8_t pin) {
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        if (zone_pins[i] == pin) return true;
    }
    return false;
}
