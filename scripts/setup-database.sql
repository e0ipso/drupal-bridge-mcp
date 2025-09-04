-- Complete Database Setup for Drupalize.me MCP Server
-- This script sets up the entire database schema from scratch
-- Run this on a fresh PostgreSQL database

BEGIN;

-- Create migrations table to track applied migrations
CREATE TABLE IF NOT EXISTS migrations (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) UNIQUE NOT NULL,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions table for OAuth state management and session tracking
-- Schema matches final technical specifications exactly
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

-- Request logs table for analytics and debugging (optional for MVP)
CREATE TABLE request_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255),
    method VARCHAR(100) NOT NULL,
    parameters JSONB,
    response_size INTEGER,
    duration_ms INTEGER,
    status VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Content cache table (for future use, from original schema)
CREATE TABLE IF NOT EXISTS content_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    content_hash VARCHAR(64),
    cached_content JSONB,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- API request logs table for monitoring (from original schema, keeping for compatibility)
CREATE TABLE IF NOT EXISTS api_request_logs (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255),
    request_method VARCHAR(10),
    request_path TEXT,
    response_status INTEGER,
    response_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Performance indexes for user_sessions (as per technical specifications)
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Performance indexes for request_logs (as per technical specifications)
CREATE INDEX idx_request_logs_user_created ON request_logs(user_id, created_at);

-- Indexes for content_cache (from original schema)
CREATE INDEX IF NOT EXISTS idx_content_cache_key ON content_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_content_cache_expires ON content_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_content_cache_hash ON content_cache(content_hash);

-- Indexes for api_request_logs (from original schema)
CREATE INDEX IF NOT EXISTS idx_api_request_logs_session_id ON api_request_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_status ON api_request_logs(response_status);

-- Cleanup function for expired sessions (as per technical specifications)
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

-- Triggers to automatically update updated_at columns
CREATE TRIGGER update_user_sessions_updated_at 
    BEFORE UPDATE ON user_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_content_cache_updated_at 
    BEFORE UPDATE ON content_cache 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Record setup as applied
INSERT INTO migrations (migration_name) 
VALUES ('complete-database-setup')
ON CONFLICT (migration_name) DO NOTHING;

COMMIT;

-- Verify the schema was created correctly
\echo 'Database setup complete. Verifying schema...'
\d+ user_sessions;
\d+ request_logs;
SELECT 'Setup verification: user_sessions table created with' || count(*) || ' columns' 
FROM information_schema.columns 
WHERE table_name = 'user_sessions';