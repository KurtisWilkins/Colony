#ifndef SENSORS_H
#define SENSORS_H

#include <Arduino.h>
#include <Adafruit_BME280.h>
#include <MHZ19.h>

struct SensorReadings {
    float temperature;      // Celsius
    float humidity;         // %RH
    float pressure;         // hPa
    int co2_ppm;            // ppm (-1 during warmup)
    float distance_cm;      // cm (raw distance from ultrasonic)
    float tank_pct;         // 0-100% tank level
    bool bme280_ok;
    bool mhz19_ok;
    bool ultrasonic_ok;
};

class Sensors {
public:
    Sensors();
    void begin();
    void update();  // Called each sensor interval

    SensorReadings readings;

    bool isBme280Alert()    { return bme280_fail_count >= 3; }
    bool isMhz19Alert()     { return mhz19_fail_count >= 3; }
    bool isUltrasonicAlert(){ return ultra_fail_count >= 3; }
    bool isCo2Warming()     { return co2_warming_up; }

    void resetBme280Alert() { bme280_fail_count = 0; }
    void resetMhz19Alert()  { mhz19_fail_count = 0; }
    void resetUltraAlert()  { ultra_fail_count = 0; }

private:
    Adafruit_BME280 bme;
    MHZ19 mhz;
    bool bme280_initialized;
    bool mhz19_initialized;

    int bme280_fail_count;
    int mhz19_fail_count;
    int ultra_fail_count;

    bool co2_warming_up;
    unsigned long warmup_start;

    void readBME280();
    void readMHZ19();
    void readUltrasonic();
    float measureDistance();
    float calculateTankPercent(float distance_cm);
};

extern Sensors sensors;

#endif // SENSORS_H
