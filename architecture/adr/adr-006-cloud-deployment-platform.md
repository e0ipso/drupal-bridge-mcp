# ADR-006: Cloud Deployment Platform Selection (Railway)

## Status

**Accepted** - 2025-09-04

## Context

The MCP server requires a cloud deployment platform that supports PostgreSQL databases, Docker
containerization, environment management, and seamless CI/CD integration. Key requirements include:

- PostgreSQL database hosting with SSL support
- Docker container deployment
- Multi-environment support (staging/production)
- Environment variable management and secrets
- Health check and monitoring capabilities
- Cost-effective pricing for MVPs
- GitHub Actions integration
- Automatic SSL/HTTPS termination

Platform evaluation considered Railway, Heroku, AWS ECS, Google Cloud Run, and DigitalOcean App
Platform.

## Decision

Deploy the MCP server on **Railway** as the primary cloud platform with integrated PostgreSQL
database service.

**Key Railway Features Utilized:**

1. **Docker Deployment**: Native Dockerfile support
2. **PostgreSQL Service**: Managed PostgreSQL with SSL
3. **Environment Management**: Per-environment variable configuration
4. **Health Checks**: Built-in health check monitoring
5. **GitHub Integration**: Automatic deployment from GitHub
6. **CLI Integration**: Railway CLI for CI/CD automation

## Rationale

### Railway Platform Advantages

**Developer Experience:**

- **Simple Setup**: Minimal configuration required
- **GitHub Integration**: Automatic deployments from repository
- **CLI Tools**: Excellent CLI for automation and debugging
- **Dashboard**: Intuitive web interface for monitoring and management
- **Documentation**: Clear, comprehensive documentation

**Technical Capabilities:**

- **Docker Support**: Native Dockerfile deployment
- **Database Integration**: Managed PostgreSQL with automatic SSL
- **Environment Variables**: Secure environment variable management
- **Health Checks**: Configurable health monitoring
- **Logs**: Real-time log streaming and aggregation
- **Metrics**: Basic application metrics and monitoring

**Cost Effectiveness:**

- **Pricing Model**: Resource-based pricing suitable for MVPs
- **Free Tier**: Generous free tier for development and testing
- **Transparent Costs**: Clear pricing without hidden fees
- **Scaling**: Pay-as-you-scale model

### PostgreSQL Database Integration

**Managed PostgreSQL Benefits:**

- **Automatic Backups**: Daily automated backups
- **SSL Encryption**: Forced SSL connections for security
- **Connection Pooling**: Built-in connection management
- **Monitoring**: Database performance metrics
- **Maintenance**: Automatic security updates and maintenance

**Configuration:**

```json
{
  "DATABASE_SSL": "true",
  "DATABASE_SSL_MODE": "require"
}
```

### Multi-Environment Configuration

**Production Environment:**

- SSL enforcement and security headers
- Rate limiting and CORS configuration
- Optimized database connection pooling
- Full monitoring and health checks

**Staging Environment:**

- Debug logging enabled
- Relaxed rate limiting for testing
- Separate database instance
- Development-friendly configurations

### CI/CD Integration

**GitHub Actions Integration:**

