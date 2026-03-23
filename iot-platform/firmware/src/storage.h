#ifndef STORAGE_H
#define STORAGE_H

#include <Arduino.h>
#include <Preferences.h>

struct StorageData {
    // WiFi
    String wifi_ssid;
    String wifi_pass;

    // MQTT
    String mqtt_host;
    uint16_t mqtt_port;
    String mqtt_user;
    String mqtt_pass;

    // Device Identity
    String facility;
    String building;
    String unit;
    String device_name;

    // Tank Calibration
    float tank_full_cm;
    float tank_empty_cm;

    // Flow Calibration
    float flow_cal;

    // Humidity Thresholds
    float hum_on_pct;
    float hum_off_pct;

    // CO2 Threshold
    int co2_high_ppm;

    // Temperature Thresholds
    float temp_min_c;
    float temp_max_c;

    // Water Level Thresholds
    float water_low_cm;
    float water_full_cm;

    // Intervals
    unsigned long sensor_interval;

    // Fan
    int fan_default_spd;

    // Accumulated Flow
    float total_liters;
};

class Storage {
public:
    Storage();
    void begin();
    void loadAll();
    void saveAll();

    // Individual setters (write to NVS immediately)
    void setWifiSsid(const String& val);
    void setWifiPass(const String& val);
    void setMqttHost(const String& val);
    void setMqttPort(uint16_t val);
    void setMqttUser(const String& val);
    void setMqttPass(const String& val);
    void setFacility(const String& val);
    void setBuilding(const String& val);
    void setUnit(const String& val);
    void setDeviceName(const String& val);
    void setTankFullCm(float val);
    void setTankEmptyCm(float val);
    void setFlowCal(float val);
    void setHumOnPct(float val);
    void setHumOffPct(float val);
    void setCo2HighPpm(int val);
    void setTempMinC(float val);
    void setTempMaxC(float val);
    void setWaterLowCm(float val);
    void setWaterFullCm(float val);
    void setSensorInterval(unsigned long val);
    void setFanDefaultSpd(int val);
    void setTotalLiters(float val);

    void clearWifiCredentials();
    void factoryReset();

    bool hasWifiCredentials();

    StorageData data;

private:
    Preferences prefs;
    void openRead();
    void openWrite();
    void close();

    String readString(const char* key, const String& defaultVal);
    uint16_t readUInt16(const char* key, uint16_t defaultVal);
    int readInt(const char* key, int defaultVal);
    float readFloat(const char* key, float defaultVal);
    unsigned long readULong(const char* key, unsigned long defaultVal);

    void writeString(const char* key, const String& val);
    void writeUInt16(const char* key, uint16_t val);
    void writeInt(const char* key, int val);
    void writeFloat(const char* key, float val);
    void writeULong(const char* key, unsigned long val);
};

extern Storage storage;

#endif // STORAGE_H
