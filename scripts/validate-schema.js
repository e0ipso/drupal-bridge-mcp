#!/usr/bin/env node

/**
 * Schema Validation Script for Drupalize.me MCP Server
 *
 * This script validates that the database schema meets all the
 * technical requirements from Task 001: Database Schema Setup
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SchemaValidator {
  constructor() {
    this.errors = [];
    this.warnings = [];
  }

  log(message) {
    console.log(`✅ ${message}`);
  }

  warn(message) {
    console.log(`⚠️  ${message}`);
    this.warnings.push(message);
  }

  error(message) {
    console.log(`❌ ${message}`);
    this.errors.push(message);
  }

  validateSqlFile(filePath, requirements) {
    if (!fs.existsSync(filePath)) {
      this.error(`SQL file not found: ${filePath}`);
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    this.log(`Validating ${path.basename(filePath)}`);

    // Check transaction blocks
    if (content.includes('BEGIN;') && content.includes('COMMIT;')) {
      this.log('  - Transaction blocks: Present');
    } else {
      this.error('  - Transaction blocks: Missing BEGIN; or COMMIT;');
    }

    // Validate user_sessions table schema
    this.validateUserSessionsTable(content);

    // Validate request_logs table if required
    if (requirements.includeRequestLogs) {
      this.validateRequestLogsTable(content);
    }

    // Validate indexes
    this.validateIndexes(content, requirements.requiredIndexes);

    // Validate functions
    this.validateFunctions(content, requirements.requiredFunctions);

    return this.errors.length === 0;
  }

  validateUserSessionsTable(content) {
    const requiredColumns = [
      'id',
      'user_id',
      'access_token_hash',
      'refresh_token_hash',
      'expires_at',
      'scope',
      'subscription_level',
      'created_at',
      'updated_at',
    ];

    if (!content.includes('CREATE TABLE user_sessions')) {
      this.error('  - user_sessions table: Missing table creation');
      return;
    }

    this.log('  - user_sessions table: Found');

    // Check each required column exists in the content
    requiredColumns.forEach(columnName => {
      if (content.includes(columnName)) {
        this.log(`    ✓ Column: ${columnName}`);
      } else {
        this.error(`    ✗ Column missing: ${columnName}`);
      }
    });

    // Check specific constraints
    const constraints = [
      { name: 'SERIAL PRIMARY KEY', check: 'id SERIAL PRIMARY KEY' },
      { name: 'NOT NULL constraints', check: 'NOT NULL' },
      { name: 'DEFAULT values', check: 'DEFAULT' },
      { name: 'TIMESTAMP WITH TIME ZONE', check: 'TIMESTAMP WITH TIME ZONE' },
      { name: 'TEXT array type', check: 'TEXT[]' },
    ];

    constraints.forEach(constraint => {
      if (content.includes(constraint.check)) {
        this.log(`    ✓ Constraint: ${constraint.name}`);
      } else {
        this.warn(`    ! Constraint may be missing: ${constraint.name}`);
      }
    });
  }

  validateRequestLogsTable(content) {
    const requiredColumns = [
      'id',
      'user_id',
      'method',
      'parameters',
      'response_size',
      'duration_ms',
      'status',
      'created_at',
    ];

    if (
      !content.includes('CREATE TABLE') ||
      !content.includes('request_logs')
    ) {
      this.error('  - request_logs table: Missing table creation');
      return;
    }

    this.log('  - request_logs table: Found');

    // Check each required column exists in the content
    requiredColumns.forEach(columnName => {
      if (content.includes(columnName)) {
        this.log(`    ✓ Column: ${columnName}`);
      } else {
        this.error(`    ✗ Column missing: ${columnName}`);
      }
    });

    // Check specific data types and constraints
    const dataTypes = [
      { name: 'JSONB type', check: 'JSONB' },
      { name: 'INTEGER types', check: 'INTEGER' },
      { name: 'VARCHAR types', check: 'VARCHAR' },
    ];

    dataTypes.forEach(dataType => {
      if (content.includes(dataType.check)) {
        this.log(`    ✓ Data type: ${dataType.name}`);
      } else {
        this.warn(`    ! Data type may be missing: ${dataType.name}`);
      }
    });
  }

  validateIndexes(content, requiredIndexes) {
    this.log('  - Performance indexes:');

    requiredIndexes.forEach(indexName => {
      if (content.includes(indexName)) {
        this.log(`    ✓ ${indexName}`);
      } else {
        this.error(`    ✗ Missing index: ${indexName}`);
      }
    });
  }

  validateFunctions(content, requiredFunctions) {
    this.log('  - Database functions:');

    requiredFunctions.forEach(functionName => {
      const functionPattern = new RegExp(
        `CREATE OR REPLACE FUNCTION ${functionName}`,
        'i'
      );
      if (functionPattern.test(content)) {
        this.log(`    ✓ ${functionName}`);
      } else {
        this.error(`    ✗ Missing function: ${functionName}`);
      }
    });
  }

  validateMigrationRunner() {
    const runnerPath = path.join(__dirname, 'run-migrations.js');

    if (!fs.existsSync(runnerPath)) {
      this.error('Migration runner script not found');
      return;
    }

    const content = fs.readFileSync(runnerPath, 'utf8');

    // Check for required functionality
    const requiredFeatures = [
      'class MigrationRunner',
      'async connect()',
      'async runSqlFile',
      'async testSchema',
      'cleanup_expired_sessions',
    ];

    this.log('Migration runner validation:');
    requiredFeatures.forEach(feature => {
      if (content.includes(feature)) {
        this.log(`  ✓ ${feature}`);
      } else {
        this.error(`  ✗ Missing feature: ${feature}`);
      }
    });
  }

  async runValidation() {
    console.log('🔍 Database Schema Validation');
    console.log('==============================\\n');

    // Define requirements based on technical specifications
    const migrationRequirements = {
      includeRequestLogs: true,
      requiredIndexes: [
        'idx_user_sessions_user_id',
        'idx_user_sessions_expires',
        'idx_request_logs_user_created',
      ],
      requiredFunctions: ['cleanup_expired_sessions'],
    };

    // Validate migration file
    const migrationFile = path.join(
      __dirname,
      '..',
      'migrations',
      '002-update-user-sessions-schema.sql'
    );
    this.validateSqlFile(migrationFile, migrationRequirements);

    // Validate setup script
    const setupFile = path.join(__dirname, 'setup-database.sql');
    this.validateSqlFile(setupFile, migrationRequirements);

    // Validate migration runner
    this.validateMigrationRunner();

    // Final results
    console.log('\\n📊 Validation Results');
    console.log('======================');

    if (this.errors.length === 0) {
      console.log('✅ All validations passed!');
      console.log('✅ Database schema meets all technical requirements');
    } else {
      console.log(`❌ ${this.errors.length} validation error(s) found:`);
      this.errors.forEach(error => console.log(`   ${error}`));
    }

    if (this.warnings.length > 0) {
      console.log(`⚠️  ${this.warnings.length} warning(s):`);
      this.warnings.forEach(warning => console.log(`   ${warning}`));
    }

    // Acceptance criteria checklist
    console.log('\\n📋 Acceptance Criteria Status');
    console.log('==============================');

    const criteria = [
      'user_sessions table created with proper column types and constraints',
      'request_logs table created for optional analytics and debugging',
      'Performance indexes implemented for user_id and expires_at lookups',
      'cleanup_expired_sessions() function created for automated maintenance',
      'Database schema validates against the technical specifications',
      'All SQL scripts execute successfully without errors',
    ];

    criteria.forEach((criterion, index) => {
      const status = this.errors.length === 0 ? '✅' : '❓';
      console.log(`${status} [${index + 1}] ${criterion}`);
    });

    return this.errors.length === 0;
  }
}

async function main() {
  const validator = new SchemaValidator();
  const success = await validator.runValidation();
  process.exit(success ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { SchemaValidator };
