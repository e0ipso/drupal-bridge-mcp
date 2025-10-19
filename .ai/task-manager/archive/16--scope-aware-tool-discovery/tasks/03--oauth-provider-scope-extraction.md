---
id: 3
group: 'oauth-provider'
dependencies: []
status: 'completed'
created: '2025-10-19'
skills:
  - typescript
  - oauth
---

# Add Scope Extraction Method to OAuth Provider

## Objective

Implement `getTokenScopes()` method in `DrupalOAuthProvider` to extract OAuth scopes from JWT access
tokens, enabling runtime scope validation.

## Skills Required

**typescript**: Async method implementation and type safety **oauth**: Understanding of JWT
structure and scope claim formats

## Acceptance Criteria

- [ ] `getTokenScopes(sessionId: string): Promise<string[]>` method added to `DrupalOAuthProvider`
- [ ] Method decodes JWT access token for the session
- [ ] Extracts `scope` claim (space-separated string)
- [ ] Returns array of scope strings
- [ ] Handles both space-separated strings and array formats
- [ ] Returns empty array if session not found or no scopes
- [ ] TypeScript compilation passes with no errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File**: `src/oauth/provider.ts` (or wherever `DrupalOAuthProvider` is defined)

**Method Signature:**

```typescript
async getTokenScopes(sessionId: string): Promise<string[]>
```

**Implementation Requirements:**

- Retrieve session/token for given sessionId
- Decode JWT access token (may need to use existing JWT decoder utility)
- Extract `scope` claim from JWT payload
- Handle formats: space-separated string `"profile content:read"` or array
  `["profile", "content:read"]`
- Return empty array on errors/missing data (fail gracefully)

## Input Dependencies

None - this is independent OAuth provider enhancement.

## Output Artifacts

- Updated `DrupalOAuthProvider` class with `getTokenScopes()` method
- Method available for use by dynamic tool handlers

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Locate DrupalOAuthProvider Class

First, find where `DrupalOAuthProvider` is implemented. Based on the codebase structure, it should
be in `src/oauth/provider.ts`.

### Step 2: Add getTokenScopes() Method

Add this method to the `DrupalOAuthProvider` class:

```typescript
/**
 * Extracts OAuth scopes from a session's access token.
 *
 * @param sessionId - Session identifier
 * @returns Array of scope strings granted to the session
 */
async getTokenScopes(sessionId: string): Promise<string[]> {
  try {
    // Get the session token (implementation depends on your session storage)
    const token = await this.getToken(sessionId);

    if (!token) {
      return [];
    }

    // Decode JWT to extract payload
    // If there's an existing JWT decoder utility, use it
    // Otherwise, decode manually (JWT is base64url encoded)
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.warn(`Invalid JWT format for session ${sessionId}`);
      return [];
    }

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    );

    // Extract scope claim
    const scopeClaim = payload.scope;

    if (!scopeClaim) {
      return [];
    }

    // Handle both string (space-separated) and array formats
    if (typeof scopeClaim === 'string') {
      return scopeClaim.split(/\s+/).filter(s => s.length > 0);
    } else if (Array.isArray(scopeClaim)) {
      return scopeClaim;
    }

    return [];
  } catch (error) {
    console.warn(`Failed to extract scopes for session ${sessionId}:`, error);
    return [];
  }
}
```

### Step 3: Check for Existing JWT Utilities

The codebase has `src/oauth/jwt-decoder.ts` which extracts user IDs from JWTs. You may want to use
similar patterns or extract a shared JWT decoding utility.

Example of using existing patterns:

```typescript
import { decodeJWT } from './jwt-decoder.js';  // If this export exists

async getTokenScopes(sessionId: string): Promise<string[]> {
  try {
    const token = await this.getToken(sessionId);

    if (!token) {
      return [];
    }

    const payload = decodeJWT(token);  // Reuse existing decoder
    const scopeClaim = payload.scope;

    if (typeof scopeClaim === 'string') {
      return scopeClaim.split(/\s+/).filter(s => s.length > 0);
    } else if (Array.isArray(scopeClaim)) {
      return scopeClaim;
    }

    return [];
  } catch (error) {
    console.warn(`Failed to extract scopes for session ${sessionId}:`, error);
    return [];
  }
}
```

### Step 4: Understand Session Storage

Review how sessions are stored in `DrupalOAuthProvider`. The plan mentions:

- User-level persistence: `userTokens` map
- Session-level mapping: `sessionToUser` map

You'll need to:

1. Map sessionId → userId (via `sessionToUser`)
2. Retrieve token from `userTokens[userId]`
3. Extract scopes from token

### Step 5: Verify TypeScript Compilation

```bash
npm run type-check
```

### Important Notes

- **Base64URL Encoding**: JWT uses base64url, not standard base64. Node.js Buffer supports
  `'base64url'` encoding.
- **Error Handling**: Fail gracefully with empty array rather than throwing errors. Scope validation
  will handle missing scopes appropriately.
- **Performance**: JWT decoding is fast (simple base64 + JSON parse). No need for caching.

</details>
