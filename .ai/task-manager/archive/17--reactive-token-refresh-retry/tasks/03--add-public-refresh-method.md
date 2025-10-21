---
id: 3
group: 'oauth-refresh-api'
dependencies: []
status: 'completed'
created: '2025-10-21'
skills:
  - typescript
  - authentication
---

# Add Public refreshSessionToken Method

## Objective

Expose a public `refreshSessionToken()` method in DrupalOAuthProvider that allows reactive refresh
triggered by 401 responses, reusing existing token refresh infrastructure.

## Skills Required

- **TypeScript**: Implement public async method with proper typing
- **Authentication**: Understand session-to-user mapping and token refresh flow

## Acceptance Criteria

- [x] `refreshSessionToken(sessionId: string)` method exists and is public
- [x] Method returns new access token as string
- [x] Throws clear error if session not authenticated
- [x] Throws clear error if no refresh token available
- [x] Reuses existing `refreshTokens()` method (no duplication)
- [x] TypeScript compilation succeeds with correct return type

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File to modify**: `src/oauth/provider.ts`

**Add method to**: `DrupalOAuthProvider` class (around line 270, after `logoutSession()`)

**Dependencies**:

- Existing `sessionToUser` map
- Existing `userTokens` map
- Existing `refreshTokens()` method (line 449)

## Input Dependencies

- Existing token storage infrastructure (`userTokens`, `sessionToUser` maps)
- Existing `refreshTokens()` private method

## Output Artifacts

- Public `refreshSessionToken(sessionId: string): Promise<string>` method
- JSDoc documentation for the method

## Implementation Notes

<details>
<summary>Implementation Guide</summary>

### Add Public Method to DrupalOAuthProvider

Add this method to the `DrupalOAuthProvider` class around line 270 (after `logoutSession()` method):

````typescript
/**
 * Refreshes tokens for a session reactively (triggered by 401 error)
 *
 * This method is called when a request receives a 401 Unauthorized response,
 * indicating the access token has expired. It attempts to use the refresh_token
 * to obtain a new access_token without requiring user re-authentication.
 *
 * @param sessionId - Session that received 401 response
 * @returns New access token for retrying the failed request
 * @throws Error if session not authenticated or no refresh_token available
 *
 * @example
 * ```typescript
 * try {
 *   const newToken = await oauthProvider.refreshSessionToken(sessionId);
 *   // Retry failed request with newToken
 * } catch (error) {
 *   // Refresh failed - user must re-authenticate
 * }
 * ```
 */
async refreshSessionToken(sessionId: string): Promise<string> {
  const userId = this.sessionToUser.get(sessionId);
  if (!userId) {
    throw new Error('Session not authenticated');
  }

  const tokens = this.userTokens.get(userId);
  if (!tokens?.refresh_token) {
    throw new Error('No refresh token available');
  }

  // Use existing refresh logic (handles deduplication, storage, cross-session updates)
  const refreshed = await this.refreshTokens(userId, sessionId, tokens);
  return refreshed.access_token;
}
````

### Design Rationale

**Why reuse `refreshTokens()`?**

- Existing method already handles:
  - Concurrent refresh deduplication (`tokenRefreshPromises` map)
  - Token storage across all user sessions
  - Error handling and retry logic
- No code duplication = less maintenance burden

**Why return only access_token?**

- Caller (reactive refresh in `makeRequest()`) only needs access token for retry
- Full token object is already stored in `userTokens` by `refreshTokens()`

**Error messages**:

- `"Session not authenticated"` - sessionId not mapped to user (never logged in)
- `"No refresh token available"` - tokens exist but refresh_token is null/undefined

### Integration Point

This method will be called from `makeRequest()` in Task 4 when a 401 is detected:

```typescript
// In makeRequest() - Task 4
if (response.status === 401 && sessionId && this.oauthProvider) {
  const newToken = await this.oauthProvider.refreshSessionToken(sessionId);
  // Retry request with newToken
}
```

### Testing

Manual verification:

1. Method compiles without errors
2. Return type is `Promise<string>`
3. Method is public (accessible from outside class)

Integration testing will happen in Task 4 and Task 6.

</details>
