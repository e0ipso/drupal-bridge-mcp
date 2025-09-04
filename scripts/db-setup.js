#!/usr/bin/env node

/**
 * Database setup script for CI/CD environments
 * Creates necessary tables for MCP server testing
 */

import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://test:test@localhost:5432/mcp_server_test';

async function setupDatabase() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
  });

  try {
    console.log('Setting up database for testing...');

    // Basic health check
    await pool.query('SELECT 1');
    console.log('Database connection successful');

    // Create a simple sessions table for OAuth state management
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(255) PRIMARY KEY,
        data JSONB NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // Create index for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)
    `);

    console.log('Database tables created successfully');

    // Clean up any existing test data
    await pool.query("DELETE FROM sessions WHERE id LIKE 'test_%'");
    console.log('Test data cleaned up');
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Only run if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase();
}

export { setupDatabase };
