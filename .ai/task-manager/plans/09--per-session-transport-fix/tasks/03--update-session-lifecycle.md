---
id: 3
group: 'session-architecture'
dependencies: [2]
status: 'pending'
created: '2025-10-03'
skills:
  - 'typescript'
---

# Update Session Lifecycle Cleanup Logic

## Objective

Enhance the `onsessionclosed` callback to properly clean up Server and Transport instances when
clients disconnect, preventing memory leaks while preserving user-level token storage.

## Skills Required

- **TypeScript**: Async cleanup patterns, Map operations, optional chaining

## Acceptance Criteria

- [ ] Update `onsessionclosed` callback in `createSessionInstance()` method
- [ ] Remove Server+Transport from transports map when session closes
- [ ] Call `transport.close()` for cleanup
- [ ] Call `server.close()` if method exists (with error handling)
- [ ] Preserve existing session-to-user mapping cleanup (Plan 8)
- [ ] Preserve existing sessionCapabilities cleanup (Plan 8)
- [ ] Do NOT remove user tokens (allow reconnection)
- [ ] Log session closure events with context (session ID, user ID)
- [ ] Handle cleanup errors gracefully without crashing

## Technical Requirements

**Updated `onsessionclosed` Callback:**

```typescript
onsessionclosed: async (closedSessionId: string) => {
  const userId = this.sessionToUser.get(closedSessionId);
  console.log(`Session closed: ${closedSessionId} (user: ${userId || 'unauthenticated'})`);

  // Step 1: Retrieve Server+Transport for cleanup
  const sessionInstance = this.transports.get(closedSessionId);

  if (sessionInstance) {
    const { server, transport } = sessionInstance;

    // Step 2: Close transport
    try {
      await transport.close();
      console.log(`Transport closed for session ${closedSessionId}`);
    } catch (error) {
      console.error(`Error closing transport for session ${closedSessionId}:`, error);
    }

    // Step 3: Close server (if method exists)
    try {
      if (typeof server.close === 'function') {
        await server.close();
        console.log(`Server closed for session ${closedSessionId}`);
      }
    } catch (error) {
      console.error(`Error closing server for session ${closedSessionId}:`, error);
    }

    // Step 4: Remove from transports map
    this.transports.delete(closedSessionId);
  }

  // Step 5: Clean session mappings (existing Plan 8 logic)
  this.sessionToUser.delete(closedSessionId);
  this.sessionCapabilities.delete(closedSessionId);

  // Step 6: DO NOT remove user tokens - they persist for reconnection

  console.log(`Active sessions: ${this.transports.size}, Active users: ${this.userTokens.size}`);
};
```

**Lifecycle Comparison Table (from Plan):**

| Event              | Plan 8 Behavior         | Plan 9 Behavior (this task)                       |
| ------------------ | ----------------------- | ------------------------------------------------- |
| Client connects    | Uses global server      | Creates new Server+Transport                      |
| Client disconnects | Removes session mapping | Removes session mapping + closes Server+Transport |
| User logout        | Removes user tokens     | Removes user tokens (unchanged)                   |
| Server shutdown    | Closes single transport | Closes all transports (Task 5)                    |

**File Location**: `src/index.ts` **Method to modify**: `createSessionInstance()` (Task 2 output)

## Input Dependencies

- Task 2: `createSessionInstance()` method with placeholder `onsessionclosed`
- Existing Plan 8 session maps: `sessionToUser`, `sessionCapabilities`, `userTokens`

## Output Artifacts

- Proper memory cleanup when clients disconnect
- Session instances removed from transports map
- User tokens preserved for reconnection
- Comprehensive logging of session lifecycle

<details>
<summary>Implementation Notes</summary>

### Step-by-Step Instructions

1. **Locate the `createSessionInstance()` Method** (added in Task 2):
   - Find the `onsessionclosed` callback inside the `StreamableHTTPServerTransport` constructor

2. **Replace Placeholder Callback**:

   Current placeholder (from Task 2):

   ```typescript
   onsessionclosed: async (closedSessionId: string) => {
     console.log(`Session ${closedSessionId} closed (cleanup pending Task 3)`);
   },
   ```

   Replace with full implementation:

   ```typescript
   onsessionclosed: async (closedSessionId: string) => {
     const userId = this.sessionToUser.get(closedSessionId);
     console.log(
       `Session closed: ${closedSessionId} (user: ${userId || 'unauthenticated'})`
     );

     // Retrieve and clean up Server+Transport
     const sessionInstance = this.transports.get(closedSessionId);

     if (sessionInstance) {
       const { server, transport } = sessionInstance;

       // Close transport
       try {
         await transport.close();
         console.log(`Transport closed for session ${closedSessionId}`);
       } catch (error) {
         console.error(`Error closing transport for session ${closedSessionId}:`, error);
       }

       // Close server (if method exists)
       try {
         if (typeof server.close === 'function') {
           await server.close();
           console.log(`Server closed for session ${closedSessionId}`);
         }
       } catch (error) {
         console.error(`Error closing server for session ${closedSessionId}:`, error);
       }

       // Remove from map
       this.transports.delete(closedSessionId);
     }

     // Clean session mappings (Plan 8 logic - preserved)
     this.sessionToUser.delete(closedSessionId);
     this.sessionCapabilities.delete(closedSessionId);

     // DO NOT delete user tokens - allow reconnection
     // this.userTokens.delete(userId); // ❌ DO NOT DO THIS

     console.log(
       `Active sessions: ${this.transports.size}, Active users: ${this.userTokens.size}`
     );
   },
   ```

3. **Error Handling Strategy**:
   - **Transport Close**: Always attempt, log errors but don't throw
   - **Server Close**: Check if method exists (SDK version compatibility), log errors
   - **Map Delete**: Safe operation, no try-catch needed
   - **Overall**: Cleanup should never crash the server

4. **Preservation of Plan 8 Logic**:
   - ✅ `sessionToUser.delete()` - Remove session-to-user mapping
   - ✅ `sessionCapabilities.delete()` - Remove session capabilities
   - ❌ **DO NOT** call `userTokens.delete()` - Tokens persist for reconnection

5. **Testing Cleanup**:

   ```bash
   npm run build
   npm run dev
   # Connect MCP Inspector
   # Check logs: "Session created: ..."
   # Disconnect MCP Inspector
   # Check logs: "Session closed: ..."
   # Verify: "Active sessions: 0, Active users: 1" (if authenticated)
   ```

6. **Expected Log Sequence**:
   ```
   Session closed: abc-123 (user: user-456)
   Transport closed for session abc-123
   Server closed for session abc-123
   Active sessions: 0, Active users: 1
   ```

### Memory Leak Prevention

The cleanup order is critical:

1. **Close Transport**: Release HTTP connections
2. **Close Server**: Release MCP SDK internal state (if method exists)
3. **Delete from Map**: Remove references to allow garbage collection
4. **Clean Session Maps**: Remove ephemeral session data
5. **Keep User Tokens**: Preserve for reconnection

### Error Scenarios to Handle

- **Transport already closed**: Log error but continue cleanup
- **Server.close() doesn't exist**: Check before calling (optional method)
- **Session not in map**: Safe to call delete() on non-existent key
- **Async errors**: Catch and log, never throw from callback

</details>
