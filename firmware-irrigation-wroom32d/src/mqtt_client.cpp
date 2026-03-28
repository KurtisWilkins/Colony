#include "mqtt_client.h"
#include "config.h"
#include "storage.h"
#include "zone_manager.h"
#include "scheduler.h"
#include "ntp_client.h"
#include "test_mode.h"
#include "relays.h"
#include <ArduinoJson.h>

MqttClient mqttClient;

extern void logMsg(const char* level, const char* fmt, ...);

// ============================================================================
// Global zone event publisher (called from zone_manager and scheduler)
// ============================================================================
void publishZoneEvent(const char* event, uint8_t zone_index, const char* reason) {
    mqttClient.publishZoneEvent(event, zone_index, reason);
}

MqttClient::MqttClient()
    : client(espClient)
    , last_connect_attempt(0)
{
}

void MqttClient::begin() {
    buildBasePath();
    client.setServer(storage.data.mqtt_host.c_str(), storage.data.mqtt_port);
    client.setCallback(messageCallback);
    client.setBufferSize(2048);
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

    String clientId = "irrigation-" + String((uint32_t)ESP.getEfuseMac(), HEX);
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

        // Subscribe to command, config, and weather topics
        String cmdTopic = topicFor("command");
        String cfgTopic = topicFor("config");
        String weatherTopic = topicFor("weather");
        client.subscribe(cmdTopic.c_str(), 1);
        client.subscribe(cfgTopic.c_str(), 1);
        client.subscribe(weatherTopic.c_str(), 1);
        logMsg("INFO", "Subscribed: %s", cmdTopic.c_str());
        logMsg("INFO", "Subscribed: %s", cfgTopic.c_str());
        logMsg("INFO", "Subscribed: %s", weatherTopic.c_str());

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

// ============================================================================
// Message Routing
// ============================================================================

void MqttClient::messageCallback(char* topic, byte* payload, unsigned int length) {
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
    } else if (t.endsWith("/weather")) {
        handleWeather(payload);
    }
}

// ============================================================================
// Command Handler
// ============================================================================

