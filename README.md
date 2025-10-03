# Minimal Drupal MCP Server

> **336 lines vs 6000 lines** - A radically simplified Model Context Protocol server for Drupal
> integration

## 🎯 **The Transformation**

This MCP server was **dramatically simplified** based on research of MCP TypeScript implementations:

- **Before**: 5,955 lines across 25+ files
- **After**: 336 lines in 1 file
- **Reduction**: 94% smaller code
- **Functionality**: Identical features

## ✨ Features

- 🔐 **OAuth 2.1 Authentication** - Simple token-based auth with Drupal
- 📚 **Content Access** - Search tutorials, load/create nodes
- 🚀 **MCP Standard** - Follows official MCP patterns
- 📦 **Minimal Dependencies** - Only MCP SDK required
- 🎯 **Zero Bloat** - No custom error handling, logging, or validation

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Drupal site with OAuth 2.0 configured

### Installation

```bash
npm install @e0ipso/drupal-bridge-mcp
```

### Configuration

Create a `.env` file:

```env
DRUPAL_BASE_URL=https://drupalize.me
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret  # Optional for public clients
```

### Usage

```bash
# Run directly
npx drupal-bridge-mcp

# Or install globally
npm install -g @e0ipso/drupal-bridge-mcp
drupal-bridge-mcp
```

## 🛠️ Available Tools

### `search_tutorials`

Search Drupal tutorials and educational content

```json
{
  "keywords": "views",
  "types": ["tutorial", "course"],
  "drupal_version": ["10", "11"],
  "limit": 10
}
```

### `load_node`

Load a Drupal node by ID

```json
{
  "nodeId": "12345"
}
```

### `create_node`

Create a new Drupal node

```json
{
  "type": "article",
  "title": "My New Article",
  "body": "Article content...",
  "status": true
}
```

### `test_connection`

Test connection to Drupal server

```json
{}
```

## 📊 Implementation Comparison

| Aspect             | Before                    | After                |
| ------------------ | ------------------------- | -------------------- |
| **Lines of Code**  | 5,955                     | 336                  |
| **Files**          | 25+                       | 1                    |
| **Dependencies**   | 20+ packages              | 1 package            |
| **Error Handling** | Custom 500-line system    | MCP SDK built-in     |
| **Validation**     | Custom 300-line framework | MCP SDK schemas      |
| **Logging**        | Complex Pino system       | Simple console.error |
| **Authentication** | 1,500-line OAuth system   | 50-line OAuth client |
| **Configuration**  | 200-line env parser       | Direct env access    |

## 🏗️ Architecture

The minimal server consists of just 3 classes:

```typescript
// 1. Simple OAuth Client (~50 lines)
class SimpleOAuth {
  async getToken(): Promise<string>; // Token management
}

// 2. Drupal JSON-RPC Client (~80 lines)
class DrupalClient {
  async searchTutorials(params): Promise<any>;
  async loadNode(id): Promise<any>;
  async createNode(params): Promise<any>;
  async testConnection(): Promise<boolean>;
}

// 3. MCP Server (~200 lines)
class MinimalDrupalMcpServer {
  // Tool registration and handling using MCP SDK
}
```

<details>
<summary>
<strong>🐛 Debug Logging</strong>
</summary>

The server includes detailed request/response logging using the `debug` package. Enable debug output
by setting the `DEBUG` environment variable:

```bash
# All debug output
DEBUG=mcp:* npm start

# Only incoming MCP requests
DEBUG=mcp:request:in npm start

# Only outgoing requests to Drupal
DEBUG=mcp:request:out npm start

# Or run in development mode
DEBUG=mcp:* npm run dev
```

**Debug Namespaces:**

- `mcp:bootstrap` - Server startup and tool discovery
- `mcp:request:in` - Incoming MCP requests (method, path, headers, session ID, body)
- `mcp:request:out` - Outgoing requests to Drupal (URL, headers, body, response)

**Note:** Authorization tokens are automatically redacted in debug output for security.

</details>

## 🔄 Session Management & Reconnection

The server implements a robust session management system that enables clients (like MCP Inspector)
to reconnect without re-authentication.

### Architecture

**User-Level Token Storage**: Tokens are stored by user ID (extracted from JWT), not by transport
session ID:

```typescript
Map<userId, tokens>; // Persistent user-level tokens
Map<sessionId, userId>; // Ephemeral session-to-user mapping
```

### Session Lifecycle

1. **Authentication**: User authenticates → JWT decoded → userId extracted → tokens stored
2. **Session Close**: Transport disconnects → session mapping removed → **tokens preserved**
3. **Reconnection**: New session ID → same userId from JWT → existing tokens reused
4. **Explicit Logout**: User logout → tokens removed from storage

**Key Distinction**: Session close ≠ Logout

- Disconnecting preserves your authentication
- Only explicit logout removes tokens

### Debug Endpoints

Monitor session state during development:

**Health Check** - Shows active users and sessions:

```bash
curl http://localhost:3000/health
```

**Debug Sessions** - Detailed session mappings:

```bash
curl http://localhost:3000/debug/sessions
```

### Troubleshooting

**Problem**: Tool calls return 403 after reconnection **Solution**: Check if tokens persisted across
reconnection:

1. Call `/health` to see activeUsers count
2. Call `/debug/sessions` to verify session → user mapping
3. Check server logs for "Token lookup failed" messages

**Problem**: Multiple reconnections create duplicate users **Solution**: This should not happen -
JWT extraction ensures same userId reused. If seeing this:

1. Verify JWT contains valid `sub`, `user_id`, or `uid` claim
2. Check logs for "User reconnecting - reusing existing tokens"

## 🎓 Key Learnings

### What MCP SDK Provides (That We Were Building Custom):

- ✅ **JSON-RPC Transport** - Built-in STDIO transport
- ✅ **Error Handling** - Automatic JSON-RPC error responses
- ✅ **Input Validation** - Works seamlessly with JSON schemas
- ✅ **Type Safety** - Full TypeScript support
- ✅ **Tool Registration** - Simple handler pattern

### OAuth Simplified:

- ✅ **OAuth Required** - Drupal headless APIs need authentication
- ❌ **Complex Discovery** - Simple client_credentials flow sufficient
- ❌ **PKCE/Stateless** - Unnecessary complexity for MCP servers

## 📋 Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build

# Type check
npm run type-check
```

## 📂 Backup

The original 6000-line implementation is preserved in `/backup/` for reference, demonstrating how
enterprise-level complexity can emerge when simple patterns would suffice.

## 📄 License

Proprietary

## 👨‍💻 Author

Mateu Aguil� Bosch (e0ipso) <mateu@mateuaguilo.com>
