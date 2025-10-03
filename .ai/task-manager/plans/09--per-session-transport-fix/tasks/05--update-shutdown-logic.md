---
id: 5
group: 'configuration'
dependencies: [1, 2, 3]
status: 'pending'
created: '2025-10-03'
skills:
  - 'typescript'
---

# Update Server Shutdown Logic for Multiple Transports

## Objective

Modify the `stop()` method to gracefully close all Server and Transport instances in the transports
map when the server shuts down.

## Skills Required

- **TypeScript**: Async iteration, error handling, Promise.all patterns

## Acceptance Criteria

- [ ] Update `stop()` method to iterate over transports map
- [ ] Close each transport with proper error handling
- [ ] Close each server instance (if method exists)
- [ ] Clear transports map after all closures
- [ ] Preserve existing cleanup logic (userTokens, sessionToUser, sessionCapabilities)
- [ ] Log shutdown events for each session
- [ ] Handle partial failures gracefully (continue closing even if one fails)
- [ ] Server shuts down cleanly without hanging or crashing

## Technical Requirements

**Current Shutdown Logic** (line 733 in `src/index.ts`):

```typescript
async stop(): Promise<void> {
  console.log('Shutting down HTTP server...');

  if (this.transport) {
    try {
      await this.transport.close();
      console.log('Transport closed');
    } catch (error) {
      console.error('Error closing transport:', error);
    }
  }

  this.userTokens.clear();
  this.sessionToUser.clear();
  this.sessionCapabilities.clear();
}
```

**Updated Shutdown Logic**:

```typescript
async stop(): Promise<void> {
  console.log('Shutting down HTTP server...');

  // Close all transports in the map
  console.log(`Closing ${this.transports.size} active sessions...`);

  for (const [sessionId, { server, transport }] of this.transports.entries()) {
    try {
      // Close transport
      await transport.close();
      console.log(`Transport closed for session ${sessionId}`);

      // Close server (if method exists)
      if (typeof server.close === 'function') {
        await server.close();
        console.log(`Server closed for session ${sessionId}`);
      }
    } catch (error) {
      console.error(`Error closing session ${sessionId}:`, error);
      // Continue with next session even if this one fails
    }
  }

  // Clear the map
  this.transports.clear();
  console.log('All transports closed');

  // Clear session and user data
  this.userTokens.clear();
  this.sessionToUser.clear();
  this.sessionCapabilities.clear();
}
```

**File Location**: `src/index.ts` **Method to modify**: `stop()` (lines 733-751)

## Input Dependencies

- Task 1: Transports map architecture
- Task 2: Multiple Server+Transport instances in map
- Task 3: Understanding of cleanup patterns

## Output Artifacts

- Clean server shutdown without memory leaks
- All sessions properly closed
- Comprehensive shutdown logging

<details>
<summary>Implementation Notes</summary>

### Step-by-Step Instructions

1. **Locate the `stop()` Method** (lines 733-751 in `src/index.ts`):

   Current implementation:

   ```typescript
   async stop(): Promise<void> {
     console.log('Shutting down HTTP server...');

     // Close the transport if it exists
     if (this.transport) {
       try {
         await this.transport.close();
         console.log('Transport closed');
       } catch (error) {
         console.error('Error closing transport:', error);
       }
     }

     // Clear all session and user data
     this.userTokens.clear();
     this.sessionToUser.clear();
     this.sessionCapabilities.clear();
   }
   ```

2. **Replace Transport Closure Logic**:

   Delete the `if (this.transport)` block and replace with:

   ```typescript
   // Close all transports in the map
   console.log(`Closing ${this.transports.size} active sessions...`);

   for (const [sessionId, { server, transport }] of this.transports.entries()) {
     try {
       // Close transport
       await transport.close();
       console.log(`Transport closed for session ${sessionId}`);

       // Close server (if method exists)
       if (typeof server.close === 'function') {
         await server.close();
         console.log(`Server closed for session ${sessionId}`);
       }
     } catch (error) {
       console.error(`Error closing session ${sessionId}:`, error);
       // Continue with next session
     }
   }

   // Clear the map
   this.transports.clear();
   console.log('All transports closed');
   ```

3. **Keep Existing Cleanup** (unchanged):

   ```typescript
   // Clear all session and user data
   this.userTokens.clear();
   this.sessionToUser.clear();
   this.sessionCapabilities.clear();
   ```

4. **Error Handling Strategy**:
   - **Sequential Closure**: Use `for...of` to close sessions one by one
   - **Error Isolation**: Catch errors per session, continue with others
   - **Logging**: Log each closure for debugging
   - **Always Clear**: Clear map even if some closures fail

5. **Alternative: Parallel Closure** (optional optimization):

   For faster shutdown with many sessions:

   ```typescript
   console.log(`Closing ${this.transports.size} active sessions...`);

   const closePromises = Array.from(this.transports.entries()).map(
     async ([sessionId, { server, transport }]) => {
       try {
         await transport.close();
         if (typeof server.close === 'function') {
           await server.close();
         }
         console.log(`Session ${sessionId} closed`);
       } catch (error) {
         console.error(`Error closing session ${sessionId}:`, error);
       }
     }
   );

   await Promise.all(closePromises);
   this.transports.clear();
   console.log('All transports closed');
   ```

   **Recommendation**: Use sequential (for...of) for simplicity unless performance is critical.

6. **Testing Shutdown**:

   ```bash
   npm run build
   npm run dev
   # Connect MCP Inspector
   # Press Ctrl+C in server terminal
   # Check logs for clean shutdown
   ```

   Expected logs:

   ```
   Shutting down HTTP server...
   Closing 1 active sessions...
   Transport closed for session abc-123
   Server closed for session abc-123
   All transports closed
   ```

7. **Signal Handling** (already in place):

   The `handleShutdown()` function (line 764) already calls `stop()`:

   ```typescript
   process.on('SIGINT', () => handleShutdown(server));
   process.on('SIGTERM', () => handleShutdown(server));
   ```

   No changes needed to signal handlers.

### Shutdown Sequence

1. **SIGINT/SIGTERM received** → `handleShutdown()` called
2. **`stop()` invoked** → Begins shutdown
3. **Iterate transports map** → Close each Server+Transport
4. **Clear transports map** → Remove all references
5. **Clear session data** → Clean up maps
6. **Process exits** → Shutdown complete

### Error Scenarios

- **Transport.close() fails**: Log error, continue with next session
- **Server.close() doesn't exist**: Check before calling (SDK compatibility)
- **Map is empty**: No-op, log "Closing 0 active sessions"
- **Partial failures**: Some sessions close, others fail → clear map anyway

### Memory Leak Prevention

- Always call `transports.clear()` even if errors occur
- Close both transport and server for each session
- Clear all maps (transports, userTokens, sessionToUser, sessionCapabilities)
- Ensure no references remain after shutdown

</details>
