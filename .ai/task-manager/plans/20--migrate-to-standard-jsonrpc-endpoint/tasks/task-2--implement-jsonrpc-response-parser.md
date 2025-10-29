---
id: 2
group: 'jsonrpc-migration'
dependencies: [1]
status: 'pending'
created: 2025-10-28
skills:
  - typescript
  - zod
---

# Implement JSON-RPC 2.0 Response Parser and Error Mapper

## Objective

Parse JSON-RPC 2.0 responses, validate structure using Zod schemas, and map JSON-RPC error codes to
MCP error types.

## Skills Required

- **typescript**: Core implementation language
- **zod**: Schema validation for response structure

## Acceptance Criteria

- [ ] Zod schema validates JSON-RPC 2.0 response structure
- [ ] Success responses extract `result` field correctly
- [ ] Error responses are detected and parsed from `error` field
- [ ] JSON-RPC error codes map to appropriate MCP error types
- [ ] Response ID validation matches request ID
- [ ] Clear error messages for common failure scenarios

## Technical Requirements

<details>
<summary>Implementation Details</summary>

### Location

Modify `src/index.ts`, specifically the `makeRequest()` method (lines 338-385)

### JSON-RPC 2.0 Response Schemas

Success response:

```typescript
const JsonRpcSuccessResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  result: z.unknown(),
  id: z.string(),
});
```

Error response:

```typescript
const JsonRpcErrorResponseSchema = z.object({
  jsonrpc: z.literal('2.0'),
  error: z.object({
    code: z.number(),
    message: z.string(),
    data: z.unknown().optional(),
  }),
  id: z.string().nullable(),
});
```

### Error Code Mapping

Map standard JSON-RPC error codes to MCP error types:

```typescript
const errorCodeMap: Record<number, ErrorCode> = {
  [-32700]: ErrorCode.ParseError, // Parse error
  [-32600]: ErrorCode.InvalidRequest, // Invalid Request
  [-32601]: ErrorCode.MethodNotFound, // Method not found
  [-32602]: ErrorCode.InvalidParams, // Invalid params
  [-32603]: ErrorCode.InternalError, // Internal error
};
```

Use `ErrorCode.InternalError` as default for unknown error codes.

### Response Validation

1. Parse JSON response
2. Validate against Zod schemas
3. Check for `error` field first
4. If error exists, map code and throw McpError
5. If success, extract `result` field
6. Optionally validate response ID matches request ID

### Integration with Existing Code

The `makeRequest()` method currently expects a specific response format. Update it to:

1. Parse JSON-RPC response
2. Validate structure
3. Extract result or error
4. Return in the format expected by calling code

</details>

## Input Dependencies

- Task 1: JSON-RPC request format (for ID correlation)
- Existing Zod schemas in codebase
- Current error handling patterns

## Output Artifacts

- Modified `makeRequest()` method with JSON-RPC 2.0 parsing
- Zod schemas for response validation
- Error mapping utilities

## Implementation Notes

Follow existing Zod validation patterns from `src/drupal/connector.ts`. The error mapping should
provide helpful messages that distinguish between client errors (invalid params) and server errors
(internal errors). Consider logging response validation failures for debugging during the migration
period.
