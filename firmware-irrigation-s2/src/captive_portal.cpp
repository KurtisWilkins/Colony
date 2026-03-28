#include "captive_portal.h"
#include "config.h"
#include "storage.h"
#include "portal_html.h"
#include <WiFi.h>
#include <LittleFS.h>
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

    // Start DNS server — redirect all domains to our IP
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
    // Serve the embedded HTML from PROGMEM — no LittleFS upload needed
    server.send_P(200, "text/html", PORTAL_HTML);
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

    // Timezone
    if (server.hasArg("timezone") && server.arg("timezone").length() > 0) {
        storage.setTimezone(server.arg("timezone"));
    }

    // Zone count
    if (server.hasArg("zone_count") && server.arg("zone_count").length() > 0) {
        storage.setZoneCount(server.arg("zone_count").toInt());
    }

    // Safety settings
    if (server.hasArg("safety_max_runtime") && server.arg("safety_max_runtime").length() > 0) {
        storage.setSafetyMaxRuntime(server.arg("safety_max_runtime").toInt());
    }
    if (server.hasArg("safety_max_daily") && server.arg("safety_max_daily").length() > 0) {
        storage.setSafetyMaxDaily(server.arg("safety_max_daily").toInt());
    }

    server.send(200, "text/html",
        "<!DOCTYPE html><html><head>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<style>body{background:#0d0d0d;color:#00ff41;font-family:'Courier New',monospace;"
        "text-align:center;padding:50px;}"
        "h1{color:#00ff41;text-shadow:0 0 10px rgba(0,255,65,0.5);}</style></head><body>"
        "<h1>Irrigation S2 Controller Configured</h1>"
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
        "<style>body{background:#0d0d0d;color:#00ff41;font-family:'Courier New',monospace;"
        "text-align:center;padding:50px;}"
        "h1{color:#00ff41;text-shadow:0 0 10px rgba(0,255,65,0.5);}</style></head><body>"
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
