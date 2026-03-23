#include "actuators.h"
#include "config.h"
#include "storage.h"

Actuators actuators;

extern void logMsg(const char* level, const char* fmt, ...);

Actuators::Actuators()
    : valve_open(false)
    , mister_on(false)
    , fan_on(false)
    , fan_speed_pct(0)
    , valve_open_start(0)
{
}

void Actuators::begin() {
    // Initialize relay pins as OUTPUT, set HIGH (OFF for active-LOW relays)
    pinMode(RELAY_VALVE, OUTPUT);
    digitalWrite(RELAY_VALVE, HIGH);  // OFF

    pinMode(RELAY_MISTER, OUTPUT);
    digitalWrite(RELAY_MISTER, HIGH); // OFF

    // Initialize fan PWM
    ledcSetup(FAN_PWM_CHANNEL, FAN_PWM_FREQ, FAN_PWM_RESOLUTION);
    ledcAttachPin(FAN_PWM_PIN, FAN_PWM_CHANNEL);
    ledcWrite(FAN_PWM_CHANNEL, 0);
    pinMode(FAN_PWM_PIN, OUTPUT);
    digitalWrite(FAN_PWM_PIN, LOW);

    logMsg("INFO", "Actuators initialized: Valve=OFF Mister=OFF Fan=OFF");
}

void Actuators::valveOpen() {
    if (!valve_open) {
        digitalWrite(RELAY_VALVE, LOW);  // LOW = energized = ON
        valve_open = true;
        valve_open_start = millis();
        logMsg("INFO", "Valve OPENED");
    }
}

void Actuators::valveClose() {
    if (valve_open) {
        digitalWrite(RELAY_VALVE, HIGH); // HIGH = de-energized = OFF
        valve_open = false;
        valve_open_start = 0;
        logMsg("INFO", "Valve CLOSED");
    }
}

void Actuators::misterOn() {
    if (!mister_on) {
        digitalWrite(RELAY_MISTER, LOW); // LOW = energized = ON
        mister_on = true;
        logMsg("INFO", "Mister ON");
    }
}

void Actuators::misterOff() {
    if (mister_on) {
        digitalWrite(RELAY_MISTER, HIGH); // HIGH = de-energized = OFF
        mister_on = false;
        logMsg("INFO", "Mister OFF");
    }
}

void Actuators::fanSetSpeed(int percent) {
    // Clamp to 0-100
    if (percent < 0) percent = 0;
    if (percent > 100) percent = 100;

    if (percent == 0) {
        fanOff();
        return;
    }

    // Enforce minimum speed when on
    if (percent < FAN_MIN_SPEED) {
        percent = FAN_MIN_SPEED;
    }

    fan_speed_pct = percent;
    fan_on = true;

    // Map 0-100% to 0-255 duty cycle
    int duty = (int)((percent / 100.0f) * 255.0f);
    if (duty > 255) duty = 255;

    ledcWrite(FAN_PWM_CHANNEL, duty);

    logMsg("INFO", "Fan speed set to %d%% (duty=%d)", percent, duty);
}

void Actuators::fanOn(int percent) {
    if (percent < 0) {
        percent = storage.data.fan_default_spd;
    }
    fanSetSpeed(percent);
}

void Actuators::fanOff() {
    fan_on = false;
    fan_speed_pct = 0;
    ledcWrite(FAN_PWM_CHANNEL, 0);
    digitalWrite(FAN_PWM_PIN, LOW);  // Ensure pin is fully LOW
    logMsg("INFO", "Fan OFF");
}

unsigned long Actuators::getValveOpenTime() {
    if (!valve_open || valve_open_start == 0) {
        return 0;
    }
    return millis() - valve_open_start;
}
