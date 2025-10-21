---
id: 5
group: 'observability'
dependencies: [2, 4]
status: 'completed'
created: '2025-10-21'
completed: '2025-10-21'
skills:
  - typescript
---

# Add Enhanced Diagnostic Logging

## Objective

Add comprehensive debug logging throughout the token refresh flow to enable visibility into
proactive vs reactive refresh triggers, outcomes, and timing for debugging authentication issues.

## Skills Required

- **TypeScript**: Add debug logging statements with proper string interpolation

## Acceptance Criteria

- [ ] Debug logs added to proactive refresh flow (ensureSessionToken)
- [ ] Debug logs added to reactive refresh flow (makeRequest)
- [ ] Debug logs added to performTokenRefresh for success/failure
- [ ] All logs use `debugOAuth` with namespace `mcp:oauth`
- [ ] Logs include relevant context (userId, sessionId, timestamps)
- [ ] TypeScript compilation succeeds

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Files to modify**:

- `src/oauth/provider.ts` - Add logs to performTokenRefresh
- `src/index.ts` - Logs already added in Task 4

**Logging namespace**: `mcp:oauth` (already imported as `debugOAuth`)

**Enable logs**: `DEBUG=mcp:oauth npm start`

## Input Dependencies

- Task 2: Modified `ensureSessionToken()` with soft-fail logic
- Task 4: Modified `makeRequest()` with reactive refresh
- Existing `debug` package import

## Output Artifacts

- Enhanced debug logging throughout token refresh flow
- Visibility into refresh trigger source (proactive vs reactive)
- Token expiry and refresh timing information

## Implementation Notes

<details>
<summary>Implementation Guide</summary>

### Logging Already Added in Previous Tasks

Task 2 and Task 4 already added most logging. This task completes the observability picture.

### Additional Logging in performTokenRefresh (src/oauth/provider.ts)

Locate `performTokenRefresh()` method (line 472). Add logging at key points:

**After successful token refresh** (around line 522, before `return`):

```typescript
const refreshed = JSON.parse(responseText) as TokenResponse;

// Log successful refresh with new token expiry
debugOAuth(
  `Token refresh successful for session ${sessionId}. ` +
    `New token expires in ${refreshed.expires_in || 3600}s ` +
    `(${new Date(Date.now() + (refreshed.expires_in || 3600) * 1000).toISOString()})`
);

const normalizedTokens: TokenResponse = {
  // ... existing normalization code
};
```

**In error handling block** (already partially there from Task 1, enhance it):

Around line 505-519, the error handling should include:

```typescript
if (!response.ok) {
  try {
    const errorJson = JSON.parse(responseText);
    const errorCode = errorJson.error || 'unknown';
    const errorDesc = errorJson.error_description || response.statusText;

    // Log the specific OAuth error for debugging
    debugOAuth(
      `Token refresh failed with OAuth error: ${errorCode} - ${errorDesc}. ` +
        `HTTP ${response.status}`
    );

    throw new Error(`${errorCode}: ${errorDesc}`);
  } catch (parseError) {
    debugOAuth(
      `Token refresh failed with non-JSON response: ${response.status} ${response.statusText}`
    );
    throw new Error(`unknown: Token refresh failed - ${response.status} ${response.statusText}`);
  }
}
```

### Summary of All Debug Logs

After all tasks complete, debug logging will show:

**Proactive Refresh Flow** (src/oauth/provider.ts):

1. Token near expiry detection: "Token for user {userId} is expired or near expiry"
2. Proactive refresh failure: "Proactive refresh failed for user {userId}: {error}"
3. Error classification: "Permanent auth failure detected" vs "Temporary failure - returning expired
   token"
4. Token state on soft-fail: Expiry time, refresh token availability

**Reactive Refresh Flow** (src/index.ts):

1. 401 detection: "401 response for session {sessionId} - attempting reactive refresh"
2. Refresh success: "Reactive refresh successful for session {sessionId} - retrying request"

**Token Refresh Execution** (src/oauth/provider.ts):

1. Success: "Token refresh successful. New token expires in {seconds}s ({ISO timestamp})"
2. Failure: "Token refresh failed with OAuth error: {code} - {description}"

### Verification

Test logging by running with debug enabled:

```bash
DEBUG=mcp:oauth npm run dev
```

You should see logs for:

- Token expiry checks
- Refresh attempts (proactive and reactive)
- Success/failure outcomes
- Token timing information

### Example Log Output

```
mcp:oauth Token for user user-123 is expired or near expiry +0ms
mcp:oauth Token refresh successful. New token expires in 300s (2025-10-21T10:15:00.000Z) +150ms
mcp:oauth 401 response for session abc-def - attempting reactive refresh +5s
mcp:oauth Reactive refresh successful for session abc-def - retrying request +200ms
```

</details>
