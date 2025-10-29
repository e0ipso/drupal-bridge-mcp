---
id: 3
group: 'jsonrpc-migration'
dependencies: [1, 2]
status: 'pending'
created: 2025-10-28
skills:
  - jest
  - technical-writing
---

# Update Tests and Documentation for JSON-RPC Migration

## Objective

Update existing test mocks to use JSON-RPC 2.0 format, add integration tests for GET/POST methods,
and document the migration in project documentation.

## Skills Required

- **jest**: Update test mocks and add new test cases
- **technical-writing**: Document environment variables and migration guide

## Acceptance Criteria

- [ ] All test mocks updated from old `/mcp/tools/invoke` format to JSON-RPC 2.0
- [ ] Unit tests cover both GET and POST request methods
- [ ] Unit tests validate URL encoding for GET requests
- [ ] Unit tests verify error code mapping
- [ ] Environment variables documented in `.env.example`
- [ ] Migration guide added to `AGENTS.md` under "Common Workflows"
- [ ] Test coverage maintains >80% threshold

## Technical Requirements

<details>
<summary>Implementation Details</summary>

### Test Updates Required

**Meaningful Test Strategy Guidelines**

Your critical mantra for test generation is: "write a few tests, mostly integration".

**Definition of "Meaningful Tests":** Tests that verify custom business logic, critical paths, and
edge cases specific to the application. Focus on testing YOUR code, not the framework or library
functionality.

**When TO Write Tests:**

- Custom business logic and algorithms
- Critical user workflows and data transformations
- Edge cases and error conditions for core functionality
- Integration points between different system components
- Complex validation logic or calculations

**When NOT to Write Tests:**

- Third-party library functionality (already tested upstream)
- Framework features (React hooks, Express middleware, etc.)
- Simple CRUD operations without custom logic
- Getter/setter methods or basic property access
- Configuration files or static data
- Obvious functionality that would break immediately if incorrect

**Test Task Creation Rules:**

- Combine related test scenarios into single tasks (e.g., "Test user authentication flow" not
  separate tasks for login, logout, validation)
- Focus on integration and critical path testing over unit test coverage
- Avoid creating separate tasks for testing each CRUD operation individually
- Question whether simple functions need dedicated test tasks

#### 1. Mock Response Updates

Update all fetch mocks in test files to return JSON-RPC 2.0 format:

```typescript
// Old format (remove)
{ name: "tool", arguments: {} }

// New format (use)
{ jsonrpc: "2.0", result: [...], id: "..." }
```

#### 2. Request Format Tests

Add tests verifying:

- JSON-RPC request structure (`jsonrpc`, `method`, `params`, `id` fields)
- GET request URL encoding
- POST request body format
- UUID generation for request IDs

#### 3. Response Parsing Tests

Test scenarios:

- Valid success response → extracts `result`
- Valid error response → throws McpError with mapped code
- Invalid JSON → parse error handling
- Missing required fields → validation error

#### 4. Error Mapping Tests

Verify each JSON-RPC error code maps correctly:

- -32700 → ParseError
- -32600 → InvalidRequest
- -32601 → MethodNotFound
- -32602 → InvalidParams
- -32603 → InternalError

#### 5. Integration Tests

If feasible, add integration test using real Drupal instance:

- Test GET request with actual `/jsonrpc` endpoint
- Test OAuth token in Authorization header
- Verify end-to-end tool invocation

### Documentation Updates

#### `.env.example`

Add:

```bash
# JSON-RPC Endpoint Configuration
# Method for JSON-RPC requests (GET recommended for CDN caching)
DRUPAL_JSONRPC_METHOD=GET  # GET | POST

# JSON-RPC endpoint path
DRUPAL_JSONRPC_ENDPOINT=/jsonrpc  # Use /mcp/tools/invoke for backward compatibility
```

#### `AGENTS.md` - Common Workflows Section

Add new section:

````markdown
### Migrating to Standard JSON-RPC Endpoint

**Why**: The standard `/jsonrpc` endpoint has built-in OAuth2 support without requiring routing
modifications.

**Migration steps**:

1. Ensure Drupal site has `jsonrpc` module 3.0.0+ installed
2. Update MCP server environment variables:
   - Remove `DRUPAL_JSONRPC_ENDPOINT=/mcp/tools/invoke` (if set)
   - Set `DRUPAL_JSONRPC_METHOD=GET` (default, recommended)
3. Restart MCP server
4. Verify tools work via MCP Inspector

**Backward compatibility**: To use old endpoint, set:

```bash
DRUPAL_JSONRPC_ENDPOINT=/mcp/tools/invoke
```
````

**GET vs POST**: GET is default for CDN caching. Automatic fallback to POST occurs when URL exceeds
2000 characters.

```

#### Architecture Documentation Updates
Update `AGENTS.md` "Tool Discovery Flow" section to clarify:
- Discovery: `/mcp/tools/list` (unchanged)
- Invocation: `/jsonrpc` (new standard, was `/mcp/tools/invoke`)

</details>

## Input Dependencies
- Task 1: Request builder implementation
- Task 2: Response parser implementation
- Existing test suite structure

## Output Artifacts
- Updated test files with JSON-RPC 2.0 mocks
- New test cases for GET/POST methods
- Updated `.env.example`
- Migration guide in `AGENTS.md`

## Implementation Notes
Focus on meaningful tests that verify the custom request/response transformation logic, not the underlying fetch or URL encoding libraries. Use the existing Jest configuration and test patterns. The migration guide should be concise and actionable, targeting developers deploying new instances.
```
