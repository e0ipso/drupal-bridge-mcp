# ADR-008: Environment Management and Secret Handling

## Status

**Accepted** - 2025-09-04

## Context

The MCP server requires secure and flexible environment management across development, staging, and
production environments. Key requirements include:

- Secure secret management for OAuth credentials and database passwords
- Environment-specific configuration without code changes
- Railway platform integration with automatic secret injection
- Type-safe configuration management with validation
- Database connection security with SSL enforcement
- CORS and security header configuration per environment
- Development workflow with easy local setup

The solution must balance security, operational simplicity, and developer productivity while
ensuring production secrets are never exposed.

## Decision

Implement a comprehensive environment management system using environment variables, centralized
configuration validation, and Railway-integrated secret management.

**Key Components:**

1. **Environment Variable Architecture**: All configuration via environment variables
2. **Type-Safe Configuration**: TypeScript interfaces with runtime validation
3. **Secret Management**: Railway secrets + GitHub Actions secrets
4. **Environment Templates**: Structured templates for each environment
5. **Database Security**: SSL enforcement and connection pooling
6. **Security Configuration**: Environment-specific security policies

## Rationale

### Environment Variable Strategy

**Benefits:**

- **Platform Agnostic**: Works across local development, CI/CD, and Railway
- **Security**: No secrets in code or configuration files
- **Railway Native**: Leverages Railway's environment variable management
- **CI/CD Integration**: GitHub Actions secrets integration
- **Developer Friendly**: Clear .env.example for local setup

**Configuration Hierarchy:**

1. Railway environment variables (production/staging)
2. GitHub Actions secrets (CI/CD)
3. Local .env files (development only)
4. Default values (where appropriate)

### Type-Safe Configuration Management

**Configuration Interface:**

```typescript
interface ServerConfig {
  environment: 'development' | 'production' | 'test' | 'staging';
  oauth: { clientId: string; clientSecret: string; ... };
  database: { host: string; password: string; ssl: boolean; ... };
  security: { httpsOnly: boolean; cors: {...}; headers: {...}; };
}
```

**Runtime Validation:**

- Required environment variables validation on startup
- Type conversion with error handling
- Default value assignment for non-sensitive settings
- Environment-specific configuration validation

### Railway Integration

**Automatic Secret Injection:**

- `DATABASE_URL`: Automatically provided by Railway PostgreSQL addon
- `PORT`: Railway-managed port assignment
- Platform variables: `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`

**Environment-Specific Configuration:**

```json
{
  "environments": {
    "production": {
      "variables": {
        "NODE_ENV": "production",
        "DATABASE_SSL": "true",
        "HTTPS_ONLY": "true",
        "RATE_LIMIT_ENABLED": "true"
      }
    }
  }
}
```

### Security Configuration Strategy

**Database Security:**

- SSL enforcement: `require` for production, `prefer` for staging
- Connection pooling with security-conscious defaults
- Password complexity requirements (enforced by Railway)
- Connection timeout limits

**Application Security:**

- HTTPS enforcement in production
- Security headers (HSTS, CSP, X-Frame-Options)
- CORS configuration with specific origin allowlist
- Rate limiting with environment-appropriate limits

**Secret Categories:**

- **Critical**: OAuth client secrets, database passwords
- **Sensitive**: Session secrets, API tokens
- **Configuration**: Base URLs, feature flags, timeouts

## Implementation Details

### Environment Configuration Structure

**Development (.env.example):**

```bash
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_SSL=false
CORS_ORIGINS=http://localhost:3000
RATE_LIMIT_MAX=100
```

**Staging (.env.staging.template):**

```bash
NODE_ENV=staging
LOG_LEVEL=debug
DATABASE_SSL=true
CORS_ORIGINS=https://staging.drupalize.me,https://claude.ai
RATE_LIMIT_MAX=500
```

**Production (.env.production.template):**

```bash
NODE_ENV=production
LOG_LEVEL=info
DATABASE_SSL=true
HTTPS_ONLY=true
CORS_ORIGINS=https://drupalize.me,https://claude.ai
RATE_LIMIT_MAX=1000
```

### Configuration Parsing and Validation

**Database Configuration:**

```typescript
function parseDatabaseConfig(): DatabaseConfig {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    // Parse URL with SSL mode validation
    return parseConnectionString(databaseUrl);
  }
  // Fallback to individual environment variables
  return parseIndividualVars();
}
```

**OAuth Configuration:**

```typescript
function parseOAuthConfig(): OAuthConfig {
  const requiredVars = ['OAUTH_CLIENT_ID', 'OAUTH_CLIENT_SECRET'];
  validateRequired(requiredVars);

  return {
    clientId: process.env.OAUTH_CLIENT_ID!,
    clientSecret: process.env.OAUTH_CLIENT_SECRET!,
    // ... other OAuth settings
  };
}
```

### Secret Management Strategy

**Railway Secrets Management:**

- Production secrets stored in Railway project settings
- Environment-specific secret namespaces
- Automatic rotation support for database credentials
- Audit logging for secret access

**GitHub Actions Integration:**

