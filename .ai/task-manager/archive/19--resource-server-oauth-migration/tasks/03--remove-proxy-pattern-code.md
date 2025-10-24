---
id: 3
group: 'code-cleanup'
dependencies: [2]
status: 'completed'
created: '2025-10-24'
skills:
  - typescript
---

# Remove dormant proxy pattern code from provider

## Objective

Delete unused token management infrastructure from `src/oauth/provider.ts`, removing ~400 lines of
dormant code (token storage, refresh logic) that never executes in resource server mode.

## Skills Required

- **TypeScript**: Safely remove code while maintaining type safety, update imports

## Acceptance Criteria

- [ ] Remove token storage maps (sessionTokens, userTokens, sessionToUser, tokenRefreshPromises)
- [ ] Remove token management methods (captureSessionToken, storeSessionTokens, etc.)
- [ ] Remove reactive refresh logic (refreshSessionToken, performTokenRefresh, etc.)
- [ ] Remove unused types (SessionAuthorization, TokenResponse, StoredToken)
- [ ] Update remaining code to not reference removed functionality
- [ ] Type checking passes: `npm run type-check`

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Code to Remove** from `src/oauth/provider.ts`:

1. **Token Storage Maps** (lines ~50-53):
   - `private sessionTokens: Map<string, StoredToken>`
   - `private userTokens: Map<string, StoredToken>`
   - `private sessionToUser: Map<string, string>`
   - `private tokenRefreshPromises: Map<string, Promise<StoredToken>>`

2. **Token Management Methods** (lines ~142-285):
   - `captureSessionToken()`
   - `setSessionTokens()`
   - `storeSessionTokens()`
   - `getSessionAuthorization()`
   - `getUserTokens()`
   - `hasValidSessionToken()`
   - `cleanup()`

3. **Reactive Refresh Logic** (lines ~286-612):
   - `refreshSessionToken()`
   - `refreshTokens()`
   - `performTokenRefresh()`
   - `handleTokenRefreshError()`
   - `updateTokensForUser()`
   - `triggerTokenUpdate()`

4. **Unused Type Definitions**:

```typescript
export interface TokenResponse { ... }
export interface SessionAuthorization { ... }
interface StoredToken extends TokenResponse { ... }
```

**Expected Outcome**: File reduced from ~635 lines to ~150 lines

## Input Dependencies

- Task 2: Server integration updated to not use removed methods
- Grep/search results to confirm no other files reference removed code

## Output Artifacts

- Simplified `src/oauth/provider.ts` or potentially delete if all logic moved to token-verifier.ts
- May convert to `src/oauth/token-verifier.ts` entirely

## Implementation Notes

<details>
<summary>Detailed Implementation Guidance</summary>

### Verification Before Deletion

1. Search for references to methods being removed:

```bash
grep -r "captureSessionToken" src/
grep -r "refreshSessionToken" src/
grep -r "storeSessionTokens" src/
grep -r "SessionAuthorization" src/
```

2. Ensure Task 2 has removed all usage in `src/index.ts`

### Decision Point: Delete vs Simplify

After Task 1 creates `token-verifier.ts`, evaluate if `provider.ts` is still needed:

**Option A**: Keep `provider.ts` but remove dormant code

- If file has other useful functionality beyond token verification
- If maintaining backwards compatibility shim is desired

**Option B**: Delete `provider.ts` entirely

- If all remaining code is in `token-verifier.ts`
- Cleaner separation of concerns

**Recommendation**: Option B - delete `provider.ts` and use `token-verifier.ts` as the single OAuth
implementation file.

### Update `src/oauth/index.ts`

Remove exports for deleted types and classes:

```typescript
// REMOVE
export type { SessionAuthorization, TokenResponse };
export { DrupalOAuthProvider };

// KEEP or ADD
export { DrupalTokenVerifier };
```

### Configuration Cleanup

Check `src/oauth/config.ts` for any references to removed functionality:

- Remove OAuth endpoint URLs for authorization/token/revocation
- Keep only introspection endpoint (if used for verification)
- Keep metadata discovery endpoint

</details>
