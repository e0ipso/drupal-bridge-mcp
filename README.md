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

# Optional
NODE_ENV=development
DEBUG=mcp:*
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
        "NODE_ENV": "development"
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
        "NODE_ENV": "development"
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
LOG_LEVEL=debug

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

| Command          | Description              |
| ---------------- | ------------------------ |
| `npm run dev`    | Start development server |
| `npm run build`  | Build for production     |
| `npm test`       | Run test suite           |
| `npm run lint`   | Lint code                |
| `npm run format` | Format code              |
