# Environment Variable Configuration Guide

This document provides comprehensive guidance for configuring environment variables across all deployment environments for the Drupalize.me MCP Server.

## Table of Contents

- [Overview](#overview)
- [Environment Categories](#environment-categories)
- [Variable Reference](#variable-reference)
- [Security Considerations](#security-considerations)
- [Deployment-Specific Configuration](#deployment-specific-configuration)
- [Validation and Testing](#validation-and-testing)

## Overview

The MCP server uses environment variables for configuration to enable:
- **Security:** Keep secrets out of source code
- **Flexibility:** Different configurations per environment
- **Scalability:** Easy configuration management in cloud platforms
- **Compliance:** Proper secret management practices

### Configuration Hierarchy

1. **Railway Environment Variables** (highest priority)
2. **System Environment Variables**
3. **`.env` file** (development only)
4. **Default values** (lowest priority)

## Environment Categories

### Development
- Local development environment
- Mock authentication available
- Relaxed security constraints
- Debug logging enabled

### Staging
- Production-like environment
- Real authentication required
- Production security settings
- Debug logging enabled

### Production
- Live production environment
- Strict security enforcement
- All secrets required
- Info-level logging

### Testing
- CI/CD test environment
- Mock services and databases
- Minimal configuration
- Test-specific overrides

## Variable Reference

### Application Configuration

#### `NODE_ENV`
- **Purpose:** Application environment identifier
- **Required:** Yes
- **Default:** `development`
- **Values:** `development`, `staging`, `production`, `test`

```bash
# Development
NODE_ENV=development

# Production
NODE_ENV=production
```

#### `PORT`
- **Purpose:** HTTP server port
- **Required:** No
- **Default:** `3000`
- **Railway:** Automatically set by platform

```bash
PORT=3000
```

#### `LOG_LEVEL`
- **Purpose:** Logging verbosity level
- **Required:** No
- **Default:** `info` (production), `debug` (development)
- **Values:** `error`, `warn`, `info`, `debug`

```bash
# Production
LOG_LEVEL=info

# Development/Staging
LOG_LEVEL=debug
```

### MCP Protocol Configuration

#### `MCP_TRANSPORT`
- **Purpose:** MCP communication protocol
- **Required:** No
- **Default:** `sse`
- **Values:** `stdio`, `sse`

```bash
MCP_TRANSPORT=sse
```

#### `REQUEST_TIMEOUT`
- **Purpose:** Request timeout in milliseconds
- **Required:** No
- **Default:** `30000` (30 seconds)

```bash
REQUEST_TIMEOUT=30000
```

### Database Configuration

#### `DATABASE_URL`
- **Purpose:** PostgreSQL connection string
- **Required:** Yes (production/staging)
- **Format:** `postgresql://user:password@host:port/database`
- **Railway:** Automatically provided by PostgreSQL addon

```bash
# Railway managed (production)
DATABASE_URL=${RAILWAY_DATABASE_URL}

# Development
DATABASE_URL=postgresql://user:password@localhost:5432/mcp_server_dev
```

#### Individual Database Variables (Alternative)
```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=mcp_server
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
```

#### Database Pool Configuration
```bash
DATABASE_POOL_MIN=2          # Minimum connections
DATABASE_POOL_MAX=20         # Maximum connections
DATABASE_CONNECTION_TIMEOUT=10000  # Connection timeout (ms)
DATABASE_IDLE_TIMEOUT=30000  # Idle timeout (ms)
```

#### Database SSL Configuration
```bash
DATABASE_SSL=true                    # Enable SSL
DATABASE_SSL_MODE=require            # SSL mode (require, prefer, disable)
```

**Important:** SSL is automatically enforced in production environments.

### Drupal Integration

#### `DRUPAL_BASE_URL`
- **Purpose:** Drupal site base URL
- **Required:** Yes
- **Format:** Full URL without trailing slash

```bash
# Production
DRUPAL_BASE_URL=https://drupalize.me

# Staging
DRUPAL_BASE_URL=https://staging.drupalize.me
```

#### `DRUPAL_JSONRPC_ENDPOINT`
- **Purpose:** JSON-RPC API endpoint path
- **Required:** No
- **Default:** `/jsonrpc`

```bash
DRUPAL_JSONRPC_ENDPOINT=/jsonrpc
```

### OAuth 2.0 Authentication

#### Critical OAuth Variables
```bash
# OAuth Client Credentials (CRITICAL - Railway secrets only)
OAUTH_CLIENT_ID=your_oauth_client_id
OAUTH_CLIENT_SECRET=your_oauth_client_secret

# OAuth Endpoints
OAUTH_AUTHORIZATION_URL=https://drupalize.me/oauth/authorize
OAUTH_TOKEN_URL=https://drupalize.me/oauth/token

# OAuth Configuration
OAUTH_SCOPES="content:read user:read"
OAUTH_REDIRECT_URI=https://your-app.railway.app/oauth/callback
OAUTH_TOKEN_REFRESH_BUFFER=300       # Seconds before token expiry to refresh
```

**Security Notes:**
- `OAUTH_CLIENT_SECRET` must be set as Railway environment variable
- Never commit OAuth secrets to source code
- Redirect URI must use HTTPS in production

### Security Configuration

#### HTTPS Enforcement
```bash
HTTPS_ONLY=true                      # Force HTTPS redirects
```
**Note:** Automatically enabled in production environment.

#### CORS Configuration
```bash
CORS_ENABLED=true
CORS_ORIGINS=https://drupalize.me,https://claude.ai
```

#### Security Headers
```bash
SECURITY_HEADERS_ENABLED=true
CSP_ENABLED=true                     # Content Security Policy
XSS_PROTECTION_ENABLED=true         # X-XSS-Protection header
NO_SNIFF_ENABLED=true               # X-Content-Type-Options
REFERRER_POLICY=strict-origin-when-cross-origin
```

#### Rate Limiting
```bash
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=1000                 # Requests per window
RATE_LIMIT_WINDOW=900000            # Window in milliseconds (15 min)
```

#### Session Security
```bash
# Session secret (CRITICAL - Railway secrets only)
SESSION_SECRET=your_session_secret_min_32_chars
```
**Requirements:** Minimum 32 characters, cryptographically random.

### Health Check Configuration

```bash
HEALTH_CHECK_ENABLED=true
HEALTH_CHECK_PATH=/health
```

## Security Considerations

### Secret Management

#### Railway Environment Variables
- **Critical secrets:** Set via Railway dashboard only
- **Encryption:** Automatically encrypted at rest
- **Access control:** Limited to authorized team members
- **Audit logging:** All changes logged

#### Never in Source Code
```bash
# ❌ NEVER DO THIS
OAUTH_CLIENT_SECRET=actual_secret_value

# ✅ CORRECT - Reference Railway variable
OAUTH_CLIENT_SECRET=${OAUTH_CLIENT_SECRET}
```

### Production Security Requirements

#### Mandatory in Production
- `OAUTH_CLIENT_SECRET`: Valid OAuth client secret
- `SESSION_SECRET`: Minimum 32 characters
- `DATABASE_SSL`: Must be `true`
- `HTTPS_ONLY`: Must be `true`
- Valid CORS origins (no wildcards)

#### Validation Checks
The application validates critical security settings on startup:

```typescript
// Automatic validation in production
if (NODE_ENV === 'production') {
  // Requires OAuth secrets
  // Enforces HTTPS
  // Validates SSL configuration
  // Checks session secret length
}
```

## Deployment-Specific Configuration

### Railway Production

**Set via Railway Dashboard:**
```bash
# Critical secrets (encrypted)
OAUTH_CLIENT_SECRET=<from-drupal-oauth-config>
SESSION_SECRET=<generated-random-64-chars>

# Application configuration
NODE_ENV=production
LOG_LEVEL=info
HTTPS_ONLY=true

# Security settings
SECURITY_HEADERS_ENABLED=true
CSP_ENABLED=true
CORS_ENABLED=true
CORS_ORIGINS=https://drupalize.me,https://claude.ai

# Drupal integration
DRUPAL_BASE_URL=https://drupalize.me
OAUTH_AUTHORIZATION_URL=https://drupalize.me/oauth/authorize
OAUTH_TOKEN_URL=https://drupalize.me/oauth/token
```

**Railway Auto-Managed:**
```bash
# Database (automatically set by Railway PostgreSQL addon)
DATABASE_URL=${RAILWAY_DATABASE_URL}
PGHOST=${PGHOST}
PGPORT=${PGPORT}
PGDATABASE=${PGDATABASE}
PGUSER=${PGUSER}
PGPASSWORD=${PGPASSWORD}

# Platform metadata
RAILWAY_ENVIRONMENT=production
RAILWAY_PROJECT_ID=<auto-set>
RAILWAY_SERVICE_ID=<auto-set>
```

### Railway Staging

Similar to production but with staging URLs:
```bash
DRUPAL_BASE_URL=https://staging.drupalize.me
CORS_ORIGINS=https://staging.drupalize.me,https://claude.ai
```

### Local Development

**`.env` file (ignored by git):**
```bash
NODE_ENV=development
LOG_LEVEL=debug
HTTPS_ONLY=false

# Mock authentication
MOCK_OAUTH=true
OAUTH_CLIENT_ID=mock_client_id
OAUTH_CLIENT_SECRET=mock_client_secret

# Local database
DATABASE_URL=postgresql://postgres:password@localhost:5432/mcp_server_dev
DATABASE_SSL=false

# Development session secret
SESSION_SECRET=dev-secret-key-at-least-32-chars-long

# Permissive CORS for development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
```

### CI/CD Testing

**GitHub Actions (set as repository secrets):**
```bash
# Security scanning
SNYK_TOKEN=<snyk-api-token>
CODECOV_TOKEN=<codecov-upload-token>

# Test environment
NODE_ENV=test
DATABASE_URL=postgresql://test:test@localhost:5432/mcp_server_test
MOCK_OAUTH=true
```

## Validation and Testing

### Configuration Validation

The application performs startup validation:

```typescript
// Environment validation on startup
validateEnvironment({
  required: ['NODE_ENV', 'DRUPAL_BASE_URL'],
  production: ['OAUTH_CLIENT_SECRET', 'SESSION_SECRET'],
  ssl: ['DATABASE_SSL'],
});
```

### Testing Configuration

#### Local Testing
```bash
# Copy example configuration
cp .env.example .env

# Edit with local values
# Start application
npm run dev
```

#### CI/CD Testing
```yaml
# GitHub Actions test environment
env:
  NODE_ENV: test
  DATABASE_URL: postgresql://test:test@localhost:5432/test_db
  MOCK_OAUTH: true
```

### Configuration Debugging

#### Enable Debug Logging
```bash
DEBUG_MODE=true
LOG_LEVEL=debug
```

#### Health Check Validation
```bash
# Check configuration endpoint (development only)
curl http://localhost:3000/health
```

## Environment-Specific Examples

### Complete Production Configuration
```bash
# Application
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

# Security
HTTPS_ONLY=true
SESSION_SECRET=<64-char-random-string>
SECURITY_HEADERS_ENABLED=true
CORS_ORIGINS=https://drupalize.me

# Database
DATABASE_URL=postgresql://user:pass@host:5432/db
DATABASE_SSL=true
DATABASE_SSL_MODE=require

# Drupal/OAuth
DRUPAL_BASE_URL=https://drupalize.me
OAUTH_CLIENT_ID=<client-id>
OAUTH_CLIENT_SECRET=<client-secret>
OAUTH_AUTHORIZATION_URL=https://drupalize.me/oauth/authorize
OAUTH_TOKEN_URL=https://drupalize.me/oauth/token
```

### Complete Development Configuration
```bash
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Security (relaxed)
HTTPS_ONLY=false
SESSION_SECRET=dev-secret-key-at-least-32-chars-long
MOCK_OAUTH=true

# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/mcp_dev
DATABASE_SSL=false

# Drupal/OAuth (mock)
DRUPAL_BASE_URL=https://drupalize.me
OAUTH_CLIENT_ID=mock_client
OAUTH_CLIENT_SECRET=mock_secret
```

---

**Document Version:** 1.0  
**Last Updated:** 2025-09-04  
**Next Review:** 2025-12-04  
**Owner:** DevOps Team