# Database Setup Guide

This guide covers the PostgreSQL database setup for the Drupalize.me MCP Server.

## Quick Start

### 1. Prerequisites

- PostgreSQL 12+ installed and running
- Node.js 18+ for running migration scripts
- Environment variable `DATABASE_URL` set (optional, defaults to local)

```bash
export DATABASE_URL="postgresql://username:password@localhost:5432/mcp_server"
```

### 2. Complete Setup (Recommended for new installations)

```bash
# Run complete database setup
node scripts/run-migrations.js --setup --test
```

This will:

- Create all required tables with correct schema
- Set up performance indexes
- Create database functions
- Verify the setup with tests

### 3. Migration-based Setup (For existing databases)

```bash
# Run individual migrations in order
node scripts/run-migrations.js
```

## Database Schema

### Core Tables

#### `user_sessions`

Stores OAuth authentication state and user session data.

| Column             | Type                     | Constraints    | Description                |
| ------------------ | ------------------------ | -------------- | -------------------------- |
| id                 | SERIAL                   | PRIMARY KEY    | Unique session identifier  |
| user_id            | VARCHAR(255)             | NOT NULL       | Drupal user ID             |
| access_token_hash  | VARCHAR(255)             | NOT NULL       | Hashed OAuth access token  |
| refresh_token_hash | VARCHAR(255)             | NOT NULL       | Hashed OAuth refresh token |
| expires_at         | TIMESTAMP WITH TIME ZONE | NOT NULL       | Token expiration time      |
| scope              | TEXT[]                   | DEFAULT '{}'   | OAuth scopes granted       |
| subscription_level | VARCHAR(50)              | DEFAULT 'free' | User's subscription tier   |
| created_at         | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()  | Record creation time       |
| updated_at         | TIMESTAMP WITH TIME ZONE | DEFAULT NOW()  | Last update time           |

#### `request_logs`

Optional table for analytics and debugging.

| Column        | Type                     | Description            |
| ------------- | ------------------------ | ---------------------- |
| id            | SERIAL                   | Primary key            |
| user_id       | VARCHAR(255)             | Associated user        |
| method        | VARCHAR(100)             | MCP method called      |
| parameters    | JSONB                    | Request parameters     |
| response_size | INTEGER                  | Response size in bytes |
| duration_ms   | INTEGER                  | Request duration       |
| status        | VARCHAR(50)              | Request status         |
| created_at    | TIMESTAMP WITH TIME ZONE | Request timestamp      |

### Performance Indexes

```sql
-- User lookup and cleanup
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);

-- Request log analysis
CREATE INDEX idx_request_logs_user_created ON request_logs(user_id, created_at);
```

### Database Functions

#### `cleanup_expired_sessions()`

Removes expired user sessions to maintain database health.

```sql
-- Run cleanup manually
SELECT cleanup_expired_sessions();

-- Recommended: Set up automated cleanup with cron or pg_cron
SELECT cron.schedule('cleanup-sessions', '0 2 * * *', 'SELECT cleanup_expired_sessions();');
```

## Migration Files

- `migrations/001-initial-schema.sql` - Original schema (legacy)
- `migrations/002-update-user-sessions-schema.sql` - Updated schema matching technical specs
- `scripts/setup-database.sql` - Complete setup from scratch

## Testing the Setup

```bash
# Test database connection and schema
node scripts/run-migrations.js --test
```

This will verify:

- All required tables exist
- Columns match specifications
- Indexes are created correctly
- Database functions work properly

## Environment Variables

```bash
# Database connection
DATABASE_URL=postgresql://user:pass@localhost:5432/mcp_server

# Optional: Connection pool settings
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_TIMEOUT=5000
```

## Maintenance

### Regular Cleanup

Set up automated cleanup of expired sessions:

```sql
-- Option 1: Using pg_cron (if available)
SELECT cron.schedule('cleanup-expired-sessions', '0 2 * * *', 'SELECT cleanup_expired_sessions();');

-- Option 2: Manual cleanup script
-- Add to your application's scheduled tasks
```

### Monitoring

Keep an eye on these metrics:

- Active session count: `SELECT COUNT(*) FROM user_sessions WHERE expires_at > NOW();`
- Expired sessions: `SELECT COUNT(*) FROM user_sessions WHERE expires_at <= NOW();`
- Request volume:
  `SELECT COUNT(*) FROM request_logs WHERE created_at > NOW() - INTERVAL '24 hours';`

### Performance Tuning

For high-traffic scenarios, consider:

1. Partitioning `request_logs` by date
2. Archive old request logs regularly
3. Monitor index usage with `pg_stat_user_indexes`

## Troubleshooting

### Migration Fails

```bash
# Check current migration status
psql $DATABASE_URL -c "SELECT * FROM migrations ORDER BY applied_at;"

# Reset and re-run if needed
psql $DATABASE_URL -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
node scripts/run-migrations.js --setup
```

### Connection Issues

```bash
# Test basic connection
psql $DATABASE_URL -c "SELECT version();"

# Check database exists
psql $DATABASE_URL -c "\l"
```

### Schema Validation

```bash
# Verify table structure
psql $DATABASE_URL -c "\d+ user_sessions"
psql $DATABASE_URL -c "\d+ request_logs"

# Check indexes
psql $DATABASE_URL -c "\di"
```
