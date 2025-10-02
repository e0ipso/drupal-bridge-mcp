# 05: Multi-User Session Management

## Overview
Implement robust multi-user support allowing concurrent authenticated sessions with secure, encrypted token storage on the **MCP Server**. This phase ensures the **MCP Server** can handle multiple **MCP Clients** simultaneously while maintaining security, session isolation, and reconnection resilience. Each **MCP Client** connection receives secure session management with user-level authentication that persists across transport reconnections.

## User vs Session Lifecycle (Critical Distinction)

**Transport Sessions (Ephemeral)**:
- Created when **MCP Client** connects via StreamableHTTP
- Automatically generated session ID (UUID)
- Destroyed on disconnect/reconnect
- **MCP Inspector** creates new session on each connection

**User Authentication (Persistent)**:
- Tied to user identity (user ID from OAuth)
- Survives transport session reconnections
- Only cleared on explicit logout
- Multiple transport sessions can share same user authentication

**Key Insight**: Tokens must be stored by **user ID**, not **session ID**, to support reconnection.

## User-Facing Features
- **Concurrent User Sessions**: Multiple **MCP Clients** can connect to **MCP Server** and authenticate simultaneously
- **Session Isolation**: Each **MCP Client's** data and tokens are completely isolated on **MCP Server**
- **Reconnection Support**: **MCP Client** authentication persists across transport disconnects/reconnects
- **Persistent User Authentication**: User tokens remain valid until explicit logout (not tied to transport session lifecycle)
- **Automatic Token Refresh**: **MCP Server** renews expired tokens transparently for each user
- **Session Status Monitoring**: **MCP Clients** can check their authentication status on **MCP Server**

## Functional Capabilities
- **MCP Server** maintains user-level authentication state (keyed by user ID)
- **MCP Server** maps transport sessions to authenticated users
- **MCP Server** stores encrypted tokens in memory per user (not per session)
- **MCP Server** automatic transport session cleanup on **MCP Client** disconnect
- **MCP Server** preserves user tokens across transport session reconnections
- **MCP Server** token refresh before expiration for each authenticated user
- **MCP Server** user timeout handling with explicit logout mechanism
- **MCP Server** concurrent request processing for multiple authenticated users

## Security Features
- **In-Memory Encryption**: **MCP Server** encrypts all tokens using AES-256-GCM
- **User-Specific Keys**: Each authenticated user has unique encryption keys on **MCP Server**
- **No Persistent Storage**: Tokens exist only in **MCP Server** encrypted memory
- **Explicit Cleanup**: **MCP Server** removes tokens only on explicit user logout (not transport disconnect)
- **Session Isolation**: Transport sessions cannot access other users' tokens
- **Key Derivation**: **MCP Server** secure key generation using Node.js crypto

## Session Lifecycle

### Initial Authentication Flow
1. **MCP Client** connects to **MCP Server** and receives unique transport session ID
2. User authenticates via OAuth (device flow or browser flow) through **MCP Client**
3. **MCP Server** receives OAuth tokens and extracts user ID from token claims
4. **MCP Server** encrypts and stores tokens in user-level storage (keyed by user ID)
5. **MCP Server** maps transport session ID → user ID for future requests
6. All subsequent **MCP Client** requests use user tokens looked up via session → user mapping

### Reconnection Flow (Critical for MCP Inspector)
1. **MCP Client** disconnects (network issue, inspector refresh, etc.)
2. **MCP Server** transport session closes, triggers `onsessionclosed` callback
3. **MCP Server** removes transport session ID from session → user mapping
4. **MCP Server** PRESERVES user tokens (does NOT delete)
5. **MCP Client** reconnects with NEW transport session ID
6. User re-authenticates (or uses stored credentials)
7. **MCP Server** recognizes existing user ID from OAuth token
8. **MCP Server** creates new session ID → user ID mapping
9. **MCP Client** resumes work with existing user tokens (no data loss)

### Explicit Logout Flow
1. **MCP Client** calls logout tool
2. **MCP Server** removes user tokens from user-level storage
3. **MCP Server** removes session ID → user ID mapping
4. **MCP Server** closes transport session
5. User must re-authenticate to continue using tools

## Session-to-User Mapping Architecture

### Data Structures

```typescript
// User-level token storage (persistent across reconnections)
private userTokens: Map<string, TokenResponse> = new Map();
// userId → { access_token, refresh_token, expires_in }

// Transport session to user mapping (ephemeral)
private sessionToUser: Map<string, string> = new Map();
// sessionId → userId

// Session capabilities (optional, ephemeral)
private sessionCapabilities: Map<string, ClientCapabilities> = new Map();
// sessionId → capabilities
```

### Token Lookup Pattern

