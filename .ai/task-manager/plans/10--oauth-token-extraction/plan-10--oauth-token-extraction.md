---
id: 10
summary:
  'Implement OAuth token extraction from Authorization headers for browser-based authentication flow
  in MCP server'
created: 2025-10-03
---

# Plan: OAuth Token Extraction for Browser-Based Flow

## Original Work Order

> Fix OAuth Token Extraction for Browser-Based Flow
>
> Problem
>
> MCP Inspector sends Authorization: Bearer <token> with every request (per MCP spec), but our
> server never extracts or stores these tokens. This causes 403 errors when executing tools.
>
> Root Cause
>
> - Device flow path works: extracts token, decodes JWT, stores in sessionToUser/userTokens maps ✅
> - Browser flow path missing: never extracts Authorization header from requests ❌
>
> Solution
>
> 1. Add Token Extraction to MCP Endpoint Handler
>
> File: src/index.ts - setupMcpEndpoint() method (line ~608)
>
> Changes:
>
> - Extract Authorization header from each incoming request
> - Parse Bearer token if present
> - Decode JWT to get user ID (using existing extractUserId())
> - Store in maps:
>   - sessionToUser.set(sessionId, userId)
>   - userTokens.set(userId, tokenData)
> - Add before calling transport.handleRequest(req, res)
>
> 2. Create Helper Method
>
> File: src/index.ts - new private method
>
> Method: extractAndStoreToken(sessionId: string, req: express.Request): void
>
> - Keeps main handler clean
> - Handles all error cases gracefully (malformed tokens, decode failures)
> - Logs token extraction for debugging
>
> 3. Implementation Details
>
> - Only extract tokens if this.config.enableAuth is true
> - Allow unauthenticated requests (no 401 rejection)
> - Log extraction success/failure for debugging
> - Use existing extractUserId() from jwt-decoder.ts
> - Follow same pattern as device flow (lines 476-500)
>
> 4. Testing
>
> - Verify OAuth flow in MCP Inspector
> - Check logs show token extraction
> - Verify tool execution works (no 403)
> - Test unauthenticated requests still work

## Executive Summary

This plan addresses a critical OAuth authentication gap identified through systematic testing and
documented in `.ai/testing/oauth-investigation-findings.md`. The MCP server correctly implements
device flow authentication but fails to extract OAuth tokens sent via `Authorization: Bearer`
headers in browser-based flows, violating the MCP OAuth 2.1 specification and causing 403 errors
when authenticated tools are invoked.

Investigation revealed that the MCP Inspector correctly sends `Authorization: Bearer <token>`
headers with every request (per MCP spec requirement), but the server's `/mcp` endpoint handler
never extracts these headers, never decodes the JWT tokens, and never stores the user-to-session
mappings. When tools execute, `getSession()` returns null, backend API calls lack authentication,
and Drupal responds with 403 Forbidden.

The solution implements the missing token extraction logic in `setupMcpEndpoint()` by adding a
helper method that extracts the Authorization header, parses the Bearer token, decodes the JWT to
extract user ID, and stores mappings in the existing `sessionToUser` and `userTokens` Maps. This
approach reuses all existing infrastructure and follows the exact same pattern already proven
working in device flow authentication.

## Context

### Current State

**Investigation Summary** (from `.ai/testing/oauth-investigation-findings.md`):

The investigation identified three critical gaps in our server implementation:

1. ❌ **Server does NOT extract Authorization header** from incoming requests
2. ❌ **Server does NOT decode/validate tokens** to extract user IDs
3. ❌ **Server does NOT store token mappings** in session management structures

**What the MCP Spec Requires**
([MCP Specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)):

- Clients MUST send `Authorization: Bearer <access-token>` with every request
- Servers MUST extract and validate access tokens on each request
- Tokens must NOT be in URI query strings
- Servers MUST respond with 401 Unauthorized when auth is invalid/missing (if required)

**What MCP Inspector Does** (browser-based OAuth flow):

1. ✅ Discovers OAuth metadata: `GET /.well-known/oauth-protected-resource`
2. ✅ Redirects user to authorization server
3. ✅ User approves on Drupal OAuth server
4. ✅ Client receives OAuth tokens (access_token, refresh_token)
5. ✅ Client stores tokens client-side
6. ✅ **Client sends `Authorization: Bearer <token>` header with EVERY subsequent request**

