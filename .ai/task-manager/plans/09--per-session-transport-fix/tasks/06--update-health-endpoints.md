---
id: 6
group: 'observability'
dependencies: [1, 2]
status: 'pending'
created: '2025-10-03'
skills:
  - 'typescript'
---

# Update Health and Debug Endpoints for Transport Map

## Objective

Modify `/health` and `/debug/sessions` endpoints to display information about the transports map
instead of single transport status.

## Skills Required

- **TypeScript**: Map iteration, object transformation

## Acceptance Criteria

- [ ] Update `/health` endpoint to show transport map size
- [ ] Update `/debug/sessions` endpoint to include session IDs from transports map
- [ ] Preserve existing session and user count information
- [ ] Endpoints return valid JSON
- [ ] Information is useful for debugging multi-session scenarios

## Technical Requirements

**Current `/health` Endpoint** (lines 645-658):

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

**Updated `/health` Endpoint**:

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
    activeTransports: this.transports.size,
    sessionMappings: Object.fromEntries(this.sessionToUser.entries()),
  });
});
```

**Current `/debug/sessions` Endpoint** (lines 660-680):

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

**Updated `/debug/sessions` Endpoint**:

```typescript
this.app.get('/debug/sessions', (_req, res) => {
  res.json({
    sessions: Array.from(this.sessionToUser.entries()).map(([sessionId, userId]) => ({
      sessionId,
      userId,
      hasTokens: this.userTokens.has(userId),
      hasCapabilities: this.sessionCapabilities.has(sessionId),
      hasTransport: this.transports.has(sessionId),
    })),
    transports: Array.from(this.transports.keys()),
    users: Array.from(this.userTokens.keys()),
    summary: {
      totalSessions: this.sessionToUser.size,
      totalUsers: this.userTokens.size,
      totalTransports: this.transports.size,
      authenticatedSessions: Array.from(this.sessionToUser.values()).filter(userId =>
        this.userTokens.has(userId)
      ).length,
    },
  });
});
```

**File Location**: `src/index.ts` **Lines to modify**: 645-680

## Input Dependencies

- Task 1: Transports map architecture
- Task 2: Sessions populated in transports map

## Output Artifacts

- Updated health endpoint showing transport count
- Updated debug endpoint showing transport session IDs
- Enhanced debugging information for multi-client scenarios

<details>
<summary>Implementation Notes</summary>

### Step-by-Step Instructions

1. **Update `/health` Endpoint** (lines 645-658):

   Find the endpoint handler and add `activeTransports` field:

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
       activeTransports: this.transports.size, // ✅ ADD THIS LINE
       sessionMappings: Object.fromEntries(this.sessionToUser.entries()),
     });
   });
   ```

2. **Update `/debug/sessions` Endpoint** (lines 660-680):

   Add transport information to sessions array and summary:

   ```typescript
   this.app.get('/debug/sessions', (_req, res) => {
     res.json({
       sessions: Array.from(this.sessionToUser.entries()).map(([sessionId, userId]) => ({
         sessionId,
         userId,
         hasTokens: this.userTokens.has(userId),
         hasCapabilities: this.sessionCapabilities.has(sessionId),
         hasTransport: this.transports.has(sessionId), // ✅ ADD THIS LINE
       })),
       transports: Array.from(this.transports.keys()), // ✅ ADD THIS LINE
       users: Array.from(this.userTokens.keys()),
       summary: {
         totalSessions: this.sessionToUser.size,
         totalUsers: this.userTokens.size,
         totalTransports: this.transports.size, // ✅ ADD THIS LINE
         authenticatedSessions: Array.from(this.sessionToUser.values()).filter(userId =>
           this.userTokens.has(userId)
         ).length,
       },
     });
   });
   ```

3. **Testing Endpoints**:

   ```bash
   npm run build
   npm run dev

   # Test health endpoint
   curl http://localhost:6200/health | jq

   # Expected output includes:
   # {
   #   "activeUsers": 0,
   #   "activeSessions": 0,
   #   "activeTransports": 0
   # }

   # Connect MCP Inspector, then check again
   curl http://localhost:6200/health | jq

   # Expected output:
   # {
   #   "activeUsers": 1,
   #   "activeSessions": 1,
   #   "activeTransports": 1
   # }

   # Test debug endpoint
   curl http://localhost:6200/debug/sessions | jq

   # Expected output includes:
   # {
   #   "sessions": [{
   #     "sessionId": "abc-123",
   #     "userId": "user-456",
   #     "hasTokens": true,
   #     "hasCapabilities": true,
   #     "hasTransport": true
   #   }],
   #   "transports": ["abc-123"],
   #   "summary": {
   #     "totalSessions": 1,
   #     "totalUsers": 1,
   #     "totalTransports": 1
   #   }
   # }
   ```

4. **Validation Scenarios**:

   **Scenario 1: No connections**
   - `activeTransports: 0`
   - `transports: []`

   **Scenario 2: One authenticated client**
   - `activeTransports: 1`
   - `transports: ["session-id"]`
   - `hasTransport: true` for that session

   **Scenario 3: Client disconnects**
   - `activeTransports: 0` (cleaned up)
   - `activeSessions: 0`
   - `activeUsers: 1` (token persists)

   **Scenario 4: Multiple clients**
   - `activeTransports: 2`
   - `transports: ["session-1", "session-2"]`
   - Each session has `hasTransport: true`

5. **Debugging Use Cases**:

   **Use Case 1: Verify transport cleanup**
   - Connect client → check `/debug/sessions`
   - Disconnect → check again
   - Verify `totalTransports` decreases to 0

   **Use Case 2: Multi-client validation**
   - Connect multiple clients
   - Verify `totalTransports` matches number of clients
   - Verify each session in `transports` array

   **Use Case 3: Memory leak detection**
   - Connect/disconnect 10 times
   - Check `/health` endpoint
   - Verify `activeTransports: 0` (not growing)

6. **Response Format Examples**:

   **/health Response:**

   ```json
   {
     "status": "healthy",
     "server": "drupal-mcp-server",
     "version": "1.0.0",
     "authEnabled": true,
     "timestamp": "2025-10-03T10:30:00.000Z",
     "activeUsers": 1,
     "activeSessions": 2,
     "activeTransports": 2,
     "sessionMappings": {
       "session-abc": "user-123",
       "session-def": "user-123"
     }
   }
   ```

   **/debug/sessions Response:**

   ```json
   {
     "sessions": [
       {
         "sessionId": "session-abc",
         "userId": "user-123",
         "hasTokens": true,
         "hasCapabilities": true,
         "hasTransport": true
       }
     ],
     "transports": ["session-abc"],
     "users": ["user-123"],
     "summary": {
       "totalSessions": 1,
       "totalUsers": 1,
       "totalTransports": 1,
       "authenticatedSessions": 1
     }
   }
   ```

### Key Insights from Endpoints

**Healthy State**: `activeTransports === activeSessions`

- Every active session should have a transport

**Memory Leak Indicator**: `activeTransports > activeSessions`

- Transports not being cleaned up properly

**Orphaned Session Indicator**: `activeSessions > activeTransports`

- Session mappings exist but no transport (should not happen after Task 3)

</details>
