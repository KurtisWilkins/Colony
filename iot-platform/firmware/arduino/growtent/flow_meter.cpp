#include "flow_meter.h"
#include "config.h"
#include "storage.h"

FlowMeter flowMeter;

extern void logMsg(const char* level, const char* fmt, ...);

volatile uint32_t FlowMeter::pulse_count = 0;

void IRAM_ATTR FlowMeter::pulseISR() {
    pulse_count++;
}

FlowMeter::FlowMeter()
    : flow_lpm(0.0f)
    , session_liters(0.0f)
    , total_liters(0.0f)
    , flowing(false)
    , last_sample_ms(0)
    , last_nvs_write_ms(0)
{
}

void FlowMeter::begin() {
    // Load lifetime total from NVS
    total_liters = storage.data.total_liters;

    // Configure flow sensor pin with interrupt
    pinMode(FLOW_SIGNAL, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(FLOW_SIGNAL), pulseISR, RISING);

    last_sample_ms = millis();
    last_nvs_write_ms = millis();

    logMsg("INFO", "Flow meter initialized (total=%.3fL, cal=%.1f pulses/L)",
           total_liters, storage.data.flow_cal);
}

void FlowMeter::update() {
    unsigned long now = millis();

    // Sample every 1 second
    if (now - last_sample_ms < 1000) return;

    unsigned long elapsed = now - last_sample_ms;
    last_sample_ms = now;

    // Atomically snapshot and reset counter
    noInterrupts();
    uint32_t pulses = pulse_count;
    pulse_count = 0;
    interrupts();

    if (pulses > 0) {
        flowing = true;

        // Calculate flow rate
        // pulses_per_second = pulses / (elapsed_ms / 1000)
        float pulses_per_second = (float)pulses / ((float)elapsed / 1000.0f);
        float cal = storage.data.flow_cal;
        if (cal <= 0) cal = DEFAULT_FLOW_CAL;

        flow_lpm = (pulses_per_second / cal) * 60.0f;

        // Accumulate volume
        float liters_this_interval = (float)pulses / cal;
        session_liters += liters_this_interval;
        total_liters += liters_this_interval;

        // Write total to NVS at most once per minute while flowing
        if (now - last_nvs_write_ms >= FLOW_NVS_WRITE_MS) {
            saveTotalToNVS();
            last_nvs_write_ms = now;
        }

        logMsg("DEBUG", "Flow: %.2f LPM, session=%.3fL, total=%.3fL",
               flow_lpm, session_liters, total_liters);
    } else {
        flow_lpm = 0.0f;
        if (flowing) {
            flowing = false;
            logMsg("DEBUG", "Flow stopped");
        }
    }
}

void FlowMeter::resetSession() {
    session_liters = 0.0f;
    flow_lpm = 0.0f;

    // Reset pulse counter
    noInterrupts();
    pulse_count = 0;
    interrupts();

    logMsg("INFO", "Flow session reset");
}

void FlowMeter::finalizeSession() {
    // Final NVS write
    saveTotalToNVS();
    logMsg("INFO", "Flow session finalized: %.3fL (lifetime=%.3fL)", session_liters, total_liters);
}

void FlowMeter::saveTotalToNVS() {
    storage.setTotalLiters(total_liters);
    logMsg("DEBUG", "Total liters saved to NVS: %.3f", total_liters);
}
