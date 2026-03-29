// ============================================================================
// Colony RFID Reader Firmware - Arduino IDE Version
// ESP32 + MFRC522 NFC/RFID Tag Scanner
//
// Reads NFC/RFID tags and posts scan events to the Colony server REST API.
// On first boot (no WiFi configured), starts a captive portal for setup.
//
// Board:    ESP32 Dev Module
// Library:  MFRC522 by miguelbalboa (>= 1.4.10)
//           ArduinoJson by bblanchon (>= 6.21.3)
//
// Install via Arduino Library Manager before compiling.
// Select board "ESP32 Dev Module" and set upload speed to 921600.
// ============================================================================

#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <time.h>

#include "config.h"
#include "portal_html.h"

// ─── Global Objects ─────────────────────────────────────────────────────────
MFRC522 rfid(SS_PIN, RST_PIN);
Preferences prefs;
WebServer webServer(PORTAL_PORT);
DNSServer dnsServer;

// ─── Stored Configuration ───────────────────────────────────────────────────
String cfgSsid;
String cfgPass;
String cfgServerUrl;
String cfgLocationId;
String cfgScannerName;
String cfgAuthToken;

// ─── State ──────────────────────────────────────────────────────────────────
String lastTagUid = "";
unsigned long lastTagTime = 0;
unsigned long lastWifiCheck = 0;
bool portalMode = false;

// ─── Forward Declarations ───────────────────────────────────────────────────
void loadConfig();
void saveConfig(String ssid, String pass, String server, String location, String scanner);
void startCaptivePortal();
void handlePortalRoot();
void handlePortalSave();
void handlePortalScan();
void handlePortalNotFound();
bool connectWifi();
String readTagUid();
void postScanEvent(const String &uid);
void ledFlash(int count, int onMs, int offMs);
String getTimestamp();
void serialLog(const String &msg);

// ============================================================================
// SETUP
// ============================================================================
void setup() {
    Serial.begin(115200);
    delay(500);

    Serial.println();
    Serial.println("========================================");
    Serial.println("  Colony RFID Reader v1.0");
    Serial.println("========================================");

    // Initialize LED
    pinMode(LED_PIN, OUTPUT);
    digitalWrite(LED_PIN, LOW);

    // Initialize SPI and MFRC522
    SPI.begin();
    rfid.PCD_Init();
    delay(100);

    // Verify MFRC522 is connected
    byte version = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    if (version == 0x00 || version == 0xFF) {
        Serial.println("[ERROR] MFRC522 not detected! Check wiring.");
        Serial.println("  SDA=GPIO5, SCK=GPIO18, MOSI=GPIO23, MISO=GPIO19, RST=GPIO22");
    } else {
        Serial.print("[OK] MFRC522 firmware version: 0x");
        Serial.println(version, HEX);
    }

    // Load configuration from NVS
    loadConfig();

    Serial.print("[CONFIG] SSID: ");
    Serial.println(cfgSsid.length() > 0 ? cfgSsid : "(not set)");
    Serial.print("[CONFIG] Server: ");
    Serial.println(cfgServerUrl);
    Serial.print("[CONFIG] Location: ");
    Serial.println(cfgLocationId);
    Serial.print("[CONFIG] Scanner: ");
    Serial.println(cfgScannerName);

    // If no WiFi credentials, start captive portal
    if (cfgSsid.length() == 0) {
        Serial.println("[SETUP] No WiFi configured, starting captive portal...");
        startCaptivePortal();
        return;
    }

    // Connect to WiFi
    if (!connectWifi()) {
        Serial.println("[WARN] WiFi connection failed, starting captive portal...");
        startCaptivePortal();
        return;
    }

    // Configure time via NTP for timestamps
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");

    // Boot complete indicator: 3 quick flashes
    ledFlash(3, 100, 100);

    Serial.println("[READY] Scanning for RFID tags...");
    Serial.println("----------------------------------------");
}