void MqttClient::handleCommand(const char* payload) {
    StaticJsonDocument<1024> doc;
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

    if (testMode.isEnabled()) {
        testMode.printCommandReceived(command, "");
    }

    // ── open_zone ───────────────────────────────────────────────────────
    if (command == "open_zone") {
        int zone = doc["zone"] | -1;
        if (zone < 0 || zone >= NUM_ZONES) {
            publishAck(cmd, false, "Invalid zone index");
            return;
        }
        uint16_t rt = doc["runtime_s"] | 0;
        if (rt > 0) {
            // Temporarily set runtime for this run
            zoneManager.zones[zone].runtime_s = rt;
        }
        bool ok = zoneManager.openZone((uint8_t)zone);
        publishAck(cmd, ok, ok ? "Zone opened" : "Failed to open zone");
    }
    // ── close_zone ──────────────────────────────────────────────────────
    else if (command == "close_zone") {
        int zone = doc["zone"] | -1;
        if (zone < 0 || zone >= NUM_ZONES) {
            publishAck(cmd, false, "Invalid zone index");
            return;
        }
        bool ok = zoneManager.closeZone((uint8_t)zone);
        publishAck(cmd, ok, ok ? "Zone closed" : "Zone was not open");
    }
    // ── close_all ───────────────────────────────────────────────────────
    else if (command == "close_all") {
        zoneManager.closeAllZones();
        publishAck(cmd, true, "All zones closed");
    }
    // ── run_program ─────────────────────────────────────────────────────
    else if (command == "run_program") {
        int group = doc["group"] | 0;
        JsonArray zones_arr = doc["zones"];

        if (zones_arr) {
            // Explicit list of zones to run
            zoneManager.clearQueue();
            for (JsonVariant v : zones_arr) {
                int zi = v["zone"] | -1;
                uint16_t rt = v["runtime_s"] | 0;
                if (zi >= 0 && zi < NUM_ZONES) {
                    zoneManager.queueZone((uint8_t)zi, rt);
                }
            }
            zoneManager.startQueue();
            publishAck(cmd, true, "Program started from zone list");
        } else if (group > 0) {
            // Run all zones in a group
            zoneManager.clearQueue();
            bool ok = zoneManager.queueProgram((uint8_t)group);
            if (ok) {
                zoneManager.startQueue();
                publishAck(cmd, true, "Program started for group");
            } else {
                publishAck(cmd, false, "No enabled zones in group");
            }
        } else {
            // Run all enabled zones sequentially
            zoneManager.clearQueue();
            for (uint8_t i = 0; i < NUM_ZONES; i++) {
                if (zoneManager.zones[i].enabled && i < storage.data.zone_count) {
                    zoneManager.queueZone(i, 0);
                }
            }
            zoneManager.startQueue();
            publishAck(cmd, true, "Full program started");
        }
    }
    // ── stop_program ────────────────────────────────────────────────────
    else if (command == "stop_program") {
        zoneManager.stopQueue();
        publishAck(cmd, true, "Program stopped");
    }
    // ── configure_zone ──────────────────────────────────────────────────
    else if (command == "configure_zone") {
        int zone = doc["zone"] | -1;
        if (zone < 0 || zone >= NUM_ZONES) {
            publishAck(cmd, false, "Invalid zone index");
            return;
        }

        JsonObject p = doc["payload"] | doc.as<JsonObject>();
        if (p.containsKey("name"))      storage.setZoneName(zone, p["name"].as<String>());
        if (p.containsKey("runtime_s")) storage.setZoneRuntime(zone, p["runtime_s"]);
        if (p.containsKey("enabled"))   storage.setZoneEnabled(zone, p["enabled"]);
        if (p.containsKey("group"))     storage.setZoneGroup(zone, p["group"]);

        zoneManager.reloadFromStorage();
        publishAck(cmd, true, "Zone configured");
    }
    // ── set_schedule ────────────────────────────────────────────────────
    else if (command == "set_schedule") {
        int zone = doc["zone"] | -1;
        if (zone < 0 || zone >= MAX_SCHEDULES) {
            publishAck(cmd, false, "Invalid zone index for schedule");
            return;
        }

        ZoneSchedule sched;
        sched.zone_index = (uint8_t)zone;
        sched.enabled    = doc["enabled"] | false;
        sched.runtime_s  = doc["runtime_s"] | DEFAULT_ZONE_RUNTIME_S;
        sched.days_of_week = doc["days_of_week"] | 0x7F;
        sched.seasonal_config_index = doc["seasonal_config"] | 255;

        JsonArray windows = doc["windows"];
        for (uint8_t w = 0; w < MAX_TIME_WINDOWS; w++) {
            if (windows && w < windows.size()) {
                JsonObject win = windows[w];
                sched.windows[w].start_hour   = win["start_hour"]   | 6;
                sched.windows[w].start_minute  = win["start_minute"] | 0;
                sched.windows[w].end_hour      = win["end_hour"]     | 6;
                sched.windows[w].end_minute    = win["end_minute"]   | 30;
                sched.windows[w].enabled       = win["enabled"]      | false;
            } else {
                sched.windows[w].enabled = false;
                sched.windows[w].start_hour = 6;
                sched.windows[w].start_minute = 0;
                sched.windows[w].end_hour = 6;
                sched.windows[w].end_minute = 30;
            }
        }

        scheduler.setSchedule((uint8_t)zone, sched);
        publishAck(cmd, true, "Schedule set");
    }
    // ── set_seasonal_config ─────────────────────────────────────────────
    else if (command == "set_seasonal_config") {
        int index = doc["index"] | -1;
        if (index < 0 || index >= MAX_SEASONAL_CONFIGS) {
            publishAck(cmd, false, "Invalid seasonal config index");
            return;
        }

        SeasonalConfig sc;
        sc.name               = doc["name"] | "";
        sc.start_month        = doc["start_month"] | 0;
        sc.start_day          = doc["start_day"]   | 1;
        sc.end_month          = doc["end_month"]   | 11;
        sc.end_day            = doc["end_day"]     | 31;
        sc.runtime_multiplier = doc["runtime_multiplier"] | 1.0f;
        sc.skip_if_rained     = doc["skip_if_rained"] | false;
        sc.rain_threshold_mm  = doc["rain_threshold_mm"] | 5.0f;

        scheduler.setSeasonalConfig((uint8_t)index, sc);
        publishAck(cmd, true, "Seasonal config set");
    }
    // ── set_test_mode ───────────────────────────────────────────────────
    else if (command == "set_test_mode") {
        bool enabled = doc["enabled"] | (doc["payload"]["enabled"] | false);
        if (enabled) {
            testMode.enable();
            publishAck(cmd, true, "Test mode enabled");
        } else {
            testMode.disable();
            publishAck(cmd, true, "Test mode disabled");
        }
        publishStatus();
    }
    // ── read_now ────────────────────────────────────────────────────────
    else if (command == "read_now") {
        publishTelemetry();
        publishAck(cmd, true, "Telemetry published");
    }
    // ── reboot ──────────────────────────────────────────────────────────
    else if (command == "reboot") {
        publishAck(cmd, true, "Rebooting...");
        delay(500);
        ESP.restart();
    }
    // ── factory_reset ───────────────────────────────────────────────────
    else if (command == "factory_reset") {
        publishAck(cmd, true, "Factory reset, rebooting...");
        zoneManager.closeAllZones();
        delay(500);
        storage.factoryReset();
        ESP.restart();
    }
    // ── unknown ─────────────────────────────────────────────────────────
    else {
        publishAck(cmd, false, "Unknown command");
    }
}

