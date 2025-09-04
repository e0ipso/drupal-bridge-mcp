# MCP Server Troubleshooting Guide

## Overview

This guide provides comprehensive troubleshooting procedures for common issues with the Drupalize.me MCP Server, including diagnostic steps, resolution procedures, and prevention strategies.

## Table of Contents

1. [Quick Diagnostic Commands](#quick-diagnostic-commands)
2. [Application Startup Issues](#application-startup-issues)
3. [Database Connection Problems](#database-connection-problems)
4. [OAuth Authentication Issues](#oauth-authentication-issues)
5. [Performance Problems](#performance-problems)
6. [MCP Protocol Issues](#mcp-protocol-issues)
7. [Deployment Failures](#deployment-failures)
8. [Health Check Failures](#health-check-failures)
9. [Memory and Resource Issues](#memory-and-resource-issues)
10. [Network and Connectivity Problems](#network-and-connectivity-problems)
11. [Security and SSL Issues](#security-and-ssl-issues)
12. [Environment Configuration Problems](#environment-configuration-problems)

## Quick Diagnostic Commands

### Essential Health Checks

```bash
# Set your Railway app URL
export APP_URL="https://mcp-server.railway.app"

# Quick health check
curl -f "$APP_URL/health" | jq '.status'

# Detailed health status
curl -s "$APP_URL/health" | jq '.'

# Check individual services
curl -s "$APP_URL/health" | jq '.services'

# Performance metrics
curl -s "$APP_URL/health" | jq '.performance'

# System resources
curl -s "$APP_URL/health" | jq '.system'
```

### Railway Diagnostics

```bash
# View recent logs
railway logs --since 10m

# View error logs only
railway logs --level error --since 30m

# Check deployment status
railway status

# View environment variables (masked)
railway variables
```

### Network Diagnostics

```bash
# Test basic connectivity
curl -I "$APP_URL/"

# Test DNS resolution
nslookup your-app.railway.app

# Test SSL certificate
openssl s_client -connect your-app.railway.app:443 -servername your-app.railway.app
```

## Application Startup Issues

### Symptom: Application fails to start or exits immediately

**Diagnostic Steps:**
```bash
# Check startup logs
railway logs --since 5m

# Check for configuration errors
railway run node -e "require('./dist/config/index.js')"

# Verify environment variables
railway variables | grep -E "(NODE_ENV|DATABASE_URL|OAUTH_CLIENT_ID)"
```

**Common Causes and Solutions:**

#### Missing Environment Variables
```bash
# Error: "Missing required environment variables: OAUTH_CLIENT_ID"
# Solution: Add missing environment variables in Railway dashboard

railway variables set OAUTH_CLIENT_ID="your_client_id"
railway variables set OAUTH_CLIENT_SECRET="your_client_secret"
```

#### Invalid Database URL
```bash
# Error: "Invalid DATABASE_URL format"
# Check DATABASE_URL format
railway run echo $DATABASE_URL

# Should be: postgresql://username:password@host:port/database
# Solution: Verify Railway PostgreSQL addon is properly configured
```

#### Port Binding Issues
```bash
# Error: "EADDRINUSE: address already in use"
# Solution: Railway automatically sets PORT environment variable
# Ensure application uses process.env.PORT

# Check port configuration
railway variables | grep PORT
```

#### TypeScript Compilation Errors
```bash
# Error: Module resolution or syntax errors
# Check build logs
railway logs --deployment

# Solution: Fix TypeScript errors and redeploy
npm run build
git add . && git commit -m "Fix build errors" && git push
```

## Database Connection Problems

### Symptom: Database health checks failing or connection timeouts

**Diagnostic Steps:**
```bash
# Check database service health
curl -s "$APP_URL/health" | jq '.services.database'

# Test direct database connection
railway run node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT NOW()').then(res => {
  console.log('Database connected:', res.rows[0]);
  process.exit(0);
}).catch(err => {
  console.error('Database error:', err.message);
  process.exit(1);
});
"

# Check connection pool status
curl -s "$APP_URL/health" | jq '.services.database.pool'
```

**Common Issues and Solutions:**

#### SSL Certificate Issues
```bash
# Error: "self signed certificate in certificate chain"
# Solution: Verify SSL configuration

# Check SSL settings
railway variables | grep -E "(DATABASE_SSL|SSL_MODE)"

# For production, ensure:
DATABASE_SSL=true
DATABASE_SSL_MODE=require
```

#### Connection Pool Exhaustion
```bash
# Symptom: "remaining connection slots are reserved"
# Check pool status
curl -s "$APP_URL/health" | jq '.services.database.pool'

# Solution: Adjust pool settings
railway variables set DATABASE_POOL_MAX=20
railway variables set DATABASE_POOL_MIN=2
```

#### Network Connectivity Issues
```bash
# Test PostgreSQL service connectivity
railway run pg_isready -d $DATABASE_URL

# Check Railway PostgreSQL service status in dashboard
# Navigate to Railway Dashboard → Services → PostgreSQL
```

#### Connection Timeout Issues
```bash
# Error: "connection timeout"
# Increase connection timeout
railway variables set DATABASE_CONNECTION_TIMEOUT=15000

# Check network latency
railway run time pg_isready -d $DATABASE_URL
```

## OAuth Authentication Issues

### Symptom: OAuth health checks failing or authentication errors

**Diagnostic Steps:**
```bash
# Check OAuth service health
curl -s "$APP_URL/health" | jq '.services.oauth'

# Test OAuth configuration
railway run node -e "
const config = require('./dist/config/index.js').config;
console.log('OAuth Config:');
console.log('Client ID:', config.oauth.clientId ? 'Set' : 'Missing');
console.log('Client Secret:', config.oauth.clientSecret ? 'Set' : 'Missing');
console.log('Auth URL:', config.oauth.authUrl);
console.log('Token URL:', config.oauth.tokenUrl);
"

# Check OAuth endpoints availability
curl -I https://drupalize.me/oauth/authorize
curl -I https://drupalize.me/oauth/token
```

**Common Issues and Solutions:**

#### Missing OAuth Configuration
```bash
# Error: "OAuth client not configured"
# Solution: Add required OAuth environment variables

railway variables set OAUTH_CLIENT_ID="your_client_id"
railway variables set OAUTH_CLIENT_SECRET="your_client_secret"
railway variables set OAUTH_AUTHORIZATION_URL="https://drupalize.me/oauth/authorize"
railway variables set OAUTH_TOKEN_URL="https://drupalize.me/oauth/token"
railway variables set OAUTH_SCOPES="content:read user:read"
```

#### Invalid OAuth Credentials
```bash
# Error: "invalid_client" or "unauthorized_client"
# Solution: Verify OAuth client credentials with Drupal admin

# Test OAuth endpoint manually
curl -X POST https://drupalize.me/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=YOUR_ID&client_secret=YOUR_SECRET"
```

#### Redirect URI Mismatch
```bash
# Error: "redirect_uri_mismatch"
# Solution: Update redirect URI in Railway environment

# Get current app URL
railway domain

# Set correct redirect URI
railway variables set OAUTH_REDIRECT_URI="https://your-app.railway.app/oauth/callback"
```

#### Token Refresh Issues
```bash
# Symptom: High consecutive failures in OAuth metrics
# Check refresh token configuration
railway variables | grep OAUTH_TOKEN_REFRESH_BUFFER

# Increase refresh buffer (default: 300 seconds)
railway variables set OAUTH_TOKEN_REFRESH_BUFFER=600
```

## Performance Problems

### Symptom: Slow response times or high resource usage

**Diagnostic Steps:**
```bash
# Check current performance metrics
curl -s "$APP_URL/health" | jq '.performance'

# Get detailed performance analytics
curl -s "$APP_URL/metrics" | jq '.metrics.performance'

# Check system resource usage
curl -s "$APP_URL/health" | jq '.system'

# Monitor response times over time
for i in {1..10}; do
  curl -w "Response time: %{time_total}s\n" -o /dev/null -s "$APP_URL/health"
  sleep 2
done
```

**Performance Optimization Solutions:**

#### High Response Times
```bash
# If health endpoint >100ms consistently:

# 1. Check database query performance
curl -s "$APP_URL/health" | jq '.services.database.metrics.averageResponseTime'

# 2. Review memory usage
curl -s "$APP_URL/health" | jq '.system.memoryUsage'

# 3. Check for memory leaks
railway logs | grep -E "(out of memory|heap out of memory)"

# 4. Scale resources if needed (Railway dashboard → Settings → Resources)
```

#### Database Performance Issues
```bash
# Check database metrics
curl -s "$APP_URL/health" | jq '.services.database.metrics'

# Solutions:
# - Optimize database connection pool
railway variables set DATABASE_POOL_MIN=5
railway variables set DATABASE_POOL_MAX=25

# - Reduce connection timeout
railway variables set DATABASE_IDLE_TIMEOUT=20000
```

#### High Memory Usage
```bash
# Check memory usage trends
curl -s "$APP_URL/health" | jq '.system.memoryUsage'

# If memory usage >80% consistently:
# 1. Check for memory leaks in logs
railway logs | grep -E "(heap|memory)"

# 2. Restart application
railway restart

# 3. Consider upgrading Railway plan for more memory
```

## MCP Protocol Issues

### Symptom: MCP endpoints not responding or connection failures

**Diagnostic Steps:**
```bash
# Test MCP SSE endpoint
curl -I -H "Accept: text/event-stream" "$APP_URL/mcp/sse"

# Test OAuth callback endpoint
curl -I "$APP_URL/oauth/callback"

# Check CORS configuration
curl -I -H "Origin: https://claude.ai" "$APP_URL/mcp/sse"

# Test with verbose output
curl -v -H "Accept: text/event-stream" "$APP_URL/mcp/sse"
```

**Common Issues and Solutions:**

#### CORS Configuration Issues
```bash
# Error: "CORS policy blocked"
# Check CORS configuration
railway variables | grep CORS

# Solution: Update CORS origins
railway variables set CORS_ENABLED=true
railway variables set CORS_ORIGINS="https://drupalize.me,https://claude.ai"
```

#### SSL/HTTPS Issues
```bash
# Error: "Mixed content" or SSL certificate errors
# Ensure HTTPS is enforced
railway variables set HTTPS_ONLY=true

# Check SSL certificate validity
openssl s_client -connect your-app.railway.app:443 -servername your-app.railway.app
```

#### Rate Limiting Issues
```bash
# Error: "Too many requests" (429)
# Check rate limiting configuration
railway variables | grep RATE_LIMIT

# Adjust rate limits if needed
railway variables set RATE_LIMIT_MAX=2000
railway variables set RATE_LIMIT_WINDOW=900000  # 15 minutes
```

## Deployment Failures

### Symptom: GitHub Actions deployment failing or Railway deployment issues

**Diagnostic Steps:**
```bash
# Check GitHub Actions status
# Go to: https://github.com/your-username/your-repo/actions

# Check Railway deployment logs
railway logs --deployment

# Check Railway CLI connectivity
railway whoami
railway projects
```

**Common Deployment Issues:**

#### Build Failures
```bash
# Error: TypeScript compilation failed
# Check build logs in GitHub Actions or Railway

# Solution: Fix TypeScript errors locally
npm run build
npm run type-check

# Test build in clean environment
docker build -t test-build .
```

#### Environment Variable Issues
```bash
# Error: Missing environment variables during deployment
# Verify all required variables are set
railway variables

# Add missing variables
railway variables set VARIABLE_NAME="value"
```

#### Docker Build Issues
```bash
# Error: Docker build failed
# Test Docker build locally
docker build -t mcp-server-test .

# Check Dockerfile syntax and dependencies
# Review Docker build logs in Railway dashboard
```

#### Health Check Failures During Deployment
```bash
# Error: Deployment rolled back due to health check failure
# Check health endpoint after manual deployment
curl -f "$APP_URL/health"

# Review deployment logs for startup errors
railway logs --deployment
```

#### Railway Token Issues (GitHub Actions)
```bash
# Error: "Unauthorized" in GitHub Actions
# Solution: Update Railway token in GitHub secrets

# Generate new token:
# Railway Dashboard → Account → Tokens → Create New Token
# GitHub Repository → Settings → Secrets → Update RAILWAY_TOKEN
```

## Health Check Failures

### Symptom: Health endpoints returning 5xx errors or timing out

**Diagnostic Steps:**
```bash
# Test each health endpoint individually
curl -v "$APP_URL/health"
curl -v "$APP_URL/ready" 
curl -v "$APP_URL/live"

# Check application logs for errors
railway logs --level error

# Test basic application responsiveness
curl -I "$APP_URL/"
```

**Resolution Steps:**

#### Application Not Starting
```bash
# Check if application process is running
railway ps

# If not running, check startup logs
railway logs --since 5m

# Restart if needed
railway restart
```

#### Partial Service Failures
```bash
# Check which services are failing
curl -s "$APP_URL/health" | jq '.services'

# Database failing:
curl -s "$APP_URL/health" | jq '.services.database'

# OAuth failing:
curl -s "$APP_URL/health" | jq '.services.oauth'
```

#### Timeout Issues
```bash
# If health checks timeout:
# 1. Check system resources
curl -s "$APP_URL/health" | jq '.system'

# 2. Check for blocking operations
railway logs | grep -E "(blocking|timeout|deadlock)"

# 3. Increase request timeout
railway variables set REQUEST_TIMEOUT=45000
```

## Memory and Resource Issues

### Symptom: High memory usage, out of memory errors, or resource exhaustion

**Diagnostic Steps:**
```bash
# Check current memory usage
curl -s "$APP_URL/health" | jq '.system.memoryUsage'

# Check Railway resource metrics
# Railway Dashboard → Project → Metrics

# Monitor memory usage over time
for i in {1..10}; do
  MEMORY=$(curl -s "$APP_URL/health" | jq '.system.memoryUsage.rss')
  echo "Memory RSS: $MEMORY bytes ($(($MEMORY/1024/1024))MB)"
  sleep 5
done
```

**Resolution Strategies:**

#### Memory Leaks
```bash
# Check for heap growth patterns
railway logs | grep -E "(heap|memory|gc)"

# Restart application to clear memory
railway restart

# Monitor memory after restart
curl -s "$APP_URL/health" | jq '.system.memoryUsage'
```

#### Resource Limits
```bash
# Check Railway plan limits
# Railway Dashboard → Settings → Plan

# If approaching limits:
# 1. Optimize application memory usage
# 2. Consider upgrading Railway plan
# 3. Implement application-level memory management
```

#### Connection Pool Issues
```bash
# Check database connection pool
curl -s "$APP_URL/health" | jq '.services.database.pool'

# Optimize pool settings
railway variables set DATABASE_POOL_MAX=15
railway variables set DATABASE_POOL_MIN=3
railway variables set DATABASE_IDLE_TIMEOUT=20000
```

## Network and Connectivity Problems

### Symptom: Intermittent connectivity issues or network timeouts

**Diagnostic Steps:**
```bash
# Test external connectivity from Railway
railway run curl -I https://drupalize.me
railway run curl -I https://claude.ai

# Check DNS resolution
railway run nslookup drupalize.me

# Test internal network connectivity
railway run ping -c 3 google.com
```

**Common Network Issues:**

#### Firewall or Network Policies
```bash
# Test specific endpoints
railway run curl -v https://drupalize.me/oauth/token
railway run curl -v https://drupalize.me/jsonrpc

# If blocked, check Railway network policies
# Contact Railway support if persistent
```

#### DNS Resolution Issues
```bash
# Test DNS resolution
railway run nslookup drupalize.me

# If DNS issues, wait for propagation or contact support
```

#### SSL/TLS Handshake Issues
```bash
# Test SSL connectivity
railway run openssl s_client -connect drupalize.me:443

# Check cipher compatibility
railway run curl -v --tlsv1.2 https://drupalize.me
```

## Security and SSL Issues

### Symptom: SSL certificate errors, security header issues, or authentication problems

**Diagnostic Steps:**
```bash
# Check SSL certificate
openssl s_client -connect your-app.railway.app:443 -servername your-app.railway.app

# Test security headers
curl -I "$APP_URL/" | grep -E "(Strict-Transport-Security|Content-Security-Policy|X-Frame-Options)"

# Check HTTPS enforcement
curl -I "http://your-app.railway.app/" | grep -i location
```

**Security Configuration Issues:**

#### SSL Certificate Problems
```bash
# If SSL certificate invalid:
# 1. Check Railway custom domain configuration
# 2. Wait for certificate provisioning (can take 10-15 minutes)
# 3. Verify DNS configuration

# Test certificate chain
curl -v "$APP_URL/health" 2>&1 | grep -E "(certificate|SSL|TLS)"
```

#### Security Headers Missing
```bash
# Enable security headers
railway variables set SECURITY_HEADERS_ENABLED=true
railway variables set CSP_ENABLED=true

# Verify headers after restart
curl -I "$APP_URL/" | grep -E "(X-Frame-Options|Content-Security-Policy)"
```

#### HTTPS Enforcement Issues
```bash
# Ensure HTTPS enforcement
railway variables set HTTPS_ONLY=true

# Test HTTP to HTTPS redirect
curl -I "http://your-app.railway.app/" | grep -i location
```

## Environment Configuration Problems

### Symptom: Configuration validation errors or environment-specific issues

**Diagnostic Steps:**
```bash
# Check environment variable configuration
railway variables

# Test configuration loading
railway run node -e "
const config = require('./dist/config/index.js').config;
console.log('Environment:', config.environment);
console.log('Database SSL:', config.database.ssl);
console.log('OAuth configured:', !!config.oauth.clientId);
"

# Validate environment-specific settings
railway run npm run --silent config:validate
```

**Configuration Issues:**

#### Environment Variable Type Errors
```bash
# Error: "Expected boolean, got string"
# Ensure boolean values are proper strings
railway variables set DATABASE_SSL=true  # not "true"
railway variables set HTTPS_ONLY=true
```

#### Missing Required Variables
```bash
# Error: "Missing required environment variables"
# Check and add missing variables
railway variables set OAUTH_CLIENT_ID="your_value"
railway variables set OAUTH_CLIENT_SECRET="your_value"
railway variables set SESSION_SECRET="generate_secure_secret"
```

#### Environment-Specific Configuration
```bash
# Production vs Staging differences
# Verify environment-specific variables are correct

# Production should have:
NODE_ENV=production
LOG_LEVEL=info
DATABASE_SSL=true
HTTPS_ONLY=true

# Staging should have:
NODE_ENV=staging
LOG_LEVEL=debug
```

## Recovery Procedures

### Complete Service Recovery

```bash
#!/bin/bash
# complete-recovery.sh - Use when multiple systems are failing

echo "Starting complete service recovery..."

# 1. Check Railway service status
railway status

# 2. Restart all services
railway restart

# 3. Wait for restart
sleep 30

# 4. Verify health
curl -f "$APP_URL/health" || echo "Health check failed"

# 5. Check database connectivity
railway run pg_isready -d $DATABASE_URL

# 6. Run database migrations if needed
railway run npm run migrate

# 7. Final health verification
curl -s "$APP_URL/health" | jq '.status'

echo "Recovery complete. Monitor for stability."
```

### Emergency Rollback

```bash
#!/bin/bash
# emergency-rollback.sh - Use when current deployment is completely broken

echo "Initiating emergency rollback..."

# 1. Rollback via Railway CLI
railway rollback

# 2. Wait for rollback
sleep 60

# 3. Verify rollback success
curl -f "$APP_URL/health" && echo "Rollback successful" || echo "Rollback failed"

# 4. Monitor logs for stability
railway logs --follow
```

## Prevention Strategies

### Monitoring and Alerting
- Set up external health check monitoring (UptimeRobot, Pingdom)
- Configure Railway alerts for resource usage
- Implement log aggregation for pattern detection
- Regular health check automation

### Testing and Validation
- Comprehensive integration testing before deployment
- Database migration testing in staging
- Load testing for performance validation
- Security scanning in CI/CD pipeline

### Documentation and Runbooks
- Keep troubleshooting procedures updated
- Document all configuration changes
- Maintain incident response procedures
- Regular team training on troubleshooting

### Infrastructure Hardening
- Implement proper error handling and logging
- Configure appropriate resource limits
- Use connection pooling and circuit breakers
- Implement graceful degradation patterns

## Getting Help

### Internal Resources
- **Health Check Endpoints**: Real-time system status
- **Railway Dashboard**: Platform metrics and logs
- **GitHub Actions**: CI/CD pipeline status and logs
- **Project Documentation**: Architecture and configuration guides

### External Support
- **Railway Support**: https://railway.app/help (platform issues)
- **GitHub Support**: https://support.github.com (CI/CD issues)
- **PostgreSQL Community**: Database-specific issues
- **Node.js Community**: Application runtime issues

### Escalation Path
1. **Self-Service**: Use this troubleshooting guide
2. **Team Support**: Contact project maintainers
3. **Platform Support**: Railway or GitHub support
4. **Emergency Escalation**: Critical issues affecting users

Remember: Always document your troubleshooting steps and solutions to improve this guide for future incidents.