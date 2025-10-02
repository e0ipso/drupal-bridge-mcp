# Legacy Static Tools

This directory contains the original static tool implementations. These are **no longer used** by
the MCP server, which now uses dynamic tool discovery from `/mcp/tools/list`.

Kept for reference and documentation purposes.

## Migration

Tools are now:

- Discovered from Drupal `/mcp/tools/list` endpoint
- Registered dynamically via `src/discovery/dynamic-handlers.ts`
- Validated with JSON Schema to Zod conversion
- Proxied to Drupal JSON-RPC endpoints

See `src/discovery/` for current implementation.