// ============================================================================
// MAIN LOOP
// ============================================================================
void loop() {
    // ── Captive Portal Mode ─────────────────────────────────────────────
    if (portalMode) {
        dnsServer.processNextRequest();
        webServer.handleClient();
        return;
    }

    // ── WiFi Reconnect ──────────────────────────────────────────────────
    if (WiFi.status() != WL_CONNECTED) {
        unsigned long now = millis();
        if (now - lastWifiCheck > WIFI_RECONNECT_INTERVAL) {
            lastWifiCheck = now;
            serialLog("WiFi disconnected, reconnecting...");
            connectWifi();
        }
        return;  // Don't attempt scans without WiFi
    }

    // ── RFID Scan ───────────────────────────────────────────────────────
    if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
        return;
    }

    // Read UID
    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
        if (rfid.uid.uidByte[i] < 0x10) uid += "0";
        uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();

    // Halt card
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();

    // Debounce: skip if same tag scanned within TAG_DEBOUNCE_MS
    unsigned long now = millis();
    if (uid == lastTagUid && (now - lastTagTime) < TAG_DEBOUNCE_MS) {
        return;
    }
    lastTagUid = uid;
    lastTagTime = now;

    // Flash LED on (will be turned off after POST)
    digitalWrite(LED_PIN, HIGH);

    serialLog("Tag: " + uid);

    // Post scan event
    postScanEvent(uid);
}

// ============================================================================
// CONFIGURATION (NVS)
// ============================================================================
void loadConfig() {
    prefs.begin(NVS_NAMESPACE, true);  // read-only
    cfgSsid        = prefs.getString(NVS_KEY_SSID, "");
    cfgPass        = prefs.getString(NVS_KEY_PASS, "");
    cfgServerUrl   = prefs.getString(NVS_KEY_SERVER, DEFAULT_SERVER_URL);
    cfgLocationId  = prefs.getString(NVS_KEY_LOC, DEFAULT_LOCATION_ID);
    cfgScannerName = prefs.getString(NVS_KEY_NAME, DEFAULT_SCANNER_NAME);
    cfgAuthToken   = prefs.getString(NVS_KEY_TOKEN, "");
    prefs.end();
}

void saveConfig(String ssid, String pass, String server, String location, String scanner) {
    prefs.begin(NVS_NAMESPACE, false);  // read-write
    prefs.putString(NVS_KEY_SSID, ssid);
    prefs.putString(NVS_KEY_PASS, pass);
    prefs.putString(NVS_KEY_SERVER, server);
    prefs.putString(NVS_KEY_LOC, location);
    prefs.putString(NVS_KEY_NAME, scanner);
    prefs.end();
}

// ============================================================================
// WIFI
// ============================================================================
bool connectWifi() {
    Serial.print("[WIFI] Connecting to: ");
    Serial.println(cfgSsid);

    WiFi.mode(WIFI_STA);
    WiFi.begin(cfgSsid.c_str(), cfgPass.c_str());

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - start > WIFI_CONNECT_TIMEOUT) {
            Serial.println("\n[WIFI] Connection timeout");
            return false;
        }
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.print("[WIFI] Connected! IP: ");
    Serial.println(WiFi.localIP());
    return true;
}

// ============================================================================
// HTTP POST SCAN EVENT
// ============================================================================
void postScanEvent(const String &uid) {
    if (WiFi.status() != WL_CONNECTED) {
        serialLog("Tag: " + uid + " -> NO WIFI");
        digitalWrite(LED_PIN, LOW);
        return;
    }

    // Build JSON payload
    StaticJsonDocument<256> doc;
    doc["tag_id"] = uid;
    doc["scanner_type"] = "nfc_fixed";
    doc["scanner_id"] = cfgScannerName;
    doc["location_id"] = cfgLocationId;

    String jsonPayload;
    serializeJson(doc, jsonPayload);

    // POST to server
    HTTPClient http;
    String url = cfgServerUrl + "/api/inventory/scan";

    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    if (cfgAuthToken.length() > 0) {
        http.addHeader("Authorization", "Bearer " + cfgAuthToken);
    }
    http.setTimeout(5000);

    int httpCode = http.POST(jsonPayload);
    String response = http.getString();
    http.end();

    // Log result
    String ts = getTimestamp();
    if (httpCode == 200 || httpCode == 201) {
        Serial.printf("[%s] Tag: %s -> %d OK\n", ts.c_str(), uid.c_str(), httpCode);

        // Success: single solid flash
        digitalWrite(LED_PIN, HIGH);
        delay(LED_FLASH_MS);
        digitalWrite(LED_PIN, LOW);
    } else {
        Serial.printf("[%s] Tag: %s -> %d ERROR\n", ts.c_str(), uid.c_str(), httpCode);
        if (response.length() > 0) {
            Serial.print("  Response: ");
            Serial.println(response);
        }

        // Error: rapid blink
        ledFlash(5, 50, 50);
    }
}

