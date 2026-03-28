#ifndef STORAGE_H
#define STORAGE_H

#include <Arduino.h>
#include <Preferences.h>
#include "config.h"

struct ZoneConfig {
    String name;
    uint16_t runtime_s;
    bool enabled;
    uint8_t group;        // Group ID for running multiple zones together (0=none)
};

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

    // Timezone (POSIX TZ string)
    String timezone;

    // Zone configurations
    ZoneConfig zones[NUM_ZONES];

    // Safety settings
    uint16_t safety_max_runtime_s;
    uint16_t safety_max_daily_s;

    // Active zone count (how many of the 16 are physically wired)
    uint8_t zone_count;
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
    void setTimezone(const String& val);

    void setZoneName(uint8_t index, const String& val);
    void setZoneRuntime(uint8_t index, uint16_t val);
    void setZoneEnabled(uint8_t index, bool val);
    void setZoneGroup(uint8_t index, uint8_t val);

    void setSafetyMaxRuntime(uint16_t val);
    void setSafetyMaxDaily(uint16_t val);
    void setZoneCount(uint8_t val);

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
    uint8_t readUInt8(const char* key, uint8_t defaultVal);
    int readInt(const char* key, int defaultVal);
    float readFloat(const char* key, float defaultVal);
    unsigned long readULong(const char* key, unsigned long defaultVal);
    bool readBool(const char* key, bool defaultVal);

    void writeString(const char* key, const String& val);
    void writeUInt16(const char* key, uint16_t val);
    void writeUInt8(const char* key, uint8_t val);
    void writeInt(const char* key, int val);
    void writeFloat(const char* key, float val);
    void writeULong(const char* key, unsigned long val);
    void writeBool(const char* key, bool val);
};

extern Storage storage;

#endif // STORAGE_H
