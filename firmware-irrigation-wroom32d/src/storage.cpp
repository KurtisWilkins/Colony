#include "storage.h"
#include "config.h"

Storage storage;

Storage::Storage() {}

void Storage::begin() {
    loadAll();
}

void Storage::openRead() {
    prefs.begin(NVS_NAMESPACE, true);
}

void Storage::openWrite() {
    prefs.begin(NVS_NAMESPACE, false);
}

void Storage::close() {
    prefs.end();
}

// ── NVS Read Helpers ────────────────────────────────────────────────────────

String Storage::readString(const char* key, const String& defaultVal) {
    return prefs.getString(key, defaultVal);
}

uint16_t Storage::readUInt16(const char* key, uint16_t defaultVal) {
    return prefs.getUShort(key, defaultVal);
}

uint8_t Storage::readUInt8(const char* key, uint8_t defaultVal) {
    return prefs.getUChar(key, defaultVal);
}

int Storage::readInt(const char* key, int defaultVal) {
    return prefs.getInt(key, defaultVal);
}

float Storage::readFloat(const char* key, float defaultVal) {
    return prefs.getFloat(key, defaultVal);
}

unsigned long Storage::readULong(const char* key, unsigned long defaultVal) {
    return prefs.getULong(key, defaultVal);
}

bool Storage::readBool(const char* key, bool defaultVal) {
    return prefs.getBool(key, defaultVal);
}

// ── NVS Write Helpers ───────────────────────────────────────────────────────

void Storage::writeString(const char* key, const String& val) {
    openWrite();
    prefs.putString(key, val);
    close();
}

void Storage::writeUInt16(const char* key, uint16_t val) {
    openWrite();
    prefs.putUShort(key, val);
    close();
}

void Storage::writeUInt8(const char* key, uint8_t val) {
    openWrite();
    prefs.putUChar(key, val);
    close();
}

void Storage::writeInt(const char* key, int val) {
    openWrite();
    prefs.putInt(key, val);
    close();
}

void Storage::writeFloat(const char* key, float val) {
    openWrite();
    prefs.putFloat(key, val);
    close();
}

void Storage::writeULong(const char* key, unsigned long val) {
    openWrite();
    prefs.putULong(key, val);
    close();
}

void Storage::writeBool(const char* key, bool val) {
    openWrite();
    prefs.putBool(key, val);
    close();
}

// ── Load All ────────────────────────────────────────────────────────────────

void Storage::loadAll() {
    openRead();

    // WiFi
    data.wifi_ssid      = readString("wifi_ssid", "");
    data.wifi_pass      = readString("wifi_pass", "");

    // MQTT
    data.mqtt_host      = readString("mqtt_host", "");
    data.mqtt_port      = readUInt16("mqtt_port", DEFAULT_MQTT_PORT);
    data.mqtt_user      = readString("mqtt_user", "");
    data.mqtt_pass      = readString("mqtt_pass", "");

    // Device Identity
    data.facility       = readString("facility", "farm");
    data.building       = readString("building", "field1");
    data.unit           = readString("unit", "zone-bank1");
    data.device_name    = readString("device_name", "irrigation1");

    // Timezone
    data.timezone       = readString("timezone", DEFAULT_TIMEZONE);

    // Safety settings
    data.safety_max_runtime_s = readUInt16("safe_max_rt", SAFETY_MAX_RUNTIME_S);
    data.safety_max_daily_s   = readUInt16("safe_max_day", SAFETY_MAX_DAILY_S);

    // Active zone count
    data.zone_count     = readUInt8("zone_count", NUM_ZONES);
    if (data.zone_count > NUM_ZONES) data.zone_count = NUM_ZONES;

    // Zone configurations
    // NVS keys are limited to 15 chars, so we use compact key names:
    //   zN_name, zN_rt, zN_en, zN_grp  where N = 0..15
    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        char keyName[16], keyRt[16], keyEn[16], keyGrp[16];
        snprintf(keyName, sizeof(keyName), "z%d_name", i);
        snprintf(keyRt,   sizeof(keyRt),   "z%d_rt",   i);
        snprintf(keyEn,   sizeof(keyEn),   "z%d_en",   i);
        snprintf(keyGrp,  sizeof(keyGrp),  "z%d_grp",  i);

        // Default zone name: "Zone 1" through "Zone 16"
        String defaultName = "Zone " + String(i + 1);
        data.zones[i].name      = readString(keyName, defaultName);
        data.zones[i].runtime_s = readUInt16(keyRt, DEFAULT_ZONE_RUNTIME_S);
        data.zones[i].enabled   = readBool(keyEn, true);
        data.zones[i].group     = readUInt8(keyGrp, 0);
    }

    close();

    // Write defaults for any keys that were missing (ensures NVS has all keys)
    saveAll();
}

// ── Save All ────────────────────────────────────────────────────────────────