// ============================================================================
// CAPTIVE PORTAL
// ============================================================================
void startCaptivePortal() {
    portalMode = true;

    WiFi.mode(WIFI_AP);
    WiFi.softAP(AP_SSID, AP_PASSWORD);
    delay(100);

    IPAddress apIP = WiFi.softAPIP();
    Serial.print("[PORTAL] AP started: ");
    Serial.println(AP_SSID);
    Serial.print("[PORTAL] IP: ");
    Serial.println(apIP);

    // DNS: redirect all requests to the portal
    dnsServer.start(53, "*", apIP);

    // Web server routes
    webServer.on("/", HTTP_GET, handlePortalRoot);
    webServer.on("/save", HTTP_POST, handlePortalSave);
    webServer.on("/scan", HTTP_GET, handlePortalScan);
    webServer.onNotFound(handlePortalNotFound);
    webServer.begin();

    Serial.println("[PORTAL] Web server started on port 80");
    Serial.println("[PORTAL] Connect to WiFi 'RFID-Reader-Setup' and open any URL");

    // Solid LED to indicate portal mode
    digitalWrite(LED_PIN, HIGH);
}

void handlePortalRoot() {
    webServer.send(200, "text/html", PORTAL_PAGE);
}

void handlePortalSave() {
    String ssid     = webServer.arg("ssid");
    String pass     = webServer.arg("pass");
    String server   = webServer.arg("server");
    String location = webServer.arg("location");
    String scanner  = webServer.arg("scanner");

    // Apply defaults for empty fields
    if (server.length() == 0)   server = DEFAULT_SERVER_URL;
    if (location.length() == 0) location = DEFAULT_LOCATION_ID;
    if (scanner.length() == 0)  scanner = DEFAULT_SCANNER_NAME;

    Serial.println("[PORTAL] Saving configuration:");
    Serial.println("  SSID: " + ssid);
    Serial.println("  Server: " + server);
    Serial.println("  Location: " + location);
    Serial.println("  Scanner: " + scanner);

    saveConfig(ssid, pass, server, location, scanner);

    webServer.send(200, "text/plain", "Configuration saved. Rebooting...");

    delay(2000);
    ESP.restart();
}

void handlePortalScan() {
    Serial.println("[PORTAL] Scanning WiFi networks...");

    int n = WiFi.scanNetworks();

    StaticJsonDocument<1024> doc;
    JsonArray arr = doc.to<JsonArray>();

    for (int i = 0; i < n && i < 15; i++) {
        JsonObject net = arr.createNestedObject();
        net["ssid"] = WiFi.SSID(i);
        net["rssi"] = WiFi.RSSI(i);
        net["secure"] = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
    }

    String json;
    serializeJson(doc, json);

    WiFi.scanDelete();

    webServer.send(200, "application/json", json);
}

void handlePortalNotFound() {
    // Redirect all unknown requests to the portal (captive portal behavior)
    webServer.sendHeader("Location", "http://" + WiFi.softAPIP().toString(), true);
    webServer.send(302, "text/plain", "");
}

// ============================================================================
// UTILITY
// ============================================================================
void ledFlash(int count, int onMs, int offMs) {
    for (int i = 0; i < count; i++) {
        digitalWrite(LED_PIN, HIGH);
        delay(onMs);
        digitalWrite(LED_PIN, LOW);
        if (i < count - 1) delay(offMs);
    }
}

String getTimestamp() {
    struct tm timeinfo;
    if (!getLocalTime(&timeinfo, 100)) {
        unsigned long sec = millis() / 1000;
        char buf[12];
        snprintf(buf, sizeof(buf), "%02lu:%02lu:%02lu",
                 (sec / 3600) % 24, (sec / 60) % 60, sec % 60);
        return String(buf);
    }
    char buf[12];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d",
             timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    return String(buf);
}

void serialLog(const String &msg) {
    Serial.print("[");
    Serial.print(getTimestamp());
    Serial.print("] ");
    Serial.println(msg);
}
