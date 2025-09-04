# Railway PostgreSQL Setup Guide

## Overview

This guide covers the setup and configuration of PostgreSQL addon for the Drupalize.me MCP Server deployed on Railway platform.

## PostgreSQL Addon Configuration

### 1. Adding PostgreSQL to Your Railway Project

```bash
# Using Railway CLI
railway add postgresql

# Or add via Railway Dashboard:
# 1. Go to your project dashboard
# 2. Click "New Service" 
# 3. Select "Database"
# 4. Choose "PostgreSQL"
```

### 2. Environment Setup

Railway automatically provides these environment variables when PostgreSQL addon is added:

- `DATABASE_URL` - Complete connection string
- `PGHOST` - Database host
- `PGPORT` - Database port (usually 5432)
- `PGDATABASE` - Database name
- `PGUSER` - Database username
- `PGPASSWORD` - Database password

### 3. Recommended PostgreSQL Plans

#### Development/Staging
- **Starter Plan**: $5/month
- 1 GB storage
- Shared compute
- Suitable for development and testing

#### Production
- **Pro Plan**: $20/month
- 8 GB storage  
- Dedicated compute
- Better performance and reliability
- Consider upgrading based on usage

## Database Schema and Migrations

### Initial Schema Setup

The MCP server requires the following database tables:

```sql
-- User sessions table for OAuth state management
CREATE TABLE user_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255),
    oauth_state JSONB,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(token_expires_at);

-- Optional: Content cache table (for future use)
CREATE TABLE content_cache (
    id SERIAL PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    content_hash VARCHAR(64),
    cached_content JSONB,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_content_cache_key ON content_cache(cache_key);
CREATE INDEX idx_content_cache_expires ON content_cache(expires_at);
```

### Migration Strategy

#### Automatic Migrations on Startup

The application includes automatic migration checks on startup:

```javascript
// Example migration check (implemented in src/database/migrations.js)
async function runMigrations() {
  // Check if migrations table exists
  // Run pending migrations in order
  // Update migration status
}
```

#### Manual Migration Commands

```bash
# Connect to Railway PostgreSQL directly
railway connect postgresql

# Run migrations manually if needed
railway run npm run migrate

# Check migration status
railway run npm run migrate:status
```

## Connection Configuration

### Connection Pool Settings

The application uses connection pooling for optimal database performance:

```javascript
// Production settings (in railway.json)
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20
DATABASE_CONNECTION_TIMEOUT=10000
DATABASE_IDLE_TIMEOUT=30000

// Staging settings
DATABASE_POOL_MIN=1
DATABASE_POOL_MAX=10
```

### SSL Configuration

Railway PostgreSQL requires SSL connections:

```javascript
DATABASE_SSL_MODE=require
```

### Connection Validation

The application includes connection validation:

```javascript
// Health check includes database connectivity
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', database: 'disconnected' });
  }
});
```

## Backup and Recovery

### Automated Backups

Railway provides automated backups for PostgreSQL:

- Daily backups for Pro plan
- 7-day retention by default
- Can be extended with higher plans

### Manual Backup

```bash
# Create manual backup
railway backup create

# List available backups
railway backup list

# Restore from backup
railway backup restore <backup-id>
```

### Database Export/Import

```bash
# Export database
railway connect postgresql -- pg_dump > backup.sql

# Import to another environment
railway connect postgresql -e staging -- psql < backup.sql
```

## Monitoring and Maintenance

### Database Monitoring

Monitor key metrics in Railway dashboard:

- Connection count
- Query performance
- Storage usage
- Memory usage

### Performance Optimization

```sql
-- Regular maintenance queries
VACUUM ANALYZE user_sessions;
VACUUM ANALYZE content_cache;

-- Monitor slow queries
SELECT query, mean_time, calls 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;
```

### Connection Troubleshooting

Common connection issues and solutions:

1. **Connection Timeout**
   - Check network connectivity
   - Verify DATABASE_URL format
   - Increase connection timeout values

2. **Too Many Connections**
   - Reduce connection pool size
   - Check for connection leaks
   - Monitor active connections

3. **SSL Connection Failures**
   - Ensure SSL_MODE=require
   - Update database driver
   - Check certificate validity

## Security Best Practices

### Environment Variables

Never commit actual credentials to repository:

```bash
# Use Railway environment variables
railway variables set OAUTH_CLIENT_SECRET=actual_secret_value
```

### Database Access Control

- Use dedicated database user for application
- Limit privileges to necessary operations only
- Enable audit logging for sensitive operations

### Connection Security

- Always use SSL connections
- Rotate database credentials regularly
- Monitor for suspicious connection patterns

## Troubleshooting

### Common Issues

1. **Database Connection Refused**
   ```bash
   # Check service status
   railway status
   
   # View logs
   railway logs
   ```

2. **Migration Failures**
   ```bash
   # Check migration status
   railway run npm run migrate:status
   
   # Force reset migrations (DANGER - only for development)
   railway run npm run migrate:reset
   ```

3. **Performance Issues**
   ```bash
   # Check connection pool status
   railway logs --filter="pool"
   
   # Monitor database metrics
   railway dashboard
   ```

### Debug Commands

```bash
# Test database connection
railway run node -e "require('./dist/database').testConnection()"

# Check environment variables
railway variables

# View detailed logs
railway logs --tail
```