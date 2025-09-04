#!/usr/bin/env node

/**
 * Database Migration Runner for Railway Deployment
 * Runs SQL migrations against PostgreSQL database
 */

const { Pool } = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Database connection configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

async function getMigrationsDirectory() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  try {
    await fs.access(migrationsDir);
    return migrationsDir;
  } catch (error) {
    console.error('Migrations directory not found:', migrationsDir);
    process.exit(1);
  }
}

async function getAppliedMigrations(client) {
  try {
    const result = await client.query(
      'SELECT migration_name FROM migrations ORDER BY applied_at'
    );
    return result.rows.map(row => row.migration_name);
  } catch (error) {
    // If migrations table doesn't exist, return empty array
    if (error.code === '42P01') {
      return [];
    }
    throw error;
  }
}

async function getAllMigrationFiles(migrationsDir) {
  const files = await fs.readdir(migrationsDir);
  return files.filter(file => file.endsWith('.sql')).sort(); // Ensure migrations run in order
}

async function runMigration(client, migrationFile, migrationsDir) {
  const migrationPath = path.join(migrationsDir, migrationFile);
  const migrationContent = await fs.readFile(migrationPath, 'utf8');

  console.log(`Running migration: ${migrationFile}`);

  try {
    await client.query(migrationContent);
    console.log(`✅ Successfully applied migration: ${migrationFile}`);
  } catch (error) {
    console.error(`❌ Failed to apply migration: ${migrationFile}`);
    console.error('Error:', error.message);
    throw error;
  }
}

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('🔄 Starting database migrations...');

    // Test database connection
    await client.query('SELECT NOW()');
    console.log('✅ Database connection established');

    const migrationsDir = await getMigrationsDirectory();
    const appliedMigrations = await getAppliedMigrations(client);
    const allMigrationFiles = await getAllMigrationFiles(migrationsDir);

    console.log(`📁 Found ${allMigrationFiles.length} migration files`);
    console.log(`📊 ${appliedMigrations.length} migrations already applied`);

    const pendingMigrations = allMigrationFiles.filter(
      file => !appliedMigrations.includes(file)
    );

    if (pendingMigrations.length === 0) {
      console.log('✅ All migrations are up to date');
      return;
    }

    console.log(`🔄 Running ${pendingMigrations.length} pending migrations...`);

    for (const migrationFile of pendingMigrations) {
      await runMigration(client, migrationFile, migrationsDir);
    }

    console.log('🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('💥 Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function checkMigrationStatus() {
  const client = await pool.connect();

  try {
    console.log('📊 Migration Status Report');
    console.log('========================');

    const migrationsDir = await getMigrationsDirectory();
    const appliedMigrations = await getAppliedMigrations(client);
    const allMigrationFiles = await getAllMigrationFiles(migrationsDir);

    console.log(`Total migration files: ${allMigrationFiles.length}`);
    console.log(`Applied migrations: ${appliedMigrations.length}`);

    if (appliedMigrations.length > 0) {
      console.log('\n✅ Applied Migrations:');
      appliedMigrations.forEach(migration => {
        console.log(`  - ${migration}`);
      });
    }

    const pendingMigrations = allMigrationFiles.filter(
      file => !appliedMigrations.includes(file)
    );

    if (pendingMigrations.length > 0) {
      console.log('\n⏳ Pending Migrations:');
      pendingMigrations.forEach(migration => {
        console.log(`  - ${migration}`);
      });
    }

    if (pendingMigrations.length === 0) {
      console.log('\n🎉 Database is up to date!');
    }
  } catch (error) {
    console.error('❌ Failed to check migration status:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

async function testDatabaseConnection() {
  console.log('🔌 Testing database connection...');

  const client = await pool.connect();

  try {
    const result = await client.query(
      'SELECT NOW() as current_time, version() as postgres_version'
    );
    const { current_time, postgres_version } = result.rows[0];

    console.log('✅ Database connection successful!');
    console.log(`Current time: ${current_time}`);
    console.log(`PostgreSQL version: ${postgres_version}`);

    // Test basic operations
    await client.query('SELECT 1 as test');
    console.log('✅ Basic query operations working');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Connection details:', {
      host: process.env.PGHOST,
      port: process.env.PGPORT,
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      ssl: process.env.NODE_ENV === 'production' ? 'required' : 'disabled',
    });
    process.exit(1);
  } finally {
    client.release();
  }
}

// Command-line interface
async function main() {
  const command = process.argv[2] || 'migrate';

  try {
    switch (command) {
      case 'migrate':
        await runMigrations();
        break;
      case 'status':
        await checkMigrationStatus();
        break;
      case 'test':
        await testDatabaseConnection();
        break;
      default:
        console.log('Usage: node migrate.js [migrate|status|test]');
        console.log('  migrate - Run pending migrations');
        console.log('  status  - Show migration status');
        console.log('  test    - Test database connection');
        process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

// Handle uncaught errors
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await pool.end();
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });
}

module.exports = {
  runMigrations,
  checkMigrationStatus,
  testDatabaseConnection,
};
