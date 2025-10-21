---
id: 2
group: 'oauth-error-handling'
dependencies: [1]
status: 'completed'
created: '2025-10-21'
skills:
  - typescript
  - authentication
---

# Implement Soft-Fail for Proactive Token Refresh

## Objective

Modify `ensureSessionToken()` to preserve valid refresh tokens when proactive refresh fails due to
temporary issues (network errors, Drupal restarts), only clearing tokens on permanent OAuth
failures.

## Skills Required

- **TypeScript**: Modify error handling in async token management logic
- **Authentication**: Understand distinction between temporary and permanent auth failures

## Acceptance Criteria

- [ ] Proactive refresh failures no longer immediately clear all tokens
- [ ] Permanent OAuth errors (invalid_grant) still clear tokens appropriately
- [ ] Temporary failures return expired token and log debug message
- [ ] Debug logging indicates proactive refresh failure and fallback strategy
- [ ] TypeScript compilation succeeds

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File to modify**: `src/oauth/provider.ts`

**Method to modify**: `ensureSessionToken()` (lines 400-447)

**Dependencies**: Requires `isPermanentAuthFailure()` from Task 1

## Input Dependencies

- Task 1: `isPermanentAuthFailure()` method
- Existing `debug` import at top of file (around line 16)
- Existing `clearUserTokens()` method

## Output Artifacts

- Modified `ensureSessionToken()` with soft-fail logic for temporary errors
- Debug logging for proactive refresh failures

## Implementation Notes

<details>
<summary>Implementation Guide</summary>

### Current Behavior (Problem)

In `ensureSessionToken()`, around lines 433-442:

```typescript
try {
  tokens = await this.refreshTokens(userId, sessionId, tokens);
  expiresAt = this.calculateExpiresAt(tokens);
} catch (error) {
  debugOAuth(
    `Token refresh failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
  );
  this.clearUserTokens(userId); // ← PROBLEM: Always clears tokens
  throw new Error('Authentication expired. Please log in again.');
}
```

### Modified Behavior (Solution)

Replace the catch block with:

```typescript
try {
  tokens = await this.refreshTokens(userId, sessionId, tokens);
  expiresAt = this.calculateExpiresAt(tokens);
} catch (error) {
  debugOAuth(
    `Proactive refresh failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
  );

  // Check if error is permanent (invalid_grant, invalid_token, unauthorized_client)
  if (error instanceof Error && this.isPermanentAuthFailure(error)) {
    debugOAuth(`Permanent auth failure detected - clearing tokens for user ${userId}`);
    this.clearUserTokens(userId);
    throw new Error('Authentication expired. Please log in again.');
  }

  // Temporary failure (network error, Drupal unavailable, etc.)
  debugOAuth(
    `Temporary proactive refresh failure - returning expired token. ` +
      `Reactive refresh will handle 401. ` +
      `Token expires: ${expiresAt ? new Date(expiresAt).toISOString() : 'unknown'}, ` +
      `Refresh token available: ${!!tokens.refresh_token}`
  );

  // Continue with expired tokens - reactive refresh will catch it on actual 401
  // Don't throw - let the request proceed and trigger reactive refresh
}
```

### Rationale

**Why not throw on temporary failures?**

- Proactive refresh is an optimization, not a requirement
- Network issues are transient - don't punish users with forced re-auth
- Reactive refresh provides second chance when actual request fails with 401
- Preserves 14-day session duration for users

**Why still clear tokens on permanent failures?**

- OAuth errors like `invalid_grant` mean refresh token is definitively expired/revoked
- No point keeping invalid tokens - user must re-authenticate
- Provides clear error message to user

### Debug Logging

The enhanced debug logging will show:

1. **Proactive refresh failure**: Initial attempt failed
2. **Error classification**: Permanent vs temporary
3. **Token state**: Expiry time and refresh token availability
4. **Fallback strategy**: "Reactive refresh will handle 401"

Enable with: `DEBUG=mcp:oauth npm start`

### Testing

Verify behavior by:

1. **Temporary failure test**: Stop Drupal, trigger proactive refresh → tokens preserved
2. **Permanent failure test**: Revoke refresh token in Drupal → tokens cleared
3. Check debug logs show correct classification

</details>
