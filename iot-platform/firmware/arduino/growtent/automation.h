#ifndef AUTOMATION_H
#define AUTOMATION_H

#include <Arduino.h>

class Automation {
public:
    Automation();
    void begin();
    void update();  // Called each loop iteration

    bool isAutonomous()     { return autonomous_mode; }
    void setAutonomous(bool val) { autonomous_mode = val; }
    void setManualOverride(bool val) { manual_override = val; }

private:
    bool autonomous_mode;
    bool manual_override;

    void controlHumidity();
    void controlCO2();
    void controlWaterLevel();
    void checkValveSafety();
};

extern Automation automation;

#endif // AUTOMATION_H
