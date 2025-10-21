---
id: 5
group: oauth-provider-refactor
dependencies:
  - 2
  - 4
status: completed
created: '2025-10-15'
skills:
  - typescript
  - oauth
---

# Replace Token Introspection with JWT Verification

## Objective

Replace the `verifyToken()` method in `DrupalOAuthProvider` to use JWT signature verification
instead of token introspection.

## Skills Required

- typescript: Class method refactoring, async operations
- oauth: JWT claims extraction, token validation

## Acceptance Criteria

- [ ] `verifyToken()` method uses `verifyJWT()` from jwt-verifier module
- [ ] Extract `client_id` from JWT payload
- [ ] Extract `scope` from JWT payload and split into array
- [ ] Extract `exp` (expiration) from JWT payload
- [ ] Return `AuthInfo` object with correct structure
- [ ] Handle errors with descriptive messages

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

File location: `src/oauth/drupal-oauth-provider.ts` (or similar)

The method should:

- Call `this.configManager.fetchMetadata()` to get OAuth metadata
- Pass token and metadata to `verifyJWT()`
- Extract claims from returned payload
- Map claims to `AuthInfo` interface

## Input Dependencies

- Task 2: `verifyJWT()` function available
- Task 4: OAuth config no longer requires client credentials

## Output Artifacts

- Updated `verifyToken()` method in `DrupalOAuthProvider`

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Add import at top of file**:

   ```typescript
   import { verifyJWT } from './jwt-verifier.js';
   ```

2. **Locate `verifyToken()` method**: Find the existing implementation in `DrupalOAuthProvider`
   class

3. **Replace implementation**:

   ```typescript
   private async verifyToken(token: string): Promise<AuthInfo> {
     try {
       const metadata = await this.configManager.fetchMetadata();
       const payload = await verifyJWT(token, metadata);

       return {
         token,
         clientId: payload.client_id as string || 'unknown',
         scopes: (payload.scope as string)?.split(' ') || [],
         expiresAt: payload.exp,
       };
     } catch (error) {
       throw new Error(`Token verification failed: ${error.message}`);
     }
   }
   ```

4. **Key changes**:
   - Remove any HTTP calls to introspection endpoint
   - Remove dependency on client credentials
   - Use JWT claims directly (more efficient than introspection)
   - Handle missing claims gracefully (default values)

5. **JWT Claims Reference**:
   - `client_id`: OAuth client identifier
   - `scope`: Space-separated list of granted scopes
   - `exp`: Expiration timestamp (Unix epoch)
   - `iss`: Issuer (validated by verifyJWT, no need to extract)

6. **Error Handling**: If `verifyJWT` throws (invalid signature, expired token), wrap the error
   message for clarity.

</details>
