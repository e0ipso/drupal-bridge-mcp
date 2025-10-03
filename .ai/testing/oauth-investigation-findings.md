# OAuth Flow Investigation Findings

## Date

2025-10-03

## Problem Statement

After successfully completing OAuth flow in MCP Inspector, tool execution fails with:

- Server: `Token lookup failed: session <id> not mapped to user`
- Client: `MCP error -32603: Tool execution failed: HTTP 403 Forbidden`

## Root Cause Analysis

### What Actually Happens (MCP OAuth 2.1 Flow)

According to
[MCP Specification 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization):

1. **Client initiates OAuth flow** (browser-based):
   - Discovers OAuth metadata: `GET /.well-known/oauth-protected-resource` ✅
   - Redirects user to authorization server ✅
   - User approves on Drupal OAuth server ✅
   - Client receives OAuth tokens (access_token, refresh_token) ✅
   - Client stores tokens client-side ✅

2. **Client sends authenticated requests**:
   - **MUST include**: `Authorization: Bearer <access-token>` header with EVERY request ✅
   - Tokens must NOT be in URI query string ✅
   - Client is doing this correctly ✅

3. **Server validates tokens**:
   - **MUST extract** Authorization header from each request ❌ **WE DON'T DO THIS**
   - **MUST validate** access tokens ❌ **WE DON'T DO THIS**
   - **MUST respond** with 401 if invalid ❌ **WE DON'T DO THIS**

### What Our Server Actually Does

**Current flow** (src/index.ts:608-631):

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

**When tool tries to execute** (src/index.ts:396-423):

```typescript
private async getSession(sessionId: string) {
  // 1. Look up user ID by session ID
  const userId = this.sessionToUser.get(sessionId); // ❌ Returns undefined!

  // 2. Look up tokens by user ID
  const tokens = this.userTokens.get(userId); // ❌ Never gets here

  // 3. Return null - no auth found
  return null; // ❌ Causes 403 error
}
```

### Why Token Lookup Fails

The `sessionToUser` map is empty because:

1. **Device Flow path** (not used by Inspector):

   ```typescript
   handleDeviceFlow(sessionId) {
     // Gets token via device flow
     userId = extractUserId(token);
     this.sessionToUser.set(sessionId, userId); // ✅ Would work
     this.userTokens.set(userId, tokens); // ✅ Would work
   }
   ```

   ❌ **But this is never called for browser-based OAuth!**

2. **Browser Flow path** (used by Inspector):
   ```typescript
   // ❌ NO CODE EXISTS to extract Authorization header
   // ❌ NO CODE EXISTS to decode token and get user ID
   // ❌ NO CODE EXISTS to store in sessionToUser map
   // ❌ NO CODE EXISTS to store in userTokens map
   ```

### The Missing Link

According to MCP spec, the server MUST:

```typescript
// REQUIRED but MISSING from our implementation:
this.app.all('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const authHeader = req.headers['authorization']; // ⬅️ MISSING!

  if (authHeader?.startsWith('Bearer ')) {
    const accessToken = authHeader.substring(7); // ⬅️ MISSING!

    // Decode/validate token and extract user ID // ⬅️ MISSING!
    const userId = extractUserId(accessToken);

    // Store in session maps // ⬅️ MISSING!
    this.sessionToUser.set(sessionId, userId);
    this.userTokens.set(userId, {
      access_token: accessToken,
      // ... other token fields
    });
  }

  await transport.handleRequest(req, res);
});
```

## Why Disconnection Happens During OAuth

The disconnection is **NOT caused by our server code**. This is standard OAuth redirect behavior:

1. MCP Inspector redirects user to `https://drupal-contrib.ddev.site/oauth/authorize`
2. User leaves the MCP Inspector application (disconnect is natural)
3. After approval, browser redirects back to Inspector with authorization code
4. Inspector exchanges code for tokens
5. Inspector creates NEW session when reconnecting
6. Inspector sends tokens with new session requests

This is **expected and correct behavior** for browser-based OAuth.

The problem is not the disconnection - it's that **we never extract and store the tokens the client
sends after reconnection**.

## Test Evidence

From test logs:

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
```

**Inspector IS sending token** in Authorization header (per MCP spec). **Server IS NOT extracting
it** from the header.

## Solution Requirements

To fix this, we need to:

1. **Extract Authorization header** from ALL incoming `/mcp` requests
2. **Parse Bearer token** from the header
3. **Decode/validate token** to extract user ID (using existing `extractUserId()` function)
4. **Store mappings**:
   - `sessionToUser.set(sessionId, userId)`
   - `userTokens.set(userId, { access_token, ... })`
5. **Handle token refresh** when tokens expire
6. **Return 401** when no valid token is present (if auth is required)

## Implementation Location

**File**: `src/index.ts` **Method**: `setupMcpEndpoint()` **Line**: ~608-631

Add token extraction logic before calling `transport.handleRequest(req, res)`.

## References

- [MCP Authorization Spec 2025-03-26](https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization)
- MCP requires: "Authorization MUST be included in every HTTP request from client to server"
- Token format: `Authorization: Bearer <access-token>`
- Servers must validate tokens on each request
