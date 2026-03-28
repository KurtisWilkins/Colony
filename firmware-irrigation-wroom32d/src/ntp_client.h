#ifndef NTP_CLIENT_H
#define NTP_CLIENT_H

#include <Arduino.h>

class NtpClient {
public:
    NtpClient();

    // Initialize SNTP with timezone from storage. Call after WiFi connects.
    void begin();

    // Force a re-sync with NTP servers
    void sync();

    // Called in loop() — triggers re-sync every 24 hours
    void update();

    // Time queries (only valid when isTimeSynced() returns true)
    int getCurrentHour();       // 0-23
    int getCurrentMinute();     // 0-59
    int getCurrentSecond();     // 0-59
    int getDayOfWeek();         // 0=Sunday, 1=Monday, ... 6=Saturday
    int getMonth();             // 0=January, ... 11=December
    int getDay();               // 1-31

    // Returns true if we have successfully synced with NTP at least once
    bool isTimeSynced() const;

    // Get formatted time string for logging
    String getTimeString();

private:
    bool _synced;
    unsigned long _last_sync_ms;
    unsigned long _sync_interval_ms;

    void applyTimezone();
    bool checkTimeValid();
};

extern NtpClient ntpClient;

#endif // NTP_CLIENT_H
