# Railway Deployment Setup Summary

## Quick Setup Checklist

This document provides a quick reference for setting up Railway deployment for the Drupalize.me MCP
Server.

### ✅ Completed Configuration

The following Railway deployment components have been configured:

#### 1. Railway Configuration Files

- ✅ `/workspace/railway.json` - Main Railway project configuration
- ✅ `/workspace/nixpacks.toml` - Build configuration

#### 2. Environment Variable Templates

- ✅ `/workspace/.env.production.template` - Production environment variables
- ✅ `/workspace/.env.staging.template` - Staging environment variables

#### 3. Database Configuration

- ✅ `/workspace/docs/railway-postgresql-setup.md` - PostgreSQL setup guide
- ✅ `/workspace/migrations/001-initial-schema.sql` - Initial database schema
- ✅ `/workspace/scripts/migrate.js` - Migration runner script

#### 4. GitHub Actions Integration

- ✅ `/workspace/.github/workflows/deploy.yml` - Production deployment workflow
- ✅ `/workspace/.github/workflows/deploy-staging.yml` - Staging deployment workflow

#### 5. Documentation

- ✅ `/workspace/docs/railway-deployment-guide.md` - Comprehensive deployment guide

## Next Steps for Manual Setup

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project from GitHub
# Go to railway.app and create project from GitHub repo
```

### 2. Add PostgreSQL Database

```bash
# Add PostgreSQL service
railway add postgresql

# Or via Railway dashboard:
# New Service → Database → PostgreSQL
```

### 3. Configure Environment Variables

Set these required variables in Railway dashboard:

#### Production Environment

```bash
OAUTH_CLIENT_ID=your_drupal_oauth_client_id
OAUTH_CLIENT_SECRET=your_drupal_oauth_client_secret
OAUTH_REDIRECT_URI=https://your-production-app.railway.app/oauth/callback
OAUTH_AUTHORIZATION_URL=https://drupalize.me/oauth/authorize
OAUTH_TOKEN_URL=https://drupalize.me/oauth/token
DRUPAL_BASE_URL=https://drupalize.me
SESSION_SECRET=your_production_session_secret_min_32_chars
CORS_ALLOWED_ORIGINS=https://your-client-app.com
```

#### Staging Environment

```bash
# Use staging/development URLs and credentials
OAUTH_CLIENT_ID=your_staging_oauth_client_id
OAUTH_CLIENT_SECRET=your_staging_oauth_client_secret
OAUTH_REDIRECT_URI=https://your-staging-app.railway.app/oauth/callback
# ... etc with staging URLs
```

### 4. Configure GitHub Secrets

Add this secret to your GitHub repository:

```bash
RAILWAY_TOKEN=your_railway_deployment_token
```

Get Railway token from:

- Railway CLI: `railway auth`
- Railway Dashboard: Account Settings → Tokens → Create Token

### 5. Database Setup

After first deployment, initialize the database:

```bash
# Run initial migrations
railway run npm run migrate

# Verify database connection
railway run npm run migrate:test
```

## Architecture Overview

### Deployment Flow

1. **Code Push** → GitHub repository
2. **CI Pipeline** → Tests, build, quality checks
3. **Railway Deploy** → Container build and deployment
4. **Database Migrations** → Automatic schema updates
5. **Health Checks** → Deployment verification
6. **Monitoring** → Ongoing health monitoring

### Environment Separation

- **Production**: Main branch → https://mcp-server.railway.app
- **Staging**: Develop/staging branch → https://mcp-server-staging.railway.app

### Database Configuration

- **PostgreSQL Addon**: Automatic connection via Railway
- **Migrations**: Automatic on deployment
- **Connection Pooling**: Configured for performance
- **SSL**: Required for production security

### Health Monitoring

- **Application Health**: `/health` endpoint
- **Database Connectivity**: Connection validation
- **MCP SSE Endpoint**: `/mcp/sse` functionality check
- **Automatic Rollback**: On health check failures

## Configuration Files Reference

### `/workspace/railway.json`

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "dockerfile",
    "dockerfilePath": "Dockerfile"
  },
  "environments": {
    "production": {
      "variables": {
        /* Production config */
      }
    },
    "staging": {
      "variables": {
        /* Staging config */
      }
    }
  },
  "healthcheck": {
    "path": "/health",
    "timeout": 10,
    "interval": 30
  }
}
```

### Migration Commands

```bash
npm run migrate        # Run pending migrations
npm run migrate:status # Check migration status
npm run migrate:test   # Test database connection
```

### Railway CLI Commands

```bash
railway up            # Deploy to Railway
railway up -e staging # Deploy to staging
railway logs          # View application logs
railway connect postgresql # Connect to database
railway variables     # List environment variables
railway rollback      # Rollback deployment
```

## Troubleshooting Quick Reference

### Deployment Issues

```bash
railway logs           # Check deployment logs
railway status         # Check service status
railway up --force     # Force rebuild and deploy
```

### Database Issues

```bash
railway run npm run migrate:test  # Test DB connection
railway connect postgresql        # Direct DB access
railway logs -s postgresql       # Database logs
```

### Environment Issues

```bash
railway variables                 # List all variables
railway variables -e production   # Environment-specific
railway shell                     # Access environment
```

## Security Checklist

- ✅ Environment variables properly configured
- ✅ PostgreSQL SSL connections enabled
- ✅ Session secrets configured
- ✅ CORS origins restricted
- ✅ OAuth credentials secured
- ✅ Railway deployment tokens secured in GitHub secrets

## Performance Optimization

- ✅ Connection pooling configured
- ✅ Health check intervals optimized
- ✅ Docker multi-stage builds for smaller images
- ✅ Production logging levels configured
- ✅ Rate limiting enabled

---

**Status**: Railway deployment configuration complete ✅ **Next Step**: Create Railway project and
configure environment variables **Documentation**: See `/workspace/docs/railway-deployment-guide.md`
for detailed instructions
