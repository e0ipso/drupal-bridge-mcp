-- Add encrypted metadata column for secure token storage
-- Migration: 003-add-encrypted-metadata.sql
-- Created: 2025-09-04
-- Purpose: Add encrypted_metadata column to support secure token storage with AES encryption

BEGIN;

-- Add encrypted metadata column to user_sessions table
ALTER TABLE user_sessions 
ADD COLUMN encrypted_metadata TEXT;

-- Add index for future queries that might filter by metadata presence
CREATE INDEX idx_user_sessions_has_metadata ON user_sessions(id) WHERE encrypted_metadata IS NOT NULL;

-- Add unique constraint on user_id to prevent duplicate sessions per user
ALTER TABLE user_sessions 
ADD CONSTRAINT unique_user_session UNIQUE (user_id);

-- Add check constraint to ensure valid subscription levels
ALTER TABLE user_sessions 
ADD CONSTRAINT check_subscription_level 
CHECK (subscription_level IN ('free', 'plus', 'pro'));

-- Update cleanup function to also log cleanup statistics
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS TABLE(deleted_count INTEGER) AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM user_sessions WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN QUERY SELECT deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Record this migration as applied
INSERT INTO migrations (migration_name) 
VALUES ('003-add-encrypted-metadata.sql')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;