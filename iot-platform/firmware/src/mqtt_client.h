#ifndef MQTT_CLIENT_H
#define MQTT_CLIENT_H

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

class MqttClient {
public:
    MqttClient();
    void begin();
    bool connect();
    void loop();
    bool isConnected();

    void publishTelemetry();
    void publishStatus();
    void publishFlow(float flow_lpm, float session_liters, float total_liters);
    void publishAlert(const char* alert_type, const char* message);
    void publishAck(const char* command, bool success, const char* message);

    String getBasePath();

private:
    WiFiClient espClient;
    PubSubClient client;
    String base_path;
    unsigned long last_connect_attempt;

    void buildBasePath();
    String topicFor(const char* suffix);
    static void messageCallback(char* topic, byte* payload, unsigned int length);
    void handleMessage(const char* topic, const char* payload);
    void handleCommand(const char* payload);
    void handleConfig(const char* payload);
};

extern MqttClient mqttClient;

#endif // MQTT_CLIENT_H
