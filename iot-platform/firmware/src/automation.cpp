#include "automation.h"
#include "config.h"
#include "storage.h"
#include "sensors.h"
#include "actuators.h"
#include "mqtt_client.h"

Automation automation;

extern void logMsg(const char* level, const char* fmt, ...);

Automation::Automation()
    : autonomous_mode(false)
    , manual_override(false)
{
}

void Automation::begin() {
    logMsg("INFO", "Automation engine initialized");
}

void Automation::update() {
    // Always check valve safety regardless of mode
    checkValveSafety();

    // In manual override mode (MQTT connected, commands received), skip automation
    if (manual_override && !autonomous_mode) {
        return;
    }

    // Automation runs when autonomous (WiFi/MQTT lost) or when no manual override
    if (!autonomous_mode && manual_override) {
        return;
    }

    controlHumidity();
    controlCO2();
    controlWaterLevel();
}

void Automation::controlHumidity() {
    if (!sensors.readings.bme280_ok) return;

    float humidity = sensors.readings.humidity;
    float on_threshold = storage.data.hum_on_pct;
    float off_threshold = storage.data.hum_off_pct;

    if (humidity < on_threshold) {
        // Humidity too low - turn on mister and fan
        if (!actuators.isMisterOn()) {
            actuators.misterOn();
            actuators.fanOn();
            logMsg("INFO", "AUTO: Humidity %.1f%% < %.1f%% - mister+fan ON", humidity, on_threshold);
        }
    } else if (humidity > off_threshold) {
        // Humidity reached target - turn off mister, set fan to default
        if (actuators.isMisterOn()) {
            actuators.misterOff();
            actuators.fanSetSpeed(storage.data.fan_default_spd);
            logMsg("INFO", "AUTO: Humidity %.1f%% > %.1f%% - mister OFF, fan default", humidity, off_threshold);
        }
    }
}

void Automation::controlCO2() {
    if (!sensors.readings.mhz19_ok) return;
    if (sensors.readings.co2_ppm < 0) return;  // Still warming up

    int co2 = sensors.readings.co2_ppm;
    int high_threshold = storage.data.co2_high_ppm;
    int low_threshold = high_threshold - 100;

    if (co2 > high_threshold) {
        // CO2 too high - ventilate at full speed
        if (actuators.getFanSpeed() < 100) {
            actuators.fanSetSpeed(100);
            logMsg("INFO", "AUTO: CO2 %dppm > %dppm - fan 100%%", co2, high_threshold);
        }
    } else if (co2 < low_threshold) {
        // CO2 back to safe range - restore default fan speed
        // Only reduce if we previously boosted for CO2 (fan at 100%)
        if (actuators.getFanSpeed() >= 100 && !actuators.isMisterOn()) {
            actuators.fanSetSpeed(storage.data.fan_default_spd);
            logMsg("INFO", "AUTO: CO2 %dppm < %dppm - fan default", co2, low_threshold);
        }
    }
}

void Automation::controlWaterLevel() {
    if (!sensors.readings.ultrasonic_ok) return;

    float distance = sensors.readings.distance_cm;
    float low_threshold = storage.data.water_low_cm;
    float full_threshold = storage.data.water_full_cm;

    if (distance > low_threshold) {
        // Water level is low (distance is large) - open valve
        if (!actuators.isValveOpen()) {
            actuators.valveOpen();
            logMsg("INFO", "AUTO: Water low (dist=%.1fcm > %.1fcm) - valve OPEN", distance, low_threshold);
        }
    } else if (distance <= full_threshold) {
        // Water level is full (distance is small) - close valve
        if (actuators.isValveOpen()) {
            actuators.valveClose();
            logMsg("INFO", "AUTO: Water full (dist=%.1fcm <= %.1fcm) - valve CLOSE", distance, full_threshold);
        }
    }
}

void Automation::checkValveSafety() {
    if (!actuators.isValveOpen()) return;

    unsigned long open_time = actuators.getValveOpenTime();
    if (open_time >= VALVE_MAX_OPEN_MS) {
        actuators.valveClose();
        logMsg("WARN", "SAFETY: Valve force-closed after %lu ms", open_time);
        mqttClient.publishAlert("valve_safety", "Valve force-closed: max open time exceeded (10 min)");
    }
}
