-- Update user_sessions schema to match technical specifications
-- Migration: 002-update-user-sessions-schema.sql
-- Created: 2025-09-04
-- Purpose: Align database schema with final technical specifications

BEGIN;

-- Drop existing user_sessions table to recreate with correct schema
DROP TABLE IF EXISTS user_sessions CASCADE;

-- Create user_sessions table with exact schema from technical specifications
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    access_token_hash VARCHAR(255) NOT NULL,
    refresh_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scope TEXT[] DEFAULT '{}',
    subscription_level VARCHAR(50) DEFAULT 'free',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create request_logs table for analytics and debugging
CREATE TABLE IF NOT EXISTS request_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    method VARCHAR(100) NOT NULL,
    parameters JSONB,
    response_size INTEGER,
    duration_ms INTEGER,
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes for user_sessions
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Performance indexes for request_logs
CREATE INDEX idx_request_logs_user_created ON request_logs(user_id, created_at);

-- Cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at column on user_sessions
CREATE TRIGGER update_user_sessions_updated_at 
    BEFORE UPDATE ON user_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Record this migration as applied
INSERT INTO migrations (migration_name) 
VALUES ('002-update-user-sessions-schema.sql')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;