// ============================================================================
// Config Handler
// ============================================================================

void MqttClient::handleConfig(const char* payload) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        logMsg("ERROR", "Config JSON parse error: %s", err.c_str());
        return;
    }

    if (doc.containsKey("facility"))          { storage.setFacility(doc["facility"].as<String>()); buildBasePath(); }
    if (doc.containsKey("building"))          { storage.setBuilding(doc["building"].as<String>()); buildBasePath(); }
    if (doc.containsKey("unit"))              { storage.setUnit(doc["unit"].as<String>()); buildBasePath(); }
    if (doc.containsKey("device_name"))       { storage.setDeviceName(doc["device_name"].as<String>()); buildBasePath(); }
    if (doc.containsKey("timezone"))          storage.setTimezone(doc["timezone"].as<String>());
    if (doc.containsKey("safety_max_runtime"))storage.setSafetyMaxRuntime(doc["safety_max_runtime"]);
    if (doc.containsKey("safety_max_daily"))  storage.setSafetyMaxDaily(doc["safety_max_daily"]);
    if (doc.containsKey("zone_count"))        storage.setZoneCount(doc["zone_count"]);

    logMsg("INFO", "Configuration updated via MQTT");
}

// ============================================================================
// Weather Handler
// ============================================================================

void MqttClient::handleWeather(const char* payload) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        logMsg("ERROR", "Weather JSON parse error: %s", err.c_str());
        return;
    }

    if (doc.containsKey("recent_rainfall_mm")) {
        float rain = doc["recent_rainfall_mm"];
        scheduler.setRecentRainfall(rain);
    }

    logMsg("INFO", "Weather data received via MQTT");
}

// ============================================================================
// Publish Telemetry
// ============================================================================