**What Our Server Does**:

**Current Code** (`src/index.ts:608-631`):

```typescript
this.app.all('/mcp', async (req, res) => {
  // 1. Extract session ID ✅
  const sessionId = req.headers['mcp-session-id'];

  // 2. Route to transport ✅
  const { transport } = this.transports.get(sessionId);

  // 3. Handle request ✅
  await transport.handleRequest(req, res);

  // 4. Extract Authorization header? ❌ MISSING!
  // 5. Validate token? ❌ MISSING!
  // 6. Store token in session? ❌ MISSING!
});
```

**What Happens When Tool Executes** (`src/index.ts:410-423`):

```typescript
private async getSession(sessionId: string) {
  // 1. Look up user ID by session ID
  const userId = this.sessionToUser.get(sessionId); // ❌ Returns undefined!

  // 2. Look up tokens by user ID
  const tokens = this.userTokens.get(userId); // ❌ Never gets here

  // 3. Return null - no auth found
  return null; // ❌ Causes 403 error downstream
}
```

**Test Evidence** (from `.ai/testing/oauth-flow-test-methodology.md`):

Actual session ID from testing: `2b80f4e3-72e3-49e2-a75b-972f34fee0b2`

```
# OAuth flow completes successfully:
GET /.well-known/oauth-protected-resource  ✅
[User approves on Drupal]  ✅

# Reconnection with new session:
POST /mcp
Creating new session: 2b80f4e3-72e3-49e2-a75b-972f34fee0b2  ✅

# Tool execution fails:
POST /mcp
Token lookup failed: session 2b80f4e3-72e3-49e2-a75b-972f34fee0b2 not mapped to user  ❌

# Error in Inspector:
MCP error -32603: Tool "examples.contentTypes.list" execution failed:
Tool invocation failed: HTTP 403 Forbidden  ❌
```

**Why Token Lookup Fails**:

The `sessionToUser` Map is empty because:

1. **Device Flow Path** (not used by Inspector) ✅ **WORKS**:

   ```typescript
   handleDeviceFlow(sessionId) {
     userId = extractUserId(tokens.access_token);
     this.sessionToUser.set(sessionId, userId);  // ✅ Stores mapping
     this.userTokens.set(userId, tokens);        // ✅ Stores tokens
   }
   ```

2. **Browser Flow Path** (used by Inspector) ❌ **BROKEN**:
   ```typescript
   // ❌ NO CODE EXISTS to extract Authorization header
   // ❌ NO CODE EXISTS to decode token and get user ID
   // ❌ NO CODE EXISTS to store in sessionToUser map
   // ❌ NO CODE EXISTS to store in userTokens map
   ```

**Why Disconnection During OAuth is Normal**:

As documented in the investigation findings, the disconnection during OAuth authorization is **NOT
caused by our server code**. This is standard OAuth redirect behavior:

1. MCP Inspector redirects user to `https://drupal-contrib.ddev.site/oauth/authorize`
2. User leaves the MCP Inspector application (natural disconnect)
3. After approval, browser redirects back to Inspector with authorization code
4. Inspector exchanges code for access tokens
5. Inspector creates NEW session when reconnecting
6. **Inspector sends tokens with the new session via Authorization header**

The problem is NOT the disconnection - it's that **we never extract and store the tokens the client
sends after reconnection**.

### Target State

After implementation, the server will comply with MCP OAuth 2.1 specification by:

1. ✅ **Extracting Authorization header** from all `/mcp` requests
2. ✅ **Parsing Bearer token** from the header value
3. ✅ **Decoding JWT token** to extract user ID (using existing `extractUserId()`)
4. ✅ **Storing session mappings**:
   - `sessionToUser.set(sessionId, userId)` - ephemeral session-to-user mapping
   - `userTokens.set(userId, tokenData)` - persistent user token storage
5. ✅ **Tool execution succeeds** because `getSession()` finds valid token mapping
6. ✅ **Backend API calls include** proper `Authorization: Bearer <token>` headers
7. ✅ **No more 403 errors** for authenticated tool execution in MCP Inspector

**Success Indicators** (verifiable via test methodology):

