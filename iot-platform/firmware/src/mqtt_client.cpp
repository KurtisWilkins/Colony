#include "mqtt_client.h"
#include "config.h"
#include "storage.h"
#include "sensors.h"
#include "actuators.h"
#include "flow_meter.h"
#include "automation.h"
#include "test_mode.h"
#include "climate.h"
#include <ArduinoJson.h>

MqttClient mqttClient;

extern void logMsg(const char* level, const char* fmt, ...);

MqttClient::MqttClient()
    : client(espClient)
    , last_connect_attempt(0)
{
}

void MqttClient::begin() {
    buildBasePath();
    client.setServer(storage.data.mqtt_host.c_str(), storage.data.mqtt_port);
    client.setCallback(messageCallback);
    client.setBufferSize(1024);
    logMsg("INFO", "MQTT configured: %s:%d base=%s",
           storage.data.mqtt_host.c_str(), storage.data.mqtt_port, base_path.c_str());
}

void MqttClient::buildBasePath() {
    base_path = storage.data.facility + "/" +
                storage.data.building + "/" +
                storage.data.unit + "/" +
                storage.data.device_name;
}

String MqttClient::topicFor(const char* suffix) {
    return base_path + "/" + suffix;
}

String MqttClient::getBasePath() {
    return base_path;
}

bool MqttClient::connect() {
    if (client.connected()) return true;

    unsigned long now = millis();
    if (now - last_connect_attempt < MQTT_RECONNECT_MS) return false;
    last_connect_attempt = now;

    String clientId = "growtent-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    String willTopic = topicFor("status");
    String willMessage = "{\"state\":\"offline\"}";

    logMsg("INFO", "MQTT connecting as %s...", clientId.c_str());

    bool connected = false;
    if (storage.data.mqtt_user.length() > 0) {
        connected = client.connect(
            clientId.c_str(),
            storage.data.mqtt_user.c_str(),
            storage.data.mqtt_pass.c_str(),
            willTopic.c_str(),
            1,    // QoS
            true, // retain
            willMessage.c_str()
        );
    } else {
        connected = client.connect(
            clientId.c_str(),
            willTopic.c_str(),
            1,
            true,
            willMessage.c_str()
        );
    }

    if (connected) {
        logMsg("INFO", "MQTT connected");

        // Subscribe to command and config topics
        String cmdTopic = topicFor("command");
        String cfgTopic = topicFor("config");
        client.subscribe(cmdTopic.c_str(), 1);
        client.subscribe(cfgTopic.c_str(), 1);
        logMsg("INFO", "Subscribed: %s", cmdTopic.c_str());
        logMsg("INFO", "Subscribed: %s", cfgTopic.c_str());

        // Publish initial status
        publishStatus();
        return true;
    } else {
        logMsg("ERROR", "MQTT connection failed, rc=%d", client.state());
        return false;
    }
}

void MqttClient::loop() {
    if (client.connected()) {
        client.loop();
    }
}

bool MqttClient::isConnected() {
    return client.connected();
}

void MqttClient::messageCallback(char* topic, byte* payload, unsigned int length) {
    // Null-terminate payload
    char buf[length + 1];
    memcpy(buf, payload, length);
    buf[length] = '\0';

    mqttClient.handleMessage(topic, buf);
}

void MqttClient::handleMessage(const char* topic, const char* payload) {
    String t(topic);
    logMsg("DEBUG", "MQTT rx: %s", topic);

    if (t.endsWith("/command")) {
        handleCommand(payload);
    } else if (t.endsWith("/config")) {
        handleConfig(payload);
    }
}

