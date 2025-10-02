---
id: 6
group: 'transport-verification'
dependencies: [4]
status: 'pending'
created: '2025-10-02'
skills:
  - typescript
---

# Verify Transport Configuration for Multi-Session Support

## Objective

Audit and validate that the StreamableHTTPServerTransport configuration properly handles multiple
sessions without "Server already initialized" errors.

## Skills Required

- **TypeScript**: Code review, transport initialization patterns

## Acceptance Criteria

- [ ] Single `StreamableHTTPServerTransport` instance verified at startup
- [ ] `server.connect()` called only once (no duplicate connections)
- [ ] Transport initialization logged for verification
- [ ] MCP endpoint handler delegates all sessions to single transport
- [ ] Documentation added explaining single long-lived transport pattern

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary><strong>Implementation Details</strong></summary>

### 1. Audit Transport Setup

**Location**: `src/index.ts` - `setupMcpEndpoint` method (lines 391-413)

Verify this pattern:

```typescript
private async setupMcpEndpoint(): Promise<void> {
  // Create a single transport instance that handles all sessions
  this.transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    enableDnsRebindingProtection: true,
    allowedHosts: [
      this.config.host,
      'localhost',
      `localhost:${this.config.port}`,
      `${this.config.host}:${this.config.port}`,
    ],
    onsessionclosed: async (sessionId: string) => {
      // ... session close logic from Task 4 ...
    },
  });

  // Connect the transport to the MCP server ONCE
  await this.server.connect(this.transport);
  console.log('Transport connected to MCP server (single long-lived instance)');

  // Log client capabilities when available
  const capabilities = this.server.getClientCapabilities();
  if (capabilities) {
    console.log('Client capabilities detected:', {
      sampling: capabilities.sampling !== undefined,
      experimental: capabilities.experimental !== undefined,
    });
  }

  // ... rest of setup ...
}
```

### 2. Validate Request Handling

**Location**: `src/index.ts` - MCP endpoint handler (lines 425-437)

Ensure transport handles all sessions:

```typescript
this.app.all('/mcp', async (req, res) => {
  try {
    // Single transport handles ALL sessions internally
    await this.transport!.handleRequest(req, res);
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

### 3. Add Initialization Logging

Add logging to track initialization:

```typescript
private async setupMcpEndpoint(): Promise<void> {
  console.log('Setting up MCP endpoint with StreamableHTTPServerTransport...');

  this.transport = new StreamableHTTPServerTransport({
    // ... config ...
  });
  console.log('StreamableHTTPServerTransport instance created');

  await this.server.connect(this.transport);
  console.log('✓ Transport connected to MCP server (handles all sessions)');
  console.log('✓ Single long-lived transport pattern verified');

  // ... rest of setup ...
}
```

### 4. Documentation Comment

Add JSDoc comment to `setupMcpEndpoint`:

```typescript
/**
 * Sets up MCP HTTP endpoint with single long-lived transport
 *
 * ARCHITECTURE: Uses one StreamableHTTPServerTransport instance that handles
 * multiple sessions internally. The transport is connected to the MCP server
 * ONCE during startup. Each client connection receives a unique session ID,
 * but all sessions share the same transport and server instance.
 *
 * This pattern prevents "Server already initialized" errors that occur when
 * trying to create multiple Server instances or call server.connect() multiple times.
 *
 * Session lifecycle:
 * 1. Client connects → Transport generates new session ID
 * 2. Client sends initialize request → Transport routes to server
 * 3. Server handles request with session context
 * 4. Client disconnects → onsessionclosed callback fires
 * 5. Next client connects → New session ID, same transport/server
 */
private async setupMcpEndpoint(): Promise<void> {
```

### 5. Validation Checklist

During implementation, verify:

- [ ] Only ONE `new StreamableHTTPServerTransport()` call exists
- [ ] Only ONE `server.connect()` call exists
- [ ] No `server.connect()` calls in request handlers or callbacks
- [ ] Transport instance stored in class property (`this.transport`)
- [ ] All `/mcp` requests use `this.transport.handleRequest()`
- [ ] No per-request transport creation

</details>

## Input Dependencies

- Refactored session lifecycle from Task 4 (onsessionclosed callback)

## Output Artifacts

- Verified single long-lived transport pattern
- Enhanced logging for transport initialization
- JSDoc documentation explaining architecture
- Validation that no "Server already initialized" errors occur

## Implementation Notes

The plan indicates this should already be working (Option A: Single Long-Lived Transport). This task
is verification and documentation, not refactoring. If issues are found, they should be documented
and fixed, but the expectation is that the current architecture is correct and just needs validation
logging.

**Key Insight**: The "Server already initialized" error was a red herring. The real issue was token
lookup failure (403 errors). By fixing token storage (Tasks 1-4), the reconnection problem should be
resolved. This task confirms the transport layer is not the root cause.
