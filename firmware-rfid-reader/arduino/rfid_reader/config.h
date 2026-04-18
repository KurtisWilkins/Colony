#ifndef CONFIG_H
#define CONFIG_H

// ─── MFRC522 Pin Connections ────────────────────────────────────────────────
#define SS_PIN          5    // SDA → GPIO 5
#define RST_PIN         22   // RST → GPIO 22
// SCK  → GPIO 18 (default SPI)
// MOSI → GPIO 23 (default SPI)
// MISO → GPIO 19 (default SPI)

// ─── LED ────────────────────────────────────────────────────────────────────
#define LED_PIN         2    // Onboard LED

// ─── NVS Storage ────────────────────────────────────────────────────────────
#define NVS_NAMESPACE   "rfid_reader"
#define NVS_KEY_SSID    "wifi_ssid"
#define NVS_KEY_PASS    "wifi_pass"
#define NVS_KEY_SERVER  "server_url"
#define NVS_KEY_LOC     "location_id"
#define NVS_KEY_NAME    "scanner_name"
#define NVS_KEY_TOKEN   "auth_token"

// ─── Defaults ───────────────────────────────────────────────────────────────
#define DEFAULT_SERVER_URL   "http://192.168.1.190"
#define DEFAULT_SCANNER_NAME "rfid-reader-01"
#define DEFAULT_LOCATION_ID  "warehouse-a"

// ─── Timing ─────────────────────────────────────────────────────────────────
#define TAG_DEBOUNCE_MS      3000   // Ignore same tag for 3 seconds
#define WIFI_CONNECT_TIMEOUT 15000  // 15 seconds to connect
#define WIFI_RECONNECT_INTERVAL 10000 // Retry every 10 seconds
#define LED_FLASH_MS         150    // LED flash duration

// ─── Captive Portal ─────────────────────────────────────────────────────────
#define AP_SSID         "RFID-Reader-Setup"
#define AP_PASSWORD     ""   // Open network
#define PORTAL_PORT     80

#endif // CONFIG_H
