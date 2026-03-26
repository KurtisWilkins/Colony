#include "captive_portal.h"
#include "config.h"
#include "storage.h"
#include <WiFi.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>

CaptivePortal captivePortal;

extern void logMsg(const char* level, const char* fmt, ...);

CaptivePortal::CaptivePortal()
    : server(80)
    , active(false)
{
}

void CaptivePortal::begin() {
    // Start AP mode
    WiFi.mode(WIFI_AP);
    WiFi.softAPConfig(AP_IP, AP_IP, IPAddress(255, 255, 255, 0));
    WiFi.softAP(AP_SSID);

    logMsg("INFO", "AP started: SSID=%s IP=%s", AP_SSID, WiFi.softAPIP().toString().c_str());

    // Start DNS server - redirect all domains to our IP
    dnsServer.start(DNS_PORT, "*", AP_IP);

    // Setup HTTP routes
    server.on("/", HTTP_GET, [this]() { handleRoot(); });
    server.on("/scan", HTTP_GET, [this]() { handleScan(); });
    server.on("/save", HTTP_POST, [this]() { handleSave(); });
    server.on("/reset", HTTP_POST, [this]() { handleReset(); });
    server.onNotFound([this]() { handleNotFound(); });

    server.begin();
    active = true;

    logMsg("INFO", "Captive portal active on http://192.168.4.1");
}

void CaptivePortal::loop() {
    if (!active) return;
    dnsServer.processNextRequest();
    server.handleClient();
}

void CaptivePortal::handleRoot() {
    if (SPIFFS.exists("/portal.html")) {
        File file = SPIFFS.open("/portal.html", "r");
        server.streamFile(file, "text/html");
        file.close();
    } else {
        server.send(200, "text/html",
            "<!DOCTYPE html><html><body>"
            "<h1>GrowTent Setup</h1>"
            "<p>Error: portal.html not found in SPIFFS.</p>"
            "<p>Upload the data/ folder using: pio run --target uploadfs</p>"
            "</body></html>"
        );
    }
}

