---
id: 1
group: 'jsonrpc-migration'
dependencies: []
status: 'completed'
created: 2025-10-28
skills:
  - typescript
  - jsonrpc
---

# Implement JSON-RPC 2.0 Request Builder

## Objective

Create a request builder that transforms MCP tool invocation format to standard JSON-RPC 2.0 format
with support for both GET and POST methods.

## Skills Required

- **typescript**: Core implementation language
- **jsonrpc**: JSON-RPC 2.0 protocol specification knowledge

## Acceptance Criteria

- [ ] Function generates valid JSON-RPC 2.0 request objects with all required fields
- [ ] Request format transforms correctly: `name` → `method`, `arguments` → `params`
- [ ] Unique request IDs are generated using UUID v4
- [ ] GET method generates URL-encoded query parameters
- [ ] POST method generates proper JSON body
- [ ] Configuration supports method selection via `DRUPAL_JSONRPC_METHOD` env var
- [ ] Default endpoint changes from `/mcp/tools/invoke` to `/jsonrpc`
- [ ] `DRUPAL_JSONRPC_ENDPOINT` env var allows override for backward compatibility

## Technical Requirements

<details>
<summary>Implementation Details</summary>

### Location

Modify `src/index.ts`, specifically the `performRequest()` method (lines 395-443)

### JSON-RPC 2.0 Request Format

```typescript
interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string; // Tool name (e.g., "examples.contentTypes.list")
  params: Record<string, unknown>; // Tool arguments
  id: string; // UUID v4 for uniqueness
}
```

### GET Request Construction

For GET requests:

1. Create JSON-RPC request object
2. Serialize to JSON string
3. URL-encode using `encodeURIComponent()`
4. Append as `?query=<encoded>` parameter
5. Example: `GET /jsonrpc?query=%7B%22jsonrpc%22%3A%222.0%22...`

### POST Request Construction

For POST requests:

1. Create JSON-RPC request object
2. Serialize to JSON
3. Include in request body
4. Set `Content-Type: application/json`

### Environment Variables

Add to `.env.example`:

```bash
# JSON-RPC endpoint configuration
DRUPAL_JSONRPC_METHOD=GET  # GET (default, CDN-friendly) | POST (fallback)
DRUPAL_JSONRPC_ENDPOINT=/jsonrpc  # Standard endpoint (was /mcp/tools/invoke)
```

### URL Length Handling

Implement automatic fallback: if GET URL exceeds 2000 characters, use POST instead. Log when
fallback occurs.

### UUID Generation

Use Node.js built-in `crypto.randomUUID()` for request IDs (available in Node 18+).

</details>

## Input Dependencies

- Current `performRequest()` implementation
- Existing environment configuration system

## Output Artifacts

- Modified `performRequest()` method supporting JSON-RPC 2.0 format
- New environment variables for configuration
- Request builder utility functions

## Implementation Notes

This task focuses solely on request construction. Response handling is in a separate task. Follow
the existing code patterns for environment variable handling. The implementation should maintain the
same function signature to minimize changes to calling code.
