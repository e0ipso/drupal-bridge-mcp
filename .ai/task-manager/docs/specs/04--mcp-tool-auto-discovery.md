# 04: MCP Tool Auto-Discovery

## Overview
Enable dynamic tool discovery and configuration from Drupal's `/mcp/tools/list` endpoint using TypeScript/Node.js, implementing the emerging community standard for agent-to-agent (A2A) tool integration. This allows the **MCP Server** to automatically learn and register available tools at startup without hardcoding tool definitions.

## User-Facing Features
- **Automatic Tool Availability**: New Drupal-side tools become immediately available to **MCP Clients** after server restart
- **Zero Manual Configuration**: No hardcoded tool definitions required in **MCP Server** code
- **Consistent Tool Signatures**: All tools follow standardized JSON Schema definitions with Zod validation
- **Real-time Updates**: Server restart discovers new or updated tools from Drupal backend
- **Graceful Degradation**: Falls back to minimal static core tools if discovery endpoint fails
- **Permission-Based Access**: Tool availability respects Drupal user permissions via OAuth

## Functional Capabilities
- **MCP Server** queries Drupal `/mcp/tools/list` endpoint at startup via HTTP
- Parse JSON tool definitions with JSON Schema format (Draft 7 compatible)
- Convert JSON Schema to Zod schemas dynamically for runtime type safety
- Register tool handlers with `@modelcontextprotocol/sdk` using `setRequestHandler`
- Validate tool invocation parameters against Zod schemas before execution
- Proxy validated requests to Drupal JSON-RPC endpoints with OAuth tokens
- Propagate authentication tokens with every tool call
- Handle discovery failures with static tool fallback strategy
- Log discovered tools for debugging and monitoring
- Cache tool definitions to reduce startup latency

## How It Works

1. **Startup Discovery**: **MCP Server** fetches `GET /mcp/tools/list` from Drupal backend during initialization
2. **Schema Parsing**: JSON tool definitions are parsed and validated for required fields (name, description, method)
3. **Zod Conversion**: JSON Schema `inputSchema` is converted to Zod validation schema
4. **Handler Registration**: Each tool gets a dynamic handler registered via `server.setRequestHandler(CallToolRequestSchema, ...)`
5. **Tool Listing**: **MCP Client** queries available tools via MCP protocol `tools/list` request
6. **Tool Invocation**: **MCP Client** calls tool → **MCP Server** validates with Zod → Drupal executes → **MCP Server** returns result
7. **Authentication Check**: OAuth tokens from session are validated and included in tool invocations to Drupal
8. **Error Handling**: Validation errors, authentication failures, and Drupal errors propagate with structured JSON-RPC messages
9. **Fallback Mode**: If discovery fails, **MCP Server** uses minimal static tool set for core operations

## Technical Stack Requirements

### Node.js/TypeScript Dependencies
- `@modelcontextprotocol/sdk` (v0.5.0+) - MCP server framework for tool registration
- `zod` (v3.22+) - Runtime schema validation and type checking
- `node-fetch` or native `fetch` - HTTP client for discovery endpoint requests
- `typescript` (v5.0+) - Type-safe implementation with strict mode
- `express` (v4.18+) - HTTP server framework (if not using MCP SDK transport)

### JSON Schema Support
- JSON Schema Draft 7 compatibility for tool definitions
- Support for `object`, `string`, `number`, `boolean`, `array` types
- Required field enforcement via `required` array
- Default value support for optional parameters
- Description metadata for parameter documentation

## Drupal Backend Requirements

### Discovery Endpoint
**URL**: `GET /mcp/tools/list`

**Authentication**: Optional - can require OAuth Bearer token for security

**Response Format**:
```json
{
  "tools": [
    {
      "name": "tool_name",
      "description": "Human-readable description of what the tool does",
      "inputSchema": {
        "type": "object",
        "properties": {
          "param1": {"type": "string", "description": "Parameter description"},
          "param2": {"type": "number", "default": 10, "description": "Optional with default"}
        },
        "required": ["param1"]
      },
      "endpoint": "/jsonrpc",
      "method": "namespace.method_name",
      "requiresAuth": true
    }
  ]
}
```

### Tool Execution Requirements
- Drupal must accept JSON-RPC calls at specified endpoints (typically `/jsonrpc`)
- Each tool maps to a JSON-RPC method (e.g., `tutorial.search`)
- Drupal must validate OAuth Bearer tokens before executing tool methods
- Drupal must enforce user permissions based on authenticated user
- Tool methods must return JSON-serializable data structures

### Security Requirements
- HTTPS required for discovery endpoint in production
- OAuth token validation before tool execution
- Rate limiting on discovery endpoint to prevent abuse
- CORS configuration to allow **MCP Server** origin

## Success Criteria

- **MCP Server** discovers 5+ tools from Drupal at startup (expandable to 100+)
- Zero hardcoded tool definitions in **MCP Server** code except minimal fallback set
- New Drupal tools available to **MCP Clients** within server restart time (<30 seconds)
- 100% of tool invocations validate against Zod schemas before backend execution
- Tool discovery failure triggers fallback mode with core `search_tutorial` and `get_tutorial` tools
- All tool calls include OAuth Bearer authentication tokens from session
- Discovery endpoint responds in <500ms for production deployments
- Tool registration overhead: <100ms per tool during server startup
- Invalid tool definitions are skipped with warning logs, not fatal errors
- Schema validation catches parameter type mismatches before Drupal receives request

## Relevant Resources

- **Community Standard**: [DevTurtle A2A Framework Article](https://www.devturtleblog.com/agentic-a2a-framework-mcp/)
- **MCP Protocol**: [MCP Specification](https://spec.modelcontextprotocol.io/)
- **Tool Concepts**: [MCP Tools Documentation](https://modelcontextprotocol.io/docs/concepts/tools)
- **TypeScript SDK**: [MCP SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk)
- **JSON Schema**: [JSON Schema Specification](https://json-schema.org/)
- **Zod Validation**: [Zod Documentation](https://zod.dev/)
