-- Climate control columns on device_thresholds
ALTER TABLE device_thresholds
    ADD COLUMN IF NOT EXISTS heat_on_c FLOAT DEFAULT 17.5,
    ADD COLUMN IF NOT EXISTS heat_off_c FLOAT DEFAULT 19.0,
    ADD COLUMN IF NOT EXISTS cool_on_c FLOAT DEFAULT 25.0,
    ADD COLUMN IF NOT EXISTS cool_off_c FLOAT DEFAULT 23.5,
    ADD COLUMN IF NOT EXISTS dehumid_on_pct FLOAT DEFAULT 92.0,
    ADD COLUMN IF NOT EXISTS dehumid_off_pct FLOAT DEFAULT 88.0,
    ADD COLUMN IF NOT EXISTS heater_safety_min INTEGER DEFAULT 30,
    ADD COLUMN IF NOT EXISTS cooling_safety_min INTEGER DEFAULT 60,
    ADD COLUMN IF NOT EXISTS climate_enabled BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS schedule_enabled BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS day_start_hour INTEGER DEFAULT 6,
    ADD COLUMN IF NOT EXISTS night_start_hour INTEGER DEFAULT 22,
    ADD COLUMN IF NOT EXISTS night_heat_on_c FLOAT DEFAULT 16.0,
    ADD COLUMN IF NOT EXISTS night_heat_off_c FLOAT DEFAULT 18.0,
    ADD COLUMN IF NOT EXISTS night_cool_on_c FLOAT DEFAULT 24.0,
    ADD COLUMN IF NOT EXISTS night_cool_off_c FLOAT DEFAULT 22.5;

CREATE TABLE IF NOT EXISTS climate_runtime_sessions (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    device_type VARCHAR(20) NOT NULL,
    session_start TIMESTAMP NOT NULL DEFAULT NOW(),
    session_end TIMESTAMP,
    duration_s INTEGER,
    trigger_type VARCHAR(20) NOT NULL DEFAULT 'auto',
    temp_at_start FLOAT,
    temp_at_end FLOAT,
    humidity_at_start FLOAT,
    safety_cutoff BOOLEAN DEFAULT FALSE,
    test_mode BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_climate_sessions_device ON climate_runtime_sessions(device_id, session_start DESC);
CREATE INDEX IF NOT EXISTS idx_climate_sessions_type ON climate_runtime_sessions(device_id, device_type, session_start DESC);
