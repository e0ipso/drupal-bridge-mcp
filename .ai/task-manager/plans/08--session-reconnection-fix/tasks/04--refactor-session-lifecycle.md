---
id: 4
group: 'session-management'
dependencies: [3]
status: 'pending'
created: '2025-10-02'
skills:
  - typescript
---

# Refactor Session Lifecycle Callbacks and Logout Handler

## Objective

Update session lifecycle management to preserve user tokens on disconnect while cleaning up session
mappings, and implement explicit logout handler to remove user tokens.

## Skills Required

- **TypeScript**: Callback refactoring, Map operations

## Acceptance Criteria

- [ ] `onsessionclosed` callback preserves user tokens (only deletes session mapping)
- [ ] `handleLogout` method removes user tokens and session mapping
- [ ] `getSession` method implements two-step lookup (session → user → tokens)
- [ ] Comprehensive logging for session close and logout events
- [ ] Active user/session counts logged on lifecycle events

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary><strong>Implementation Details</strong></summary>

### 1. Update `onsessionclosed` Callback

**Location**: `src/index.ts` - `setupMcpEndpoint` method (lines 403-409)

**Current Code**:

```typescript
onsessionclosed: async (sessionId: string) => {
  console.log(`Session closed: ${sessionId}`);
  this.sessionTokens.delete(sessionId); // ❌ Deletes tokens!
  this.sessionCapabilities.delete(sessionId);
};
```

**New Code**:

```typescript
onsessionclosed: async (sessionId: string) => {
  const userId = this.sessionToUser.get(sessionId);
  console.log(`Session closed: ${sessionId} (user: ${userId || 'unauthenticated'})`);

  // Remove session mapping (ephemeral)
  this.sessionToUser.delete(sessionId);
  this.sessionCapabilities.delete(sessionId);

  // DO NOT remove user tokens - they persist for reconnection
  // Tokens are only removed on explicit logout

  console.log(`Active sessions: ${this.sessionToUser.size}, Active users: ${this.userTokens.size}`);
};
```

### 2. Implement `handleLogout` Method

**Location**: Add new method to `DrupalMCPHttpServer` class

```typescript
/**
 * Handle explicit user logout
 * Removes user tokens and session mapping
 * @param sessionId - Session requesting logout
 */
async handleLogout(sessionId: string): Promise<void> {
  const userId = this.sessionToUser.get(sessionId);

  if (!userId) {
    console.log(`Logout requested for unauthenticated session: ${sessionId}`);
    return;
  }

  // Remove user tokens (persistent storage)
  this.userTokens.delete(userId);
  console.log(`User ${userId} logged out - tokens removed`);

  // Remove session-to-user mapping (ephemeral)
  this.sessionToUser.delete(sessionId);

  // Remove session capabilities
  this.sessionCapabilities.delete(sessionId);

  console.log(`Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`);
}
```

### 3. Refactor `getSession` Method

**Location**: `src/index.ts` (lines 296-311)

**Current Code**:

```typescript
private async getSession(sessionId: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
} | null> {
  const tokens = this.sessionTokens.get(sessionId);
  if (!tokens) {
    return null;
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
  };
}
```

**New Code**:

```typescript
private async getSession(sessionId: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
} | null> {
  // Step 1: Get user ID from session mapping
  const userId = this.sessionToUser.get(sessionId);
  if (!userId) {
    console.log(`Token lookup failed: session ${sessionId} not mapped to user`);
    return null; // Session not authenticated
  }

  // Step 2: Get user tokens from user storage
  const tokens = this.userTokens.get(userId);
  if (!tokens) {
    console.log(`Token lookup failed: user ${userId} has no tokens`);
    return null; // User tokens expired/logged out
  }

  console.log(`Token lookup success: session ${sessionId} → user ${userId}`);
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
  };
}
```

### 4. Wire Up Logout Tool (Optional Enhancement)

If a logout tool exists in `src/tools/auth/logout.ts`, update it to call `handleLogout`:

```typescript
// In logout tool handler
const sessionId = extra?.sessionId;
if (sessionId) {
  await this.server.handleLogout(sessionId);
}
```

</details>

## Input Dependencies

- Updated `handleDeviceFlow` from Task 3 (tokens stored by user ID)
- `userTokens` and `sessionToUser` Maps from Task 2

## Output Artifacts

- Updated `onsessionclosed` callback that preserves user tokens
- New `handleLogout` method for explicit token removal
- Refactored `getSession` with two-step lookup (session → user → tokens)
- Enhanced logging for all lifecycle events

## Implementation Notes

The critical distinction: **session close ≠ logout**. When a transport session closes (disconnect,
timeout), we clean up the ephemeral session → user mapping but PRESERVE the user's tokens. Only when
the user explicitly calls logout do we remove their tokens. This enables reconnection without
re-authentication.
