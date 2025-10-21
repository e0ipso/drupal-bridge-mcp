---
id: 2
group: jwt-verification-infrastructure
dependencies:
  - 1
status: completed
created: '2025-10-15'
skills:
  - typescript
  - oauth
---

# Create JWT Verification Utility

## Objective

Implement a JWT verification utility that validates OAuth access tokens using Drupal's JWKS
endpoint.

## Skills Required

- typescript: Module creation, async/await, error handling
- oauth: JWT verification, JWKS, token validation

## Acceptance Criteria

- [x] Create `src/oauth/jwt-verifier.ts` with `verifyJWT()` function
- [x] Function uses JWKS URI from OAuth metadata (not hard-coded)
- [x] Function validates JWT signature and issuer
- [x] Function returns decoded payload on success
- [x] Function throws descriptive errors on failure

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

- Import `createRemoteJWKSet` and `jwtVerify` from `jose`
- Accept token string and OAuthMetadata as parameters
- Use `metadata.jwks_uri` for key retrieval
- Validate issuer matches `metadata.issuer`
- Return JWT payload for claims extraction

## Input Dependencies

- Task 1: `jose` library installed
- Existing `OAuthMetadata` type from `@modelcontextprotocol/sdk/shared/auth.js`

## Output Artifacts

- `src/oauth/jwt-verifier.ts` module
- Exported `verifyJWT()` function

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Create the file**: `src/oauth/jwt-verifier.ts`

2. **Implement the verification function**:

   ```typescript
   import { createRemoteJWKSet, jwtVerify } from 'jose';
   import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

   /**
    * Verifies a JWT access token using Drupal's JWKS endpoint
    * @param token - The JWT access token to verify
    * @param metadata - OAuth metadata containing jwks_uri and issuer
    * @returns The decoded JWT payload
    * @throws Error if verification fails or JWKS URI is missing
    */
   export async function verifyJWT(token: string, metadata: OAuthMetadata) {
     if (!metadata.jwks_uri) {
       throw new Error('JWKS URI not available in OAuth metadata');
     }

     // Use JWKS endpoint from discovered metadata (not hard-coded)
     const JWKS = createRemoteJWKSet(new URL(metadata.jwks_uri));

     const { payload } = await jwtVerify(token, JWKS, {
       issuer: metadata.issuer, // Use issuer from metadata
     });

     return payload;
   }
   ```

3. **Error Handling**: The `jwtVerify` function will throw errors for:
   - Invalid signature
   - Expired token
   - Invalid issuer
   - Malformed JWT

   Let these errors propagate with their descriptive messages.

4. **Key Points**:
   - Never hard-code Drupal URLs - always use metadata
   - The `jose` library handles JWKS caching and refresh automatically
   - The function is pure and stateless - no side effects

</details>
