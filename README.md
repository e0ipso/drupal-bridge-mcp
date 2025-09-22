# Drupalize.me MCP Server

> A Model Context Protocol (MCP) server that provides AI systems with secure access to
> Drupalize.me's Drupal educational content through OAuth 2.0 authentication.

## ✨ Features

- 🔐 **OAuth 2.0 Authentication** - Secure per-user authentication
- 📚 **Content Access** - Search tutorials, courses, and documentation
- 🔄 **RAG-Optimized** - Content transformed for AI consumption
- 🛡️ **Type-Safe** - Full TypeScript implementation
- 🎯 **Subscription-Aware** - Respects user access levels

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Drupal instance with Simple OAuth and JSON-RPC modules

### Installation

```bash
npm install @e0ipso/drupal-bridge-mcp
```

### Configuration

Create a `.env` file:

```env
# Drupal Site
DRUPAL_BASE_URL=https://your-drupal-site.com

# OAuth 2.0 (Required for authentication)
OAUTH_CLIENT_ID=your-client-id
AUTH_ENABLED=true  # Set to false to skip authentication

# Optional Configuration
NODE_ENV=development
LOG_LEVEL=info              # error | warn | info | debug
LOG_TO_FILE=false          # Force file logging
LOG_DIR=./logs             # Log file directory
DISABLE_PRETTY_LOGS=false  # Disable pretty-printing in development
DEBUG=mcp:*                # Debug output patterns
```

### Usage

#### As MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "drupal-bridge-mcp": {
      "command": "npx",
      "args": ["@e0ipso/drupal-bridge-mcp"]
    }
  }
}
```

#### Direct Usage

```bash
npx @e0ipso/drupal-bridge-mcp
```

## 🛠️ Development

### Local Setup

```bash
# Clone repository
git clone https://github.com/e0ipso/drupal-bridge-mcp.git
cd drupal-bridge-mcp

# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env with your Drupal configuration

# Start development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
```

### Local MCP Server Configuration

#### With Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "drupal-bridge-mcp-local": {
      "command": "node",
      "args": ["/path/to/your/project/dist/main.js"],
      "env": {
        "DRUPAL_BASE_URL": "http://localhost/drupal",
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

#### With Development Server

For live reloading during development:

```json
{
  "mcpServers": {
    "drupal-bridge-mcp-dev": {
      "command": "npm",
      "args": ["run", "dev"],
      "cwd": "/path/to/your/project",
      "env": {
        "DRUPAL_BASE_URL": "http://localhost/drupal",
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      }
    }
  }
}
```

### Environment Configuration

Create `.env` file with your local Drupal setup:

```env
# Your local Drupal instance
DRUPAL_BASE_URL=http://localhost/drupal
DRUPAL_JSON_RPC_ENDPOINT=/jsonrpc

# Development settings
NODE_ENV=development

# Logging configuration
LOG_LEVEL=debug           # error | warn | info | debug
LOG_TO_FILE=false        # Force file logging (overrides environment defaults)
LOG_DIR=./logs           # Directory for log files (production mode)
DISABLE_PRETTY_LOGS=false # Disable pretty-printing in development

# Debug output (structured text logs to console)
DEBUG=mcp:*

# OAuth (when available)
# OAUTH_CLIENT_ID=your-client-id
# OAUTH_CLIENT_SECRET=your-client-secret
```

### OAuth Setup in Drupal

1. **Install Simple OAuth in Drupal**:

   ```bash
   composer require drupal/simple_oauth:^5
   drush en simple_oauth
   ```

2. **Create OAuth Client**:
   - Navigate to `/admin/config/services/consumer/add`
   - Configure:
     - Label: "MCP Server"
     - Client ID: (auto-generated or custom)
     - Scopes: `tutorial:read`, `user:profile`
     - Grant type: "Authorization Code"
     - Redirect URI: `http://127.0.0.1:3000/callback`

3. **First Authentication**:
   - On first use, the MCP server will open your browser
   - Log into Drupal and authorize the application
   - Tokens are encrypted and stored locally
   - Subsequent requests use refresh tokens automatically

### Testing with MCP Client

```bash
# Start the MCP server directly
npm run dev

# In another terminal, test with an MCP client
# The server listens on stdio by default
```

## 🔧 Available Tools

The server exposes these MCP tools:

- `search_tutorials` - Search Drupalize.me tutorials
- `get_tutorial` - Retrieve specific tutorial content
- `list_courses` - Get available courses
- `authenticate_user` - OAuth authentication flow

## 📝 Scripts

| Command                             | Description                         |
| ----------------------------------- | ----------------------------------- |
| `npm run dev`                       | Start development server            |
| `npm run build`                     | Build for production                |
| `npm test`                          | Run complete test suite             |
| `npm run test:unit`                 | Run unit tests (fast, isolated)     |
| `npm run test:integration`          | Run integration tests               |
| `npm run test:unit:coverage`        | Generate unit test coverage         |
| `npm run test:integration:coverage` | Generate integration coverage       |
| `npm run test:all`                  | Run both unit and integration tests |
| `npm run lint`                      | Lint code                           |
| `npm run format`                    | Format code                         |

## 📋 Logging Infrastructure