void MqttClient::publishTelemetry() {
    if (!client.connected()) return;

    StaticJsonDocument<2048> doc;

    // Active zone info
    uint8_t active = zoneManager.getActiveZone();
    doc["active_zone"]       = (active == 255) ? -1 : (int)active;
    doc["zones_open"]        = zoneManager.getZonesOpenCount();
    doc["queue_running"]     = zoneManager.isQueueRunning();
    doc["queue_length"]      = zoneManager.getQueueLength();
    doc["queue_position"]    = zoneManager.getQueuePosition();

    // Active zone runtime
    if (active != 255) {
        doc["active_zone_name"]  = zoneManager.zones[active].name;
        doc["active_runtime_s"]  = (unsigned long)(zoneManager.getZoneRuntime(active) / 1000);
        doc["active_target_s"]   = zoneManager.zones[active].runtime_s;
    }

    // Per-zone status array
    JsonArray zonesArr = doc.createNestedArray("zones");
    for (uint8_t i = 0; i < storage.data.zone_count; i++) {
        JsonObject z = zonesArr.createNestedObject();
        z["index"]    = i;
        z["name"]     = zoneManager.zones[i].name;
        z["enabled"]  = zoneManager.zones[i].enabled;
        z["is_open"]  = zoneManager.zones[i].is_open;
        z["group"]    = zoneManager.zones[i].group;
        if (zoneManager.zones[i].is_open) {
            z["runtime_ms"] = zoneManager.getZoneRuntime(i);
        }
    }

    // NTP time
    doc["ntp_synced"] = ntpClient.isTimeSynced();
    if (ntpClient.isTimeSynced()) {
        doc["time"] = ntpClient.getTimeString();
    }

    // System info
    doc["uptime_s"]          = millis() / 1000;
    doc["rssi"]              = WiFi.RSSI();
    doc["free_heap"]         = ESP.getFreeHeap();

    // Weather data
    doc["recent_rainfall_mm"] = serialized(String(scheduler.getRecentRainfall(), 1));

    // Test mode flag — included in ALL payloads
    doc["test_mode"]         = testMode.isEnabled();
    if (testMode.isEnabled()) {
        doc["test_cycle_zone"]   = testMode.getCurrentCycleZone();
    }

    char buffer[2048];
    size_t len = serializeJson(doc, buffer, sizeof(buffer));

    String topic = topicFor("telemetry");
    client.publish(topic.c_str(), buffer, false);

    if (testMode.isEnabled()) {
        testMode.printPublished(topic, len);
    } else {
        logMsg("DEBUG", "Published telemetry (%d bytes)", len);
    }
}

// ============================================================================
// Publish Zone Event
// ============================================================================

void MqttClient::publishZoneEvent(const char* event, uint8_t zone_index, const char* reason) {
    if (!client.connected()) return;

    StaticJsonDocument<512> doc;
    doc["event"]      = event;
    doc["zone"]       = (zone_index == 255) ? -1 : (int)zone_index;
    doc["reason"]     = reason;
    doc["uptime_s"]   = millis() / 1000;
    doc["test_mode"]  = testMode.isEnabled();

    if (zone_index < NUM_ZONES) {
        doc["zone_name"]  = zoneManager.zones[zone_index].name;
        doc["gpio_pin"]   = zoneManager.zones[zone_index].gpio_pin;
    }

    if (ntpClient.isTimeSynced()) {
        doc["time"] = ntpClient.getTimeString();
    }

    char buffer[512];
    serializeJson(doc, buffer, sizeof(buffer));

    String topic = topicFor("zone_event");
    client.publish(topic.c_str(), buffer, false);
    logMsg("INFO", "Zone event: %s zone=%d reason=%s", event, zone_index, reason);
}

// ============================================================================
// Publish Status Heartbeat
// ============================================================================

void MqttClient::publishStatus() {
    if (!client.connected()) return;

    StaticJsonDocument<256> doc;
    doc["state"]             = "online";
    doc["uptime_s"]          = millis() / 1000;
    doc["rssi"]              = WiFi.RSSI();
    doc["free_heap"]         = ESP.getFreeHeap();
    doc["firmware_version"]  = FIRMWARE_VERSION;
    doc["test_mode"]         = testMode.isEnabled();
    doc["zones_open"]        = zoneManager.getZonesOpenCount();
    doc["queue_running"]     = zoneManager.isQueueRunning();
    doc["ntp_synced"]        = ntpClient.isTimeSynced();

    char buffer[256];
    serializeJson(doc, buffer, sizeof(buffer));

    String topic = topicFor("status");
    client.publish(topic.c_str(), buffer, true);  // retained
    logMsg("DEBUG", "Published status heartbeat");
}

// ============================================================================
// Publish Ack
// ============================================================================

void MqttClient::publishAck(const char* command, bool success, const char* message) {
    if (!client.connected()) return;

    StaticJsonDocument<192> doc;
    doc["command"]   = command;
    doc["success"]   = success;
    doc["message"]   = message;
    doc["test_mode"] = testMode.isEnabled();

    char buffer[192];
    serializeJson(doc, buffer, sizeof(buffer));

    String topic = topicFor("ack");
    client.publish(topic.c_str(), buffer, false);
    logMsg("DEBUG", "Ack: %s success=%s", command, success ? "true" : "false");
}
