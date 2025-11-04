# AGENTS.md

## AI Task Manager

This project uses the [AI Task Manager](https://mateuaguilo.com/ai-task-manager)

- **Archived tasks**: `.ai/task-manager/archive/` - Completed feature implementations
- **Planned tasks**: `.ai/task-manager/plans/` - Upcoming features/fixes
- **Slash commands**: `/tasks:create-plan`, `/tasks:generate-tasks`, `/tasks:execute-task`,
  `/tasks:fix-broken-tests`

Note: Not all changes use Task Manager - check git history for complete picture.

## Project Overview

This is a **Model Context Protocol (MCP) server** that bridges Claude AI with Drupal CMS via OAuth
2.1 authentication. It implements dynamic tool discovery using the emerging A2A (agent-to-agent)
protocol standard, allowing Claude to interact with Drupal content through discovered tools.

**Key architecture**: HTTP-based MCP server with per-session Server+Transport instances, OAuth
device flow authentication, and dynamic tool registration from Drupal's `/mcp/tools/list` endpoint.

## Development Commands

### Build and Run

- `npm run build` - Compile TypeScript to dist/
- `npm run dev` - Run in development mode with auto-reload (uses tsx)
- `npm start` - Run production build from dist/
- `npm run start:debug` - Run with DEBUG=mcp:\* logging enabled

### Testing

- `npm test` - Run Jest unit tests
- `npm run type-check` - TypeScript type checking without emitting
- `npm run manual:oauth` - Manual OAuth flow test script (interactive, requires .env.test)

### Environment Configuration

- Copy `.env.example` to `.env` for local development
- Required variables: `DRUPAL_BASE_URL`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`
- Set `AUTH_ENABLED=true` to enable OAuth (default: true)
- Set `OAUTH_FORCE_DEVICE_FLOW=true` for headless OAuth flow
- `LOG_LEVEL` controls pino logging verbosity (default: info)

## Architecture Overview

### Core Components

1. **MCP Server** (`src/index.ts`)
   - Entry point: `DrupalMCPHttpServer` class
   - Creates per-session Server+Transport instances (Map<sessionId, {server, transport}>)
   - Handles session lifecycle: creation, token extraction, cleanup
   - Routes requests to correct transport based on `mcp-session-id` header

2. **OAuth Authentication** (`src/oauth/`)
   - Device Flow: Headless OAuth 2.1 using RFC 8628 device authorization grant
   - `device-flow.ts`: Main orchestrator with retry logic
   - `device-flow-handler.ts`: Initiates device authorization
   - `device-token-poller.ts`: Polls token endpoint
   - `device-flow-ui.ts`: Console UI for user instructions
   - `jwt-decoder.ts`: Extracts user ID from JWT access tokens
   - Token storage: User-level persistence (`userTokens` map) + session-level mapping
     (`sessionToUser` map)

3. **Tool Discovery** (`src/discovery/`)
   - `tool-discovery.ts`: Fetches tools from `/mcp/tools/list` at startup
   - `dynamic-handlers.ts`: Registers CallToolRequest handlers for discovered tools
   - `tool-cache.ts`: In-memory tool definition storage
   - Tool invocation: Uses per-tool URLs (`/mcp/tools/{tool_name}`)

4. **Drupal Connector** (`src/drupal/connector.ts`)
   - JSON-RPC 2.0 client for Drupal communication
   - Stateless design: OAuth token passed per-request
   - Zod schema validation for all responses
   - HTTP error → MCP error code mapping

5. **Logging** (`src/utils/logger.ts`)
   - Pino structured logging with pino-http middleware
   - Request serialization with header/body masking
   - Debug namespaces: `mcp:request:in`, `mcp:request:out`, `mcp:oauth`

### Session Lifecycle

**Creation** → Client sends initialize without session ID → Server generates UUID → Server+Transport
pair created → Stored in `transports` map

**Authentication** → Authorization header extracted → JWT decoded to userId → Token stored in
`userTokens` map → Session mapped to user in `sessionToUser` map

**Reconnection** → Same user, new session → Existing tokens reused → New session mapped to same
userId

**Cleanup** → `onsessionclosed` callback → Transport closed → Server closed → Session removed from
all maps → **User tokens persist** for reconnection

### Tool Discovery Flow

1. **Discovery**: Server startup calls `getDiscoveredTools(DRUPAL_BASE_URL)`
2. Fetches `/mcp/tools/list` (5-second timeout)
3. Validates tool definitions (name, description, inputSchema required)
4. Normalizes Drupal quirks (empty array → empty object for properties)
5. Stores in `discoveredToolDefinitions` array
6. Each new session registers dynamic handlers via `registerDynamicTools()`
7. **Invocation**: Tools execute via standard `/jsonrpc` endpoint using JSON-RPC 2.0 protocol

### OAuth Device Flow

1. Detect headless environment (no DISPLAY, SSH_CONNECTION, or OAUTH_FORCE_DEVICE_FLOW=true)
2. POST to `device_authorization_endpoint` with client credentials
3. Display user_code and verification_uri in console (with QR code if possible)
4. Poll `token_endpoint` with device_code (respects interval, max 5 minutes)
5. Extract userId from JWT, store tokens by userId
6. Map session to userId

## Code Patterns

### TypeScript Configuration

- **Strict mode enabled**: All strict compiler options active
- **ES Modules**: Uses `"type": "module"` with .js extensions in imports
- **Path aliases**: `@/*` maps to `src/*` (configured in tsconfig.json)
- **Import extensions**: Always use `.js` in imports (TypeScript quirk for ESM)

### Testing

- **Framework**: Jest with ts-jest preset for ESM
- **Test locations**: `src/**/__tests__/**/*.test.ts`, `src/**/*.test.ts`
- **Mock strategy**: Use `jest.mock()` for external dependencies (fetch, OAuth endpoints)
- **Coverage**: 80% threshold for branches/functions/lines/statements
- **Timeout**: 5-second default test timeout

### Environment Detection

- **Headless**: Check `!process.env.DISPLAY || process.env.SSH_CONNECTION`
- **Test environment**: `NODE_ENV=test` or `process.env.NODE_ENV === 'test'`
- **Debug logging**: Use `debug` package with namespace pattern `mcp:*`

### Error Handling

- **MCP errors**: Throw `McpError` with appropriate `ErrorCode` (InvalidParams, InvalidRequest,
  InternalError)
- **HTTP errors**: Map status codes to MCP errors (401→InvalidParams, 403→InvalidParams,
  404→InvalidRequest)
- **Validation errors**: Use Zod `.parse()` and catch `ZodError` for structured validation
- **Token redaction**: Always use `redactToken()` helper for logging (shows last 6 chars)

## Common Workflows

### Adding a New Tool

1. Implement tool in Drupal backend at `/mcp/tools/list`
2. Restart MCP server to re-discover tools
3. Tool automatically registered via dynamic handlers
4. No code changes needed in this codebase

### Debugging OAuth Issues

1. Enable debug logging: `DEBUG=mcp:oauth npm run dev`
2. Check token extraction: `DEBUG=mcp:* npm run dev`
3. Verify JWT structure: Inspect logs for `extractUserId()` calls
4. Check session/user mappings: Visit `/debug/sessions` endpoint
5. Manual OAuth test: `npm run manual:oauth`

### Running Single Test

```bash
npx jest src/path/to/file.test.ts
```

### Tool Invocation Method

**Architecture**: The MCP server uses per-tool URLs for tool invocation, where each tool is accessed
at its own endpoint: `/mcp/tools/{tool_name}`. This architecture provides better routing control and
clearer endpoint management.

**HTTP Method Configuration**:

Set `DRUPAL_JSONRPC_METHOD` to control the HTTP method for tool invocation:

- `GET` (default): URL-encoded query parameters (CDN-friendly, automatic POST fallback if URL > 2000
  chars)
- `POST`: JSON body

**GET vs POST**: GET is the default for CDN-friendly caching. The server automatically falls back to
POST when the URL exceeds 2000 characters to avoid URL length limitations.

### Type Checking

Always run before committing:

```bash
npm run type-check
```

## Important Constraints

- **OAuth tokens persist by userId**: Never clear `userTokens` on session close (enables
  reconnection)
- **Session data is ephemeral**: `sessionToUser` and `sessionCapabilities` cleared on session close
- **Tool discovery is blocking**: Server exits if `/mcp/tools/list` fails or returns 0 tools
- **Per-session isolation**: Each session gets dedicated Server+Transport instances
- **No browser OAuth yet**: Device flow only (browser flow throws NotImplemented error)

## References

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [A2A Protocol](https://www.devturtleblog.com/agentic-a2a-framework-mcp/)
- [OAuth Device Flow (RFC 8628)](https://datatracker.ietf.org/doc/html/rfc8628)
- [Drupal MCP Backend](https://github.com/e0ipso/jsonrpc_mcp)