```typescript
async getSession(sessionId: string): Promise<Session | null> {
  // 1. Get user ID from session mapping
  const userId = this.sessionToUser.get(sessionId);
  if (!userId) {
    return null; // Session not authenticated
  }

  // 2. Get user tokens from user storage
  const tokens = this.userTokens.get(userId);
  if (!tokens) {
    return null; // User tokens expired/logged out
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
  };
}
```

### Session Lifecycle Callbacks

```typescript
onsessionclosed: async (sessionId: string) => {
  console.log(`Transport session closed: ${sessionId}`);

  // Remove session mapping (ephemeral)
  this.sessionToUser.delete(sessionId);
  this.sessionCapabilities.delete(sessionId);

  // DO NOT remove user tokens - they persist for reconnection
  // Tokens are only removed on explicit logout
}
```

## Technical Stack Requirements

### Core Features
- Node.js crypto module for encryption
- Dual-Map storage: user tokens + session-to-user mapping
- Automatic garbage collection for orphaned sessions
- User ID extraction from OAuth token claims (JWT decoding)

### Security Requirements
- Cryptographically secure session ID generation
- Proper key derivation functions
- Memory-safe token handling
- User isolation: sessions cannot access other users' tokens

## Success Criteria
- Multiple **MCP Clients** can authenticate independently to **MCP Server**
- **MCP Client** sessions remain isolated from each other on **MCP Server**
- **MCP Client** can disconnect and reconnect without losing authentication
- **MCP Inspector** can reconnect without "Server already initialized" error
- **MCP Server** token refresh happens automatically for each authenticated user
- **MCP Server** memory usage scales with user count (not session count)
- **MCP Server** transport session data is cleaned up on disconnect
- **MCP Server** user tokens persist until explicit logout
- No token leakage between users on **MCP Server**
- Tool calls after reconnection use existing user tokens (no 403 errors)

## Known Issues & Resolutions

### Issue 1: HTTP 403 on Tool Invocation After Authentication

**Symptom**: MCP Inspector successfully authenticates but tool calls return:
```
HTTP 403 Forbidden
Tool "examples.contentTypes.list" execution failed
```

**Root Cause**:
- OAuth tokens stored in `Map<sessionId, tokens>`
- Inspector creates NEW session ID on each connection
- Token lookup fails because new session ID has no tokens
- Request to Drupal sent without Authorization header
- Drupal rejects unauthenticated request with 403

**Resolution**:
- Store tokens in `Map<userId, tokens>` (user-level)
- Add `Map<sessionId, userId>` mapping (session-to-user)
- Extract user ID from OAuth token claims
- Look up tokens via two-step process: sessionId → userId → tokens
- Tokens persist across session reconnections

### Issue 2: "Server Already Initialized" Error on Reconnection

**Symptom**: MCP Inspector connects successfully but reconnection fails:
```
Error: Invalid Request: Server already initialized
```

**Root Cause**:
- `server.connect(transport)` called once during server startup
- StreamableHTTPServerTransport creates new session per connection
- MCP SDK Server class doesn't support re-initialization
- Each connection sends `initialize` request
- Server rejects duplicate initialization attempts

**Resolution** (Multiple Options):

**Option A: Single Long-Lived Transport** (Current Implementation)
- Create one transport instance at server startup
- Transport handles multiple sessions internally
- All connections share same transport instance
- Each session gets unique ID, but transport persists

**Option B: Session Isolation Per Transport** (Alternative)
- Create new Server + Transport per connection
- Each connection is completely isolated
- Higher memory usage but simpler session management
- Suitable for single-user scenarios

**Option C: Transport Session Reuse** (Future Investigation)
- Investigate if transport supports session resumption
- May require SDK enhancements
- Check if `Mcp-Session-Id` header can persist across requests

**Recommended**: Option A with user-level token storage

## Session Debugging Recommendations

### Logging Strategy
```typescript
// Log session lifecycle with user context
console.log(`Session ${sessionId} created`);
console.log(`Session ${sessionId} authenticated as user ${userId}`);
console.log(`Session ${sessionId} closed (user ${userId} tokens preserved)`);
console.log(`User ${userId} explicitly logged out (tokens deleted)`);

// Log token availability
console.log(`Active users: ${this.userTokens.size}`);
console.log(`Active sessions: ${this.sessionToUser.size}`);
console.log(`Session ${sessionId} → User ${userId || 'unauthenticated'}`);
```

### Health Check Endpoint
```typescript
GET /health
{
  "activeUsers": 3,
  "activeSessions": 5,
  "sessionMappings": {
    "session-abc": "user-123",
    "session-def": "user-456"
  }
}
```

## Relevant Resources
- [MCP Specification](https://modelcontextprotocol.io/docs/specification)
- [OAuth 2.1 Token Management](https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/)
- [StreamableHTTP Transport Docs](https://modelcontextprotocol.io/docs/concepts/transports)
- [MCP Server SDK](https://github.com/modelcontextprotocol/typescript-sdk)