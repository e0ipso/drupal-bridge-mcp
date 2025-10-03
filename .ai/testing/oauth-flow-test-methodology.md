# OAuth Flow Test Methodology

## Test Date

2025-10-03

## Environment

- MCP Inspector (browser-based client)
- Drupal MCP Server v1.4.0
- Drupal OAuth server at https://drupal-contrib.ddev.site

## Test Steps

### 1. Initial Connection & Reconnection

**Action**: Click "Reconnect" button in MCP Inspector

**Expected Server Output**:

```
DELETE /mcp
Session closed: <old-session-id> (user: unauthenticated)
Transport closed for session <old-session-id>
Server closed for session <old-session-id>
Active sessions: 0, Active users: 0
POST /mcp
Creating new session: <new-session-id>
✓ Registered schema for tool: examples.contentTypes.list
✓ Registered schema for tool: examples.article.toMarkdown
✓ Registered schema for tool: examples.articles.list
✓ Registered 3 dynamic tool handlers
Server+Transport created for session <new-session-id>
Session <new-session-id> created. Active sessions: 1
POST /mcp
GET /mcp
```

**Result**: ✅ Session successfully recreated

### 2. Clear OAuth State

**Action**: Click "Authentication settings -> Clear OAuth State"

**Expected Server Output**:

```
(no output)
```

**Result**: ✅ OAuth state cleared client-side only

### 3. Quick OAuth Flow

**Action**: Click "Quick OAuth Flow" button

**Expected Server Output**:

```
GET /.well-known/oauth-protected-resource
```

**Expected Browser Behavior**:

- Redirected to authorization server
- Authorization page displayed

**Result**: ✅ OAuth metadata endpoint accessed

### 4. OAuth Authorization

**Action**: Click "Allow" on authorization server page

**Expected Browser Behavior**:

- User is redirected back to MCP Inspector
- **OBSERVED**: User gets disconnected during redirect

**Result**: ⚠️ Disconnection occurs during OAuth callback

### 5. Reconnection After OAuth

**Action**: Click "Connect" button

**Expected Server Output**:

```
GET /mcp
POST /mcp
Creating new session: <new-session-id-2>
✓ Registered schema for tool: examples.contentTypes.list
✓ Registered schema for tool: examples.article.toMarkdown
✓ Registered schema for tool: examples.articles.list
✓ Registered 3 dynamic tool handlers
Server+Transport created for session <new-session-id-2>
Session <new-session-id-2> created. Active sessions: 2
POST /mcp
GET /mcp
```

**Result**: ✅ New session created (session count = 2)

### 6. List Tools

**Action**: Click "Tools -> List Tools"

**Expected Server Output**:

```
POST /mcp
```

**Expected Inspector Output**:

- List of 3 tools displayed

**Result**: ✅ Tools listed successfully

### 7. Execute Tool (Authentication Required)

**Action**: Execute tool `examples.contentTypes.list`

**Expected Server Output**:

```
POST /mcp
Token lookup failed: session <session-id> not mapped to user
```

**Expected Inspector Output**:

```
Received POST message for sessionId <session-id>
MCP error -32603: Tool "examples.contentTypes.list" execution failed: Tool invocation failed: HTTP 403 Forbidden
```

**Result**: ❌ Tool execution failed - OAuth token not found for session

## Issue Summary

### Problem

After completing OAuth flow successfully, tool execution fails with `403 Forbidden` error.

### Root Cause

OAuth tokens are not associated with the session created after OAuth redirect.

### Session Lifecycle Observed

1. **Session A**: OAuth flow initiated
2. **OAuth Redirect**: User leaves application
3. **OAuth Callback**: User returns to application
4. **Disconnection**: Session A terminates during callback
5. **Session B**: New session created on reconnection
6. **Token Lookup**: Session B has no token mapping → 403 error

### Key Questions

1. Is the disconnection during OAuth callback caused by server code?
2. Should OAuth tokens be stored server-side for the user (not session)?
3. How should session reconnection after OAuth preserve authentication state?
4. Is this a problem with the MCP SDK's OAuth handling or our implementation?
