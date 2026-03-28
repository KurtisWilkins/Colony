#ifndef CAPTIVE_PORTAL_H
#define CAPTIVE_PORTAL_H

#include <Arduino.h>
#include <WebServer.h>
#include <DNSServer.h>

class CaptivePortal {
public:
    CaptivePortal();
    void begin();
    void loop();
    bool isActive() { return active; }

private:
    WebServer server;
    DNSServer dnsServer;
    bool active;

    void handleRoot();
    void handleScan();
    void handleSave();
    void handleReset();
    void handleNotFound();
};

extern CaptivePortal captivePortal;

#endif // CAPTIVE_PORTAL_H
