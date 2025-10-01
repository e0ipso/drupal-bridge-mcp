---
id: 2
group: 'foundation'
dependencies: [1]
status: 'completed'
created: '2025-10-01'
completed: '2025-10-02'
skills:
  - typescript
  - mcp-protocol
---

# Implement Sampling Capability Detection

## Objective

Add session-based sampling capability detection to `DrupalMCPHttpServer`, enabling the server to
track which connected clients support sampling and make this information available to tool handlers.

## Skills Required

- **typescript**: Implementing TypeScript classes with session management
- **mcp-protocol**: Understanding MCP capability negotiation

## Acceptance Criteria

- [ ] Add `clientCapabilities` storage to `DrupalMCPHttpServer` using session-based Map
- [ ] Capture client capabilities during transport connection
- [ ] Make capability information accessible to tool handlers via context
- [ ] Handle capability cleanup when sessions close
- [ ] Maintain thread safety for concurrent session access

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand implementation details</summary>

### Implementation Location

Modify `src/index.ts` in the `DrupalMCPHttpServer` class.

### Data Structure

Add session-based capability storage similar to existing `sessionTokens`:

```typescript
export class DrupalMCPHttpServer {
  private sessionTokens: Map<string, TokenResponse> = new Map();

  // Add this
  private sessionCapabilities: Map<string, ClientCapabilities> = new Map();

  // ... rest of class
}
```

Define a TypeScript interface for capabilities (adjust based on Task 1 research):

```typescript
interface ClientCapabilities {
  sampling?: {
    supported: boolean;
  };
  // Add other relevant capability fields based on MCP SDK types
}
```

### Capture Capabilities During Connection

In the `setupMcpEndpoint()` method, after `this.server.connect(this.transport)`, capture
capabilities:

```typescript
private async setupMcpEndpoint(): Promise<void> {
  this.transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    // ... existing config
    onsessionclosed: async (sessionId: string) => {
      console.log(`Session closed: ${sessionId}`);
      this.sessionTokens.delete(sessionId);
      this.sessionCapabilities.delete(sessionId); // Clean up capabilities
    },
  });

  await this.server.connect(this.transport);

  // TODO: Based on Task 1 research, determine how to access client capabilities
  // Example (adjust based on actual SDK API):
  // const capabilities = this.transport.getClientCapabilities();
  // Store per session when session is created
}
```

### Make Available to Tool Handlers

Modify the `CallToolRequestSchema` handler to include capabilities in context:

```typescript
this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const sessionId = extra?.sessionId || 'default-session';

  // Retrieve capabilities for this session
  const capabilities = this.sessionCapabilities.get(sessionId);

  const contentContext = {
    sessionId,
    oauthProvider: this.oauthProvider,
    drupalConnector: this.drupalConnector,
    samplingCapabilities: capabilities, // Add this
  };

  // ... rest of handler
});
```

### Key Implementation Notes

1. **Session Lifecycle**: Capabilities must be associated with sessions, not globally
2. **Timing**: Ensure capabilities are captured after connection completes
3. **Cleanup**: Remove capabilities from Map when session closes (already implemented in
   `onsessionclosed`)
4. **Default Behavior**: When capabilities are undefined or sampling not supported, tools should
   gracefully skip AI enhancement

### Type Safety

Update the context interfaces in tool files to include capabilities:

```typescript
// In src/tools/content/search.ts
export interface SearchTutorialContext {
  sessionId: string;
  oauthProvider: DrupalOAuthProvider;
  drupalConnector: DrupalConnector;
  samplingCapabilities?: ClientCapabilities; // Add this
}
```

</details>

## Input Dependencies

- Research findings from Task 1 (exact API for accessing client capabilities)
- Existing `DrupalMCPHttpServer` class in `src/index.ts`
- Existing session management pattern (`sessionTokens` Map)

## Output Artifacts

- Modified `src/index.ts` with capability storage and detection
- Updated context interfaces in tool files to include `samplingCapabilities`
- Session-based capability tracking that cleans up on session close

## Implementation Notes

Follow the existing pattern for `sessionTokens` - this ensures consistency and maintainability. The
key challenge is determining when and how client capabilities become available after connection;
Task 1 research should clarify this.

If capabilities aren't immediately available after `connect()`, consider using transport events or
callbacks to capture them when they arrive.