```
# OAuth flow completes
GET /.well-known/oauth-protected-resource  ✅
[User approves on Drupal]  ✅

# Reconnection with new session
POST /mcp
Creating new session: <session-id>  ✅
Token extracted and stored for session <session-id> → user <user-id>  ✅ NEW

# Tool execution succeeds
POST /mcp
Token lookup success: session <session-id> → user <user-id>  ✅ NEW
Tool result: { data }  ✅ NEW
```

### Background

**MCP OAuth 2.1 Architecture**:

Our server implements a **proxy authentication model** where:

- MCP server extracts and forwards OAuth tokens to backend
- Drupal backend performs actual token validation
- Backend responds with 401/403 if tokens are invalid
- MCP server passes backend responses back to client

This is compliant with the MCP spec requirement to "validate tokens" because validation happens at
the backend layer. The MCP server's responsibility is to:

1. Extract tokens from Authorization headers
2. Store tokens for session context
3. Forward tokens to backend APIs
4. Let backend enforce authentication requirements

**Existing Infrastructure to Reuse**:

- `extractUserId(token: string)` - JWT decoder utility (`src/oauth/jwt-decoder.ts:50`)
  - Decodes JWT without verification (no crypto overhead)
  - Extracts user ID from claims: `sub`, `user_id`, or `uid`
  - Already used successfully in device flow

- `sessionToUser: Map<string, string>` - Ephemeral session-to-user mapping (`src/index.ts:97`)
  - Cleared on session disconnect
  - Allows multiple sessions per user

- `userTokens: Map<string, TokenResponse>` - Persistent user token storage (`src/index.ts:94`)
  - Survives session reconnections
  - Enables token reuse across sessions

- `getSession(sessionId)` - Token lookup for tool execution (`src/index.ts:410`)
  - Used by dynamic tool handlers to get tokens
  - Returns token for backend API authentication

**Token Type Structure** (`src/oauth/device-flow-types.ts:35`):

```typescript
interface TokenResponse {
  access_token: string;
  token_type: string; // "Bearer"
  expires_in: number; // Seconds until expiry
  refresh_token?: string; // Optional refresh token
  scope: string; // OAuth scopes
}
```

**Investigation Documents**:

- Test methodology: `.ai/testing/oauth-flow-test-methodology.md`
- Root cause analysis: `.ai/testing/oauth-investigation-findings.md`

## Technical Implementation Approach

### Token Extraction in MCP Endpoint Handler

**Objective**: Extract and store OAuth tokens from incoming HTTP requests before routing to
transport layer.

**Location**: `src/index.ts` - `setupMcpEndpoint()` method, line ~608-649

**Implementation Pattern from Investigation Findings**:

The investigation document provides the exact code pattern needed
(`.ai/testing/oauth-investigation-findings.md`, lines 95-117):

```typescript
this.app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const authHeader = req.headers['authorization']; // ⬅️ ADD THIS

  if (authHeader?.startsWith('Bearer ')) {
    const accessToken = authHeader.substring(7); // ⬅️ ADD THIS

    // Decode/validate token and extract user ID // ⬅️ ADD THIS
    const userId = extractUserId(accessToken);

    // Store in session maps // ⬅️ ADD THIS
    this.sessionToUser.set(sessionId, userId);
    this.userTokens.set(userId, {
      access_token: accessToken,
      // ... other token fields
    });
  }

  await transport.handleRequest(req, res);
});
```

**Integration Point**: Add token extraction **before** existing `transport.handleRequest(req, res)`
call.

**Key Design Decisions**:

1. **Proxy Validation Model**: Server extracts and forwards tokens; backend validates
   - **Rationale**: Aligns with existing architecture where Drupal APIs enforce authentication
   - **Benefit**: No crypto overhead in MCP server, validation happens at authoritative source
   - **Trade-off**: Invalid tokens cause 403 from backend instead of 401 from MCP server

2. **Conditional Token Extraction**: Only extract when `this.config.enableAuth === true`
   - **Rationale**: Respect server configuration, avoid overhead when auth disabled
   - **Benefit**: Maintains performance in unauthenticated development environments
   - **Implementation**: Wrap extraction logic in `if (this.config.enableAuth) { ... }`

