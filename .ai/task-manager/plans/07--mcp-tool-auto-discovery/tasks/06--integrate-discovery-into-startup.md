---
id: 6
group: 'server-integration'
dependencies: [2, 3, 4, 5]
status: 'pending'
created: '2025-10-02'
skills: ['typescript', 'mcp-protocol']
---

# Integrate Discovery into Server Startup

## Objective

Modify `src/index.ts` startup sequence to call discovery service, validate results, register dynamic
handlers, and fail fast if discovery fails.

## Skills Required

- **typescript**: Async/await, error handling, initialization logic
- **mcp-protocol**: Server initialization sequence, timing requirements

## Acceptance Criteria

- [ ] Import discovery functions: `getDiscoveredTools`, `registerDynamicTools`
- [ ] Call `getDiscoveredTools` during server initialization (before handlers registered)
- [ ] Validate discovered tools array is not empty, throw error if empty
- [ ] Call `setDiscoveredTools` to store tools for ListToolsRequest handler
- [ ] Call `registerDynamicTools` to register CallToolRequest handler
- [ ] Get `DRUPAL_BASE_URL` from environment variable
- [ ] Handle discovery errors with clear messages and fail fast (exit process)
- [ ] Log successful discovery and registration
- [ ] Ensure discovery completes before server starts listening

## Technical Requirements

**Environment Variable**: `DRUPAL_BASE_URL` (required)

**Startup Sequence**:

1. Load environment variables
2. Create MCP server instance
3. **Discover tools** (new)
4. **Validate tool count > 0** (new)
5. **Store tools** (new)
6. **Register dynamic handlers** (new)
7. Register other handlers (ListTools already registered)
8. Start HTTP server

**Error Handling**:

- Discovery fails → log error, exit process with code 1
- Empty tools array → log error, exit process with code 1
- Schema conversion errors → warnings logged, continue if some tools valid

## Input Dependencies

- Environment variable `DRUPAL_BASE_URL`
- Optional: `TOOL_CACHE_TTL_MS`
- Discovery service functions
- Dynamic handler registration function
- Session manager for OAuth integration

## Output Artifacts

- Modified `src/index.ts` with integrated discovery
- Server fails to start if discovery fails
- Successful startup logs tool count

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Add Imports

At the top of `src/index.ts`, add:

```typescript
import {
  getDiscoveredTools,
  registerDynamicTools,
  type ToolDefinition,
} from './discovery/index.js';
```

### Step 2: Locate Server Initialization Code

Find the main server initialization function. It might look like:

```typescript
async function main() {
  // Load environment
  const DRUPAL_BASE_URL = process.env.DRUPAL_BASE_URL;
  if (!DRUPAL_BASE_URL) {
    throw new Error('DRUPAL_BASE_URL environment variable is required');
  }

  // Create server
  const server = new Server(/* ... */);

  // Register handlers
  // ... existing handler code
}

main().catch(console.error);
```

### Step 3: Add Discovery Before Handler Registration

Insert discovery logic after server creation but before handler registration:

