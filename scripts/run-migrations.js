#!/usr/bin/env node

/**
 * Database Migration Runner for Drupalize.me MCP Server
 *
 * This script handles database migrations and setup.
 * Usage:
 *   node scripts/run-migrations.js [--setup] [--test]
 *
 * Options:
 *   --setup  Run complete database setup from scratch
 *   --test   Test database connection and schema
 */

import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MigrationRunner {
  constructor() {
    this.client = new Client({
      connectionString:
        process.env.DATABASE_URL || 'postgresql://localhost:5432/mcp_server',
    });
  }

  async connect() {
    try {
      await this.client.connect();
      console.log('✅ Connected to PostgreSQL database');
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to database:', error.message);
      return false;
    }
  }

  async disconnect() {
    await this.client.end();
    console.log('📤 Disconnected from database');
  }

  async runSqlFile(filePath) {
    try {
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`🔄 Running ${path.basename(filePath)}...`);

      await this.client.query(sql);
      console.log(`✅ Successfully executed ${path.basename(filePath)}`);
      return true;
    } catch (error) {
      console.error(
        `❌ Failed to execute ${path.basename(filePath)}:`,
        error.message
      );
      return false;
    }
  }

  async testSchema() {
    try {
      console.log('🔍 Testing database schema...');

      // Test user_sessions table
      const userSessionsResult = await this.client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'user_sessions'
        ORDER BY ordinal_position;
      `);

      console.log('\n📋 user_sessions table columns:');
      userSessionsResult.rows.forEach(row => {
        console.log(
          `  - ${row.column_name}: ${row.data_type}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}`
        );
      });

      // Test request_logs table
      const requestLogsResult = await this.client.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns 
        WHERE table_name = 'request_logs'
        ORDER BY ordinal_position;
      `);

      console.log('\n📋 request_logs table columns:');
      requestLogsResult.rows.forEach(row => {
        console.log(
          `  - ${row.column_name}: ${row.data_type}${row.is_nullable === 'NO' ? ' NOT NULL' : ''}`
        );
      });

      // Test indexes
      const indexesResult = await this.client.query(`
        SELECT schemaname, tablename, indexname
        FROM pg_indexes 
        WHERE tablename IN ('user_sessions', 'request_logs')
        ORDER BY tablename, indexname;
      `);

      console.log('\n📑 Indexes:');
      indexesResult.rows.forEach(row => {
        console.log(`  - ${row.tablename}.${row.indexname}`);
      });

      // Test cleanup function
      const functionsResult = await this.client.query(`
        SELECT routine_name, routine_type
        FROM information_schema.routines 
        WHERE routine_name = 'cleanup_expired_sessions'
        AND routine_schema = 'public';
      `);

      console.log('\n⚙️  Functions:');
      functionsResult.rows.forEach(row => {
        console.log(`  - ${row.routine_name} (${row.routine_type})`);
      });

      // Test function execution
      console.log('\n🧪 Testing cleanup_expired_sessions function...');
      await this.client.query('SELECT cleanup_expired_sessions();');
      console.log('✅ cleanup_expired_sessions function executed successfully');

      return true;
    } catch (error) {
      console.error('❌ Schema test failed:', error.message);
      return false;
    }
  }

  async runMigrations() {
    const migrationsDir = path.join(__dirname, '..', 'migrations');

    try {
      const files = fs
        .readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql'))
        .sort();

      console.log(`📁 Found ${files.length} migration files`);

      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const success = await this.runSqlFile(filePath);

        if (!success) {
          console.log('❌ Migration failed, stopping');
          return false;
        }
      }

      console.log('✅ All migrations completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Migration runner failed:', error.message);
      return false;
    }
  }

  async runSetup() {
    const setupFile = path.join(__dirname, 'setup-database.sql');

    if (!fs.existsSync(setupFile)) {
      console.error('❌ Setup file not found:', setupFile);
      return false;
    }

    return await this.runSqlFile(setupFile);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isSetup = args.includes('--setup');
  const isTest = args.includes('--test');

  const runner = new MigrationRunner();

  const connected = await runner.connect();
  if (!connected) {
    process.exit(1);
  }

  try {
    if (isSetup) {
      console.log('🚀 Running complete database setup...');
      const success = await runner.runSetup();
      if (success && isTest) {
        await runner.testSchema();
      }
    } else if (isTest) {
      console.log('🧪 Testing database schema...');
      await runner.testSchema();
    } else {
      console.log('🔄 Running database migrations...');
      const success = await runner.runMigrations();
      if (success && args.includes('--verify')) {
        await runner.testSchema();
      }
    }
  } finally {
    await runner.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MigrationRunner };
