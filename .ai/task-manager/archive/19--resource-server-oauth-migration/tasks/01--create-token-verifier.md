---
id: 1
group: 'resource-server-implementation'
dependencies: []
status: 'completed'
created: '2025-10-24'
skills:
  - typescript
  - oauth
---

# Create DrupalTokenVerifier implementing OAuthTokenVerifier interface

## Objective

Create a new `DrupalTokenVerifier` class that implements the MCP SDK's `OAuthTokenVerifier`
interface, replacing the proxy pattern with resource server pattern for OAuth token validation.

## Skills Required

- **TypeScript**: Implement interface with strict typing, ES modules, async/await patterns
- **OAuth 2.1**: Understand resource server token validation, JWT structure, AuthInfo extraction

## Acceptance Criteria

- [ ] Create `src/oauth/token-verifier.ts` implementing `OAuthTokenVerifier` interface
- [ ] Implement `verifyAccessToken(token: string): Promise<AuthInfo>` method
- [ ] Reuse existing `verifyJWT()` logic from `jwt-verifier.ts`
- [ ] Extract AuthInfo fields: token, clientId, scopes, expiresAt, resource
- [ ] Handle verification failures with appropriate error types
- [ ] Type checking passes: `npm run type-check`

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**SDK Interface**: `node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/provider.d.ts:62-67`

```typescript
export interface OAuthTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthInfo>;
}
```

**AuthInfo Structure**:
`node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/types.d.ts:4-31`

```typescript
export interface AuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
  resource?: URL;
  extra?: Record<string, unknown>;
}
```

**Existing JWT Verification**: Leverage `src/oauth/jwt-verifier.ts` `verifyJWT()` function which
already:

- Fetches Drupal public keys
- Verifies JWT signature
- Validates token expiration
- Extracts claims

## Input Dependencies

- Existing `jwt-verifier.ts` with `verifyJWT()` function
- Existing `config.ts` with OAuth configuration
- MCP SDK types for `OAuthTokenVerifier` and `AuthInfo`

## Output Artifacts

- `src/oauth/token-verifier.ts` - New file with `DrupalTokenVerifier` class
- Exports `DrupalTokenVerifier` for use in server integration

## Implementation Notes

<details>
<summary>Detailed Implementation Guidance</summary>

### File Structure

Create `src/oauth/token-verifier.ts` with:

```typescript
import { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { verifyJWT } from './jwt-verifier.js';
import type { OAuthConfigManager } from './config.js';

export class DrupalTokenVerifier implements OAuthTokenVerifier {
  private readonly configManager: OAuthConfigManager;

  constructor(configManager: OAuthConfigManager) {
    this.configManager = configManager;
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    // 1. Call verifyJWT to validate token
    // 2. Extract claims from JWT payload
    // 3. Map JWT claims to AuthInfo structure
    // 4. Return AuthInfo or throw on validation failure
  }
}
```

### Key Mappings (JWT → AuthInfo)

- `token` ← token parameter (input)
- `clientId` ← JWT `aud` claim (audience)
- `scopes` ← JWT `scope` claim (split by space if string)
- `expiresAt` ← JWT `exp` claim (expiration timestamp)
- `resource` ← JWT `aud` as URL if present

### Error Handling

- Invalid signature → throw Error with descriptive message
- Expired token → throw Error with expiration details
- Missing required claims → throw Error with missing claim info
- Public key fetch failure → throw Error with key endpoint info

### Reference Implementation

Look at `src/oauth/provider.ts:104-150` for existing `verifyToken()` method to understand the
current pattern, then simplify to focus only on verification without storage.

</details>
