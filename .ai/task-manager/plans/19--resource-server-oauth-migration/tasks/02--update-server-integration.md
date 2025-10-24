---
id: 2
group: 'resource-server-implementation'
dependencies: [1]
status: 'completed'
created: '2025-10-24'
skills:
  - typescript
  - mcp-server
---

# Update server integration to use DrupalTokenVerifier

## Objective

Modify `src/index.ts` to use `DrupalTokenVerifier` instead of `DrupalOAuthProvider`, removing proxy
pattern infrastructure and simplifying to resource server pattern.

## Skills Required

- **TypeScript**: Update imports, refactor initialization, handle async patterns
- **MCP Server**: Understand MCP server architecture, authentication middleware, session management

## Acceptance Criteria

- [ ] Replace `DrupalOAuthProvider` imports with `DrupalTokenVerifier`
- [ ] Update OAuth initialization to use verifier pattern
- [ ] Simplify token extraction logic (no storage needed)
- [ ] Remove `mcpAuthRouter` OAuth endpoints (keep resource metadata only)
- [ ] Maintain existing authentication flow compatibility
- [ ] Type checking passes: `npm run type-check`

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Current Pattern**: `src/index.ts` imports and uses
`DrupalOAuthProvider extends ProxyOAuthServerProvider`

**Target Pattern**: Use `DrupalTokenVerifier implements OAuthTokenVerifier` with Bearer auth
middleware

**SDK Reference**:
`node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/middleware/bearerAuth.d.ts`

```typescript
export function requireBearerAuth({
  verifier: OAuthTokenVerifier,
  requiredScopes?: string[],
  resourceMetadataUrl?: string
}): RequestHandler;
```

**Key Changes**:

1. Import `DrupalTokenVerifier` instead of `DrupalOAuthProvider`
2. Create verifier instance: `new DrupalTokenVerifier(configManager)`
3. Remove OAuth authorization/token/revocation endpoints
4. Keep resource metadata endpoint: `/.well-known/oauth-protected-resource`
5. Simplify `extractAndStoreTokenFromRequest()` - no storage, just validation

## Input Dependencies

- Task 1: `DrupalTokenVerifier` class from `src/oauth/token-verifier.ts`
- Existing `src/oauth/config.ts` for configuration management
- MCP SDK middleware for Bearer auth

## Output Artifacts

- Updated `src/index.ts` with resource server integration
- Simplified authentication middleware chain
- Removed proxy pattern infrastructure

## Implementation Notes

<details>
<summary>Detailed Implementation Guidance</summary>

### Import Changes

```typescript
// OLD
import { DrupalOAuthProvider } from '@/oauth/index.js';

// NEW
import { DrupalTokenVerifier } from '@/oauth/index.js';
```

### Initialization Changes

```typescript
// OLD: Creates provider with full OAuth endpoints
const oauthProvider = createDrupalOAuthProvider(configManager);

// NEW: Creates simple verifier
const tokenVerifier = new DrupalTokenVerifier(configManager);
```

### Router Simplification

```typescript
// REMOVE: mcpAuthRouter provides authorization, token, revocation endpoints
app.use(
  mcpAuthRouter({
    provider: oauthProvider,
    issuerUrl: serverUrl,
    scopesSupported: ['mcp:tools'],
  })
);

// KEEP ONLY: Resource metadata endpoint
// This is automatic with resource server pattern - check SDK docs
```

### Token Extraction Simplification

Current `extractAndStoreTokenFromRequest()` does:

1. Extract token from Authorization header
2. Store in `oauthProvider.captureSessionToken()`
3. Map session to user

New pattern should:

1. Extract token from Authorization header
2. Call `tokenVerifier.verifyAccessToken(token)` to get AuthInfo
3. Attach AuthInfo to request context (no storage needed)

**Important**: The server no longer needs to store tokens. Each request validates the token
independently using JWT verification.

### Reference Files

- Current integration: `src/index.ts:540-597` (extractAndStoreTokenFromRequest)
- Current initialization: `src/index.ts:100-150` (DrupalMCPHttpServer constructor)

</details>
