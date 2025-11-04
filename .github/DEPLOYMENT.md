# Deployment Configuration

This document outlines the CI/CD pipeline setup and required configuration for the MCP Server.

## GitHub Actions Workflows

### 1. CI Workflow (`.github/workflows/ci.yml`)

**Triggers:**

- Pull requests to `main`, `beta`, `alpha` branches
- Pushes to `main` branch
- Manual workflow dispatch

**Jobs:**

- **Changes Detection**: Determines which parts of the codebase changed
- **Lint & Format**: Code quality checks (ESLint, Prettier, TypeScript)
- **Test**: Unit and integration tests with PostgreSQL
- **Build**: Production build with artifact generation
- **Security**: Dependency vulnerability scanning

### 2. Deploy Workflow (`.github/workflows/deploy.yml`)

**Triggers:**

- Successful completion of CI workflow on `main` branch
- Manual workflow dispatch

**Jobs:**

- **Deploy Production**: Deploys to Railway with health checks
- **Rollback**: Automatic rollback on deployment failure

## Required GitHub Secrets

Configure the following secrets in your GitHub repository settings:

### Core Secrets

- `CODECOV_TOKEN`: Token for uploading test coverage reports to Codecov
- `RAILWAY_TOKEN`: Railway CLI token for production deployments

### Database Configuration (for Railway)

These are configured in Railway directly, not as GitHub secrets:

- `DATABASE_URL`: PostgreSQL connection string
- `DB_SSL`: Set to `true` for production

### OAuth Configuration (for Railway)

These are configured in Railway directly:

- `OAUTH_CLIENT_ID`: Drupal Simple OAuth client ID
- `OAUTH_CLIENT_SECRET`: Drupal Simple OAuth client secret
- `OAUTH_REDIRECT_URI`: OAuth callback URL
- `OAUTH_AUTH_URL`: Drupal OAuth authorization endpoint
- `OAUTH_TOKEN_URL`: Drupal OAuth token endpoint

### Drupal Integration (for Railway)

- `DRUPAL_BASE_URL`: Base URL of your Drupal instance
- `DRUPAL_JSONRPC_METHOD`: HTTP method for tool invocation (GET or POST, default: `GET`)
- `DRUPAL_TIMEOUT`: Request timeout in milliseconds (default: `10000`)

### Other Configuration

- `NODE_ENV`: Set to `production`
- `PORT`: Application port (Railway provides this automatically)

### Logging Configuration

- `LOG_LEVEL`: Logging level (`error`, `warn`, `info`, `debug`) - Default: `info`
- `LOG_TO_FILE`: Force file logging (`true`/`false`) - Default: `true` in production
- `LOG_DIR`: Log file directory - Default: `./logs`
- `DISABLE_PRETTY_LOGS`: Disable pretty-printing (`true`/`false`) - Default: `true` in production

## Pipeline Features

### ✅ Automated Testing

- Node.js 20 environment
- PostgreSQL 15 service for integration tests
- Test coverage reporting with Codecov integration
- Security vulnerability scanning

### ✅ Build Optimization

- TypeScript compilation with type checking
- Build artifact caching
- Production-optimized builds
- Multi-architecture Docker support (if using containers)

### ✅ Deployment Automation

- Zero-downtime deployment to Railway
- Comprehensive health checks
- Automatic rollback on failure
- Deployment status tracking

### ✅ Quality Assurance

- ESLint and Prettier code formatting
- TypeScript strict type checking
- Dependency vulnerability scanning
- Test coverage thresholds (80% minimum)

## Local Development Testing

To test the CI pipeline locally:

```bash
# Install dependencies
npm ci

# Run quality checks
npm run quality:check

# Setup test database (if PostgreSQL is available)
npm run db:setup

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build:prod
```

## Database Schema

The pipeline includes automatic database setup for testing. The following tables are created:

- `sessions`: OAuth session management
  - `id`: Session identifier
  - `data`: Session data (JSON)
  - `expires_at`: Session expiration
  - `created_at`, `updated_at`: Timestamps

## Health Check Endpoints

The deployment workflow validates these endpoints:

- `GET /health`: Application health check
- `GET /mcp/sse`: MCP Server-Sent Events endpoint
- `GET /oauth/callback`: OAuth callback (should return 405 Method Not Allowed)

## Monitoring and Alerting

### Deployment Notifications

- Successful deployments are logged with commit information
- Failed deployments automatically create GitHub issues with incident details
- Rollback operations are tracked and reported

### Coverage Reports

- Test coverage reports are uploaded to Codecov
- Coverage trends are visible in pull request checks
- Minimum coverage threshold: 80% for all metrics

## Troubleshooting

### Common Issues

1. **Database Connection Failures**
   - Verify PostgreSQL service is healthy in CI
   - Check `DATABASE_URL` format in deployment environment

2. **Test Failures**
   - Review test logs in GitHub Actions
   - Ensure all required environment variables are set

3. **Deployment Failures**
   - Check Railway service logs
   - Verify all required secrets are configured
   - Confirm health check endpoints are responding

4. **Build Failures**
   - Review TypeScript compilation errors
   - Check for missing dependencies or type definitions

### Support

For deployment issues, check:

1. GitHub Actions logs
2. Railway deployment logs
3. Application health check endpoints
4. GitHub Issues for automated incident reports
