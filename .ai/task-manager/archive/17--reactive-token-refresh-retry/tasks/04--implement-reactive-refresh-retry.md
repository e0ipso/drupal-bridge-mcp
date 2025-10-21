---
id: 4
group: 'request-retry-logic'
dependencies: [3]
status: 'completed'
created: '2025-10-21'
skills:
  - typescript
  - http-client
---

# Implement Reactive Refresh and Request Retry

## Objective

Add 401 detection and automatic retry logic to `makeRequest()` method in src/index.ts, enabling
transparent token refresh and request retry when access tokens expire.

## Skills Required

- **TypeScript**: Refactor async HTTP request logic with retry pattern
- **HTTP Client**: Implement retry logic for failed requests with status code detection

## Acceptance Criteria

- [ ] `makeRequest()` detects 401 responses
- [ ] On 401, attempts token refresh via `refreshSessionToken()`
- [ ] Retries original request with new token if refresh succeeds
- [ ] Max 1 retry per request (prevents retry loops)
- [ ] `sessionId` parameter threaded through call chain
- [ ] Dynamic handlers pass `sessionId` to `makeRequest()`
- [ ] TypeScript compilation succeeds
- [ ] Existing non-401 error handling preserved

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Files to modify**:

- `src/index.ts` - `makeRequest()` method (lines 329-361)
- `src/discovery/dynamic-handlers.ts` - Thread sessionId to makeRequest

**Dependencies**:

- Task 3: `refreshSessionToken()` method from DrupalOAuthProvider
- Existing `oauthProvider` instance in DrupalMCPHttpServer class

## Input Dependencies

- Task 3: `refreshSessionToken(sessionId)` method
- Existing `makeRequest()` method signature
- Existing `registerDynamicTools()` in dynamic-handlers.ts

## Output Artifacts

- Modified `makeRequest()` with optional `sessionId` parameter and retry logic
- New `performRequest()` helper method for actual fetch execution
- Updated call sites in `registerDynamicTools()` to pass sessionId

## Implementation Notes

<details>
<summary>Implementation Guide</summary>

### Step 1: Refactor makeRequest in src/index.ts

**Current method** (lines 329-361):

```typescript
private async makeRequest(
  toolName: string,
  params: unknown,
  token?: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const endpoint = process.env.DRUPAL_JSONRPC_ENDPOINT || '/mcp/tools/invoke';
  const response = await fetch(`${process.env.DRUPAL_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: toolName,
      arguments: params,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Tool invocation failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}
```

**Replace with** (extract fetch logic + add retry):

```typescript
/**
 * Make HTTP request to Drupal with automatic token refresh on 401
 *
 * @param toolName - Name of the tool to invoke
 * @param params - Tool parameters
 * @param token - OAuth access token (optional)
 * @param sessionId - Session ID for token refresh (optional)
 * @returns Tool invocation result
 */
private async makeRequest(
  toolName: string,
  params: unknown,
  token?: string,
  sessionId?: string
): Promise<unknown> {
  const response = await this.performRequest(toolName, params, token);

  // Detect 401 and attempt reactive refresh
  if (response.status === 401 && sessionId && this.oauthProvider) {
    debugOAuth(
      `401 response for session ${sessionId} - attempting reactive refresh`
    );

    try {
      // Attempt to refresh token for this session
      const newToken = await this.oauthProvider.refreshSessionToken(sessionId);

      debugOAuth(
        `Reactive refresh successful for session ${sessionId} - retrying request`
      );

      // Retry request with new token (max 1 retry)
      const retryResponse = await this.performRequest(toolName, params, newToken);

      if (!retryResponse.ok) {
        throw new Error(
          `Retry failed: HTTP ${retryResponse.status} ${retryResponse.statusText}`
        );
      }

      return retryResponse.json();
    } catch (refreshError) {
      // Refresh failed - throw original 401 error with context
      const errorMsg = refreshError instanceof Error
        ? refreshError.message
        : String(refreshError);
      throw new Error(`Authentication failed: ${errorMsg}`);
    }
  }

  if (!response.ok) {
    throw new Error(
      `Tool invocation failed: HTTP ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Perform HTTP request to Drupal (extracted for retry logic)
 *
 * @param toolName - Name of the tool to invoke
 * @param params - Tool parameters
 * @param token - OAuth access token (optional)
 * @returns Raw fetch Response object
 */
private async performRequest(
  toolName: string,
  params: unknown,
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const endpoint = process.env.DRUPAL_JSONRPC_ENDPOINT || '/mcp/tools/invoke';
  return fetch(`${process.env.DRUPAL_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: toolName,
      arguments: params,
    }),
  });
}
```

**Add debug import** at top of file if not already present:

```typescript
import debug from 'debug';
const debugOAuth = debug('mcp:oauth');
```

### Step 2: Thread sessionId Through Call Chain

In `src/discovery/dynamic-handlers.ts`, locate the `registerDynamicTools()` function (around line
155).

Find where `makeRequest()` is called (around line 204-230):

**Current call**:

```typescript
const result = await makeRequest(toolName, validatedArgs, session?.accessToken);
```

**Update to**:

```typescript
const result = await makeRequest(
  toolName,
  validatedArgs,
  session?.accessToken,
  extra?.sessionId // Pass sessionId for reactive refresh
);
```

**Note**: The `extra` parameter is available from the CallToolRequestSchema handler and contains
`sessionId`.

### Step 3: Update makeRequest Call Sites

Search for all `makeRequest()` calls in src/index.ts and ensure backward compatibility:

- Existing calls without sessionId still work (parameter is optional)
- Only dynamic tool handlers need to pass sessionId

### Step 4: Verify Compilation

```bash
npm run type-check
```

### Testing Strategy

This will be tested comprehensively in Task 6. For now, verify:

1. Code compiles without errors
2. `sessionId` parameter is correctly typed as optional
3. Retry logic only triggers on 401 (not other errors)
4. Max 1 retry per request (second 401 fails permanently)

</details>
