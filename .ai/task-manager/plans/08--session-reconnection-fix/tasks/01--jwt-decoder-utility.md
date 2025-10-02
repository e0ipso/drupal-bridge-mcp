---
id: 1
group: 'token-management'
dependencies: []
status: 'pending'
created: '2025-10-02'
skills:
  - typescript
  - oauth
---

# Create JWT Decoder Utility for User ID Extraction

## Objective

Implement JWT decoding utilities to extract user IDs from OAuth access tokens, enabling stable user
identification across session reconnections.

## Skills Required

- **TypeScript**: Type-safe JWT decoding implementation
- **OAuth**: Understanding JWT structure and standard claims

## Acceptance Criteria

- [ ] JWT decoder handles base64url-encoded tokens correctly
- [ ] User ID extraction checks multiple standard JWT claims (sub, user_id, uid)
- [ ] Error handling for malformed or non-JWT tokens with fallback
- [ ] Unit tests verify extraction with sample JWT tokens

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary><strong>Implementation Details</strong></summary>

### File Location

Create `src/oauth/jwt-decoder.ts`

### Core Functions

```typescript
/**
 * Decode a JWT token without verification
 * @param token - JWT token string
 * @returns Decoded payload as object
 * @throws Error if token is malformed
 */
export function decodeJwt(token: string): Record<string, any> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format: expected 3 parts');
    }

    const [, payload] = parts;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
  } catch (error) {
    throw new Error(
      `JWT decoding failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract user ID from JWT token
 * Checks multiple standard claims: sub, user_id, uid
 * @param token - OAuth access token (JWT)
 * @returns User ID string
 * @throws Error if user ID cannot be extracted
 */
export function extractUserId(token: string): string {
  try {
    const claims = decodeJwt(token);

    // Check standard JWT claims in order of priority
    const userId = claims.sub || claims.user_id || claims.uid;

    if (!userId) {
      throw new Error('No user ID found in token claims (checked sub, user_id, uid)');
    }

    return String(userId);
  } catch (error) {
    throw new Error(
      `User ID extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
```

### TypeScript Types

```typescript
export interface JwtClaims {
  sub?: string; // Subject (standard JWT claim)
  user_id?: string; // Custom user ID claim
  uid?: string; // Alternative user ID claim
  exp?: number; // Expiration timestamp
  iat?: number; // Issued at timestamp
  [key: string]: any; // Additional claims
}
```

### Error Handling Strategy

- **Malformed JWT**: Throw descriptive error about invalid format
- **Missing user ID**: Throw error listing checked claims
- **Base64 decode failure**: Throw error with original exception context
- **Non-JWT tokens**: Caller should catch and fallback to session ID

### Testing Requirements

Create unit tests with:

- Valid JWT with `sub` claim
- Valid JWT with `user_id` claim
- Valid JWT with `uid` claim
- Malformed token (wrong number of parts)
- Invalid base64 encoding
- Missing user ID claims

</details>

## Input Dependencies

None - this is a foundational utility

## Output Artifacts

- `src/oauth/jwt-decoder.ts` with `decodeJwt()` and `extractUserId()` functions
- Type definitions for JWT claims
- Unit tests validating extraction logic

## Implementation Notes

Use Node.js built-in `Buffer.from(payload, 'base64url')` for decoding - no external JWT library
needed for this simple extraction. The token is NOT verified (signature check) because Drupal OAuth
server already validated it. This utility only extracts the user ID claim for session-to-user
mapping.
