-- Migration: Add mushroom inventory tracking tables
-- Date: 2026-03-29

BEGIN;

-- -------------------------------------------------------------------------
-- mushroom_strains: catalogue of mushroom species / cultivars
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mushroom_strains (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL UNIQUE,
    species         VARCHAR(150),
    source          VARCHAR(200),
    generation      VARCHAR(50),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- substrate_recipes: named substrate formulations
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS substrate_recipes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL UNIQUE,
    description     TEXT,
    target_moisture_pct  REAL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- substrate_recipe_components: ingredients per recipe
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS substrate_recipe_components (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id       UUID NOT NULL REFERENCES substrate_recipes(id) ON DELETE CASCADE,
    ingredient      VARCHAR(150) NOT NULL,
    quantity         REAL NOT NULL,
    unit            VARCHAR(30) NOT NULL DEFAULT 'g',
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_recipe_ingredient UNIQUE (recipe_id, ingredient)
);

CREATE INDEX IF NOT EXISTS idx_recipe_components_recipe ON substrate_recipe_components(recipe_id);

-- -------------------------------------------------------------------------
-- autoclave_units: registered sterilisation equipment
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS autoclave_units (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    model           VARCHAR(150),
    capacity_liters REAL,
    device_id       UUID REFERENCES devices(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -------------------------------------------------------------------------
-- locations: logical grow areas (rooms, tents, shelves, etc.)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(150) NOT NULL,
    parent_id       UUID REFERENCES locations(id) ON DELETE CASCADE,
    location_type   VARCHAR(50) NOT NULL DEFAULT 'room',
    unit_id         UUID REFERENCES units(id) ON DELETE SET NULL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_location_name_parent UNIQUE (name, parent_id)
);

CREATE INDEX IF NOT EXISTS idx_locations_parent ON locations(parent_id);

-- -------------------------------------------------------------------------
-- shelf_positions: individual slots within a location
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shelf_positions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    label           VARCHAR(50) NOT NULL,
    row_num         SMALLINT,
    col_num         SMALLINT,
    occupied        BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT uq_shelf_position UNIQUE (location_id, label)
);

CREATE INDEX IF NOT EXISTS idx_shelf_positions_location ON shelf_positions(location_id);

-- -------------------------------------------------------------------------
-- jars: the central asset being tracked
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jars (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_id          VARCHAR(100) UNIQUE,
    label           VARCHAR(100),
    volume_ml       REAL DEFAULT 946,
    status          VARCHAR(30) NOT NULL DEFAULT 'clean',
    current_location_id  UUID REFERENCES locations(id) ON DELETE SET NULL,
    current_shelf_id     UUID REFERENCES shelf_positions(id) ON DELETE SET NULL,
    current_cycle_id     UUID,
    total_cycles    INTEGER NOT NULL DEFAULT 0,
    total_yield_g   REAL NOT NULL DEFAULT 0,
    notes           TEXT,
    retired         BOOLEAN NOT NULL DEFAULT FALSE,
    retired_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jars_tag ON jars(tag_id);
CREATE INDEX IF NOT EXISTS idx_jars_status ON jars(status);
CREATE INDEX IF NOT EXISTS idx_jars_location ON jars(current_location_id);

-- -------------------------------------------------------------------------
-- batches: a group of jars prepared together
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_code      VARCHAR(30) NOT NULL UNIQUE,
    strain_id       UUID REFERENCES mushroom_strains(id) ON DELETE SET NULL,
    recipe_id       UUID REFERENCES substrate_recipes(id) ON DELETE SET NULL,
    status          VARCHAR(30) NOT NULL DEFAULT 'preparing',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_batches_code ON batches(batch_code);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);

-- -------------------------------------------------------------------------
-- batch_jars: many-to-many between batches and jars
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batch_jars (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_batch_jar UNIQUE (batch_id, jar_id)
);

CREATE INDEX IF NOT EXISTS idx_batch_jars_batch ON batch_jars(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_jars_jar ON batch_jars(jar_id);

-- -------------------------------------------------------------------------
-- sterilization_runs: autoclave session for a batch
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sterilization_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    autoclave_id    UUID REFERENCES autoclave_units(id) ON DELETE SET NULL,
    start_time      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time        TIMESTAMPTZ,
    target_temp_c   REAL DEFAULT 121,
    target_psi      REAL DEFAULT 15,
    duration_min    INTEGER DEFAULT 90,
    status          VARCHAR(30) NOT NULL DEFAULT 'running',
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sterilization_batch ON sterilization_runs(batch_id);

-- -------------------------------------------------------------------------
-- sterilization_jar_assignments: which jars were in each run
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sterilization_jar_assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id          UUID NOT NULL REFERENCES sterilization_runs(id) ON DELETE CASCADE,
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    CONSTRAINT uq_sterilization_jar UNIQUE (run_id, jar_id)
);

CREATE INDEX IF NOT EXISTS idx_sterilization_jar_run ON sterilization_jar_assignments(run_id);

-- -------------------------------------------------------------------------
-- inoculation_sessions: a session where jars are inoculated
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inoculation_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id        UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    strain_id       UUID REFERENCES mushroom_strains(id) ON DELETE SET NULL,
    inoculation_type VARCHAR(50) DEFAULT 'liquid_culture',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    operator        VARCHAR(100),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inoculation_batch ON inoculation_sessions(batch_id);

-- -------------------------------------------------------------------------
-- inoculation_jar_log: per-jar record within a session
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inoculation_jar_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES inoculation_sessions(id) ON DELETE CASCADE,
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    inoculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cc_injected     REAL,
    injection_site  VARCHAR(50),
    notes           TEXT,
    CONSTRAINT uq_inoculation_jar UNIQUE (session_id, jar_id)
);

