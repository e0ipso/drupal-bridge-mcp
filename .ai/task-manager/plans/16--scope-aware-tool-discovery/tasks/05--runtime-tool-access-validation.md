---
id: 5
group: 'runtime-validation'
dependencies: [1, 3]
status: 'pending'
created: '2025-10-19'
skills:
  - typescript
  - oauth
---

# Implement Runtime Tool Access Validation

## Objective

Add scope validation to dynamic tool handlers to enforce authentication and scope requirements
before tool invocation, with clear error messages for denied access.

## Skills Required

**typescript**: Async error handling and MCP error types **oauth**: Scope-based access control
implementation

## Acceptance Criteria

- [ ] `validateToolAccessForSession()` helper function implemented
- [ ] Validation integrated into tool invocation handler
- [ ] Auth level 'none' allows unrestricted access
- [ ] Auth level 'optional' allows access without authentication
- [ ] Auth level 'required' enforces authentication and scope validation
- [ ] `McpError` with `ErrorCode.InvalidRequest` thrown for auth failures
- [ ] Error messages include required/missing/current scopes
- [ ] TypeScript compilation passes with no errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File**: `src/discovery/dynamic-handlers.ts`

**Implementation Requirements:**

1. Import `getAuthLevel` and `validateToolAccess` from tool-discovery
2. Import `McpError` and `ErrorCode` from MCP SDK
3. Add `validateToolAccessForSession()` async function
4. Integrate validation at start of CallToolRequest handler
5. Use `oauthProvider.getTokenScopes(sessionId)` to get session scopes

**Error Handling:**

- Authentication errors → `McpError(ErrorCode.InvalidRequest, message)`
- Scope errors → `McpError(ErrorCode.InvalidRequest, message)`
- Include detailed scope information in error messages

## Input Dependencies

- Task 1: `getAuthLevel()` and `validateToolAccess()` functions
- Task 3: `oauthProvider.getTokenScopes()` method

## Output Artifacts

- Updated `src/discovery/dynamic-handlers.ts` with scope validation
- Runtime enforcement of tool access control
- Clear error messages guiding users to resolve auth issues

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Add Imports

At the top of `src/discovery/dynamic-handlers.ts`, add:

```typescript
import { getAuthLevel, validateToolAccess } from './tool-discovery.js';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
```

### Step 2: Implement validateToolAccessForSession()

Add this helper function before `registerDynamicTools()`:

```typescript
/**
 * Validates tool access for a session.
 *
 * @param tool - Tool definition
 * @param oauthProvider - OAuth provider instance (optional)
 * @param sessionId - Session identifier (optional)
 * @throws McpError if access is denied
 */
async function validateToolAccessForSession(
  tool: ToolDefinition,
  oauthProvider?: DrupalOAuthProvider,
  sessionId?: string
): Promise<void> {
  const authMetadata = tool.annotations?.auth;
  const authLevel = getAuthLevel(authMetadata);

  // Allow access if auth level is 'none'
  if (authLevel === 'none') {
    return;
  }

  // For 'optional' auth, allow access without provider/session
  if (authLevel === 'optional') {
    return;
  }

  // For 'required' auth, enforce authentication
  if (authLevel === 'required') {
    // Require OAuth provider and session
    if (!oauthProvider || !sessionId) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Tool "${tool.name}" requires authentication. Please authenticate first.`
      );
    }

    // Get session scopes
    const sessionScopes = await oauthProvider.getTokenScopes(sessionId);

    if (!sessionScopes || sessionScopes.length === 0) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        `Tool "${tool.name}" requires authentication. No valid session found.`
      );
    }

    // Validate scopes
    try {
      validateToolAccess(tool, sessionScopes);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        error instanceof Error ? error.message : 'Access denied'
      );
    }
  }
}
```

### Step 3: Update registerDynamicTools() Signature

The function needs access to `oauthProvider` and `sessionId`. Check the current signature and ensure
it includes:

```typescript
export function registerDynamicTools(
  server: Server,
  tools: ToolDefinition[],
  makeRequest: (toolName: string, params: unknown, token?: string) => Promise<unknown>,
  getSession: (sessionId: string) => Promise<Session | null>,
  localHandlers: Map<string, LocalToolHandler> = new Map(),
  oauthProvider?: DrupalOAuthProvider // May need to add this
): void;
```

### Step 4: Integrate Validation into Tool Handler

Update the CallToolRequest handler to validate access before execution:

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const toolName = request.params.name;
  const context = toolContexts.get(toolName);

  // Handle unknown tool
  if (!context && !localHandlers.has(toolName)) {
    const availableTools = Array.from(toolContexts.keys()).join(', ');
    throw new Error(`Unknown tool: "${toolName}". Available tools: ${availableTools}`);
  }

  // NEW: Validate tool access based on session scopes
  if (context) {
    await validateToolAccessForSession(context.tool, oauthProvider, extra?.sessionId);
  }

  // Get OAuth token if available (existing code)
  let accessToken: string | undefined;
  const sessionId = extra?.sessionId;

  if (sessionId) {
    const session = await getSession(sessionId);
    if (session?.accessToken) {
      accessToken = session.accessToken;
    }
  }

  // Validate parameters with Zod schema (existing code)
  let validatedParams: unknown;
  try {
    validatedParams = context
      ? context.schema.parse(request.params.arguments || {})
      : request.params.arguments || {};
  } catch (zodError) {
    throw new Error(
      `Invalid parameters for tool "${toolName}": ` +
        `${zodError instanceof Error ? zodError.message : String(zodError)}`
    );
  }

  // Handle local handlers (existing code)
  const localHandler = localHandlers.get(toolName);
  if (localHandler) {
    return await localHandler(validatedParams, { sessionId });
  }

  if (!context) {
    throw new Error(`Tool "${toolName}" is not available`);
  }

  // Proxy request to Drupal (existing code)
  try {
    const result = await makeRequest(context.tool.name, validatedParams, accessToken);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (drupalError) {
    throw new Error(
      `Tool "${toolName}" execution failed: ` +
        `${drupalError instanceof Error ? drupalError.message : String(drupalError)}`
    );
  }
});
```

### Step 5: Update Type Imports

Ensure `DrupalOAuthProvider` type is imported:

```typescript
import type { DrupalOAuthProvider } from '../oauth/provider.js';
```

### Step 6: Verify TypeScript Compilation

```bash
npm run type-check
```

### Important Notes

- **Validation Order**: Access validation happens BEFORE parameter validation. This prevents
  unnecessary parameter processing for denied requests.
- **Error Types**: All authentication/authorization errors use `McpError` with
  `ErrorCode.InvalidRequest` for consistency.
- **Optional Provider**: `oauthProvider` parameter may be optional in the signature. For tools with
  `auth.level='none'`, it's not needed.

### Example Error Messages

**Missing Authentication:**

```
Tool "examples.contentTypes.create" requires authentication. Please authenticate first.
```

**Insufficient Scopes:**

```
Insufficient OAuth scopes for tool "examples.contentTypes.create".
Required: content_type:write
Missing: content_type:write
Current: profile, content_type:read
```

</details>
