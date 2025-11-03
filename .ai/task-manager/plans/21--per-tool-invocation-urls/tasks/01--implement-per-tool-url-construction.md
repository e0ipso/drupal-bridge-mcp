---
id: 1
group: 'url-construction'
dependencies: []
status: 'completed'
created: '2025-11-03'
completed: '2025-11-03'
skills:
  - typescript
  - http
---

# Implement Per-Tool URL Construction

## Objective

Modify the tool invocation logic in `src/index.ts` to construct per-tool URLs following the pattern
`/mcp/tools/{tool_name}` instead of using a centralized configurable endpoint.

## Skills Required

- **typescript**: Modify type-safe code in strict mode with ES modules
- **http**: Understanding of URL construction and request handling

## Acceptance Criteria

- [x] URL construction changed from centralized endpoint to per-tool pattern
- [x] `DRUPAL_JSONRPC_ENDPOINT` environment variable no longer used in code
- [x] JSON-RPC request format remains unchanged (method field still includes tool name)
- [x] GET/POST method selection logic continues to work correctly
- [x] TypeScript compilation succeeds with `npm run type-check`
- [x] Error messages reference tool-specific URLs for clarity

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand detailed implementation requirements</summary>

### File to Modify

- `src/index.ts` (approximately lines 516-560)

### Current Implementation Pattern

```typescript
const endpoint = process.env.DRUPAL_JSONRPC_ENDPOINT || '/jsonrpc';
const baseUrl = `${process.env.DRUPAL_BASE_URL}${endpoint}`;
```

### Target Implementation Pattern

```typescript
const toolEndpoint = `/mcp/tools/${toolName}`;
const baseUrl = `${process.env.DRUPAL_BASE_URL}${toolEndpoint}`;
```

### Key Implementation Points

1. **URL Construction**:
   - Tool name is available from the `CallToolRequestSchema` handler context
   - No URL encoding needed (A2A spec constrains tool names to safe characters: alphanumeric, dots,
     underscores)
   - Base URL construction happens per-request (already the case)

2. **JSON-RPC Format Preservation**:
   - DO NOT modify the JSON-RPC request construction logic (lines ~505-513)
   - The `method` field should still be set to the tool name
   - The request structure remains:
     `{ jsonrpc: "2.0", id: "uuid", method: "tool_name", params: {...} }`

3. **GET/POST Handling**:
   - Existing logic for GET (URL-encoded query parameter) should work unchanged
   - Existing logic for POST (JSON body) should work unchanged
   - Automatic POST fallback when URL > 2000 characters should work unchanged
   - The URL length calculation will inherently account for tool-specific paths

4. **Error Messages**:
   - Update any error logging or debugging messages that reference the endpoint URL
   - Example: `debugRequestOut(\`${requestMethod} ${url}\`)` will automatically show the new
     per-tool URL

5. **TypeScript Considerations**:
   - Use strict ES module imports with `.js` extensions
   - Ensure type safety is maintained
   - Follow existing code patterns and formatting

### Code Location Reference

Look for the tool invocation handler, likely within `registerDynamicTools` callback or similar
function that handles `CallToolRequestSchema` requests. The `toolName` variable should already be
available in this context from `request.params.name`.

### Testing During Implementation

- Run `npm run type-check` after changes
- Verify no TypeScript errors
- Check that `DRUPAL_JSONRPC_ENDPOINT` references are removed
- Confirm error messages are updated

</details>

## Input Dependencies

None - this is the first implementation task.

## Output Artifacts

- Modified `src/index.ts` with per-tool URL construction
- Removal of `DRUPAL_JSONRPC_ENDPOINT` usage from codebase

## Implementation Notes

The tool name is already available in the invocation context (passed via `request.params.name` in
the `CallToolRequestSchema` handler). Tool names are validated during discovery to be non-empty
strings following JSON-RPC method naming conventions (alphanumeric + dots/underscores), so they are
safe to use directly in URL paths without encoding.

The existing GET/POST method selection logic should work without modification since it operates on
the constructed `baseUrl`. The automatic POST fallback mechanism will correctly account for the
slightly longer per-tool URLs.