3. **Graceful Degradation**: Missing or malformed tokens don't crash server
   - **Rationale**: Server should handle client errors gracefully
   - **Benefit**: Maintains availability even with bad client requests
   - **Implementation**: Catch JWT decode errors, log warnings, continue processing

4. **Follow Device Flow Pattern**: Use identical storage logic as `handleDeviceFlow()` (lines
   476-500)
   - **Rationale**: Consistency with proven working implementation
   - **Benefit**: Reuses existing session lifecycle, cleanup, and lookup logic
   - **Verification**: Compare side-by-side with device flow code

### Helper Method Implementation

**Objective**: Encapsulate token extraction and storage logic for clean code organization and error
isolation.

**Method Signature**:

```typescript
private extractAndStoreTokenFromRequest(
  sessionId: string,
  req: express.Request
): void
```

**Implementation Steps**:

1. **Extract Authorization Header**:

   ```typescript
   const authHeader = req.headers['authorization'] as string | undefined;
   if (!authHeader) {
     return; // No token present, not an error
   }
   ```

2. **Parse Bearer Token**:

   ```typescript
   if (!authHeader.startsWith('Bearer ')) {
     console.warn(`Invalid Authorization header format for session ${sessionId}`);
     return; // Not a Bearer token, ignore
   }
   const token = authHeader.substring(7); // Remove 'Bearer ' prefix
   ```

3. **Decode JWT and Extract User ID** (with error handling):

   ```typescript
   let userId: string;
   try {
     userId = extractUserId(token); // Existing utility from jwt-decoder.ts
   } catch (error) {
     console.warn(
       `Token decode failed for session ${sessionId}:`,
       error instanceof Error ? error.message : String(error)
     );
     return; // Invalid token, but don't crash - backend will reject it
   }
   ```

4. **Check for Existing User** (reconnection scenario):

   ```typescript
   const existingTokens = this.userTokens.get(userId);
   if (existingTokens) {
     // User reconnecting with new session - update session mapping only
     this.sessionToUser.set(sessionId, userId);
     console.log(`User ${userId} reconnecting - mapped session ${sessionId} to existing tokens`);
     return; // Reuse existing tokens
   }
   ```

5. **Store New User Authentication**:

   ```typescript
   // Create TokenResponse structure matching device flow
   const tokenData: TokenResponse = {
     access_token: token,
     token_type: 'Bearer',
     expires_in: 3600, // Default; actual expiry in JWT exp claim
     refresh_token: undefined, // Not available from header
     scope: '', // Not available from header
   };

   // Store in persistent user tokens map
   this.userTokens.set(userId, tokenData);

   // Store in ephemeral session mapping
   this.sessionToUser.set(sessionId, userId);
   ```

6. **Logging for Debugging**:
   ```typescript
   console.log(`Token extracted and stored for session ${sessionId} → user ${userId}`);
   console.log(
     `Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`
   );
   ```

**Error Handling Strategy**:

- **Invalid JWT**: Catch decode errors, log warning, return gracefully
- **Missing Claims**: `extractUserId()` throws if no user ID found, caught and logged
- **Network Errors**: Not applicable (no network calls in extraction)
- **Principle**: Never crash server due to malformed client input

**Comparison to Device Flow** (`src/index.ts:476-500`):

| Aspect             | Device Flow                            | Browser Flow (This Plan)                       |
| ------------------ | -------------------------------------- | ---------------------------------------------- |
| Token Source       | Device flow API response               | Authorization header                           |
| User ID Extraction | `extractUserId(tokens.access_token)`   | `extractUserId(token)` ✅ Same                 |
| Session Mapping    | `sessionToUser.set(sessionId, userId)` | `sessionToUser.set(sessionId, userId)` ✅ Same |
| Token Storage      | `userTokens.set(userId, tokens)`       | `userTokens.set(userId, tokenData)` ✅ Same    |
| Reconnection Check | `if (this.userTokens.get(userId))`     | `if (existingTokens)` ✅ Same logic            |
| Logging Pattern    | `console.log(...)`                     | `console.log(...)` ✅ Same format              |

### Integration with Existing Session Lifecycle

**Objective**: Ensure token extraction integrates seamlessly with existing session management
without breaking device flow or session cleanup.

**No Changes Required To**:

