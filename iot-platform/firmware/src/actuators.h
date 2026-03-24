#ifndef ACTUATORS_H
#define ACTUATORS_H

#include <Arduino.h>

class Actuators {
public:
    Actuators();
    void begin();

    // Relay control
    void valveOpen();
    void valveClose();
    void misterOn();
    void misterOff();

    // Fan PWM control
    void fanSetSpeed(int percent);  // 0-100%
    void fanOn(int percent = -1);   // -1 = use default speed
    void fanOff();

    // State queries
    bool isValveOpen()  { return valve_open; }
    bool isMisterOn()   { return mister_on; }
    bool isFanOn()      { return fan_on; }
    int getFanSpeed()   { return fan_speed_pct; }

    // Valve timing
    unsigned long getValveOpenTime();

private:
    bool valve_open;
    bool mister_on;
    bool fan_on;
    int fan_speed_pct;
    unsigned long valve_open_start;
};

extern Actuators actuators;

#endif // ACTUATORS_H
