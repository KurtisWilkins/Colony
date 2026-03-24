-- Migration: add automation tables for the IoT automation server
-- Run against the iot_platform database after the base schema exists.

-- Per-device automation thresholds
CREATE TABLE IF NOT EXISTS device_thresholds (
    id              BIGSERIAL PRIMARY KEY,
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    humidity_on_pct     DOUBLE PRECISION NOT NULL DEFAULT 60.0,
    humidity_off_pct    DOUBLE PRECISION NOT NULL DEFAULT 80.0,
    co2_high_ppm        DOUBLE PRECISION NOT NULL DEFAULT 1200.0,
    co2_normal_ppm      DOUBLE PRECISION NOT NULL DEFAULT 800.0,
    temp_min_c          DOUBLE PRECISION NOT NULL DEFAULT 18.0,
    temp_max_c          DOUBLE PRECISION NOT NULL DEFAULT 30.0,
    water_low_cm        DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    water_full_cm       DOUBLE PRECISION NOT NULL DEFAULT 80.0,
    fan_default_speed   INTEGER NOT NULL DEFAULT 50,
    fan_co2_speed       INTEGER NOT NULL DEFAULT 100,
    sensor_interval_s   INTEGER NOT NULL DEFAULT 30,
    valve_safety_min    INTEGER NOT NULL DEFAULT 30,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_device_thresholds UNIQUE (device_id)
);

-- Water usage sessions (valve open/close cycles)
CREATE TABLE IF NOT EXISTS water_usage_sessions (
    id              BIGSERIAL PRIMARY KEY,
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    session_start   TIMESTAMP NOT NULL DEFAULT NOW(),
    session_end     TIMESTAMP,
    duration_s      DOUBLE PRECISION,
    liters_used     DOUBLE PRECISION,
    trigger_type    VARCHAR(64) NOT NULL DEFAULT 'manual',
    trigger_source  VARCHAR(128),
    tank_pct_start  DOUBLE PRECISION,
    tank_pct_end    DOUBLE PRECISION,
    completed       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_water_sessions_device
    ON water_usage_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_water_sessions_start
    ON water_usage_sessions(session_start);

-- Automation events audit log
CREATE TABLE IF NOT EXISTS automation_events (
    id              BIGSERIAL PRIMARY KEY,
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    event_time      TIMESTAMP NOT NULL DEFAULT NOW(),
    rule_name       VARCHAR(128) NOT NULL,
    trigger_value   JSONB,
    action_taken    VARCHAR(256) NOT NULL,
    command_sent    JSONB,
    autonomous      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_automation_events_device
    ON automation_events(device_id);
CREATE INDEX IF NOT EXISTS idx_automation_events_time
    ON automation_events(event_time);