void MqttClient::handleCommand(const char* payload) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        logMsg("ERROR", "Command JSON parse error: %s", err.c_str());
        publishAck("unknown", false, "JSON parse error");
        return;
    }

    const char* cmd = doc["command"];
    if (!cmd) {
        publishAck("unknown", false, "Missing 'command' field");
        return;
    }

    String command(cmd);
    logMsg("INFO", "Command received: %s", cmd);

    if (command == "set_fan_speed") {
        int speed = doc["value"] | (doc["payload"]["speed_pct"] | -1);
        if (speed < 0 || speed > 100) {
            publishAck(cmd, false, "Invalid speed (0-100)");
            return;
        }
        actuators.fanSetSpeed(speed);
        automation.setManualOverride(true);
        publishAck(cmd, true, "Fan speed set");
    }
    else if (command == "fan_on") {
        int speed = doc["value"] | (doc["payload"]["speed_pct"] | -1);
        actuators.fanOn(speed);
        automation.setManualOverride(true);
        publishAck(cmd, true, "Fan on");
    }
    else if (command == "fan_off") {
        actuators.fanOff();
        automation.setManualOverride(true);
        publishAck(cmd, true, "Fan off");
    }
    else if (command == "mister_on") {
        actuators.misterOn();
        automation.setManualOverride(true);
        publishAck(cmd, true, "Mister on");
    }
    else if (command == "mister_off") {
        actuators.misterOff();
        automation.setManualOverride(true);
        publishAck(cmd, true, "Mister off");
    }
    else if (command == "valve_open") {
        actuators.valveOpen();
        automation.setManualOverride(true);
        publishAck(cmd, true, "Valve opened");
    }
    else if (command == "valve_close") {
        actuators.valveClose();
        automation.setManualOverride(true);
        publishAck(cmd, true, "Valve closed");
    }
    else if (command == "fill_tank") {
        actuators.valveOpen();
        automation.setManualOverride(true);
        publishAck(cmd, true, "Tank fill started");
    }
    else if (command == "stop_fill") {
        actuators.valveClose();
        automation.setManualOverride(true);
        publishAck(cmd, true, "Tank fill stopped");
    }
    else if (command == "update_config") {
        handleConfig(payload);
        publishAck(cmd, true, "Config updated");
    }
    else if (command == "read_now") {
        sensors.update();
        publishTelemetry();
        publishAck(cmd, true, "Sensor read complete");
    }
    else if (command == "reboot") {
        publishAck(cmd, true, "Rebooting...");
        delay(500);
        ESP.restart();
    }
    else if (command == "factory_reset") {
        publishAck(cmd, true, "Factory reset, rebooting...");
        delay(500);
        storage.factoryReset();
        ESP.restart();
    }
    else if (command == "set_test_mode") {
        JsonObject payload = doc["payload"];
        bool enabled = payload["enabled"] | false;
        if (testMode.isEnabled()) {
            testMode.printCommandReceived(command, enabled ? "enabled:true" : "enabled:false");
        }
        if (enabled) {
            testMode.enable();
            publishAck(cmd, true, "Test mode enabled");
        } else {
            testMode.disable();
            publishAck(cmd, true, "Test mode disabled");
        }
        // Publish status immediately to announce mode change
        publishStatus();
    }
    else if (command == "heater_on") {
        climateController.setHeater(true);
        publishAck(cmd, true, "Heater on");
    }
    else if (command == "heater_off") {
        climateController.setHeater(false);
        publishAck(cmd, true, "Heater off");
    }
    else if (command == "cooling_on") {
        climateController.setCooling(true);
        publishAck(cmd, true, "Cooling on");
    }
    else if (command == "cooling_off") {
        climateController.setCooling(false);
        publishAck(cmd, true, "Cooling off");
    }
    else if (command == "dehumidifier_on") {
        climateController.setDehumidifier(true);
        publishAck(cmd, true, "Dehumidifier on");
    }
    else if (command == "dehumidifier_off") {
        climateController.setDehumidifier(false);
        publishAck(cmd, true, "Dehumidifier off");
    }
    else if (command == "climate_all_off") {
        climateController.allOff();
        publishAck(cmd, true, "All climate relays off");
    }
    else if (command == "set_climate_enabled") {
        JsonObject payload = doc["payload"];
        bool enabled = payload["enabled"] | doc["value"] | true;
        ClimateThresholds t = climateController.getThresholds();
        t.climate_enabled = enabled;
        climateController.setThresholds(t);
        climateController.saveToNVS();
        publishAck(cmd, true, enabled ? "Climate enabled" : "Climate disabled");
    }
    else if (command == "update_climate_config") {
        JsonObject payload = doc["payload"];
        ClimateThresholds t = climateController.getThresholds();
        if (payload.containsKey("heat_on_c"))          t.heat_on_c          = payload["heat_on_c"];
        if (payload.containsKey("heat_off_c"))         t.heat_off_c         = payload["heat_off_c"];
        if (payload.containsKey("cool_on_c"))          t.cool_on_c          = payload["cool_on_c"];
        if (payload.containsKey("cool_off_c"))         t.cool_off_c         = payload["cool_off_c"];
        if (payload.containsKey("dehumid_on_pct"))     t.dehumid_on_pct     = payload["dehumid_on_pct"];
        if (payload.containsKey("dehumid_off_pct"))    t.dehumid_off_pct    = payload["dehumid_off_pct"];
        if (payload.containsKey("heater_safety_min"))  t.heater_safety_min  = payload["heater_safety_min"];
        if (payload.containsKey("cooling_safety_min")) t.cooling_safety_min = payload["cooling_safety_min"];
        if (payload.containsKey("climate_enabled"))    t.climate_enabled    = payload["climate_enabled"];
        if (payload.containsKey("schedule_enabled"))   t.schedule_enabled   = payload["schedule_enabled"];
        if (payload.containsKey("day_start_hour"))     t.day_start_hour     = payload["day_start_hour"];
        if (payload.containsKey("night_start_hour"))   t.night_start_hour   = payload["night_start_hour"];
        if (payload.containsKey("night_heat_on_c"))    t.night_heat_on_c    = payload["night_heat_on_c"];
        if (payload.containsKey("night_heat_off_c"))   t.night_heat_off_c   = payload["night_heat_off_c"];
        if (payload.containsKey("night_cool_on_c"))    t.night_cool_on_c    = payload["night_cool_on_c"];
        if (payload.containsKey("night_cool_off_c"))   t.night_cool_off_c   = payload["night_cool_off_c"];
        climateController.setThresholds(t);
        climateController.saveToNVS();
        publishAck(cmd, true, "Climate config updated");
    }
    else {
        publishAck(cmd, false, "Unknown command");
    }
}

