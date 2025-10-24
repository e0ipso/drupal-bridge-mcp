---
id: 5
group: 'code-cleanup'
dependencies: [3]
status: 'completed'
created: '2025-10-24'
skills:
  - typescript
---

# Update module exports and configuration

## Objective

Update `src/oauth/index.ts` and related configuration files to export new resource server components
and remove proxy pattern exports, completing the migration to resource server architecture.

## Skills Required

- **TypeScript**: Update module exports, type definitions, maintain backwards compatibility where
  needed

## Acceptance Criteria

- [ ] Update `src/oauth/index.ts` to export `DrupalTokenVerifier`
- [ ] Remove exports for deleted types (SessionAuthorization, TokenResponse, StoredToken)
- [ ] Remove exports for deleted class (DrupalOAuthProvider)
- [ ] Update `src/oauth/config.ts` if needed (remove unused OAuth endpoints)
- [ ] Ensure all TypeScript imports resolve: `npm run type-check`
- [ ] Build succeeds: `npm run build`

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File: `src/oauth/index.ts`**

Current exports:

```typescript
export { DrupalOAuthProvider, createDrupalOAuthProvider };
export type { SessionAuthorization, TokenResponse };
export { OAuthConfigManager, createOAuthConfigFromEnv };
export type { OAuthConfig };
```

Target exports:

```typescript
export { DrupalTokenVerifier };
export { OAuthConfigManager, createOAuthConfigFromEnv };
export type { OAuthConfig };
// Remove: DrupalOAuthProvider, SessionAuthorization, TokenResponse, StoredToken
```

**File: `src/oauth/config.ts`**

Review and potentially simplify:

- Remove OAuth endpoint configuration for authorization/token/revocation
- Keep introspection endpoint if used for fallback verification
- Keep metadata discovery endpoint (always needed)
- May not need changes if endpoints only used internally by removed code

## Input Dependencies

- Task 3: Proxy pattern code removed, types deleted
- Task 2: Server integration updated to use new exports
- Verification that no other files import removed exports

## Output Artifacts

- Updated `src/oauth/index.ts` with resource server exports
- Potentially simplified `src/oauth/config.ts`
- Clean TypeScript compilation

## Implementation Notes

<details>
<summary>Detailed Implementation Guidance</summary>

### Pre-Update Verification

Search for usage of exports being removed:

```bash
grep -r "DrupalOAuthProvider" src/ --exclude-dir=__tests__
grep -r "SessionAuthorization" src/ --exclude-dir=__tests__
grep -r "TokenResponse" src/ --exclude-dir=__tests__
grep -r "createDrupalOAuthProvider" src/ --exclude-dir=__tests__
```

All references should only be in:

- Test files (which will be updated/deleted in Task 4)
- `src/oauth/provider.ts` (which is being deleted in Task 3)
- `src/index.ts` (which was updated in Task 2)

### Module Export Pattern

Update `src/oauth/index.ts`:

```typescript
// Resource Server Implementation
export { DrupalTokenVerifier } from './token-verifier.js';

// Configuration
export { OAuthConfigManager, createOAuthConfigFromEnv } from './config.js';
export type { OAuthConfig } from './config.js';

// Utilities (if still needed)
export { extractUserId } from './jwt-decoder.js';
export { verifyJWT } from './jwt-verifier.js';
```

### Configuration Review

In `src/oauth/config.ts`, check if these are still needed:

- `authorizationUrl` - NO (only for authorization code flow)
- `tokenUrl` - NO (only for token exchange)
- `revocationUrl` - NO (only for token revocation)
- `introspectionUrl` - MAYBE (if fallback to introspection instead of JWT)
- `metadataUrl` - YES (always needed for discovery)
- `jwksUrl` - YES (needed for JWT verification)

Simplify to only keep what's actually used by DrupalTokenVerifier.

### Backwards Compatibility Note

If external code depends on old exports (unlikely), consider:

- Adding deprecation warnings
- Providing shim exports with console.warn
- Documenting breaking changes in CHANGELOG.md

For this internal server, breaking changes are acceptable since it's not a published library.

### Build Verification

After changes:

```bash
npm run type-check  # Should pass
npm run build       # Should succeed
npm test            # Should pass (after Task 4 completes)
```

</details>