The application uses [Pino](https://getpino.io/) for structured, high-performance logging with
automatic configuration based on the environment and comprehensive security features.

### Logging Behavior by Environment

#### Development Mode (`NODE_ENV=development`)

- **Output**: Pretty-printed console logs with colors and timestamps
- **Format**: Human-readable format optimized for development
- **Level**: Configurable via `LOG_LEVEL` (default: `info`)
- **Features**:
  - Colored output for different log levels
  - Component-based logging with child loggers
  - Timestamp formatting (`HH:MM:ss`)
  - Single-line format for readability

#### Production Mode (`NODE_ENV=production`)

- **Output**: Structured JSON logs to files
- **Files**:
  - `./logs/app.log` - All logs (info and above)
  - `./logs/error.log` - Error logs only
- **Format**: Machine-readable JSON for log aggregation
- **Features**:
  - Automatic log directory creation
  - Structured logging for monitoring systems
  - Performance optimized for high-throughput

#### Test Mode (`NODE_ENV=test`)

- **Output**: Minimal structured JSON to console
- **Purpose**: Reduced noise during test execution
- **Features**: Error serialization and basic structured logging

### Configuration Options

All logging behavior can be customized via environment variables:

| Variable              | Default  | Description                                                             |
| --------------------- | -------- | ----------------------------------------------------------------------- |
| `LOG_LEVEL`           | `info`   | Minimum log level (`error`, `warn`, `info`, `debug`)                    |
| `LOG_TO_FILE`         | `false`  | Force file logging (overrides environment-based defaults)               |
| `LOG_DIR`             | `./logs` | Directory for log files (used in production or when `LOG_TO_FILE=true`) |
| `DISABLE_PRETTY_LOGS` | `false`  | Disable pretty-printing in development mode                             |
| `DEBUG`               | -        | Enable debug output for specific components (e.g., `mcp:*`)             |

### Security Features

The logging system automatically redacts sensitive information:

#### Automatically Redacted Fields

- `password`, `token`, `access_token`, `refresh_token`
- `authorization`, `auth`, `secret`, `key`, `client_secret`, `bearer`
- HTTP headers: `authorization`, `cookie`, `set-cookie`
- OAuth fields: `oauth.client_secret`, `oauth.access_token`, `oauth.refresh_token`
- Request/response bodies: `body.password`, `body.token`, `body.secret`

Redacted fields show `***REDACTED***` instead of actual values.

### Component-Based Logging

The system supports child loggers for component-specific logging:

```typescript
import { createChildLogger } from '@/utils/logger.js';

// Create a component-specific logger
const logger = createChildLogger({ component: 'oauth', operation: 'token-refresh' });

// Log with automatic context
logger.info('Token refreshed successfully');
// Output: {"level":30,"time":1234567890,"component":"oauth","operation":"token-refresh","msg":"Token refreshed successfully"}
```

### Development vs Production Examples

#### Development Output

```
15:30:45 INFO (oauth): Starting OAuth authentication flow
15:30:46 DEBUG (oauth): Discovering endpoints from https://example.com/.well-known/oauth-authorization-server
15:30:47 INFO (oauth): ✓ OAuth endpoints discovered successfully (120ms)
```

#### Production Output

```json
{"level":30,"time":1625140245000,"component":"oauth","msg":"Starting OAuth authentication flow"}
{"level":20,"time":1625140246000,"component":"oauth","msg":"Discovering endpoints from https://example.com/.well-known/oauth-authorization-server"}
{"level":30,"time":1625140247000,"component":"oauth","discoveryTime":120,"msg":"✓ OAuth endpoints discovered successfully"}
```

### Accessing Production Logs

In production environments, logs are written to files:

```bash
# View all application logs
tail -f ./logs/app.log

# View error logs only
tail -f ./logs/error.log

# Search for specific components
grep "oauth" ./logs/app.log | jq '.'

# Monitor log levels
jq 'select(.level >= 40)' ./logs/app.log  # Errors only
```

### Integration with Monitoring

The structured JSON format integrates seamlessly with log aggregation systems:

- **ELK Stack**: Direct JSON ingestion
- **Splunk**: Automatic field extraction
- **CloudWatch**: JSON log parsing
- **Grafana Loki**: Label-based querying

Example log aggregation query:

```
{component="oauth"} |= "error" | json
```

## 🧪 Testing Strategy

The project uses a comprehensive testing approach designed for reliability and efficiency:

### Test Types

#### Unit Tests (`npm run test:unit`)

- **Purpose**: Test business logic in isolation with mocked dependencies
- **Location**: `src/**/*.test.ts`
- **Focus**: Configuration, OAuth discovery logic, validation, and core application functions
- **Speed**: Fast execution (~4 seconds)

#### Integration Tests (`npm run test:integration`)

- **Purpose**: Test real interactions with external systems
- **Location**: `tests/integration/**/*.test.ts`
- **Focus**: OAuth flows, MCP server functionality, real HTTP requests, and end-to-end workflows
- **Speed**: Moderate execution (~85 seconds)

### Quick Testing Commands

```bash
# Run all tests
npm test

# Fast feedback loop (unit tests only)
npm run test:unit

# Test real integrations
npm run test:integration

# Generate coverage reports
npm run test:unit:coverage
npm run test:integration:coverage

# Watch mode for development
npm run test:unit:watch
npm run test:integration:watch
```

### Test Guidelines

For detailed testing guidelines and best practices, see
[TESTING_GUIDELINES.md](.ai/task-manager/plans/09--test-suite-optimization/TESTING_GUIDELINES.md).

**Key Principles:**

- Unit tests focus on business logic with mocked dependencies
- Integration tests use real HTTP servers and external services
- No testing of upstream dependencies (Node.js built-ins, external libraries)
- Clear separation between unit and integration test responsibilities