CREATE INDEX IF NOT EXISTS idx_inoculation_jar_session ON inoculation_jar_log(session_id);

-- -------------------------------------------------------------------------
-- grow_cycles: colonisation + fruiting lifecycle per jar
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grow_cycles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    batch_id        UUID REFERENCES batches(id) ON DELETE SET NULL,
    strain_id       UUID REFERENCES mushroom_strains(id) ON DELETE SET NULL,
    inoculation_date TIMESTAMPTZ,
    colonization_start TIMESTAMPTZ,
    colonization_end   TIMESTAMPTZ,
    fruiting_start     TIMESTAMPTZ,
    fruiting_end       TIMESTAMPTZ,
    status          VARCHAR(30) NOT NULL DEFAULT 'colonizing',
    total_yield_g   REAL NOT NULL DEFAULT 0,
    biological_efficiency_pct REAL,
    substrate_dry_weight_g REAL,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grow_cycles_jar ON grow_cycles(jar_id);
CREATE INDEX IF NOT EXISTS idx_grow_cycles_batch ON grow_cycles(batch_id);
CREATE INDEX IF NOT EXISTS idx_grow_cycles_status ON grow_cycles(status);

-- -------------------------------------------------------------------------
-- colonization_checks: periodic mycelium growth observations
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS colonization_checks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    cycle_id        UUID REFERENCES grow_cycles(id) ON DELETE CASCADE,
    check_date      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    colonization_pct REAL NOT NULL DEFAULT 0,
    notes           TEXT,
    photo_url       VARCHAR(500),
    checked_by      VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_colonization_jar ON colonization_checks(jar_id);
CREATE INDEX IF NOT EXISTS idx_colonization_cycle ON colonization_checks(cycle_id);

-- -------------------------------------------------------------------------
-- contamination_records: contamination events
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contamination_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    cycle_id        UUID REFERENCES grow_cycles(id) ON DELETE SET NULL,
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    contamination_type VARCHAR(80),
    severity        VARCHAR(30) DEFAULT 'moderate',
    action_taken    VARCHAR(50) DEFAULT 'quarantine',
    disposed_at     TIMESTAMPTZ,
    notes           TEXT,
    photo_url       VARCHAR(500)
);

CREATE INDEX IF NOT EXISTS idx_contamination_jar ON contamination_records(jar_id);
CREATE INDEX IF NOT EXISTS idx_contamination_cycle ON contamination_records(cycle_id);

-- -------------------------------------------------------------------------
-- jar_movements: location transfer log
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jar_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    from_location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    to_location_id   UUID REFERENCES locations(id) ON DELETE SET NULL,
    from_shelf_id    UUID REFERENCES shelf_positions(id) ON DELETE SET NULL,
    to_shelf_id      UUID REFERENCES shelf_positions(id) ON DELETE SET NULL,
    moved_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    moved_by        VARCHAR(100),
    reason          VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_movements_jar ON jar_movements(jar_id);
CREATE INDEX IF NOT EXISTS idx_movements_time ON jar_movements(moved_at);

-- -------------------------------------------------------------------------
-- flushes: individual fruiting flushes within a grow cycle
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flushes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id        UUID NOT NULL REFERENCES grow_cycles(id) ON DELETE CASCADE,
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    flush_number    SMALLINT NOT NULL DEFAULT 1,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    harvested_at    TIMESTAMPTZ,
    yield_g         REAL,
    notes           TEXT,
    CONSTRAINT uq_flush_number UNIQUE (cycle_id, flush_number)
);

CREATE INDEX IF NOT EXISTS idx_flushes_cycle ON flushes(cycle_id);
CREATE INDEX IF NOT EXISTS idx_flushes_jar ON flushes(jar_id);

-- -------------------------------------------------------------------------
-- jar_photos: image references for jars
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jar_photos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    cycle_id        UUID REFERENCES grow_cycles(id) ON DELETE SET NULL,
    photo_path      VARCHAR(500) NOT NULL,
    caption         VARCHAR(300),
    taken_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_jar ON jar_photos(jar_id);

-- -------------------------------------------------------------------------
-- scan_events: NFC / QR code scan log
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jar_id          UUID REFERENCES jars(id) ON DELETE SET NULL,
    tag_id          VARCHAR(100),
    scanned_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    scanner_id      VARCHAR(100),
    action          VARCHAR(50),
    metadata        JSONB
);

CREATE INDEX IF NOT EXISTS idx_scan_events_jar ON scan_events(jar_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_tag ON scan_events(tag_id);
CREATE INDEX IF NOT EXISTS idx_scan_events_time ON scan_events(scanned_at);

-- -------------------------------------------------------------------------
-- jar_env_links: link jars to IoT environment sensors
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS jar_env_links (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    jar_id          UUID NOT NULL REFERENCES jars(id) ON DELETE CASCADE,
    device_id       UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    linked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unlinked_at     TIMESTAMPTZ,
    CONSTRAINT uq_jar_env_active UNIQUE (jar_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_jar_env_jar ON jar_env_links(jar_id);
CREATE INDEX IF NOT EXISTS idx_jar_env_device ON jar_env_links(device_id);

-- Add deferred FK for jars.current_cycle_id
ALTER TABLE jars
    ADD CONSTRAINT fk_jars_current_cycle
    FOREIGN KEY (current_cycle_id) REFERENCES grow_cycles(id)
    ON DELETE SET NULL;

COMMIT;
