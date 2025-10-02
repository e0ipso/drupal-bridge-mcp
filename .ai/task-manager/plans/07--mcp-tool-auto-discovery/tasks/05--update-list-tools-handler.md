---
id: 5
group: 'server-integration'
dependencies: [2]
status: 'completed'
created: '2025-10-02'
skills: ['typescript', 'mcp-protocol']
---

# Update ListToolsRequestSchema Handler

## Objective

Modify the `ListToolsRequestSchema` handler in `src/index.ts` to return dynamically discovered tools
instead of static tool definitions.

## Skills Required

- **typescript**: Modifying existing code, module-level state
- **mcp-protocol**: MCP SDK `ListToolsRequestSchema`, tool response format

## Acceptance Criteria

- [ ] Create module-level variable to store discovered tools
- [ ] Create `setDiscoveredTools` function to store tool definitions
- [ ] Modify existing `ListToolsRequestSchema` handler to return discovered tools
- [ ] Handler returns tools in correct MCP format (name, description, inputSchema)
- [ ] inputSchema is returned directly from discovery (already JSON Schema)
- [ ] No conversion needed (no more `zodToJsonSchema`)
- [ ] Remove any zodToJsonSchema imports if no longer used

## Technical Requirements

**File Location**: `src/index.ts`

**Current Handler** (lines ~228-289):

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'auth_login',
      description: 'Authenticate with Drupal using OAuth Device Flow',
      inputSchema: zodToJsonSchema(authLoginSchema),
    },
    // ... more static tools
  ],
}));
```

**Target Handler**:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: discoveredToolDefinitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema, // Already JSON Schema
  })),
}));
```

**State Management**:

- Module-level variable: `let discoveredToolDefinitions: ToolDefinition[] = [];`
- Setter function: `function setDiscoveredTools(tools: ToolDefinition[]): void`

## Input Dependencies

- Existing `src/index.ts` with MCP server setup
- `ToolDefinition` type from `discovery/tool-discovery.ts`

## Output Artifacts

- Modified `src/index.ts` with updated `ListToolsRequestSchema` handler
- Module-level state for discovered tools
- Removed static tool definitions from handler

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Add Import for ToolDefinition

At the top of `src/index.ts`, add import:

```typescript
import { type ToolDefinition } from './discovery/tool-discovery.js';
```

### Step 2: Add Module-Level State

Add near the top of the file, after imports:

```typescript
/**
 * Discovered tool definitions from /mcp/tools/list endpoint
 * Set during server initialization via setDiscoveredTools()
 */
let discoveredToolDefinitions: ToolDefinition[] = [];

/**
 * Store discovered tools for ListToolsRequest handler
 */
function setDiscoveredTools(tools: ToolDefinition[]): void {
  discoveredToolDefinitions = tools;
  console.log(`Stored ${tools.length} tool definitions for ListToolsRequest handler`);
}
```

### Step 3: Locate and Replace ListToolsRequestSchema Handler

Find the existing handler (around line 228-289):

```typescript
// OLD CODE - REMOVE THIS
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'auth_login',
      description: 'Authenticate with Drupal using OAuth Device Flow',
      inputSchema: zodToJsonSchema(authLoginSchema),
    },
    {
      name: 'auth_logout',
      description: 'End the current Drupal session',
      inputSchema: zodToJsonSchema(authLogoutSchema),
    },
    {
      name: 'auth_status',
      description: 'Check current authentication status',
      inputSchema: zodToJsonSchema(authStatusSchema),
    },
    {
      name: 'search_tutorial',
      description: 'Search Drupal tutorials using Claude-enhanced MCP Sampling',
      inputSchema: zodToJsonSchema(searchTutorialSchema),
    },
    {
      name: 'get_tutorial',
      description: 'Retrieve a specific Drupal tutorial by ID',
      inputSchema: zodToJsonSchema(getTutorialSchema),
    },
  ],
}));
```

Replace with:

```typescript
// NEW CODE
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: discoveredToolDefinitions.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema, // Already JSON Schema from discovery
  })),
}));
```

### Step 4: Check for Unused Imports

After replacing the handler, check if these imports are still used elsewhere in the file:

```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  authLogin,
  authLoginSchema,
  authLogout,
  authLogoutSchema,
  authStatus,
  authStatusSchema,
} from './tools/auth/index.js';
import {
  searchTutorial,
  searchTutorialSchema,
  getTutorial,
  getTutorialSchema,
} from './tools/content/index.js';
```

**DO NOT REMOVE THESE YET** - they may be used in:

- CallToolRequestSchema handler (will be replaced in next task)
- Other parts of the code

Leave removal of these imports for Task 7 (Remove Static Tool Code).

### Step 5: Export setDiscoveredTools if Needed

If `setDiscoveredTools` needs to be called from outside `index.ts`, add export:

```typescript
export { setDiscoveredTools };
```

Otherwise, keep it as a local function.

### Step 6: Type Check

```bash
npm run type-check
```

### Step 7: Verify Handler Location

Ensure the handler registration happens AFTER the server is created but BEFORE the server starts
listening. Typical structure:

```typescript
// Create server
const server = new Server(/* ... */);

// Register handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  /* ... */
}));
server.setRequestHandler(CallToolRequestSchema, async request => ({
  /* ... */
}));

// Start server
await server.connect(transport);
```

### Integration Point

This handler will be populated during server startup via:

```typescript
// In startup code (will be added in Task 6)
const tools = await getDiscoveredTools(DRUPAL_BASE_URL);
setDiscoveredTools(tools);
```

### Troubleshooting

**Issue: Empty Tools Array Returned**

- Check `setDiscoveredTools` was called during startup
- Verify `discoveredToolDefinitions` is populated
- Add debug log in handler: `console.log('Returning tools:', discoveredToolDefinitions.length)`

**Issue: Type Errors on ToolDefinition**

- Verify import path uses `.js` extension for ESM
- Check `ToolDefinition` is exported from `tool-discovery.ts`
- May need `type` import: `import type { ToolDefinition }`

**Issue: Handler Returns Before Tools Discovered**

- Ensure discovery happens during server initialization, not after
- Discovery must complete before MCP clients connect
- Check startup sequence order

</details>