void MqttClient::handleConfig(const char* payload) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        logMsg("ERROR", "Config JSON parse error: %s", err.c_str());
        return;
    }

    if (doc.containsKey("hum_on_pct"))     storage.setHumOnPct(doc["hum_on_pct"]);
    if (doc.containsKey("hum_off_pct"))    storage.setHumOffPct(doc["hum_off_pct"]);
    if (doc.containsKey("co2_high_ppm"))   storage.setCo2HighPpm(doc["co2_high_ppm"]);
    if (doc.containsKey("temp_min_c"))     storage.setTempMinC(doc["temp_min_c"]);
    if (doc.containsKey("temp_max_c"))     storage.setTempMaxC(doc["temp_max_c"]);
    if (doc.containsKey("water_low_cm"))   storage.setWaterLowCm(doc["water_low_cm"]);
    if (doc.containsKey("water_full_cm"))  storage.setWaterFullCm(doc["water_full_cm"]);
    if (doc.containsKey("tank_full_cm"))   storage.setTankFullCm(doc["tank_full_cm"]);
    if (doc.containsKey("tank_empty_cm"))  storage.setTankEmptyCm(doc["tank_empty_cm"]);
    if (doc.containsKey("flow_cal"))       storage.setFlowCal(doc["flow_cal"]);
    if (doc.containsKey("sensor_interval"))storage.setSensorInterval(doc["sensor_interval"]);
    if (doc.containsKey("fan_default_spd"))storage.setFanDefaultSpd(doc["fan_default_spd"]);
    if (doc.containsKey("facility"))       { storage.setFacility(doc["facility"].as<String>()); buildBasePath(); }
    if (doc.containsKey("building"))       { storage.setBuilding(doc["building"].as<String>()); buildBasePath(); }
    if (doc.containsKey("unit"))           { storage.setUnit(doc["unit"].as<String>()); buildBasePath(); }
    if (doc.containsKey("device_name"))    { storage.setDeviceName(doc["device_name"].as<String>()); buildBasePath(); }

    logMsg("INFO", "Configuration updated via MQTT");
}

