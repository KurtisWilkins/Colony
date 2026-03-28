#include "ntp_client.h"
#include "config.h"
#include "storage.h"
#include <time.h>
#include <WiFi.h>

NtpClient ntpClient;

extern void logMsg(const char* level, const char* fmt, ...);

NtpClient::NtpClient()
    : _synced(false)
    , _last_sync_ms(0)
    , _sync_interval_ms(NTP_SYNC_INTERVAL_MS)
{
}

// ============================================================================
// begin() — Configure SNTP and apply timezone from storage
// ============================================================================
void NtpClient::begin() {
    applyTimezone();
    sync();
    logMsg("INFO", "NTP client initialized, timezone=%s", storage.data.timezone.c_str());
}

// ============================================================================
// applyTimezone() — Set the POSIX timezone string for ESP32 time library
// ============================================================================
void NtpClient::applyTimezone() {
    // ESP32 uses configTime() which sets the POSIX TZ environment variable
    // and configures SNTP servers internally
    configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);

    // Apply the POSIX timezone string from storage
    setenv("TZ", storage.data.timezone.c_str(), 1);
    tzset();
}

// ============================================================================
// sync() — Force an NTP synchronization attempt
// ============================================================================
void NtpClient::sync() {
    if (WiFi.status() != WL_CONNECTED) {
        logMsg("WARN", "NTP sync skipped — WiFi not connected");
        return;
    }

    logMsg("INFO", "NTP syncing with %s ...", NTP_SERVER_1);

    // Re-initialize SNTP (this triggers a fresh sync)
    configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);
    setenv("TZ", storage.data.timezone.c_str(), 1);
    tzset();

    // Wait briefly for time to sync (non-blocking with timeout)
    unsigned long start = millis();
    while (!checkTimeValid() && millis() - start < 5000) {
        delay(100);
    }

    if (checkTimeValid()) {
        _synced = true;
        _last_sync_ms = millis();
        logMsg("INFO", "NTP synced: %s", getTimeString().c_str());
    } else {
        logMsg("WARN", "NTP sync timeout — will retry");
    }
}

// ============================================================================
// update() — Called every loop iteration, triggers periodic re-sync
// ============================================================================
void NtpClient::update() {
    // If never synced and WiFi is connected, try again
    if (!_synced && WiFi.status() == WL_CONNECTED) {
        if (millis() - _last_sync_ms > 30000) {  // Retry every 30s if not synced
            sync();
        }
        return;
    }

    // Periodic re-sync every 24 hours
    if (_synced && millis() - _last_sync_ms >= _sync_interval_ms) {
        logMsg("INFO", "NTP periodic re-sync...");
        sync();
    }

    // Also check if time somehow became invalid
    if (_synced && !checkTimeValid()) {
        _synced = false;
        logMsg("WARN", "NTP time became invalid, will re-sync");
    }
}

// ============================================================================
// checkTimeValid() — Returns true if the system time looks reasonable
// ============================================================================
bool NtpClient::checkTimeValid() {
    time_t now;
    time(&now);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);

    // If year is >= 2024, we have a valid time from NTP
    return (timeinfo.tm_year >= 124);  // tm_year is years since 1900
}

// ============================================================================
// Time Query Methods
// ============================================================================

int NtpClient::getCurrentHour() {
    time_t now;
    time(&now);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);
    return timeinfo.tm_hour;
}

int NtpClient::getCurrentMinute() {
    time_t now;
    time(&now);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);
    return timeinfo.tm_min;
}

int NtpClient::getCurrentSecond() {
    time_t now;
    time(&now);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);
    return timeinfo.tm_sec;
}

int NtpClient::getDayOfWeek() {
    time_t now;
    time(&now);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);
    return timeinfo.tm_wday;  // 0=Sunday
}

int NtpClient::getMonth() {
    time_t now;
    time(&now);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);
    return timeinfo.tm_mon;  // 0=January
}

int NtpClient::getDay() {
    time_t now;
    time(&now);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);
    return timeinfo.tm_mday;  // 1-31
}

bool NtpClient::isTimeSynced() const {
    return _synced;
}

String NtpClient::getTimeString() {
    time_t now;
    time(&now);
    struct tm timeinfo;
    localtime_r(&now, &timeinfo);

    char buf[32];
    strftime(buf, sizeof(buf), "%Y-%m-%d %H:%M:%S", &timeinfo);
    return String(buf);
}
