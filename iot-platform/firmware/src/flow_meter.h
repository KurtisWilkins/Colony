#ifndef FLOW_METER_H
#define FLOW_METER_H

#include <Arduino.h>

class FlowMeter {
public:
    FlowMeter();
    void begin();
    void update();  // Called every loop - handles 1s sampling

    float getFlowLPM()       { return flow_lpm; }
    float getSessionLiters() { return session_liters; }
    float getTotalLiters()   { return total_liters; }

    void resetSession();       // Called when valve opens
    void finalizeSession();    // Called when valve closes
    void saveTotalToNVS();     // Write total to NVS (rate-limited)

private:
    static void IRAM_ATTR pulseISR();

    static volatile uint32_t pulse_count;
    float flow_lpm;
    float session_liters;
    float total_liters;
    bool flowing;

    unsigned long last_sample_ms;
    unsigned long last_nvs_write_ms;
};

extern FlowMeter flowMeter;

#endif // FLOW_METER_H
