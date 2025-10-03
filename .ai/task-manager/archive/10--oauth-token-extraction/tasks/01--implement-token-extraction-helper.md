---
id: 1
group: 'token-extraction'
dependencies: []
status: 'completed'
created: '2025-10-03'
skills:
  - typescript
  - oauth
---

# Implement Token Extraction Helper Method

## Objective

Create a private helper method `extractAndStoreTokenFromRequest()` in the `DrupalMCPHttpServer`
class that extracts OAuth Bearer tokens from Authorization headers, decodes JWTs to extract user
IDs, and stores session-to-user and user-to-token mappings.

## Skills Required

- **TypeScript**: Implement class method with proper typing for Express Request objects and
  TokenResponse structures
- **OAuth**: Parse Bearer tokens, decode JWT payloads, extract user claims (sub, user_id, uid)

## Acceptance Criteria

- [ ] Method signature matches:
      `private extractAndStoreTokenFromRequest(sessionId: string, req: express.Request): void`
- [ ] Extracts `authorization` header from Express request (lowercase, per Express normalization)
- [ ] Validates header starts with `"Bearer "` prefix
- [ ] Parses token by removing `"Bearer "` prefix (substring from index 7)
- [ ] Calls existing `extractUserId(token)` utility with try-catch error handling
- [ ] Checks for existing user in `userTokens` Map (reconnection scenario)
- [ ] Creates `TokenResponse` structure with: `access_token`, `token_type: "Bearer"`,
      `expires_in: 3600`, `scope: ""`
- [ ] Stores in `this.userTokens.set(userId, tokenData)`
- [ ] Stores in `this.sessionToUser.set(sessionId, userId)`
- [ ] Logs extraction success with session ID, user ID, and active counts
- [ ] Returns gracefully (no throw) on missing header, invalid format, or decode errors
- [ ] All error conditions log warnings but don't crash

## Technical Requirements

**File**: `src/index.ts`

**Location**: Add as private method in `DrupalMCPHttpServer` class (before `setupMcpEndpoint()`
method)

**Dependencies**:

- Existing `extractUserId()` from `src/oauth/jwt-decoder.ts` (already imported)
- Existing `TokenResponse` type from `src/oauth/device-flow-types.ts` (already imported)
- Existing Maps: `this.sessionToUser`, `this.userTokens` (class properties)

**Reference Implementation Pattern**: Device flow authentication in same file
(`src/index.ts:476-500`) shows identical Map storage pattern to follow

## Input Dependencies

- Existing `extractUserId()` utility function (no changes needed)
- Existing `TokenResponse` type definition (no changes needed)
- Existing session management Maps (no changes needed)

## Output Artifacts

- New private method `extractAndStoreTokenFromRequest()` in `DrupalMCPHttpServer` class
- Method ready to be called from `/mcp` endpoint handler

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Method Structure

```typescript
/**
 * Extracts OAuth token from Authorization header and stores session/user mappings
 * @param sessionId - MCP session identifier
 * @param req - Express Request object
 */
private extractAndStoreTokenFromRequest(
  sessionId: string,
  req: express.Request
): void {
  // Implementation here
}
```

### Step-by-Step Implementation

**Step 1: Extract Authorization Header**

```typescript
const authHeader = req.headers['authorization'] as string | undefined;
if (!authHeader) {
  return; // No token present - not an error, exit gracefully
}
```

**Step 2: Validate Bearer Token Format**

```typescript
if (!authHeader.startsWith('Bearer ')) {
  console.warn(`Invalid Authorization header format for session ${sessionId}`);
  return;
}
```

**Step 3: Parse Token**

```typescript
const token = authHeader.substring(7); // Remove 'Bearer ' prefix
```

**Step 4: Decode JWT with Error Handling**

```typescript
let userId: string;
try {
  userId = extractUserId(token); // Existing utility from jwt-decoder.ts
} catch (error) {
  console.warn(
    `Token decode failed for session ${sessionId}:`,
    error instanceof Error ? error.message : String(error)
  );
  return; // Invalid token - log warning, exit gracefully
}
```

**Step 5: Check for Reconnection** (same user, new session)

```typescript
const existingTokens = this.userTokens.get(userId);
if (existingTokens) {
  // User reconnecting - just update session mapping, reuse tokens
  this.sessionToUser.set(sessionId, userId);
  console.log(`User ${userId} reconnecting - mapped session ${sessionId} to existing tokens`);
  return;
}
```

**Step 6: Create TokenResponse Structure**

```typescript
const tokenData: TokenResponse = {
  access_token: token,
  token_type: 'Bearer',
  expires_in: 3600, // Default expiry (actual expiry in JWT exp claim)
  refresh_token: undefined, // Not available from Authorization header
  scope: '', // Not available from Authorization header
};
```

**Step 7: Store in Maps**

```typescript
// Persistent user token storage
this.userTokens.set(userId, tokenData);

// Ephemeral session-to-user mapping
this.sessionToUser.set(sessionId, userId);
```

**Step 8: Log Success**

```typescript
console.log(`Token extracted and stored for session ${sessionId} → user ${userId}`);
console.log(`Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`);
```

### Key Points

1. **No Imports Needed**: All required types and utilities are already imported in `src/index.ts`

2. **Error Handling Philosophy**: Never throw errors. Log warnings and return gracefully. Invalid
   tokens will naturally fail at backend API layer.

3. **Reconnection Logic**: Check `userTokens` Map first. If user exists, just update session
   mapping. Don't create duplicate token entries.

4. **Logging Pattern**: Follow same format as device flow (lines 480, 496-500 in `src/index.ts`)

5. **Map Storage Order**: Store in `userTokens` first, then `sessionToUser` (same order as device
   flow line 503-507)

### Validation

After implementation, verify:

- TypeScript compiles without errors
- Method signature is private (not exposed in class interface)
- All code paths return void (no exceptions thrown)
- Console logs match existing device flow format

</details>
