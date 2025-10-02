---
id: 7
group: 'cleanup'
dependencies: [6]
status: 'pending'
created: '2025-10-02'
skills: ['typescript']
---

# Remove Static Tool Code

## Objective

Remove all static tool imports, schemas, handler functions, and the static `CallToolRequestSchema`
handler from `src/index.ts`, since tools are now dynamically registered.

## Skills Required

- **typescript**: Code refactoring, import cleanup

## Acceptance Criteria

- [ ] Remove static tool imports from `src/index.ts` (auth, content tools)
- [ ] Remove static `CallToolRequestSchema` handler (replaced by dynamic handler)
- [ ] Remove `zodToJsonSchema` import if no longer used
- [ ] Verify no other files reference removed imports
- [ ] Type check passes after removal
- [ ] Consider keeping `src/tools/` directory structure for future reference (optional)

## Technical Requirements

**Files to Modify**:

- `src/index.ts` - remove imports and static handler

**Imports to Remove**:

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

**Handler to Remove**:

```typescript
server.setRequestHandler(CallToolRequestSchema, async request => {
  // Old static tool routing logic
  // ... large switch/if statement for tool names
});
```

**Files to Keep (for reference)**:

- `src/tools/` directory (may contain helpful examples)
- Tool implementation files (auth, content)
- Keep if they document expected patterns

## Input Dependencies

- Completed integration (Task 6) ensures dynamic handlers work
- No active code dependencies on static tools

## Output Artifacts

- Cleaned `src/index.ts` without static tool code
- Reduced file size (likely ~100-200 lines removed)
- Cleaner imports section

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Backup Current State

Before making changes, create a backup or commit current state:

```bash
git add src/index.ts
git commit -m "checkpoint: before removing static tool code"
```

Or copy the file:

```bash
cp src/index.ts src/index.ts.backup
```

### Step 2: Remove Tool Imports

At the top of `src/index.ts`, remove these imports:

```typescript
// REMOVE THESE:
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

### Step 3: Find and Remove Static CallToolRequestSchema Handler

Search for the static handler (likely a large block with tool routing):

```typescript
// REMOVE THIS ENTIRE BLOCK:
server.setRequestHandler(CallToolRequestSchema, async request => {
  const toolName = request.params.name;

  // Static tool routing
  switch (toolName) {
    case 'auth_login':
      return authLogin(request.params.arguments);
    case 'auth_logout':
      return authLogout(request.params.arguments);
    case 'auth_status':
      return authStatus(request.params.arguments);
    case 'search_tutorial':
      return searchTutorial(request.params.arguments);
    case 'get_tutorial':
      return getTutorial(request.params.arguments);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
});
```

**Important**: The `CallToolRequestSchema` handler is now registered by `registerDynamicTools()` in
Task 3, so removing this is correct.

### Step 4: Check for Other zodToJsonSchema Usage

Search the file for `zodToJsonSchema` usage:

```bash
grep -n "zodToJsonSchema" src/index.ts
```

If it's only used in the removed imports and handlers, the import can be safely removed.

### Step 5: Remove Unused Type Imports

Check if these types are still used:

```bash
grep -n "authLoginSchema\|searchTutorialSchema" src/index.ts
```

If no matches (after removing handler), they're safe to remove.

### Step 6: Verify No Circular Dependencies

Check if any removed tools were used elsewhere:

```bash
grep -rn "authLogin\|searchTutorial" src/ --exclude-dir=tools
```

Should only show usage in `src/tools/` directory (which we're keeping for reference).

### Step 7: Type Check

Run TypeScript compiler to verify no broken imports:

```bash
npm run type-check
```

Expected: No errors related to removed imports.

### Step 8: Check File Size Reduction

```bash
wc -l src/index.ts
```

Should see reduction of ~100-200 lines depending on original size.

### Step 9: Review Remaining Handlers

After cleanup, verify these handlers remain:

- ✅ `ListToolsRequestSchema` (updated in Task 5)
- ✅ `CallToolRequestSchema` (registered by `registerDynamicTools`)
- ✅ Other non-tool handlers (if any)

### Step 10: Optional - Keep Tools Directory

The `src/tools/` directory can be kept as documentation:

```bash
# Add README to tools directory explaining it's reference-only
cat > src/tools/README.md << 'EOF'
# Legacy Static Tools

This directory contains the original static tool implementations.
These are **no longer used** by the MCP server, which now uses
dynamic tool discovery from /mcp/tools/list.

Kept for reference and documentation purposes.

## Migration

Tools are now:
- Discovered from Drupal `/mcp/tools/list` endpoint
- Registered dynamically via `src/discovery/dynamic-handlers.ts`
- Validated with JSON Schema to Zod conversion
- Proxied to Drupal JSON-RPC endpoints

See `src/discovery/` for current implementation.
EOF
```

### Step 11: Test Server Startup

Ensure server still starts correctly:

```bash
npm run dev
```

Should see same discovery logs as before, with no errors about missing imports.

### Step 12: Commit Changes

```bash
git add src/index.ts src/tools/README.md
git commit -m "refactor: remove static tool code, now using dynamic discovery

- Remove static tool imports (auth, content)
- Remove static CallToolRequestSchema handler
- Remove zodToJsonSchema import
- Add README to tools/ explaining migration
- Server now fully relies on dynamic tool discovery

Refs: Plan 7 - MCP Tool Auto-Discovery"
```

### Troubleshooting

**Issue: Type Errors After Removal**

- Check for lingering references to removed imports
- Search globally: `grep -rn "authLogin\|authLoginSchema" src/`
- May have missed some usage - track down and remove

**Issue: Server Won't Start**

- Check `registerDynamicTools` was called successfully
- Verify dynamic handler is registered before server starts
- Add debug log before removing code to confirm dynamic handlers work

**Issue: Tools Not Working**

- Verify removal didn't accidentally delete dynamic handler registration
- Check `CallToolRequestSchema` handler exists via `registerDynamicTools`
- Test with MCP client to confirm tools still callable

**Issue: Linter Warnings**

- Run linter: `npm run lint` (if configured)
- Fix any unused import warnings
- Clean up any formatting issues

</details>