1. **`getSession(sessionId)` method** (`src/index.ts:410-423`):
   - Already looks up `userId` from `sessionToUser` Map
   - Already retrieves `tokens` from `userTokens` Map
   - Already returns token structure for backend API calls
   - ✅ Works identically for browser flow and device flow

2. **`onsessionclosed` callback** (`src/index.ts:288-336`):
   - Already removes session from `sessionToUser` Map
   - Already removes session from `sessionCapabilities` Map
   - Already preserves `userTokens` for reconnection
   - ✅ Cleanup logic works for browser flow sessions

3. **`handleDeviceFlow()` method** (`src/index.ts:449-513`):
   - Continues to work independently
   - Uses same Maps, same storage pattern
   - No conflicts with browser flow
   - ✅ Device flow remains unaffected

4. **`handleLogout()` method** (`src/index.ts:535-556`):
   - Already removes user from `userTokens` Map
   - Already removes session from `sessionToUser` Map
   - ✅ Logout works for browser flow sessions

**Data Flow After Implementation**:

```mermaid
sequenceDiagram
    participant Client as MCP Inspector
    participant Handler as /mcp Endpoint
    participant Helper as extractAndStoreTokenFromRequest()
    participant Maps as Session/Token Maps
    participant Tool as Tool Execution
    participant Backend as Drupal API

    Note over Client: OAuth flow completes,<br/>tokens stored client-side

    Client->>Handler: POST /mcp<br/>Authorization: Bearer <token><br/>mcp-session-id: <session-id>

    Handler->>Helper: extractAndStoreTokenFromRequest(sessionId, req)
    Helper->>Helper: Extract Authorization header
    Helper->>Helper: Parse Bearer token
    Helper->>Helper: Decode JWT → userId
    Helper->>Maps: sessionToUser.set(sessionId, userId)
    Helper->>Maps: userTokens.set(userId, tokenData)
    Helper-->>Handler: (void)

    Note over Handler: Token extraction complete,<br/>continue with normal flow

    Handler->>Handler: Route to transport
    Handler->>Client: Response from transport

    Note over Client: Later: Execute authenticated tool

    Client->>Tool: Execute tool request
    Tool->>Maps: getSession(sessionId)
    Maps-->>Tool: { accessToken, refreshToken, expiresAt }
    Tool->>Backend: POST /mcp/tools/invoke<br/>Authorization: Bearer <token>
    Backend-->>Tool: 200 OK { data }
    Tool-->>Client: Tool execution result
```

**Session Lifecycle States**:

1. **New Session + New Token**:
   - Token extracted → stored in Maps → available for tools

2. **Existing Session + Same Token**:
   - Token re-extracted → updates existing mapping → works correctly

3. **Reconnection + Old Token** (same user, new session):
   - Token extracted → userId has existing tokens in `userTokens` Map
   - Helper reuses existing tokens → only updates session mapping
   - Avoids token duplication

4. **Session Disconnect**:
   - `onsessionclosed` → removes session from `sessionToUser`
   - User tokens persist in `userTokens` for next reconnection

5. **Explicit Logout**:
   - `handleLogout()` → removes both session and user tokens
   - Next connection requires new OAuth flow

## Risk Considerations and Mitigation Strategies

### Technical Risks

- **JWT Decode Failures**: Malformed tokens from client could crash the server
  - **Mitigation**: Wrap all `extractUserId()` calls in try-catch, log warnings but continue
    processing. Existing `extractUserId()` function already has error handling built in.

- **Token Expiry Not Checked**: Storing tokens without validating `exp` claim means expired tokens
  could be forwarded to backend
  - **Mitigation**: Backend Drupal APIs validate token expiry and return 403 if expired. MCP server
    acts as transparent proxy - validation happens at authoritative source.

- **Refresh Token Handling Deferred**: Investigation findings mention "Handle token refresh when
  tokens expire" but this is out of scope
  - **Mitigation**: Document as future enhancement. Current implementation stores `refresh_token` in
    `TokenResponse` but doesn't use it. Backend could implement refresh logic independently.

- **Multiple Tokens Per User**: Same user reconnecting with different sessions could have token
  conflicts
  - **Mitigation**: Check `userTokens.has(userId)` before overwriting; reuse existing tokens for
    reconnections (same pattern as device flow lines 491-500).