void CaptivePortal::handleScan() {
    logMsg("INFO", "WiFi scan requested");

    int n = WiFi.scanNetworks();
    StaticJsonDocument<1024> doc;
    JsonArray networks = doc.createNestedArray("networks");

    for (int i = 0; i < n && i < 20; i++) {
        JsonObject net = networks.createNestedObject();
        net["ssid"] = WiFi.SSID(i);
        net["rssi"] = WiFi.RSSI(i);
        net["secure"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
    }

    char buffer[1024];
    serializeJson(doc, buffer, sizeof(buffer));
    server.send(200, "application/json", buffer);

    WiFi.scanDelete();
    logMsg("INFO", "WiFi scan complete: %d networks found", n);
}

void CaptivePortal::handleSave() {
    logMsg("INFO", "Configuration save requested");

    // WiFi credentials
    if (server.hasArg("wifi_ssid") && server.arg("wifi_ssid").length() > 0) {
        storage.setWifiSsid(server.arg("wifi_ssid"));
    }
    if (server.hasArg("wifi_pass")) {
        storage.setWifiPass(server.arg("wifi_pass"));
    }

    // MQTT
    if (server.hasArg("mqtt_host") && server.arg("mqtt_host").length() > 0) {
        storage.setMqttHost(server.arg("mqtt_host"));
    }
    if (server.hasArg("mqtt_port") && server.arg("mqtt_port").length() > 0) {
        storage.setMqttPort(server.arg("mqtt_port").toInt());
    }
    if (server.hasArg("mqtt_user")) {
        storage.setMqttUser(server.arg("mqtt_user"));
    }
    if (server.hasArg("mqtt_pass")) {
        storage.setMqttPass(server.arg("mqtt_pass"));
    }

    // Device Identity
    if (server.hasArg("facility") && server.arg("facility").length() > 0) {
        storage.setFacility(server.arg("facility"));
    }
    if (server.hasArg("building") && server.arg("building").length() > 0) {
        storage.setBuilding(server.arg("building"));
    }
    if (server.hasArg("unit") && server.arg("unit").length() > 0) {
        storage.setUnit(server.arg("unit"));
    }
    if (server.hasArg("device_name") && server.arg("device_name").length() > 0) {
        storage.setDeviceName(server.arg("device_name"));
    }

    // Tank Calibration
    if (server.hasArg("tank_full_cm") && server.arg("tank_full_cm").length() > 0) {
        storage.setTankFullCm(server.arg("tank_full_cm").toFloat());
    }
    if (server.hasArg("tank_empty_cm") && server.arg("tank_empty_cm").length() > 0) {
        storage.setTankEmptyCm(server.arg("tank_empty_cm").toFloat());
    }

    // Flow Calibration
    if (server.hasArg("flow_cal") && server.arg("flow_cal").length() > 0) {
        storage.setFlowCal(server.arg("flow_cal").toFloat());
    }

    // Thresholds
    if (server.hasArg("hum_on_pct") && server.arg("hum_on_pct").length() > 0) {
        storage.setHumOnPct(server.arg("hum_on_pct").toFloat());
    }
    if (server.hasArg("hum_off_pct") && server.arg("hum_off_pct").length() > 0) {
        storage.setHumOffPct(server.arg("hum_off_pct").toFloat());
    }
    if (server.hasArg("co2_high_ppm") && server.arg("co2_high_ppm").length() > 0) {
        storage.setCo2HighPpm(server.arg("co2_high_ppm").toInt());
    }
    if (server.hasArg("temp_min_c") && server.arg("temp_min_c").length() > 0) {
        storage.setTempMinC(server.arg("temp_min_c").toFloat());
    }
    if (server.hasArg("temp_max_c") && server.arg("temp_max_c").length() > 0) {
        storage.setTempMaxC(server.arg("temp_max_c").toFloat());
    }
    if (server.hasArg("water_low_cm") && server.arg("water_low_cm").length() > 0) {
        storage.setWaterLowCm(server.arg("water_low_cm").toFloat());
    }
    if (server.hasArg("water_full_cm") && server.arg("water_full_cm").length() > 0) {
        storage.setWaterFullCm(server.arg("water_full_cm").toFloat());
    }

    // Intervals & Fan
    if (server.hasArg("sensor_interval") && server.arg("sensor_interval").length() > 0) {
        storage.setSensorInterval(server.arg("sensor_interval").toInt());
    }
    if (server.hasArg("fan_default_spd") && server.arg("fan_default_spd").length() > 0) {
        storage.setFanDefaultSpd(server.arg("fan_default_spd").toInt());
    }

    server.send(200, "text/html",
        "<!DOCTYPE html><html><head>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>body{background:#1a1a2e;color:#0f0;font-family:monospace;text-align:center;padding:50px;}"
        "h1{color:#00ff41;}</style></head><body>"
        "<h1>Device Configured</h1>"
        "<p>Rebooting in 3 seconds...</p>"
        "</body></html>"
    );

    logMsg("INFO", "Configuration saved, rebooting in 3s...");
    delay(3000);
    ESP.restart();
}

void CaptivePortal::handleReset() {
    logMsg("INFO", "WiFi credential reset requested");
    storage.clearWifiCredentials();

    server.send(200, "text/html",
        "<!DOCTYPE html><html><head>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>body{background:#1a1a2e;color:#0f0;font-family:monospace;text-align:center;padding:50px;}"
        "h1{color:#00ff41;}</style></head><body>"
        "<h1>WiFi Credentials Cleared</h1>"
        "<p>Rebooting...</p>"
        "</body></html>"
    );

    delay(2000);
    ESP.restart();
}

void CaptivePortal::handleNotFound() {
    // Redirect everything to root for captive portal detection
    server.sendHeader("Location", "http://192.168.4.1/");
    server.send(302, "text/plain", "Redirecting to setup portal");
}
