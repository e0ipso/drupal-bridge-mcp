# ADR-005: Container Strategy and Docker Configuration

## Status

**Accepted** - 2025-09-04

## Context

The MCP server requires containerization for consistent deployment across environments, particularly
for Railway cloud deployment. Container strategy decisions include base image selection, multi-stage
build optimization, security hardening, health checks, and runtime configuration. Key requirements
include:

- Minimal production image size for faster deployments
- Security hardening with non-root user execution
- Proper signal handling for graceful shutdowns
- Health check integration for deployment verification
- PostgreSQL client library compatibility
- Efficient build caching and layer optimization

## Decision

Implement a multi-stage Docker build strategy using Node.js Alpine Linux base images with
comprehensive security hardening and Railway-optimized configuration.

**Key Decisions:**

1. **Multi-stage Build**: Separate build and production stages
2. **Alpine Linux Base**: Minimal `node:20-alpine` for production
3. **Non-root Execution**: Custom user `mcpserver` with restricted permissions
4. **Signal Handling**: `dumb-init` for proper process management
5. **Health Checks**: Built-in Docker health check with custom script
6. **Security Hardening**: Latest security updates and minimal attack surface

## Rationale

### Multi-Stage Build Strategy

**Build Stage Benefits:**

- Include development dependencies only during compilation
- TypeScript compilation with full toolchain
- Native module building with Python and build tools
- Build artifact optimization and verification

**Production Stage Benefits:**

- Minimal runtime dependencies only
- Smaller image size (reduces deployment time)
- Reduced attack surface with fewer installed packages
- Optimized for Railway deployment constraints

### Base Image Selection: Node.js Alpine Linux

**Alpine Linux Advantages:**

- **Small Size**: ~5MB base vs ~100MB+ for Ubuntu-based images
- **Security Focus**: Minimal package set reduces vulnerabilities
- **Package Manager**: APK for efficient package management
- **Railway Compatibility**: Excellent performance on Railway platform

**Node.js 20 Selection:**

- **LTS Support**: Long-term support for stability
- **Performance**: Latest V8 optimizations
- **ES Module Support**: Native ESM compatibility
- **Security Updates**: Regular security patching

### Security Hardening Implementation

**Non-root User Execution:**

```dockerfile
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001 -G nodejs
USER mcpserver
```

**Security Updates:**

```dockerfile
RUN apk upgrade --no-cache && \
    apk add --no-cache dumb-init
```

**Minimal Dependencies:**

- Production dependencies only in final stage
- Clean npm cache after installation
- No development tools in production image

### Health Check Integration

**Custom Health Check Script:**

- HTTP endpoint verification (`/health`)
- Configurable port and timeout
- Proper exit codes for container orchestration
- Railway health check compatibility

**Docker Health Check Configuration:**

```dockerfile
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node /app/health-check.js
```

## Consequences

### Positive Consequences

- **Fast Deployments**: Small image size reduces Railway deployment time
- **Enhanced Security**: Non-root execution and minimal attack surface
- **Reliable Operations**: Proper signal handling prevents hanging processes
- **Development Efficiency**: Consistent environment across dev/staging/production
- **Resource Optimization**: Efficient memory and CPU usage on Railway
- **Health Monitoring**: Integrated health checks for deployment verification

### Negative Consequences

- **Alpine Complexity**: Some Node.js modules require compilation on Alpine
- **Build Time**: Multi-stage builds add complexity and initial build time
- **Debugging Complexity**: Minimal production image has fewer debugging tools
- **Platform Lock-in**: Docker-specific configuration reduces portability

### Mitigation Strategies

- **Build Dependencies**: Include Python and build tools in build stage
- **Layer Caching**: Optimize layer order for efficient caching
- **Development Image**: Separate development Dockerfile with debugging tools
- **Documentation**: Comprehensive deployment and troubleshooting guides

## Implementation Details

### Multi-Stage Build Configuration

**Build Stage:**

```dockerfile
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++  # Native module compilation
WORKDIR /app
COPY package*.json tsconfig*.json ./
RUN npm ci --frozen-lockfile
COPY src/ ./src/
RUN npm run build:prod
```

**Production Stage:**

```dockerfile
FROM node:20-alpine AS production
RUN apk upgrade --no-cache && apk add --no-cache dumb-init
RUN addgroup -g 1001 -S nodejs && adduser -S mcpserver -u 1001 -G nodejs
WORKDIR /app
COPY package*.json ./
RUN npm ci --frozen-lockfile --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
```

### Security Configuration

**File System Permissions:**

- Application files owned by `mcpserver:nodejs`
- Read-only file system where possible
- Proper file permissions for security

**Process Management:**

- `dumb-init` as PID 1 for signal handling
- Proper SIGTERM handling for graceful shutdowns
- Container-optimized process management

### Health Check Implementation

**Health Check Script Features:**

- HTTP request to configurable health endpoint
- Configurable timeout and port detection
- Proper exit codes for container orchestration
- Error handling for network issues

**Railway Integration:**

- Health check path: `/health`
- Timeout: 10 seconds
- Interval: 30 seconds
- Compatible with Railway's health check system

### Environment Configuration

**Railway-Specific Optimizations:**

- Port configuration via `PORT` environment variable
- Proper signal handling for Railway's container management
- Health check endpoint for deployment verification
- SSL and security headers for production deployment

## Dockerfile Structure Analysis

```dockerfile
# Build stage - includes dev dependencies
FROM node:20-alpine AS builder
# [Build dependencies and compilation]

# Production stage - minimal runtime
FROM node:20-alpine AS production
# [Security hardening and runtime setup]
```

**Key Components:**

1. **Dependency Management**: Separate build and runtime dependencies
2. **Security Hardening**: Non-root user and minimal packages
3. **Health Checks**: Built-in Docker health check
4. **Signal Handling**: Proper process management with dumb-init
5. **Railway Optimization**: Port configuration and deployment compatibility

## Alternatives Considered

### Alternative 1: Single-Stage Build

**Description**: Simple Dockerfile without multi-stage build **Rejected Because:**

- Larger production image includes unnecessary development dependencies
- Security risk from development tools in production
- Slower deployment times due to image size

### Alternative 2: Ubuntu/Debian Base Image

**Description**: Use full Ubuntu or Debian base instead of Alpine **Rejected Because:**

- Significantly larger image size (10x+ larger)
- More attack surface with additional packages
- Slower deployment and startup times
- Higher resource usage on Railway

### Alternative 3: Distroless Images

**Description**: Google's distroless Node.js images **Rejected Because:**

- Limited package manager for PostgreSQL client libraries
- More complex debugging and troubleshooting
- Less mature ecosystem compared to Alpine
- Compatibility concerns with Railway deployment

### Alternative 4: Root User Execution

**Description**: Run application as root user for simplicity **Rejected Because:**

- Significant security vulnerability
- Container escape risks
- Best practice violation for production deployments
- Railway security policy non-compliance

## Related ADRs

- [ADR-004: CI/CD Pipeline Architecture and Tool Selection](./adr-004-cicd-pipeline-architecture.md)
- [ADR-006: Cloud Deployment Platform Selection](./adr-006-cloud-deployment-platform.md)
- [ADR-007: Monitoring and Observability Strategy](./adr-007-monitoring-observability-strategy.md)
- [ADR-008: Environment Management and Secret Handling](./adr-008-environment-management.md)