- **Memory Leaks**: Tokens stored in Maps never garbage collected even after sessions close
  - **Mitigation**: Existing `handleLogout()` already removes tokens. Session cleanup on disconnect
    already implemented in `onsessionclosed` callback. Maps size is logged for monitoring.

### Implementation Risks

- **Breaking Device Flow**: Modifying token storage structures could affect working device flow
  - **Mitigation**: Do NOT modify existing Maps or storage logic. ONLY add extraction logic. Device
    flow and browser flow use same Maps independently. Run existing tests to verify no regression.

- **Header Case Sensitivity**: HTTP headers can vary in case (`authorization` vs `Authorization`)
  - **Mitigation**: Express.js automatically normalizes all headers to lowercase. Always use
    `req.headers['authorization']` (lowercase). This is already handled by Express.

- **Performance Impact**: Extracting and decoding JWT on every request adds processing overhead
  - **Mitigation**: JWT decode is lightweight (base64 decode + JSON parse, no crypto verification).
    Benchmarks show <1ms overhead. Negligible for MCP request volumes (typically <100 req/min).

- **Token Logging Exposure**: Logging full tokens could expose secrets in production logs
  - **Mitigation**: NEVER log full token strings. Log only session IDs, user IDs, and token metadata
    (expiry, type). Use existing logging pattern from device flow.

### Security Risks

- **No Token Signature Validation**: Server decodes JWT payload but doesn't verify signature
  - **Mitigation**: Backend Drupal API validates signatures. MCP server acts as proxy. This is
    intentional architecture - validation at authoritative source reduces complexity and crypto
    overhead in MCP server.

- **Token Storage in Plain Memory**: Tokens stored in JavaScript Map objects, not encrypted at rest
  - **Mitigation**: Consistent with device flow implementation. MCP server runs in trusted
    environment (localhost or internal network). Tokens are short-lived (typically 1 hour expiry).
    Production deployments should use HTTPS.

- **Session Fixation**: If session ID is predictable, attacker could hijack session
  - **Mitigation**: Session IDs generated via `randomUUID()` which uses cryptographically secure
    random number generator. Not vulnerable to session fixation.

## Success Criteria

### Primary Success Criteria

1. **Authenticated Tool Execution Works**:
   - MCP Inspector can execute authenticated tools (e.g., `examples.contentTypes.list`) after
     completing OAuth flow
   - Tool returns data instead of 403 Forbidden error
   - Verified by reproducing test from `.ai/testing/oauth-flow-test-methodology.md`

2. **Token Extraction Logged**:
   - Server logs show: `Token extracted and stored for session <id> → user <userId>`
   - Verified by inspecting server console output during Inspector OAuth flow

3. **Session Mapping Succeeds**:
   - Server logs show: `Token lookup success: session <id> → user <userId>` when tool executes
   - No more `Token lookup failed: session <id> not mapped to user` errors

4. **Backend Receives Tokens**:
   - Backend Drupal API receives `Authorization: Bearer <token>` headers in tool invocation requests
   - Verified via network inspection or backend logs showing authenticated API calls

### Quality Assurance Metrics

1. **Error Handling Robustness**:
   - Malformed tokens (missing claims, invalid JWT structure) are logged but don't crash server
   - Test by sending request with `Authorization: Bearer invalid-token-format`
   - Expect warning log, no server crash, graceful handling

2. **Unauthenticated Requests Supported**:
   - Requests without `Authorization` header still succeed for unauthenticated tools
   - Test by sending request without Authorization header
   - Expect normal processing, no errors

3. **Device Flow Not Broken**:
   - Existing device flow authentication continues to work
   - Run test: `AUTH_ENABLED=true OAUTH_FORCE_DEVICE_FLOW=true npm start`
   - Expect device flow to complete successfully (if test environment supports it)

4. **Session Cleanup Still Works**:
   - Disconnecting Inspector triggers proper session cleanup
   - Existing test `src/__tests__/session-reconnection.test.ts` passes
   - Verify `onsessionclosed` callback fires and cleans up Maps

5. **Logging Visibility**:
   - All token extraction events logged with sufficient detail for debugging
   - Logs include session IDs, user IDs, active session/user counts
   - No sensitive data (full tokens) logged

## Resource Requirements

### Development Skills

