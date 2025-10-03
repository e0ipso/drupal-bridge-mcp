---
id: 2
group: 'session-architecture'
dependencies: [1]
status: 'completed'
created: '2025-10-03'
completed: '2025-10-03'
skills:
  - 'typescript'
  - 'mcp-sdk'
---

# Implement Per-Session Server+Transport Creation and Routing

## Objective

Refactor the `/mcp` endpoint handler to create separate Server and Transport instances for each
client session, implementing proper session ID routing and request handling.

## Skills Required

- **TypeScript**: Async/await patterns, Map operations, error handling
- **MCP SDK**: Server and StreamableHTTPServerTransport lifecycle, session management

## Acceptance Criteria

- [ ] Add `isInitializeRequest(body: any): boolean` helper method
- [ ] Add `createSessionInstance(sessionId: string): Promise<{server, transport}>` helper method
- [ ] Refactor `/mcp` endpoint handler to implement session routing logic
- [ ] Handle three scenarios: new initialize request, existing session, invalid session
- [ ] Return HTTP 404 for invalid session IDs
- [ ] Store new Server+Transport pairs in transports map with session ID as key
- [ ] Log session creation, routing, and error events
- [ ] Code compiles and server starts without errors

## Technical Requirements

**Helper Methods to Add:**

```typescript
private isInitializeRequest(body: any): boolean {
  return body && body.method === 'initialize';
}

private async createSessionInstance(sessionId: string): Promise<{
  server: Server,
  transport: StreamableHTTPServerTransport
}> {
  // Create new Server instance with same config as original
  const server = new Server(
    {
      name: this.config.name,
      version: this.config.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool handlers on this server instance
  // (copy from setupHandlers method)

  // Create new Transport with session ID generator
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => sessionId,
    enableDnsRebindingProtection: true,
    allowedHosts: [
      this.config.host,
      'localhost',
      `localhost:${this.config.port}`,
      `${this.config.host}:${this.config.port}`,
    ],
    onsessionclosed: async (closedSessionId: string) => {
      // Will be implemented in Task 3
      console.log(`Session closed: ${closedSessionId}`);
    },
  });

  // Connect server to transport
  await server.connect(transport);

  return { server, transport };
}
```

**Routing Logic for `/mcp` Endpoint:**

```typescript
this.app.all('/mcp', async (req, res) => {
  try {
    // Step 1: Extract session ID from header
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Step 2: Session routing logic
    if (!sessionId && this.isInitializeRequest(req.body)) {
      // Scenario 1: New initialize request
      const newSessionId = randomUUID();
      console.log(`Creating new session: ${newSessionId}`);

      const { server, transport } = await this.createSessionInstance(newSessionId);
      this.transports.set(newSessionId, { server, transport });

      console.log(`Session ${newSessionId} created. Active sessions: ${this.transports.size}`);

      await transport.handleRequest(req, res);
    } else if (sessionId && this.transports.has(sessionId)) {
      // Scenario 2: Existing session
      const { transport } = this.transports.get(sessionId)!;
      await transport.handleRequest(req, res);
    } else if (sessionId) {
      // Scenario 3: Invalid session ID
      console.warn(`Invalid session ID: ${sessionId}`);
      res.status(404).json({
        error: 'Session not found',
        sessionId,
      });
    } else {
      // Scenario 4: No session ID and not initialize request
      console.warn('Request without session ID and not initialize request');
      res.status(400).json({
        error: 'Bad Request: Session ID required or send initialize request',
      });
    }
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
});
```

**File Location**: `src/index.ts` **Method to refactor**: `setupMcpEndpoint()` (lines 496-561)

## Input Dependencies

- Task 1: Transports map initialized in class
- Existing tool discovery setup (lines 571-638)
- Existing `setupHandlers()` method for tool registration

## Output Artifacts

- Working session routing logic
- Helper methods for session management
- Multiple clients can connect and receive unique session IDs

<details>
<summary>Implementation Notes</summary>

### Step-by-Step Instructions

1. **Add Helper Methods** (before `setupMcpEndpoint()` method):

   ```typescript
   /**
    * Check if request body contains an initialize method
    */
   private isInitializeRequest(body: any): boolean {
     return body && body.method === 'initialize';
   }

   /**
    * Create a new Server and Transport instance for a session
    */
   private async createSessionInstance(sessionId: string): Promise<{
     server: Server,
     transport: StreamableHTTPServerTransport
   }> {
     // Create server with same configuration
     const server = new Server(
       {
         name: this.config.name,
         version: this.config.version,
       },
       {
         capabilities: {
           tools: {},
         },
       }
     );

     // Set up tool handlers (copy from setupHandlers)
     server.setRequestHandler(ListToolsRequestSchema, async () => {
       return {
         tools: discoveredToolDefinitions.map(tool => ({
           name: tool.name,
           description: tool.description,
           inputSchema: tool.inputSchema,
         })),
       };
     });

     // Create transport
     const transport = new StreamableHTTPServerTransport({
       sessionIdGenerator: () => sessionId,
       enableDnsRebindingProtection: true,
       allowedHosts: [
         this.config.host,
         'localhost',
         `localhost:${this.config.port}`,
         `${this.config.host}:${this.config.port}`,
       ],
       onsessionclosed: async (closedSessionId: string) => {
         // Placeholder - will be implemented in Task 3
         console.log(`Session ${closedSessionId} closed (cleanup pending Task 3)`);
       },
     });

     // Connect server to transport
     await server.connect(transport);
     console.log(`Server+Transport created for session ${sessionId}`);

     return { server, transport };
   }
   ```

2. **Refactor `setupMcpEndpoint()` Method**:
   - Remove old transport creation code (lines 502-536)
   - Remove old `server.connect(transport)` call (line 534)
   - Replace `/mcp` endpoint handler with new routing logic

3. **Important Considerations**:
   - **Tool Discovery**: The `createSessionInstance()` method must register the same tools as the
     original server
   - **Dynamic Tools**: Ensure `registerDynamicTools()` is called for each server instance
   - **Session Cleanup**: The `onsessionclosed` callback is a placeholder for now (Task 3)
   - **Error Handling**: Wrap session creation in try-catch to handle failures gracefully

4. **Integrating with Tool Discovery**:

   Since tool discovery happens in `start()` method (lines 571-638), you need to ensure each new
   Server instance gets the discovered tools. Consider:
   - Storing `discoveredToolDefinitions` at class level (already done)
   - Calling `registerDynamicTools()` for each new server instance
   - Alternative: Move tool registration logic into `createSessionInstance()`

5. **Testing After Implementation**:

   ```bash
   npm run build
   npm run dev
   # In another terminal, use MCP Inspector to connect
   # Verify session ID is generated and logged
   # Disconnect and reconnect - verify new session ID created
   ```

6. **Expected Logs**:
   ```
   Creating new session: abc-123-def-456
   Server+Transport created for session abc-123-def-456
   Session abc-123-def-456 created. Active sessions: 1
   ```

### Critical Integration Point

**Tool Registration per Server:**

Each Server instance needs the same tool handlers. You have two options:

**Option A**: Copy tool registration in `createSessionInstance()`:

```typescript
// Inside createSessionInstance(), after creating server:
registerDynamicTools(
  server,
  discoveredToolDefinitions,
  this.makeRequest.bind(this),
  this.getSession.bind(this)
);
```

**Option B**: Extract tool registration to separate method and call from both places.

Choose Option A for simplicity unless there's a strong reason for abstraction.

</details>
