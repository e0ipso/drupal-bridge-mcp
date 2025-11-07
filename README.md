# Drupal Bridge MCP Server

## 🚀 Quick Start

## 🛠️ Available Tools
MCP tools are auto-discovered from the Drupal site. Just create the tools using [JSON-RPC MCP](https://github.com/e0ipso/jsonrpc_mcp).

### How It Works

1. Server fetches tool definitions from `/mcp/tools/list`
2. Extracts required OAuth scopes from each tool's `annotations.auth.scopes`

This eliminates manual scope configuration and automatically adapts to backend tool changes.

### Automatic Scope Discovery

Scopes are extracted from tool metadata:

```json
{
  "name": "examples.contentTypes.create",
  "annotations": {
    "auth": {
      "scopes": ["content_type:write"],
      "level": "required"
    }
  }
}
```

The server automatically requests the `content_type:write` scope during OAuth flow.

### Tool Access Validation

Before invoking a tool, the server validates:

1. **Authentication** - Tool requires auth and session is authenticated
2. **Scopes** - Session has all required OAuth scopes
3. **Permissions** - Drupal validates permissions server-side

**Error example:**

```
Insufficient OAuth scopes for tool "examples.contentTypes.create".
Required: content_type:write
Missing: content_type:write
Current: profile, content_type:read
```

### Authentication Levels

Tools can declare three authentication levels:

- **`none`**: Public tools, no authentication required
- **`optional`**: Enhanced functionality with auth, but works without
- **`required`**: Enforces authentication and scope validation

If a tool doesn't declare `annotations.auth`, it defaults to `level='none'` (public access).

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

Use the great [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector) project to validate the MCP server changes.

```bash
npx @modelcontextprotocol/inspector
```

## 📄 License

[MIT](LICENSE.md)

## 👨‍💻 Author

Mateu Aguiló Bosch (e0ipso) <mateu@mateuaguilo.com>
