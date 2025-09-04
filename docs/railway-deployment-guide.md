# Railway Deployment Guide

## Overview

This guide covers the complete deployment process for the Drupalize.me MCP Server on Railway platform, including environment setup, database configuration, and automated CI/CD deployment.

## Prerequisites

- GitHub repository with the MCP server code
- Railway account (sign up at railway.app)
- Railway CLI installed locally (optional, for manual operations)

## Initial Railway Setup

### 1. Create Railway Project

#### Via Railway Dashboard
1. Go to [railway.app](https://railway.app)
2. Click "New Project"
3. Select "Deploy from GitHub repo" 
4. Choose your repository
5. Configure initial settings

#### Via Railway CLI
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Initialize project in your repository
railway init

# Link to existing project (if already created)
railway link
```

### 2. Configure Environment Variables

#### Required Environment Variables

Set these variables in Railway dashboard for each environment:

**Production Environment:**
```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# OAuth Configuration (replace with actual values)
OAUTH_CLIENT_ID=your_drupal_oauth_client_id
OAUTH_CLIENT_SECRET=your_drupal_oauth_client_secret
OAUTH_REDIRECT_URI=https://your-production-app.railway.app/oauth/callback
OAUTH_AUTHORIZATION_URL=https://drupalize.me/oauth/authorize
OAUTH_TOKEN_URL=https://drupalize.me/oauth/token

# Drupal API
DRUPAL_BASE_URL=https://drupalize.me
DRUPAL_API_BASE_PATH=/api
DRUPAL_JSONRPC_ENDPOINT=/jsonrpc

# Security
SESSION_SECRET=your_production_session_secret_min_32_chars
CORS_ALLOWED_ORIGINS=https://your-client-app.com

# Database (automatically set by Railway PostgreSQL addon)
# DATABASE_URL will be set automatically
```

**Staging Environment:**
```bash
# Use staging/development values for OAuth and Drupal URLs
NODE_ENV=staging
LOG_LEVEL=debug
# ... (use staging URLs and credentials)
```

#### Set Environment Variables
```bash
# Via Railway CLI
railway variables set OAUTH_CLIENT_ID=your_value
railway variables set OAUTH_CLIENT_SECRET=your_secret

# Or use the Railway dashboard:
# Project Settings > Variables > Add Variable
```

### 3. Add PostgreSQL Database

#### Via Railway Dashboard
1. Go to your project dashboard
2. Click "New Service"
3. Select "Database"
4. Choose "PostgreSQL"
5. Select appropriate plan:
   - **Starter ($5/month)** - Development/Staging
   - **Pro ($20/month)** - Production

#### Via Railway CLI
```bash
railway add postgresql
```

The database will automatically provide these environment variables:
- `DATABASE_URL` - Complete connection string
- `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`

## Deployment Configuration

### 1. Railway Configuration Files

The repository includes these Railway configuration files:

#### `/workspace/railway.json`
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "dockerfile",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyType": "on-failure"
  },
  "environments": {
    "production": { ... },
    "staging": { ... }
  },
  "healthcheck": {
    "path": "/health",
    "timeout": 10,
    "interval": 30
  }
}
```

#### `/workspace/nixpacks.toml`
```toml
[phases.build]
cmds = [
  "npm ci --frozen-lockfile",
  "npm run build:prod"
]

[start]
cmd = "node dist/index.js"
```

### 2. GitHub Actions Integration

The deployment is automated via GitHub Actions workflow (`.github/workflows/deploy.yml`).

#### Deployment Triggers
- Automatic: After successful CI on main branch
- Manual: Via workflow_dispatch

#### Required GitHub Secrets
Set these in your GitHub repository secrets:

```bash
RAILWAY_TOKEN=your_railway_deployment_token
```

To get Railway token:
```bash
# Via Railway CLI
railway auth

# Or create in Railway dashboard:
# Account Settings > Tokens > Create Token
```

### 3. Database Migrations

Migrations run automatically during deployment:

```yaml
- name: Run database migrations
  run: railway run npm run migrate
  env:
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

#### Manual Migration Commands
```bash
# Check migration status
railway run npm run migrate:status

# Run migrations manually
railway run npm run migrate

# Test database connection
railway run npm run migrate:test
```

## Staging vs Production Environments

### Environment Separation

Railway supports multiple environments within a single project:

#### Staging Environment
- Branch: `develop` or `staging`
- Database: Separate PostgreSQL instance
- Smaller resource allocation
- Debug logging enabled
- Relaxed rate limiting

#### Production Environment  
- Branch: `main`
- Database: Production PostgreSQL instance
- Full resource allocation
- Info-level logging
- Production rate limiting

### Environment-Specific Deployment

```bash
# Deploy to staging
railway up -e staging

# Deploy to production  
railway up -e production

# Set environment-specific variables
railway variables set OAUTH_CLIENT_ID=staging_client_id -e staging
railway variables set OAUTH_CLIENT_ID=prod_client_id -e production
```

## Health Checks and Monitoring

### Built-in Health Checks

Railway monitors these endpoints:

```javascript
// Application health check
GET /health
Response: {"status": "healthy", "database": "connected"}

// MCP SSE endpoint check  
GET /mcp/sse
Response: Server-Sent Events stream
```

### Monitoring Setup

#### Railway Dashboard
- Service metrics (CPU, Memory, Network)
- Deployment logs
- Database metrics
- Alert configuration

#### Custom Monitoring
```bash
# View logs
railway logs

# Monitor specific service
railway logs -f

# Check service status
railway status
```

## Deployment Process

### Automated Deployment Flow

1. **Code Push**: Push to main branch
2. **CI Pipeline**: Run tests, build, quality checks
3. **Deployment Trigger**: On CI success
4. **Railway Deploy**: Build and deploy container
5. **Database Migrations**: Run pending migrations
6. **Health Checks**: Verify deployment success
7. **Rollback**: Automatic rollback on failure

### Manual Deployment

```bash
# Build and deploy
railway up

# Deploy specific environment
railway up -e production

# Deploy with custom image
railway up --detach
```

### Rollback Procedures

#### Automatic Rollback
- Triggered on health check failures
- Creates GitHub issue for incident tracking
- Restores previous working deployment

#### Manual Rollback
```bash
# List recent deployments
railway deployments

# Rollback to specific deployment
railway rollback <deployment-id>

# Rollback to previous deployment
railway rollback
```

## Security Configuration

### SSL/TLS Configuration
- Railway provides automatic HTTPS
- Custom domains supported
- SSL certificates managed automatically

### Database Security
- SSL connections required in production
- Connection pooling with limits
- Automatic security updates

### Environment Security
```bash
# Secure environment variables
railway variables set SECRET_KEY=value --encrypted

# Audit environment access
railway collaborators list
```

## Troubleshooting

### Common Deployment Issues

#### Build Failures
```bash
# Check build logs
railway logs --build

# Verify dependencies
railway run npm audit

# Clear cache and rebuild
railway up --force
```

#### Database Connection Issues
```bash
# Test database connectivity
railway run npm run migrate:test

# Check database status
railway services

# View database logs
railway logs -s postgresql
```

#### Environment Variable Issues
```bash
# List all variables
railway variables

# Check variable in specific environment
railway variables -e production

# Test configuration
railway run env | grep OAUTH
```

### Performance Monitoring

```bash
# Resource usage
railway metrics

# Response time monitoring
railway logs | grep "response_time"

# Database performance
railway connect postgresql
```

### Debug Commands

```bash
# Connect to production environment
railway shell

# Run commands in production
railway run node -v

# Database shell access
railway connect postgresql

# Download logs
railway logs > deployment.log
```

## Maintenance and Updates

### Regular Maintenance Tasks

1. **Database Maintenance**
   ```bash
   # Vacuum database
   railway connect postgresql -- VACUUM ANALYZE;
   
   # Check database size
   railway connect postgresql -- SELECT pg_size_pretty(pg_database_size('railway'));
   ```

2. **Security Updates**
   ```bash
   # Update dependencies
   npm audit fix
   
   # Rebuild and deploy
   railway up
   ```

3. **Monitoring Cleanup**
   ```bash
   # Archive old logs
   railway logs --since=30d > monthly-logs.txt
   
   # Clean up old deployments
   # (Railway handles this automatically)
   ```

### Scaling Considerations

#### Horizontal Scaling
```json
// In railway.json
{
  "deploy": {
    "numReplicas": 3,
    "restartPolicyType": "always"
  }
}
```

#### Vertical Scaling
- Upgrade Railway plan for more resources
- Monitor resource usage in dashboard
- Adjust database plan as needed

#### Database Scaling
- Monitor connection pool usage
- Adjust pool settings in environment variables
- Consider read replicas for high-traffic scenarios

## Support and Resources

### Documentation
- [Railway Docs](https://docs.railway.app)
- [PostgreSQL on Railway](https://docs.railway.app/databases/postgresql)
- [GitHub Actions Integration](https://docs.railway.app/deploy/github-actions)

### Getting Help
- Railway Discord community
- GitHub Issues for application-specific problems
- Railway support for platform issues

### Useful Commands Reference
```bash
# Essential Railway CLI commands
railway login          # Authenticate with Railway
railway init           # Initialize project
railway up             # Deploy application  
railway logs           # View logs
railway shell          # Access environment shell
railway connect        # Connect to services
railway variables      # Manage environment variables
railway status         # Check service status
railway rollback       # Rollback deployment
```