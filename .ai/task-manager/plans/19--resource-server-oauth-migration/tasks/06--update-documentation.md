---
id: 6
group: 'documentation'
dependencies: [2, 3, 5]
status: 'pending'
created: '2025-10-24'
skills:
  - technical-writing
---

# Update documentation for resource server architecture

## Objective

Update AGENTS.md and related documentation to reflect the resource server pattern, removing
references to proxy pattern and documenting the simplified OAuth architecture.

## Skills Required

- **Technical Writing**: Document architectural changes, update code references, maintain clarity

## Acceptance Criteria

- [ ] Update AGENTS.md OAuth authentication section to reflect resource server pattern
- [ ] Remove references to token storage, refresh logic, proxy pattern
- [ ] Document that token lifecycle is client-managed (Claude Code)
- [ ] Update code references (file paths, line numbers) to match new structure
- [ ] Ensure consistency with June 2025 MCP specification terminology

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File: AGENTS.md**

Current OAuth section describes:

- Token storage: "User-level persistence (`userTokens` map) + session-level mapping (`sessionToUser`
  map)"
- Session lifecycle with token persistence
- Device flow with token storage

Target OAuth section should describe:

- Resource server pattern: "Server validates access tokens, does not store or manage tokens"
- JWT verification using public key from Drupal
- Client-managed token lifecycle (refresh handled by Claude Code)
- No token storage on server side

**Key Changes**:

1. Section "OAuth Authentication (`src/oauth/`)"
   - Update to describe resource server pattern
   - Remove references to token storage maps
   - Document `DrupalTokenVerifier` instead of `DrupalOAuthProvider`

2. Section "Session Lifecycle"
   - Simplify: No token persistence, only validation per-request
   - Remove "User tokens persist for reconnection"

3. Section "Important Constraints"
   - Remove "OAuth tokens persist by userId"
   - Add "Token lifecycle managed by client (Claude Code)"

## Input Dependencies

- Task 2: Server integration changes (new file paths)
- Task 3: Removed code (document what's gone)
- Task 5: Module exports (document new API)

## Output Artifacts

- Updated AGENTS.md with accurate OAuth architecture documentation
- Consistent terminology aligned with MCP June 2025 specification

## Implementation Notes

<details>
<summary>Detailed Implementation Guidance</summary>

### Documentation Sections to Update

#### 1. Project Overview (Line ~17)

No changes needed - high-level description remains accurate.

#### 2. OAuth Authentication Section (Lines ~45-65)

**Current**:

> Token storage: User-level persistence (`userTokens` map) + session-level mapping (`sessionToUser`
> map)

**Target**:

> Resource Server Pattern: Server validates access tokens using JWT verification with Drupal public
> keys. Token lifecycle (issuance, refresh, revocation) managed by OAuth client (Claude Code).

**Files**:

- `token-verifier.ts`: JWT validation, AuthInfo extraction
- `jwt-verifier.ts`: JWT signature verification, public key fetching
- `jwt-decoder.ts`: Extract user ID from JWT claims

#### 3. Session Lifecycle Section (Lines ~84-96)

**Simplify to**:

- **Authentication**: Authorization header extracted → JWT verified → AuthInfo attached to request
- **Validation**: Each request validates token independently, no server-side storage
- **Client Responsibility**: Token refresh handled by Claude Code before expiration

**Remove**:

- "Token stored in `userTokens` map"
- "User tokens persist for reconnection"

#### 4. OAuth Device Flow Section (Lines ~106-112)

**Keep** device flow description for initial authentication, but note:

- Device flow initiates OAuth, returns tokens to Claude Code
- Server never receives refresh_token
- Subsequent requests send only access_token

#### 5. Important Constraints Section (Lines ~180-185)

**Remove**:

- "OAuth tokens persist by userId: Never clear `userTokens` on session close"

**Add**:

- "Token lifecycle is client-managed: Server validates tokens but does not store or refresh them"
- "JWT verification requires Drupal public key endpoint availability"

### Architectural Terminology

Use consistent terms aligned with MCP spec:

- "Resource Server" (not "authorization server" or "proxy server")
- "Token verification" (not "token management")
- "Client-managed lifecycle" (not "server-managed lifecycle")
- "JWT validation" (specific technique used)

### Code References

Update file paths and line numbers:

- `src/oauth/provider.ts` → `src/oauth/token-verifier.ts`
- Remove references to deleted methods (captureSessionToken, refreshSessionToken, etc.)
- Add references to new DrupalTokenVerifier class

### Testing Note

No automated tests for documentation - manual review for:

- Technical accuracy
- Consistency with code
- Clear explanation of resource server pattern
- Alignment with MCP June 2025 specification

</details>
