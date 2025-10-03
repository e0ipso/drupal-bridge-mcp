---
id: 5
group: 'observability'
dependencies: [4]
status: 'completed'
created: '2025-10-02'
skills:
  - typescript
  - api-endpoints
---

# Add Debugging Endpoints and Session Lifecycle Logging

## Objective

Enhance observability by adding debug information to `/health` endpoint and creating optional
`/debug/sessions` endpoint for troubleshooting session-to-user mappings.

## Skills Required

- **TypeScript**: Express route handlers, JSON serialization
- **API Endpoints**: RESTful endpoint design, health check patterns

## Acceptance Criteria

- [ ] `/health` endpoint includes active users and sessions counts
- [ ] `/health` endpoint exposes session-to-user mappings
- [ ] Optional `/debug/sessions` endpoint shows detailed session state
- [ ] All session lifecycle events logged with context
- [ ] Logging includes session ID, user ID, and active counts

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary><strong>Implementation Details</strong></summary>

### 1. Enhance `/health` Endpoint

**Location**: `src/index.ts` - health check route (lines 522-530)

**Current Code**:

```typescript
this.app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    server: this.config.name,
    version: this.config.version,
    authEnabled: this.config.enableAuth,
    timestamp: new Date().toISOString(),
  });
});
```

**New Code**:

```typescript
this.app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    server: this.config.name,
    version: this.config.version,
    authEnabled: this.config.enableAuth,
    timestamp: new Date().toISOString(),

    // Session and authentication state
    activeUsers: this.userTokens.size,
    activeSessions: this.sessionToUser.size,
    sessionMappings: Object.fromEntries(this.sessionToUser.entries()),
  });
});
```

### 2. Add Optional `/debug/sessions` Endpoint

```typescript
this.app.get('/debug/sessions', (_req, res) => {
  res.json({
    sessions: Array.from(this.sessionToUser.entries()).map(([sessionId, userId]) => ({
      sessionId,
      userId,
      hasTokens: this.userTokens.has(userId),
      hasCapabilities: this.sessionCapabilities.has(sessionId),
    })),
    users: Array.from(this.userTokens.keys()),
    summary: {
      totalSessions: this.sessionToUser.size,
      totalUsers: this.userTokens.size,
      authenticatedSessions: Array.from(this.sessionToUser.values()).filter(userId =>
        this.userTokens.has(userId)
      ).length,
    },
  });
});
```

### 3. Comprehensive Session Lifecycle Logging

Add logging at key points:

**Transport Initialization** (index.ts:~391):

```typescript
this.transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => {
    const sessionId = randomUUID();
    console.log(`New transport session created: ${sessionId}`);
    return sessionId;
  },
  enableDnsRebindingProtection: true,
  // ...
});
```

**Server Startup** (index.ts:~536):

```typescript
console.log('\n=== MCP Server Started ===');
console.log(`Active users: ${this.userTokens.size}`);
console.log(`Active sessions: ${this.sessionToUser.size}`);
```

**Token Lookup Attempts** (already in Task 4's `getSession` method):

- Log when lookup starts (session ID provided)
- Log when session → user mapping not found
- Log when user → tokens mapping not found
- Log successful token retrieval

### 4. Logging Format Standards

Use consistent format for all session lifecycle logs:

```typescript
// Session creation
console.log(`Session created: ${sessionId}`);

// Authentication
console.log(`Session ${sessionId} authenticated as user ${userId}`);

// Session close
console.log(`Session closed: ${sessionId} (user: ${userId || 'unauthenticated'})`);

// Logout
console.log(`User ${userId} logged out - tokens removed`);

// Counts
console.log(`Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`);
```

</details>

## Input Dependencies

- Refactored session lifecycle from Task 4
- `userTokens` and `sessionToUser` Maps from Task 2

## Output Artifacts

- Enhanced `/health` endpoint with session/user state
- New `/debug/sessions` endpoint for detailed debugging
- Comprehensive logging throughout session lifecycle
- Standardized log format for easy troubleshooting

## Implementation Notes

The `/health` endpoint changes expose session-to-user mappings which may be sensitive in production.
Consider:

- Adding authentication requirement for `/health` endpoint
- Making `/debug/sessions` only available in development (check `NODE_ENV`)
- Providing configuration option to disable session mapping exposure

For now, implement as documented for debugging, and security hardening can be added later if needed.
