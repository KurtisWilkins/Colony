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

String Storage::readString(const char* key, const String& defaultVal) {
    return prefs.getString(key, defaultVal);
}

uint16_t Storage::readUInt16(const char* key, uint16_t defaultVal) {
    return prefs.getUShort(key, defaultVal);
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
    data.building       = readString("building", "bldg1");
    data.unit           = readString("unit", "tent1");
    data.device_name    = readString("device_name", "controller1");

    // Tank Calibration
    data.tank_full_cm   = readFloat("tank_full_cm", DEFAULT_TANK_FULL_CM);
    data.tank_empty_cm  = readFloat("tank_empty_cm", DEFAULT_TANK_EMPTY_CM);

    // Flow Calibration
    data.flow_cal       = readFloat("flow_cal", DEFAULT_FLOW_CAL);

    // Humidity Thresholds
    data.hum_on_pct     = readFloat("hum_on_pct", DEFAULT_HUM_ON_PCT);
    data.hum_off_pct    = readFloat("hum_off_pct", DEFAULT_HUM_OFF_PCT);

    // CO2 Threshold
    data.co2_high_ppm   = readInt("co2_high_ppm", DEFAULT_CO2_HIGH_PPM);

    // Temperature Thresholds
    data.temp_min_c     = readFloat("temp_min_c", DEFAULT_TEMP_MIN_C);
    data.temp_max_c     = readFloat("temp_max_c", DEFAULT_TEMP_MAX_C);

    // Water Level Thresholds
    data.water_low_cm   = readFloat("water_low_cm", DEFAULT_WATER_LOW_CM);
    data.water_full_cm  = readFloat("water_full_cm", DEFAULT_WATER_FULL_CM);

    // Intervals
    data.sensor_interval = readULong("sensor_intv", DEFAULT_SENSOR_INTERVAL);

    // Fan
    data.fan_default_spd = readInt("fan_def_spd", DEFAULT_FAN_SPEED);

    // Accumulated Flow
    data.total_liters   = readFloat("total_liters", 0.0f);

    close();

    // Write defaults for any keys that were missing (ensures NVS has all keys)
    saveAll();
}

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
    prefs.putFloat("tank_full_cm", data.tank_full_cm);
    prefs.putFloat("tank_empty_cm", data.tank_empty_cm);
    prefs.putFloat("flow_cal", data.flow_cal);
    prefs.putFloat("hum_on_pct", data.hum_on_pct);
    prefs.putFloat("hum_off_pct", data.hum_off_pct);
    prefs.putInt("co2_high_ppm", data.co2_high_ppm);
    prefs.putFloat("temp_min_c", data.temp_min_c);
    prefs.putFloat("temp_max_c", data.temp_max_c);
    prefs.putFloat("water_low_cm", data.water_low_cm);
    prefs.putFloat("water_full_cm", data.water_full_cm);
    prefs.putULong("sensor_intv", data.sensor_interval);
    prefs.putInt("fan_def_spd", data.fan_default_spd);
    prefs.putFloat("total_liters", data.total_liters);

    close();
}

// Individual setters
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
void Storage::setTankFullCm(float val)           { data.tank_full_cm = val; writeFloat("tank_full_cm", val); }
void Storage::setTankEmptyCm(float val)          { data.tank_empty_cm = val; writeFloat("tank_empty_cm", val); }
void Storage::setFlowCal(float val)              { data.flow_cal = val; writeFloat("flow_cal", val); }
void Storage::setHumOnPct(float val)             { data.hum_on_pct = val; writeFloat("hum_on_pct", val); }
void Storage::setHumOffPct(float val)            { data.hum_off_pct = val; writeFloat("hum_off_pct", val); }
void Storage::setCo2HighPpm(int val)             { data.co2_high_ppm = val; writeInt("co2_high_ppm", val); }
void Storage::setTempMinC(float val)             { data.temp_min_c = val; writeFloat("temp_min_c", val); }
void Storage::setTempMaxC(float val)             { data.temp_max_c = val; writeFloat("temp_max_c", val); }
void Storage::setWaterLowCm(float val)           { data.water_low_cm = val; writeFloat("water_low_cm", val); }
void Storage::setWaterFullCm(float val)          { data.water_full_cm = val; writeFloat("water_full_cm", val); }
void Storage::setSensorInterval(unsigned long val) { data.sensor_interval = val; writeULong("sensor_intv", val); }
void Storage::setFanDefaultSpd(int val)          { data.fan_default_spd = val; writeInt("fan_def_spd", val); }
void Storage::setTotalLiters(float val)          { data.total_liters = val; writeFloat("total_liters", val); }

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
