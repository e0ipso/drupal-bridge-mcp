# Multi-stage Dockerfile for Drupalize.me MCP Server
# Built for Railway deployment with health checks and security hardening

# Build stage - includes dev dependencies for compilation
FROM node:20-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ 

# Set working directory
WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./
COPY tsconfig*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci --frozen-lockfile

# Copy source code
COPY src/ ./src/

# Build the TypeScript application
RUN npm run build:prod

# Production stage - minimal runtime environment
FROM node:20-alpine AS production

# Install security updates and dumb-init for proper signal handling
RUN apk upgrade --no-cache && \
    apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S mcpserver -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --frozen-lockfile --only=production && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create health check endpoint script
COPY <<'EOF' /app/health-check.js
const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: '/health',
  method: 'GET',
  timeout: 2000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => {
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();
EOF

# Change ownership of app directory to non-root user
RUN chown -R mcpserver:nodejs /app

# Switch to non-root user
USER mcpserver

# Expose port (configurable via environment variable)
EXPOSE 3000

# Add health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node /app/health-check.js

# Use dumb-init for proper signal handling and start the application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

# Metadata labels
LABEL org.opencontainers.image.title="Drupalize.me MCP Server"
LABEL org.opencontainers.image.description="MCP Server for Drupalize.me Drupal integration with OAuth authentication"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Drupalize.me"