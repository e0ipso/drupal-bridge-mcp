# Drupalize.me MCP Server

A Model Context Protocol (MCP) server that connects to Drupalize.me's Drupal installation, providing AI systems with secure, authenticated access to educational content through a standardized RAG (Retrieval Augmented Generation) interface.

## Overview

This MCP server enables AI systems to access Drupalize.me's comprehensive Drupal educational content through OAuth 2.0 authentication. The server transforms Drupal content into RAG-optimized formats and provides structured access to tutorials, documentation, and learning resources.

### Key Features

- **OAuth 2.0 Authentication**: Secure per-user authentication with Drupal's Simple OAuth module
- **Content Transformation**: Automatic conversion of Drupal content to RAG-optimized Markdown
- **Dynamic Tool Discovery**: JSON-RPC endpoints automatically discovered from Drupal configuration
- **Subscription-Aware**: Respects user subscription levels for content access
- **TypeScript**: Full type safety with comprehensive error handling
- **Production Ready**: Includes monitoring, logging, and health checks

## Architecture

The server implements a simplified MVP architecture without caching complexity:

```
AI System → MCP Protocol → MCP Server → OAuth 2.0 → Drupal JSON-RPC API
                ↓
           PostgreSQL
         (User Sessions)
```

For detailed architecture documentation, see the [`/architecture/`](./architecture/) directory.

## Prerequisites

- **Node.js** 18.0.0 or higher
- **PostgreSQL** 12 or higher
- **Drupal Instance** with Simple OAuth and JSON-RPC modules configured
- **OAuth 2.0 Credentials** from your Drupal installation

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/drupalize/mcp-server.git
   cd mcp-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up the database**
   ```bash
   npm run db:setup
   ```

5. **Build the project**
   ```bash
   npm run build
   ```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/mcp_server

# Drupal OAuth Configuration
DRUPAL_BASE_URL=https://your-drupal-site.com
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_REDIRECT_URI=http://localhost:3000/auth/callback

# MCP Configuration
MCP_TRANSPORT=sse
DEBUG_MODE=true

# Security
JWT_SECRET=your-secure-jwt-secret
ENCRYPTION_KEY=your-32-character-encryption-key

# Logging
LOG_LEVEL=info
LOG_FORMAT=combined
```

### OAuth 2.0 Setup

1. **Enable modules in Drupal**:
   - Simple OAuth
   - JSON-RPC
   - Custom content transformation modules

2. **Create OAuth 2.0 application**:
   - Navigate to `/admin/config/services/consumer`
   - Create new consumer with Authorization Code Grant
   - Copy client ID and secret to your `.env` file

3. **Configure permissions**:
   - Grant appropriate API access to authenticated users
   - Set up subscription-based content access rules

## Usage

### Development

```bash
# Start development server with hot reload
npm run dev

# Run with debug logging
DEBUG=mcp:* npm run dev

# Watch mode with automatic rebuilding
npm run dev:watch
```

### Production

```bash
# Build for production
npm run build:prod

# Start production server
npm start

# Run with PM2 (recommended)
pm2 start dist/index.js --name mcp-server
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm run test:coverage

# Lint and format code
npm run quality:check
npm run quality:fix
```

## API Documentation

### MCP Tools

The server provides the following MCP tools dynamically discovered from Drupal:

#### Content Access Tools
- `search_content`: Search Drupal content with filters
- `get_tutorial`: Retrieve specific tutorial content
- `list_courses`: Get available course listings
- `get_user_progress`: Access user's learning progress

#### Authentication Tools
- `authenticate_user`: Initiate OAuth 2.0 flow
- `refresh_token`: Refresh expired access tokens
- `get_user_profile`: Retrieve authenticated user information

### HTTP Endpoints

#### Health Check
```http
GET /health
```
Returns server health status and version information.

#### OAuth Callback
```http
GET /auth/callback?code=...&state=...
```
Handles OAuth 2.0 authorization code callback.

#### MCP Transport
```http
GET /mcp/sse
```
Server-Sent Events endpoint for MCP protocol communication.

## Development

### Project Structure

```
src/
├── auth/           # OAuth 2.0 authentication
├── config/         # Configuration management  
├── database/       # Database models and migrations
├── handlers/       # MCP request handlers
├── services/       # Business logic services
├── transport/      # MCP transport implementations
├── types/          # TypeScript type definitions
└── utils/          # Utility functions

tests/
├── integration/    # Integration tests
├── unit/          # Unit tests
└── fixtures/      # Test fixtures and mocks

architecture/      # Architecture documentation
.github/           # GitHub workflows and templates
```

### Code Quality

This project uses:
- **TypeScript** for type safety
- **ESLint** for code linting  
- **Prettier** for code formatting
- **Jest** for testing
- **Husky** for pre-commit hooks
- **Conventional Commits** for standardized commit messages

### Contributing Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes with tests
4. Run quality checks: `npm run quality:check`
5. Commit using conventional format: `git commit -m "feat: add amazing feature"`
6. Push to your fork and create a Pull Request

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## Monitoring and Debugging

### Logging

The server uses Winston for structured logging:

```javascript
import { logger } from './utils/logger';

logger.info('Server started', { port: 3000 });
logger.error('Database connection failed', { error: err.message });
```

### Health Checks

Monitor server health via:
```bash
curl http://localhost:3000/health
```

Response includes:
- Server version and uptime
- Database connectivity status  
- Drupal API connectivity status
- Memory and CPU usage metrics

### Debug Mode

Enable debug mode for verbose logging:
```bash
DEBUG=mcp:* NODE_ENV=development npm start
```

## Deployment

### Docker

```bash
# Build Docker image
docker build -t drupalize/mcp-server .

# Run with Docker Compose
docker-compose up -d
```

### Production Deployment

1. **Environment Setup**:
   - Configure production environment variables
   - Set up PostgreSQL database
   - Configure reverse proxy (nginx/Apache)

2. **Security**:
   - Use HTTPS for all communications
   - Implement proper firewall rules
   - Regular security updates

3. **Monitoring**:
   - Set up application monitoring (New Relic, DataDog)
   - Configure log aggregation
   - Implement alerting for critical errors

## Troubleshooting

### Common Issues

**Authentication failures**:
- Verify OAuth 2.0 client credentials
- Check Drupal module configurations
- Ensure redirect URI matches exactly

**Database connection errors**:
- Verify DATABASE_URL format
- Check PostgreSQL service status
- Confirm user permissions

**Content access issues**:
- Verify user subscription status
- Check Drupal permissions
- Review content transformation logs

### Support

- **Issues**: [GitHub Issues](https://github.com/drupalize/mcp-server/issues)
- **Discussions**: [GitHub Discussions](https://github.com/drupalize/mcp-server/discussions)
- **Documentation**: [Architecture Docs](./architecture/)

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and release notes.

---

Built with ❤️ by the Drupalize.me team