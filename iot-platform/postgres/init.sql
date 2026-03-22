-- =============================================================================
-- Colony IoT Platform – PostgreSQL Schema
-- Initializes extensions, tables, constraints, and indexes.
-- =============================================================================

-- Enable uuid-ossp so we can generate UUIDs with uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- devices – Registry of every IoT device managed by the platform.
-- Each device belongs to a facility > building > unit hierarchy and carries
-- a human-readable name plus a broad type classification.
-- -----------------------------------------------------------------------------
CREATE TABLE devices (
    id            UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    facility      VARCHAR(255)  NOT NULL,                  -- top-level site / campus
    building      VARCHAR(255)  NOT NULL,                  -- building within the facility
    unit          VARCHAR(255)  NOT NULL,                  -- room, zone, or logical unit
    device_name   VARCHAR(255)  NOT NULL,                  -- human-readable device label
    device_type   VARCHAR(50)   NOT NULL,                  -- e.g. 'sensor', 'actuator', 'combo'
    registered_at TIMESTAMP     DEFAULT NOW(),             -- when the device was first registered
    last_seen     TIMESTAMP,                               -- last heartbeat / telemetry timestamp
    is_online     BOOLEAN       DEFAULT FALSE,             -- current connectivity status

    -- A device name must be unique within the same location hierarchy
    CONSTRAINT uq_device_location UNIQUE (facility, building, unit, device_name)
);

-- -----------------------------------------------------------------------------
-- telemetry – Time-series store for inbound device readings.
-- Each row captures one payload (arbitrary JSON) tied to a device.
-- -----------------------------------------------------------------------------
CREATE TABLE telemetry (
    id          BIGSERIAL   PRIMARY KEY,
    device_id   UUID        NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    received_at TIMESTAMP   DEFAULT NOW(),                 -- server-side reception time
    payload     JSONB       NOT NULL                       -- flexible sensor / metric data
);

-- Speed up queries that filter telemetry by device and time range
CREATE INDEX idx_telemetry_device_received ON telemetry (device_id, received_at);

-- -----------------------------------------------------------------------------
-- commands – Outbound instructions sent to devices.
-- Tracks issuance time and whether the device has acknowledged the command.
-- -----------------------------------------------------------------------------
CREATE TABLE commands (
    id              BIGSERIAL    PRIMARY KEY,
    device_id       UUID         NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    issued_at       TIMESTAMP    DEFAULT NOW(),            -- when the command was created
    command_type    VARCHAR(100) NOT NULL,                  -- e.g. 'reboot', 'set_threshold'
    payload         JSONB,                                  -- optional parameters for the command
    acknowledged    BOOLEAN      DEFAULT FALSE,             -- has the device acked?
    acknowledged_at TIMESTAMP                               -- timestamp of the ack (NULL until acked)
);

-- Speed up lookups of commands targeting a specific device
CREATE INDEX idx_commands_device ON commands (device_id);

-- -----------------------------------------------------------------------------
-- alerts – Scaffold table for device-triggered alerts.
-- Stores alert metadata and resolution status for downstream dashboards.
-- -----------------------------------------------------------------------------
CREATE TABLE alerts (
    id           BIGSERIAL    PRIMARY KEY,
    device_id    UUID         NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    triggered_at TIMESTAMP    DEFAULT NOW(),               -- when the alert fired
    alert_type   VARCHAR(100) NOT NULL,                    -- e.g. 'temperature_high', 'offline'
    message      TEXT,                                      -- human-readable description
    resolved     BOOLEAN      DEFAULT FALSE                -- whether the alert has been resolved
);

-- Speed up lookups of alerts for a specific device
CREATE INDEX idx_alerts_device ON alerts (device_id);

-- -----------------------------------------------------------------------------
-- users – Platform user accounts for authentication and access control.
-- The first user created via /api/auth/setup becomes the admin.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL        PRIMARY KEY,
    username      VARCHAR(64)   NOT NULL UNIQUE,
    password_hash VARCHAR(256)  NOT NULL,
    role          VARCHAR(16)   NOT NULL DEFAULT 'user',       -- 'admin' or 'user'
    is_active     BOOLEAN       DEFAULT TRUE,                  -- disabled users cannot log in
    created_at    TIMESTAMP     DEFAULT NOW()
);