```typescript
async function main() {
  // Load environment
  const DRUPAL_BASE_URL = process.env.DRUPAL_BASE_URL;
  if (!DRUPAL_BASE_URL) {
    console.error('ERROR: DRUPAL_BASE_URL environment variable is required');
    console.error('Set it in your .env file or environment:');
    console.error('  DRUPAL_BASE_URL=https://your-drupal-site.com');
    process.exit(1);
  }

  console.log(`Drupal Base URL: ${DRUPAL_BASE_URL}`);

  // Create server
  const server = new Server(/* ... */);

  // ========== NEW: Tool Discovery ==========
  console.log('\n=== Discovering Tools ===');

  let tools: ToolDefinition[];
  try {
    tools = await getDiscoveredTools(DRUPAL_BASE_URL);
  } catch (error) {
    console.error('\n❌ FATAL: Tool discovery failed');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    console.error('\nTroubleshooting:');
    console.error('  1. Verify DRUPAL_BASE_URL is correct');
    console.error('  2. Ensure /mcp/tools/list endpoint exists on Drupal');
    console.error('  3. Check network connectivity to Drupal server');
    console.error('  4. Review Drupal logs for errors');
    process.exit(1);
  }

  // Validate we have tools
  if (tools.length === 0) {
    console.error('\n❌ FATAL: No tools discovered from /mcp/tools/list');
    console.error('The MCP server cannot start without any tools.');
    console.error('\nEnsure Drupal backend has configured tools at /mcp/tools/list endpoint.');
    process.exit(1);
  }

  console.log(`✓ Discovered ${tools.length} tools from Drupal`);
  tools.forEach(tool => {
    console.log(
      `  - ${tool.name}: ${tool.description.substring(0, 60)}${tool.description.length > 60 ? '...' : ''}`
    );
  });

  // Store tools for ListToolsRequest handler
  setDiscoveredTools(tools);

  // Register dynamic handlers
  console.log('\n=== Registering Dynamic Handlers ===');
  try {
    registerDynamicTools(server, tools, connector, getSession);
  } catch (error) {
    console.error('\n❌ FATAL: Dynamic handler registration failed');
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // ========== END: Tool Discovery ==========

  // Register other handlers (ListToolsRequestSchema already registered above)
  // ... existing handler code (keep any non-tool handlers)

  // Start server
  console.log('\n=== Starting MCP Server ===');
  // ... existing server start code
}
```

### Step 4: Pass Required Dependencies

Ensure `connector` and `getSession` are available in scope:

```typescript
// These should already exist in the file
import { DrupalConnector } from './drupal-connector.js';
import { getSession } from './session-manager.js';

// Create connector (likely already exists)
const connector = new DrupalConnector(DRUPAL_BASE_URL);
```

### Step 5: Remove Old CallToolRequestSchema Handler

The old static `CallToolRequestSchema` handler should be removed since `registerDynamicTools` now
handles this. This will be done in Task 7.

### Step 6: Add Success Log at End

After server starts successfully:

```typescript
console.log(`\n✅ MCP Server started successfully with ${tools.length} tools`);
console.log(`Listening on port ${PORT}`);
```

### Step 7: Update Error Handler at Top Level

Ensure main() has proper error handling:

```typescript
main().catch(error => {
  console.error('\n❌ FATAL: MCP Server failed to start');
  console.error(error);
  process.exit(1);
});
```

### Step 8: Type Check

```bash
npm run type-check
```

### Step 9: Test Startup

Test with mock endpoint or real Drupal:

```bash
npm run dev
```

Expected output:

```
=== Discovering Tools ===
Discovering tools from https://drupal-site.com/mcp/tools/list...
✓ Successfully discovered 5 tools
✓ Discovered 5 tools from Drupal
  - auth_login: Authenticate with Drupal using OAuth Device Flow
  - auth_logout: End the current Drupal session
  - ...

=== Registering Dynamic Handlers ===
✓ Registered schema for tool: auth_login
✓ Registered schema for tool: auth_logout
...
✓ Registered 5 dynamic tool handlers

=== Starting MCP Server ===
✅ MCP Server started successfully with 5 tools
Listening on port 3000
```

### Troubleshooting

**Issue: connector is undefined**

- Check `DrupalConnector` is imported and instantiated
- Verify it's created before `registerDynamicTools` is called
- May need to pass DRUPAL_BASE_URL to connector constructor

**Issue: getSession is not defined**

- Check `src/session-manager.ts` exports `getSession` function
- Import with: `import { getSession } from './session-manager.js';`
- If session manager has different interface, adapt accordingly

**Issue: Server Starts Before Discovery Completes**

- Ensure `await getDiscoveredTools()` is used (not missing await)
- Check all discovery code is inside `async function main()`
- Verify no parallel execution that starts server early

**Issue: Discovery Works But Tools Not Registered**

- Check `registerDynamicTools` is called after discovery
- Verify tools array is passed correctly
- Add debug logs to confirm execution flow

</details>