void Storage::saveAll() {
    openWrite();

    prefs.putString("wifi_ssid", data.wifi_ssid);
    prefs.putString("wifi_pass", data.wifi_pass);
    prefs.putString("mqtt_host", data.mqtt_host);
    prefs.putUShort("mqtt_port", data.mqtt_port);
    prefs.putString("mqtt_user", data.mqtt_user);
    prefs.putString("mqtt_pass", data.mqtt_pass);
    prefs.putString("facility", data.facility);
    prefs.putString("building", data.building);
    prefs.putString("unit", data.unit);
    prefs.putString("device_name", data.device_name);
    prefs.putString("timezone", data.timezone);
    prefs.putUShort("safe_max_rt", data.safety_max_runtime_s);
    prefs.putUShort("safe_max_day", data.safety_max_daily_s);
    prefs.putUChar("zone_count", data.zone_count);

    for (uint8_t i = 0; i < NUM_ZONES; i++) {
        char keyName[16], keyRt[16], keyEn[16], keyGrp[16];
        snprintf(keyName, sizeof(keyName), "z%d_name", i);
        snprintf(keyRt,   sizeof(keyRt),   "z%d_rt",   i);
        snprintf(keyEn,   sizeof(keyEn),   "z%d_en",   i);
        snprintf(keyGrp,  sizeof(keyGrp),  "z%d_grp",  i);

        prefs.putString(keyName, data.zones[i].name);
        prefs.putUShort(keyRt, data.zones[i].runtime_s);
        prefs.putBool(keyEn, data.zones[i].enabled);
        prefs.putUChar(keyGrp, data.zones[i].group);
    }

    close();
}

// ── Individual Setters ──────────────────────────────────────────────────────

void Storage::setWifiSsid(const String& val)    { data.wifi_ssid = val; writeString("wifi_ssid", val); }
void Storage::setWifiPass(const String& val)     { data.wifi_pass = val; writeString("wifi_pass", val); }
void Storage::setMqttHost(const String& val)     { data.mqtt_host = val; writeString("mqtt_host", val); }
void Storage::setMqttPort(uint16_t val)          { data.mqtt_port = val; writeUInt16("mqtt_port", val); }
void Storage::setMqttUser(const String& val)     { data.mqtt_user = val; writeString("mqtt_user", val); }
void Storage::setMqttPass(const String& val)     { data.mqtt_pass = val; writeString("mqtt_pass", val); }
void Storage::setFacility(const String& val)     { data.facility = val; writeString("facility", val); }
void Storage::setBuilding(const String& val)     { data.building = val; writeString("building", val); }
void Storage::setUnit(const String& val)         { data.unit = val; writeString("unit", val); }
void Storage::setDeviceName(const String& val)   { data.device_name = val; writeString("device_name", val); }
void Storage::setTimezone(const String& val)     { data.timezone = val; writeString("timezone", val); }

void Storage::setZoneName(uint8_t index, const String& val) {
    if (index >= NUM_ZONES) return;
    data.zones[index].name = val;
    char key[16];
    snprintf(key, sizeof(key), "z%d_name", index);
    writeString(key, val);
}

void Storage::setZoneRuntime(uint8_t index, uint16_t val) {
    if (index >= NUM_ZONES) return;
    data.zones[index].runtime_s = val;
    char key[16];
    snprintf(key, sizeof(key), "z%d_rt", index);
    writeUInt16(key, val);
}

void Storage::setZoneEnabled(uint8_t index, bool val) {
    if (index >= NUM_ZONES) return;
    data.zones[index].enabled = val;
    char key[16];
    snprintf(key, sizeof(key), "z%d_en", index);
    writeBool(key, val);
}

void Storage::setZoneGroup(uint8_t index, uint8_t val) {
    if (index >= NUM_ZONES) return;
    data.zones[index].group = val;
    char key[16];
    snprintf(key, sizeof(key), "z%d_grp", index);
    writeUInt8(key, val);
}

void Storage::setSafetyMaxRuntime(uint16_t val)  { data.safety_max_runtime_s = val; writeUInt16("safe_max_rt", val); }
void Storage::setSafetyMaxDaily(uint16_t val)    { data.safety_max_daily_s = val; writeUInt16("safe_max_day", val); }
void Storage::setZoneCount(uint8_t val)          { if (val > NUM_ZONES) val = NUM_ZONES; data.zone_count = val; writeUInt8("zone_count", val); }

void Storage::clearWifiCredentials() {
    data.wifi_ssid = "";
    data.wifi_pass = "";
    openWrite();
    prefs.putString("wifi_ssid", "");
    prefs.putString("wifi_pass", "");
    close();
}

void Storage::factoryReset() {
    openWrite();
    prefs.clear();
    close();
}

bool Storage::hasWifiCredentials() {
    return (data.wifi_ssid.length() > 0);
}
