# MCP Server Deployment Guide

## Overview

This guide provides comprehensive step-by-step instructions for deploying the Drupalize.me MCP Server to Railway, including environment setup, database configuration, and CI/CD integration.

## Prerequisites

Before deploying, ensure you have:

- **GitHub Account**: Repository access and Actions enabled
- **Railway Account**: Free account at [railway.app](https://railway.app)
- **Railway CLI**: Installed locally for deployment management
- **Node.js 20+**: For local development and testing
- **Git**: For version control and deployment triggers

## Table of Contents

1. [Railway Project Setup](#railway-project-setup)
2. [Database Configuration](#database-configuration)
3. [Environment Variables](#environment-variables)
4. [GitHub Integration](#github-integration)
5. [Initial Deployment](#initial-deployment)
6. [Health Check Verification](#health-check-verification)
7. [Domain Configuration](#domain-configuration)
8. [CI/CD Pipeline Setup](#cicd-pipeline-setup)
9. [Staging Environment](#staging-environment)
10. [Production Deployment](#production-deployment)
11. [Post-Deployment Verification](#post-deployment-verification)

## Railway Project Setup

### 1. Create Railway Project

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project from GitHub repository
railway login
railway new
# Select "Deploy from GitHub repo"
# Choose your repository: drupalizeme-mcp-server
```

### 2. Project Configuration

1. **Navigate to Railway Dashboard**
   - Go to [railway.app/dashboard](https://railway.app/dashboard)
   - Select your newly created project

2. **Configure Build Settings**
   - Go to **Settings** → **Build**
   - Build Command: `npm run build:prod`
   - Start Command: `npm start`
   - Root Directory: `/` (default)

3. **Add PostgreSQL Service**
   - Click **+ New Service**
   - Select **Database** → **PostgreSQL**
   - Railway will automatically provision a PostgreSQL database

## Database Configuration

### 1. PostgreSQL Setup

Railway automatically configures PostgreSQL with the following:
- Database name, user, and password
- SSL certificate configuration
- Connection pooling and security settings

### 2. Database Connection Variables

Railway automatically provides these environment variables:
```bash
DATABASE_URL=postgresql://username:password@hostname:port/database
PGHOST=hostname
PGPORT=port
PGDATABASE=database_name
PGUSER=username
PGPASSWORD=password
```

### 3. Database Migrations

Initial migration will run automatically during deployment via the CI/CD pipeline:
```bash
# Migrations run automatically in deploy workflow
railway run npm run migrate
```

## Environment Variables

### 1. Production Environment Variables

Configure these in Railway Dashboard → **Variables**:

**Application Configuration:**
```bash
NODE_ENV=production
LOG_LEVEL=info
MCP_TRANSPORT=sse
```

**Security Configuration:**
```bash
HTTPS_ONLY=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=900000
SECURITY_HEADERS_ENABLED=true
CSP_ENABLED=true
```

**CORS Configuration:**
```bash
CORS_ENABLED=true
CORS_ORIGINS=https://drupalize.me,https://claude.ai
```

**Drupal Integration:**
```bash
DRUPAL_BASE_URL=https://drupalize.me
DRUPAL_JSONRPC_ENDPOINT=/jsonrpc
```

**OAuth Configuration:**
```bash
OAUTH_CLIENT_ID=your_oauth_client_id
OAUTH_CLIENT_SECRET=your_oauth_client_secret
OAUTH_AUTHORIZATION_URL=https://drupalize.me/oauth/authorize
OAUTH_TOKEN_URL=https://drupalize.me/oauth/token
OAUTH_SCOPES=content:read user:read
OAUTH_TOKEN_REFRESH_BUFFER=300
```

**Database Security:**
```bash
DATABASE_SSL=true
DATABASE_SSL_MODE=require
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20
DATABASE_CONNECTION_TIMEOUT=10000
DATABASE_IDLE_TIMEOUT=30000
```

**Health Check Configuration:**
```bash
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PATH=/health
```

### 2. Staging Environment Variables

For staging environment, modify the following values:
```bash
NODE_ENV=staging
LOG_LEVEL=debug
CORS_ORIGINS=https://staging.drupalize.me,https://claude.ai
DRUPAL_BASE_URL=https://staging.drupalize.me
RATE_LIMIT_MAX=500
```

## GitHub Integration

### 1. Connect GitHub Repository

1. **Railway Dashboard** → **Settings** → **Source**
2. **Connect GitHub Repository**
3. Select repository: `your-username/drupalizeme-mcp-server`
4. Configure auto-deployment:
   - **Branch**: `main`
   - **Auto-Deploy**: Enabled

### 2. GitHub Actions Secrets

Add these secrets to your GitHub repository:

1. **Repository Settings** → **Secrets and variables** → **Actions**
2. **Add New Repository Secret**:

```bash
RAILWAY_TOKEN=your_railway_token  # Get from Railway Dashboard → Settings → Tokens
CODECOV_TOKEN=your_codecov_token  # Optional: for code coverage
SNYK_TOKEN=your_snyk_token        # Optional: for security scanning
```

**Get Railway Token:**
```bash
# In Railway Dashboard
1. Go to Account Settings → Tokens
2. Create New Token → Project Token
3. Select your project
4. Copy the token
```

## Initial Deployment

### 1. Deploy from Railway CLI

```bash
# Make sure you're in the project directory
cd drupalizeme-mcp-server

# Deploy to Railway
railway up

# Monitor deployment
railway logs
```

### 2. Deploy from GitHub Actions

Push to main branch triggers automatic deployment:
```bash
git add .
git commit -m "Initial deployment"
git push origin main
```

### 3. Manual Deployment

From Railway Dashboard:
1. Go to **Deployments**
2. Click **Deploy Now**
3. Monitor build and deployment logs

## Health Check Verification

### 1. Basic Health Check

```bash
# Replace with your Railway app URL
curl -f https://your-app.railway.app/health
```

Expected response (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2025-09-04T10:30:00.000Z",
  "services": {
    "database": {
      "status": "up",
      "pool": { "total": 5, "idle": 3, "active": 2 }
    },
    "oauth": {
      "status": "up",
      "configured": true
    },
    "mcp_server": "up"
  },
  "performance": {
    "responseTime": "25ms",
    "totalRequests": 150,
    "errorRate": "0%"
  },
  "system": {
    "uptime": "3600s",
    "memoryUsage": {
      "rss": "45MB",
      "heapUsed": "32MB"
    }
  }
}
```

### 2. Readiness Probe

```bash
curl -f https://your-app.railway.app/ready
```

Expected response (200 OK):
```json
{
  "status": "ready",
  "timestamp": "2025-09-04T10:30:00.000Z"
}
```

### 3. MCP Endpoint Check

```bash
# Check MCP SSE endpoint
curl -I -H "Accept: text/event-stream" https://your-app.railway.app/mcp/sse
```

Expected response: `200 OK` or `405 Method Not Allowed` (both indicate the endpoint exists)

## Domain Configuration

### 1. Custom Domain Setup

1. **Railway Dashboard** → **Settings** → **Domains**
2. **Add Custom Domain**
3. Enter your domain: `mcp-server.yourdomain.com`
4. Configure DNS records as instructed by Railway
5. Wait for SSL certificate provisioning (automatic)

### 2. Update Environment Variables

Update CORS origins to include your custom domain:
```bash
CORS_ORIGINS=https://drupalize.me,https://claude.ai,https://mcp-server.yourdomain.com
```

## CI/CD Pipeline Setup

### 1. GitHub Actions Workflows

The repository includes pre-configured workflows:
- **`.github/workflows/ci.yml`**: Testing, linting, security scanning
- **`.github/workflows/deploy.yml`**: Production deployment
- **`.github/workflows/deploy-staging.yml`**: Staging deployment

### 2. Deployment Flow

```mermaid
graph LR
    A[Push to main] --> B[CI Pipeline]
    B --> C[Tests Pass]
    C --> D[Deploy to Railway]
    D --> E[Health Checks]
    E --> F[Deployment Complete]
    
    C --> G[Tests Fail]
    G --> H[Deployment Blocked]
    
    E --> I[Health Checks Fail]
    I --> J[Auto Rollback]
```

### 3. Manual Deployment Trigger

Trigger manual deployment via GitHub Actions:
```bash
# Go to repository → Actions → Deploy to Railway → Run workflow
# Select branch: main
# Click "Run workflow"
```

## Staging Environment

### 1. Create Staging Environment

```bash
# Create staging project in Railway
railway new staging-mcp-server

# Or create environment in existing project
# Railway Dashboard → Environments → New Environment → "staging"
```

### 2. Staging Configuration

Copy production environment variables with staging-specific modifications:
```bash
NODE_ENV=staging
DRUPAL_BASE_URL=https://staging.drupalize.me
CORS_ORIGINS=https://staging.drupalize.me,https://claude.ai
RATE_LIMIT_MAX=500
LOG_LEVEL=debug
```

### 3. Staging Deployment

```bash
# Deploy to staging
railway environment staging
railway up

# Or trigger via GitHub Actions
# Push to 'staging' branch or use workflow dispatch
```

## Production Deployment

### 1. Pre-Deployment Checklist

- [ ] All tests passing in CI
- [ ] Security scans completed
- [ ] Environment variables configured
- [ ] Database migrations ready
- [ ] Health checks responding
- [ ] Staging deployment verified

### 2. Production Deployment Process

1. **Merge to Main Branch**
   ```bash
   git checkout main
   git pull origin main
   git merge feature-branch
   git push origin main
   ```

2. **Monitor CI Pipeline**
   - GitHub Actions → CI workflow
   - Wait for all checks to pass

3. **Automatic Deployment**
   - Deploy workflow triggers automatically
   - Monitor deployment in Railway logs

4. **Verify Deployment**
   - Health check verification
   - Endpoint testing
   - Performance monitoring

### 3. Deployment Verification

```bash
# Comprehensive health check
curl -f https://mcp-server.railway.app/health | jq '.'

# Test MCP endpoints
curl -I -H "Accept: text/event-stream" https://mcp-server.railway.app/mcp/sse

# Check OAuth callback (should return 405)
curl -I https://mcp-server.railway.app/oauth/callback
```

## Post-Deployment Verification

### 1. Functional Testing

**Database Connectivity:**
```bash
# Check database health in health endpoint
curl https://your-app.railway.app/health | jq '.services.database'
```

**OAuth Configuration:**
```bash
# Verify OAuth service status
curl https://your-app.railway.app/health | jq '.services.oauth'
```

**MCP Protocol:**
```bash
# Test MCP Server-Sent Events endpoint
curl -H "Accept: text/event-stream" https://your-app.railway.app/mcp/sse
```

### 2. Performance Verification

```bash
# Check performance metrics
curl https://your-app.railway.app/metrics | jq '.metrics.performance'

# Monitor response times
curl -w "@curl-format.txt" -o /dev/null -s https://your-app.railway.app/health
```

**curl-format.txt:**
```
     time_namelookup:  %{time_namelookup}\n
        time_connect:  %{time_connect}\n
     time_appconnect:  %{time_appconnect}\n
    time_pretransfer:  %{time_pretransfer}\n
       time_redirect:  %{time_redirect}\n
  time_starttransfer:  %{time_starttransfer}\n
                     ----------\n
          time_total:  %{time_total}\n
```

### 3. Security Verification

```bash
# Check security headers
curl -I https://your-app.railway.app/

# Verify SSL certificate
openssl s_client -connect your-app.railway.app:443 -servername your-app.railway.app
```

### 4. Monitoring Setup

1. **Railway Monitoring**
   - Dashboard → Metrics
   - Set up alerts for downtime
   - Monitor resource usage

2. **Health Check Monitoring**
   - Set up external monitoring (UptimeRobot, Pingdom)
   - Monitor `/health` endpoint
   - Alert on 503 responses

3. **Log Monitoring**
   - Railway → Logs
   - Set up log aggregation if needed
   - Monitor error patterns

## Troubleshooting Common Issues

### Deployment Failures

**Build Failures:**
```bash
# Check build logs
railway logs --deployment

# Common issues:
# - Missing environment variables
# - TypeScript compilation errors
# - Dependency installation failures
```

**Health Check Failures:**
```bash
# Check application logs
railway logs

# Common issues:
# - Database connection failures
# - Missing environment variables
# - OAuth configuration errors
```

### Rollback Procedures

**Automatic Rollback:**
- Deployment pipeline includes automatic rollback on health check failure
- Railway keeps previous deployment available

**Manual Rollback:**
```bash
# Using Railway CLI
railway rollback

# Using Railway Dashboard
# Deployments → Previous Deployment → Rollback
```

### Database Issues

**Connection Problems:**
```bash
# Check database service status in Railway Dashboard
# Verify DATABASE_URL environment variable
# Check SSL configuration

# Test database connection
railway run node -e "console.log(process.env.DATABASE_URL)"
```

**Migration Issues:**
```bash
# Run migrations manually
railway run npm run migrate

# Check migration status
railway run npm run migrate:status
```

## Maintenance and Updates

### Regular Maintenance Tasks

1. **Security Updates**
   - Monitor security scan results in CI
   - Update dependencies regularly
   - Review and rotate OAuth credentials

2. **Performance Monitoring**
   - Monitor response times and error rates
   - Review resource usage trends
   - Optimize database queries if needed

3. **Backup Verification**
   - Railway handles PostgreSQL backups automatically
   - Verify backup restoration procedures
   - Document disaster recovery plans

### Update Procedures

1. **Code Updates**
   ```bash
   # Development → Staging → Production flow
   git checkout develop
   # Make changes
   git push origin develop
   # Test in staging
   git checkout main
   git merge develop
   git push origin main
   ```

2. **Dependency Updates**
   ```bash
   npm audit fix
   npm update
   # Test thoroughly before deploying
   ```

3. **Environment Variable Updates**
   - Use Railway Dashboard for environment variable changes
   - Update staging first, then production
   - Restart applications after environment changes

## Support and Resources

### Documentation
- [Railway Documentation](https://docs.railway.app/)
- [GitHub Actions Documentation](https://docs.github.com/actions)
- [Project Architecture Documentation](/architecture/)

### Monitoring and Alerting
- Railway Dashboard: https://railway.app/dashboard
- GitHub Actions: https://github.com/your-username/drupalizeme-mcp-server/actions
- Health Check: https://your-app.railway.app/health

### Emergency Contacts
- Railway Support: [railway.app/help](https://railway.app/help)
- GitHub Support: [support.github.com](https://support.github.com)
- Project Maintainers: [See CONTRIBUTING.md](/CONTRIBUTING.md)

### Escalation Procedures
1. Check health endpoints and logs
2. Review recent deployments and changes
3. Check Railway status page
4. Contact project maintainers
5. Escalate to Railway support if platform issue