```yaml
env:
  RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
  CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}
  SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

**Development Workflow:**

1. Copy `.env.example` to `.env`
2. Fill in development-specific values (no production secrets)
3. Use mock/development services for OAuth and database
4. Environment-specific feature flags for development

### Security Hardening

**SSL/TLS Configuration:**

```typescript
const sslConfig = {
  ssl: environment === 'production',
  sslMode: environment === 'production' ? 'require' : 'prefer',
  sslCert: process.env.DATABASE_SSL_CERT, // Railway managed
  sslKey: process.env.DATABASE_SSL_KEY, // Railway managed
};
```

**CORS Configuration:**

```typescript
const corsOptions = {
  origin: process.env.CORS_ORIGINS?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
};
```

**Security Headers:**

```typescript
const securityHeaders = {
  hsts: environment === 'production',
  contentSecurityPolicy: true,
  xssProtection: true,
  noSniff: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
};
```

## Environment-Specific Configurations

### Development Environment

- **Database**: Local PostgreSQL or Docker container
- **SSL**: Disabled for local development
- **Logging**: Debug level with pretty formatting
- **CORS**: Permissive localhost origins
- **Rate Limiting**: Disabled or high limits
- **OAuth**: Development client credentials

### Staging Environment

- **Database**: Railway PostgreSQL with SSL preferred
- **SSL**: Enabled but not enforced (for testing)
- **Logging**: Debug level with JSON formatting
- **CORS**: Staging domain origins
- **Rate Limiting**: Moderate limits for testing
- **OAuth**: Staging environment credentials

### Production Environment

- **Database**: Railway PostgreSQL with SSL required
- **SSL**: Enforced across all connections
- **Logging**: Info level with structured JSON
- **CORS**: Strict origin allowlist
- **Rate Limiting**: Production-appropriate limits
- **OAuth**: Production client credentials
- **Security**: All security headers enabled

## Consequences

### Positive Consequences

- **Security**: No secrets in code or version control
- **Flexibility**: Easy environment-specific configuration
- **Railway Native**: Leverages platform secret management
- **Type Safety**: Runtime validation prevents configuration errors
- **Developer Productivity**: Clear templates and examples
- **Audit Trail**: Railway and GitHub provide access logging
- **Operational Simplicity**: Single source of truth per environment

### Negative Consequences

- **Environment Variable Complexity**: Many environment variables to manage
- **Template Maintenance**: Multiple template files to keep synchronized
- **Local Development Setup**: Initial configuration required for developers
- **Runtime Validation Overhead**: Configuration parsing on every startup

### Mitigation Strategies

- **Documentation**: Comprehensive environment variable documentation
- **Validation**: Startup-time validation with clear error messages
- **Templates**: Well-documented templates with examples
- **Tooling**: Scripts for environment setup and validation
- **Monitoring**: Configuration validation in health checks

## Secret Management Best Practices

### Production Secrets

1. **Storage**: Railway environment variables only
2. **Access**: Limited to production environment
3. **Rotation**: Regular credential rotation procedures
4. **Backup**: Secure backup procedures for critical credentials

### Development Workflow

1. **Local Development**: Never use production secrets locally
2. **Testing**: Mock services and test credentials only
3. **CI/CD**: Minimal secrets required for testing
4. **Documentation**: Clear examples without real credentials

### Security Policies

1. **Principle of Least Privilege**: Minimum required access
2. **Environment Isolation**: No cross-environment secret access
3. **Audit Logging**: All secret access logged
4. **Regular Review**: Quarterly secret and access review

## Configuration Validation

### Startup Validation

```typescript
function validateConfiguration(config: ServerConfig): void {
  // Validate required environment variables
  const required = ['OAUTH_CLIENT_ID', 'DATABASE_URL'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Validate configuration consistency
  if (config.environment === 'production' && !config.database.ssl) {
    throw new Error('SSL must be enabled in production');
  }
}
```

### Health Check Integration

- Configuration validation in health endpoints
- Environment-specific health check behavior
- Secure masking of sensitive configuration in responses

## Alternatives Considered

### Alternative 1: Configuration Files

**Description**: Use JSON/YAML configuration files per environment **Rejected Because:**

- Secrets would be in version control or require external management
- Less Railway-native integration
- Additional file management complexity
- Security risk of secrets in configuration files

### Alternative 2: External Secret Management (Vault, AWS Secrets Manager)

**Description**: Use external secret management service **Rejected Because:**

- Additional service dependency and costs
- Over-engineering for current scale
- Railway provides adequate secret management
- Increased operational complexity

### Alternative 3: Runtime Secret Fetching

**Description**: Fetch secrets from external services at runtime **Rejected Because:**

- Network dependency for critical configuration
- Startup complexity and failure points
- Railway environment variables are simpler and more reliable
- Additional authentication and networking requirements

### Alternative 4: Encrypted Configuration Files

**Description**: Use encrypted configuration files with decryption keys **Rejected Because:**

- Key management complexity
- Decryption overhead and failure points
- Environment variables are simpler and more secure
- Railway platform doesn't require this complexity

## Related ADRs

- [ADR-004: CI/CD Pipeline Architecture and Tool Selection](./adr-004-cicd-pipeline-architecture.md)
- [ADR-005: Container Strategy and Docker Configuration](./adr-005-container-strategy.md)
- [ADR-006: Cloud Deployment Platform Selection](./adr-006-cloud-deployment-platform.md)
- [ADR-007: Monitoring and Observability Strategy](./adr-007-monitoring-observability-strategy.md)