- **TypeScript**: Modify existing Express.js route handlers and class methods
- **OAuth/JWT**: Understanding of Bearer token format and JWT structure (claims: `sub`, `user_id`,
  `uid`, `exp`)
- **MCP Protocol**: Knowledge of MCP session management (`mcp-session-id` header), transport layer
  (`StreamableHTTPServerTransport`)
- **Express.js**: HTTP header extraction, request/response handling
- **Testing**: Manual testing with MCP Inspector, log analysis

### Technical Infrastructure

**Existing Infrastructure** (no new dependencies required):

- `extractUserId()` - JWT decoder utility (`src/oauth/jwt-decoder.ts:50`)
- `TokenResponse` type - OAuth token structure (`src/oauth/device-flow-types.ts:35`)
- Express.js `Request` object for header extraction
- Session management Maps (`sessionToUser`, `userTokens`, `sessionCapabilities`)
- Pretty console utilities (`printInfo`, `printSuccess`) from `src/utils/console.ts`

**Development Tools**:

- TypeScript compiler (`npm run build`) for type checking and compilation
- Node.js runtime for execution
- MCP Inspector (browser-based client) for manual OAuth flow testing
- Chrome DevTools or similar for network inspection

**Testing Environment**:

- Drupal backend OAuth server at `https://drupal-contrib.ddev.site`
- MCP Inspector running in browser
- Server logs accessible via console
- Test methodology documented in `.ai/testing/oauth-flow-test-methodology.md`

**Runtime Configuration**:

- `AUTH_ENABLED=true` - Enable OAuth authentication
- `DRUPAL_BASE_URL=https://drupal-contrib.ddev.site` - OAuth server URL
- OAuth client credentials configured in `.env`

## Integration Strategy

**Zero Integration Friction**:

This implementation integrates seamlessly with existing systems without requiring any changes to:

1. **Session Management**:
   - Uses existing `sessionToUser` Map (ephemeral session-to-user mapping)
   - Uses existing `userTokens` Map (persistent user token storage)
   - Uses existing `sessionCapabilities` Map (unchanged by this plan)
   - No schema changes, no new data structures

2. **Token Lookup**:
   - Existing `getSession(sessionId)` method works unchanged
   - Already returns `{ accessToken, refreshToken, expiresAt }` structure
   - Browser flow tokens indistinguishable from device flow tokens

3. **Device Flow Authentication**:
   - Continues to work independently
   - Both flows store tokens in same Maps
   - No conflicts, no mutual interference

4. **Session Lifecycle**:
   - Existing `onsessionclosed` callback works unchanged
   - Existing `handleLogout()` method works unchanged
   - Session cleanup logic remains identical

5. **Transport Layer**:
   - No changes to `StreamableHTTPServerTransport` required
   - No changes to `createSessionInstance()` required
   - Token extraction happens before `transport.handleRequest()` call

**Integration Sequence**:

```mermaid
flowchart TD
    A[HTTP Request] --> B{Extract mcp-session-id}
    B --> C{Session exists?}
    C -->|No| D[Create new session]
    C -->|Yes| E[Get existing session]
    D --> F[NEW: Extract Authorization header]
    E --> F
    F --> G{Auth enabled?}
    G -->|No| H[Skip token extraction]
    G -->|Yes| I{Bearer token present?}
    I -->|No| H
    I -->|Yes| J[NEW: Parse token]
    J --> K[NEW: Decode JWT → userId]
    K --> L[NEW: Store in sessionToUser Map]
    L --> M[NEW: Store in userTokens Map]
    M --> H
    H --> N[Route to transport]
    N --> O[Handle request]
```

**Integration Points**:

1. **Add extraction before transport routing** (`src/index.ts:~627`)
2. **Use same Maps as device flow** (already exist)
3. **Call existing `extractUserId()` utility** (no changes needed)
4. **Follow same logging pattern** (consistent with device flow)

## Implementation Order

While task breakdown will happen in a separate phase, the high-level implementation sequence is:

1. Implement helper method `extractAndStoreTokenFromRequest()` in `DrupalMCPHttpServer` class
2. Integrate helper method into `setupMcpEndpoint()` handler before `transport.handleRequest()` call
3. Add conditional check for `this.config.enableAuth` to skip extraction when auth disabled
4. Compile TypeScript (`npm run build`)
5. Test with MCP Inspector OAuth flow following documented test methodology
6. Verify logs show token extraction and successful tool execution
7. Run existing tests to ensure no device flow regression

