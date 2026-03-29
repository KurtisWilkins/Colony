-- Device MQTT credentials
CREATE TABLE IF NOT EXISTS device_mqtt_credentials (
    id SERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    mqtt_username VARCHAR(200) NOT NULL UNIQUE,
    mqtt_password_hash VARCHAR(200) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_mqtt_creds_device ON device_mqtt_credentials(device_id);
CREATE INDEX IF NOT EXISTS idx_mqtt_creds_username ON device_mqtt_credentials(mqtt_username);

-- Enhanced users table (check if exists first, alter if needed)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='role') THEN
        ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'viewer';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_active') THEN
        ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='created_by') THEN
        ALTER TABLE users ADD COLUMN created_by UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_login') THEN
        ALTER TABLE users ADD COLUMN last_login TIMESTAMP;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='last_login_ip') THEN
        ALTER TABLE users ADD COLUMN last_login_ip VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='force_password_change') THEN
        ALTER TABLE users ADD COLUMN force_password_change BOOLEAN DEFAULT FALSE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email') THEN
        ALTER TABLE users ADD COLUMN email VARCHAR(200);
    END IF;
END $$;

-- User device assignments
CREATE TABLE IF NOT EXISTS user_device_assignments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by INTEGER,
    UNIQUE(user_id, device_id)
);

-- User sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    revoked BOOLEAN DEFAULT FALSE
);

-- Security events
CREATE TABLE IF NOT EXISTS security_events (
    id BIGSERIAL PRIMARY KEY,
    event_time TIMESTAMP DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    user_id INTEGER,
    ip_address VARCHAR(50),
    details JSONB
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_assignments_user ON user_device_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_security_events_time ON security_events(event_time DESC);
