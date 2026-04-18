-- Migration: Add irrigation controller tables
-- Date: 2026-03-27

BEGIN;

-- -------------------------------------------------------------------------
-- irrigation_zones: per-device zone configuration (up to 16 zones each)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS irrigation_zones (
    id              SERIAL PRIMARY KEY,
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    zone_index      SMALLINT NOT NULL CHECK (zone_index BETWEEN 0 AND 15),
    name            VARCHAR(100) NOT NULL DEFAULT '',
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    runtime_s       INTEGER NOT NULL DEFAULT 600,
    zone_group      VARCHAR(50),
    gpio_pin        SMALLINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_irrigation_zone UNIQUE (device_id, zone_index)
);

-- -------------------------------------------------------------------------
-- irrigation_schedules: per-zone watering schedule
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS irrigation_schedules (
    id                      SERIAL PRIMARY KEY,
    device_id               UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    zone_index              SMALLINT NOT NULL,
    enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
    runtime_s               INTEGER NOT NULL DEFAULT 600,
    days_of_week            SMALLINT NOT NULL DEFAULT 127,   -- bitmask: bit0=Mon .. bit6=Sun, 127=every day
    times                   JSONB NOT NULL DEFAULT '[]'::JSONB,  -- e.g. ["06:00","18:00"]
    seasonal_config_index   SMALLINT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_irrigation_schedule UNIQUE (device_id, zone_index)
);

-- -------------------------------------------------------------------------
-- irrigation_seasonal_configs: seasonal adjustment profiles (up to 8 per device)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS irrigation_seasonal_configs (
    id                      SERIAL PRIMARY KEY,
    device_id               UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    config_index            SMALLINT NOT NULL CHECK (config_index BETWEEN 0 AND 7),
    name                    VARCHAR(100) NOT NULL DEFAULT '',
    start_month             SMALLINT NOT NULL CHECK (start_month BETWEEN 1 AND 12),
    start_day               SMALLINT NOT NULL CHECK (start_day BETWEEN 1 AND 31),
    end_month               SMALLINT NOT NULL CHECK (end_month BETWEEN 1 AND 12),
    end_day                 SMALLINT NOT NULL CHECK (end_day BETWEEN 1 AND 31),
    runtime_multiplier      REAL NOT NULL DEFAULT 1.0,
    skip_if_rained          BOOLEAN NOT NULL DEFAULT FALSE,
    skip_rain_threshold_mm  REAL NOT NULL DEFAULT 5.0,
    enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_irrigation_seasonal_config UNIQUE (device_id, config_index)
);

-- -------------------------------------------------------------------------
-- irrigation_zone_events: log of zone open/close/skip events
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS irrigation_zone_events (
    id              BIGSERIAL PRIMARY KEY,
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    zone_index      SMALLINT NOT NULL,
    zone_name       VARCHAR(100),
    event_type      VARCHAR(30) NOT NULL,      -- 'open', 'close', 'skip', 'error'
    trigger_type    VARCHAR(30) NOT NULL,       -- 'schedule', 'manual', 'program', 'test'
    runtime_s       INTEGER,
    seasonal_config VARCHAR(100),
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    test_mode       BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_irrigation_zone_events_device_ts
    ON irrigation_zone_events (device_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_irrigation_zone_events_device_zone_ts
    ON irrigation_zone_events (device_id, zone_index, timestamp DESC);

-- -------------------------------------------------------------------------
-- irrigation_weather: weather data snapshots used for skip decisions
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS irrigation_weather (
    id                  SERIAL PRIMARY KEY,
    device_id           UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    rainfall_24h_mm     REAL,
    temperature_c       REAL,
    forecast_rain_mm    REAL,
    weather_skip_active BOOLEAN NOT NULL DEFAULT FALSE
);

COMMIT;