void MqttClient::publishTelemetry() {
    if (!client.connected()) return;

    StaticJsonDocument<1536> doc;

    doc["temperature"]      = serialized(String(sensors.readings.temperature, 1));
    doc["humidity"]          = serialized(String(sensors.readings.humidity, 1));
    doc["pressure"]          = serialized(String(sensors.readings.pressure, 1));
    doc["co2_ppm"]           = sensors.readings.co2_ppm;
    doc["distance_cm"]       = serialized(String(sensors.readings.distance_cm, 1));
    doc["tank_pct"]          = serialized(String(sensors.readings.tank_pct, 0));

    doc["valve_open"]        = actuators.isValveOpen();
    doc["mister_on"]         = actuators.isMisterOn();
    doc["fan_on"]            = actuators.isFanOn();
    doc["fan_speed_pct"]     = actuators.getFanSpeed();

    doc["uptime_s"]          = millis() / 1000;
    doc["rssi"]              = WiFi.RSSI();
    doc["autonomous_mode"]   = automation.isAutonomous();

    doc["bme280_ok"]         = sensors.readings.bme280_ok;
    doc["mhz19_ok"]          = sensors.readings.mhz19_ok;
    doc["ultrasonic_ok"]     = sensors.readings.ultrasonic_ok;

    // Test mode fields
    doc["test_mode"]         = testMode.isEnabled();
    if (testMode.isEnabled()) {
        doc["test_phase"]                = testMode.getPhaseDescription();
        doc["test_cycle_progress_pct"]   = testMode.getCycleProgressPct();
    }

    // Climate control fields
    doc["heater_on"]              = climateController.getState().heater_on;
    doc["cooling_on"]             = climateController.getState().cooling_on;
    doc["dehumidifier_on"]        = climateController.getState().dehumidifier_on;
    doc["climate_enabled"]        = climateController.getThresholds().climate_enabled;
    doc["climate_mode"]           = climateController.isDaytime() ? "day" : "night";
    doc["heater_safety_tripped"]  = climateController.getState().heater_safety_tripped;
    doc["cooling_safety_tripped"] = climateController.getState().cooling_safety_tripped;
    doc["sensor_error"]           = climateController.getState().sensor_error;

    char buffer[1536];
    size_t len = serializeJson(doc, buffer, sizeof(buffer));


    String topic = topicFor("telemetry");
    client.publish(topic.c_str(), buffer, false);

    if (testMode.isEnabled()) {
        testMode.printPublished(topic, len);
    } else {
        logMsg("DEBUG", "Published telemetry (%d bytes)", len);
    }
}

void MqttClient::publishStatus() {
    if (!client.connected()) return;

    StaticJsonDocument<256> doc;
    doc["state"]             = "online";
    doc["uptime_s"]          = millis() / 1000;
    doc["rssi"]              = WiFi.RSSI();
    doc["free_heap"]         = ESP.getFreeHeap();
    doc["firmware_version"]  = FIRMWARE_VERSION;
    doc["test_mode"]         = testMode.isEnabled();

    char buffer[256];
    serializeJson(doc, buffer, sizeof(buffer));

    String topic = topicFor("status");
    client.publish(topic.c_str(), buffer, true);  // retained
    logMsg("DEBUG", "Published status heartbeat");
}

void MqttClient::publishFlow(float flow_lpm, float session_liters, float total_liters) {
    if (!client.connected()) return;

    StaticJsonDocument<256> doc;

    if (testMode.isEnabled()) {
        VirtualActuatorState va = testMode.getActuatorState();
        SimulatedReadings sim = testMode.generateReadings();
        doc["flow_lpm"]      = serialized(String(sim.flow_rate_lpm, 2));
        doc["session_liters"]= serialized(String(va.session_liters_virtual, 3));
        doc["total_liters"]  = serialized(String(total_liters, 3));
        doc["valve_open"]    = va.valve_open;
        doc["test_mode"]     = true;
    } else {
        doc["flow_lpm"]          = serialized(String(flow_lpm, 2));
        doc["session_liters"]    = serialized(String(session_liters, 3));
        doc["total_liters"]      = serialized(String(total_liters, 3));
        doc["valve_open"]        = actuators.isValveOpen();
        doc["test_mode"]         = false;
    }

    char buffer[256];
    serializeJson(doc, buffer, sizeof(buffer));

    String topic = topicFor("flow");
    client.publish(topic.c_str(), buffer, false);
    logMsg("DEBUG", "Published flow data");
}

void MqttClient::publishAlert(const char* alert_type, const char* message) {
    if (!client.connected()) return;

    StaticJsonDocument<256> doc;
    doc["alert_type"]  = alert_type;
    doc["message"]     = message;
    doc["uptime_s"]    = millis() / 1000;
    doc["timestamp"]   = millis();

    char buffer[256];
    serializeJson(doc, buffer, sizeof(buffer));

    String topic = topicFor("alert");
    client.publish(topic.c_str(), buffer, false);
    logMsg("WARN", "Alert published: [%s] %s", alert_type, message);
}

void MqttClient::publishAck(const char* command, bool success, const char* message) {
    if (!client.connected()) return;

    StaticJsonDocument<192> doc;
    doc["command"]  = command;
    doc["success"]  = success;
    doc["message"]  = message;

    char buffer[192];
    serializeJson(doc, buffer, sizeof(buffer));

    String topic = topicFor("ack");
    client.publish(topic.c_str(), buffer, false);
    logMsg("DEBUG", "Ack: %s success=%s", command, success ? "true" : "false");
}