```yaml
- name: Deploy to Railway
  run: railway up --detach
  env:
    RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

**Deployment Features:**

- Automatic deployment from GitHub
- Health check verification
- Database migration automation
- Rollback capabilities

## Implementation Details

### Railway Configuration (`railway.json`)

**Build Configuration:**

```json
{
  "build": {
    "builder": "dockerfile",
    "dockerfilePath": "Dockerfile"
  }
}
```

**Deployment Settings:**

```json
{
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false,
    "restartPolicyType": "on-failure",
    "restartPolicyMaxRetries": 10
  }
}
```

**Health Check Configuration:**

```json
{
  "healthcheck": {
    "path": "/health",
    "timeout": 10,
    "interval": 30
  }
}
```

### Environment-Specific Configuration

**Production Variables:**

- `NODE_ENV`: "production"
- `LOG_LEVEL`: "info"
- `HTTPS_ONLY`: "true"
- `DATABASE_SSL`: "true"
- `RATE_LIMIT_ENABLED`: "true"
- Full CORS and security configurations

**Staging Variables:**

- `NODE_ENV`: "staging"
- `LOG_LEVEL`: "debug"
- Relaxed security for development testing
- Separate OAuth and database configurations

### Database Configuration

**Connection Settings:**

- SSL mode: `require`
- Connection pooling: 2-20 connections (production)
- Connection timeout: 10 seconds
- Idle timeout: 30 seconds

**Security Features:**

- Forced SSL connections
- Automatic certificate management
- Network isolation
- Access control via environment variables

## Consequences

### Positive Consequences

- **Rapid Deployment**: Quick setup and deployment process
- **Integrated Database**: No separate database hosting required
- **Cost Effective**: Suitable pricing for MVP and scaling
- **Developer Friendly**: Excellent tooling and documentation
- **Security**: SSL, secrets management, and security headers
- **Monitoring**: Built-in health checks and basic metrics
- **Maintenance**: Managed services reduce operational overhead

### Negative Consequences

- **Platform Lock-in**: Some Railway-specific configuration
- **Limited Monitoring**: Basic metrics compared to enterprise solutions
- **Scaling Constraints**: Fewer advanced scaling options than AWS/GCP
- **Regional Availability**: Limited geographic regions
- **Vendor Risk**: Dependence on Railway's platform stability

### Mitigation Strategies

- **Container Portability**: Docker ensures platform portability
- **Environment Variables**: Externalized configuration for flexibility
- **Documentation**: Comprehensive deployment procedures
- **Backup Strategy**: Database backup and export procedures
- **Monitoring Extension**: Integration with external monitoring tools

## Migration and Deployment Strategy

### Initial Deployment

1. **Railway Project Setup**: Create project with PostgreSQL service
2. **Environment Configuration**: Set production and staging variables
3. **GitHub Integration**: Connect repository for automatic deployments
4. **Database Setup**: Run initial migrations and schema creation
5. **Health Check Verification**: Confirm all endpoints respond correctly

### CI/CD Integration

**Deployment Workflow:**

1. GitHub Actions builds and tests code
2. Railway CLI deploys Docker container
3. Database migrations run automatically
4. Health checks verify deployment success
5. Rollback triggers on health check failure

**Deployment Commands:**

```bash
railway up --detach                    # Deploy application
railway run npm run migrate           # Run database migrations
railway logs                          # View application logs
railway rollback                      # Rollback to previous deployment
```

## Platform Comparison

### Railway vs Alternatives

**Railway vs Heroku:**

- **Advantages**: Better pricing, Docker support, modern architecture
- **Disadvantages**: Smaller ecosystem, fewer add-ons

**Railway vs AWS ECS:**

- **Advantages**: Simpler setup, integrated database, lower complexity
- **Disadvantages**: Less control, fewer enterprise features

**Railway vs Google Cloud Run:**

- **Advantages**: Persistent connections, integrated database
- **Disadvantages**: Less global infrastructure, fewer scaling options

**Railway vs DigitalOcean App Platform:**

- **Advantages**: Better PostgreSQL integration, superior CLI
- **Disadvantages**: Smaller community, newer platform

## Alternatives Considered

### Alternative 1: Heroku

**Description**: Traditional PaaS with extensive add-on ecosystem **Rejected Because:**

- Higher costs for equivalent resources
- Limited Docker support and flexibility
- Complex add-on pricing model
- Scheduled maintenance windows

### Alternative 2: AWS ECS with RDS

**Description**: AWS container service with managed database **Rejected Because:**

- Significant complexity for MVP deployment
- Higher operational overhead and learning curve
- Cost complexity and potential for bill shock
- Over-engineering for current requirements

### Alternative 3: Google Cloud Run

**Description**: Serverless container platform **Rejected Because:**

- Cold start issues for MCP server connections
- Stateless architecture conflicts with OAuth sessions
- Database connection pooling challenges
- Complex networking for PostgreSQL integration

### Alternative 4: Self-Hosted on VPS

**Description**: Deploy on DigitalOcean Droplet or similar **Rejected Because:**

- Manual infrastructure management overhead
- Security and maintenance responsibilities
- No managed database services
- Requires DevOps expertise and time investment

## Related ADRs

- [ADR-004: CI/CD Pipeline Architecture and Tool Selection](./adr-004-cicd-pipeline-architecture.md)
- [ADR-005: Container Strategy and Docker Configuration](./adr-005-container-strategy.md)
- [ADR-007: Monitoring and Observability Strategy](./adr-007-monitoring-observability-strategy.md)
- [ADR-008: Environment Management and Secret Handling](./adr-008-environment-management.md)
