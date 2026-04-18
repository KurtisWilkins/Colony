-- Add status column to devices table for auto-discovery support.
-- Existing devices get 'active'; new auto-discovered devices get 'pending'.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS status VARCHAR(16) NOT NULL DEFAULT 'active';