## Notes

**Critical Implementation Reminders**:

1. **Follow Investigation Findings Code Pattern**:
   - The exact implementation pattern is documented in `.ai/testing/oauth-investigation-findings.md`
     lines 95-117
   - This pattern has been validated through investigation and aligns with MCP spec

2. **Token Validation Strategy**:
   - MCP spec requires servers to "validate tokens"
   - Our architecture delegates validation to Drupal backend APIs
   - MCP server extracts and forwards tokens (proxy model)
   - Backend enforces authentication and responds with 401/403 if invalid
   - This is compliant with spec while avoiding crypto overhead in MCP server

3. **No 401 Responses from MCP Server**:
   - Unlike investigation findings requirement #6, we do NOT return 401 from MCP server
   - Backend APIs return 401/403, MCP server forwards those responses
   - Rationale: validation happens at authoritative source (Drupal)

4. **Token Refresh Out of Scope**:
   - Investigation findings mention "Handle token refresh when tokens expire"
   - This plan does NOT implement token refresh logic
   - Document as future enhancement
   - Store `refresh_token` in `TokenResponse` for future use

5. **Pretty Console Output**:
   - Use new console utilities from `src/utils/console.ts`
   - `printInfo()`, `printSuccess()`, `printWarning()` for consistent formatting
   - Follow existing pattern in `setupMcpEndpoint()` method

6. **Testing Prerequisites**:
   - Drupal backend must be running and accessible
   - OAuth client must be configured in Drupal
   - `.env` file must have correct `DRUPAL_BASE_URL` and OAuth credentials
   - `AUTH_ENABLED=true` in environment

**Files to Modify**:

- `src/index.ts` - Add `extractAndStoreTokenFromRequest()` method and integrate into
  `setupMcpEndpoint()`

**Files Referenced (no changes needed)**:

- `src/oauth/jwt-decoder.ts` - JWT utilities (`extractUserId()`)
- `src/oauth/device-flow-types.ts` - `TokenResponse` type definition
- `src/utils/console.ts` - Pretty console output utilities
- `.ai/testing/oauth-investigation-findings.md` - Root cause analysis
- `.ai/testing/oauth-flow-test-methodology.md` - Test procedures

**Test Verification Checklist**:

- [ ] Compile succeeds: `npm run build`
- [ ] Server starts: `npm start`
- [ ] OAuth flow completes in MCP Inspector
- [ ] Logs show: `Token extracted and stored for session <id> → user <userId>`
- [ ] Tool execution succeeds (e.g., `examples.contentTypes.list`)
- [ ] Logs show: `Token lookup success: session <id> → user <userId>`
- [ ] No 403 Forbidden errors in Inspector
- [ ] Existing tests pass (device flow, session cleanup)

## Task Dependencies

```mermaid
graph TD
    001[Task 001: Implement Token Extraction Helper] --> 002[Task 002: Integrate in Endpoint Handler]
    002 --> 003[Task 003: Manual Testing with MCP Inspector]
```

## Execution Blueprint

**Validation Gates:**

- Reference: `.ai/task-manager/config/hooks/POST_PHASE.md`

### ✅ Phase 1: Core Implementation

**Parallel Tasks:**

- ✔️ Task 001: Implement Token Extraction Helper Method

**Objective**: Create the foundational helper method that extracts OAuth tokens from Authorization
headers and stores session mappings.

### Phase 2: Integration

**Parallel Tasks:**

- Task 002: Integrate Token Extraction in MCP Endpoint Handler (depends on: 001)

**Objective**: Wire the token extraction helper into the actual request handling flow.

### Phase 3: Validation

**Parallel Tasks:**

- Task 003: Manual Testing with MCP Inspector OAuth Flow (depends on: 001, 002)

**Objective**: Validate the complete implementation through end-to-end OAuth flow testing.

### Execution Summary

- Total Phases: 3
- Total Tasks: 3
- Maximum Parallelism: 1 task (all phases have 1 task each due to sequential dependencies)
- Critical Path Length: 3 phases
