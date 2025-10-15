---
id: 8
group: 'oauth-client-removal'
dependencies: [7]
status: 'pending'
created: '2025-10-15'
skills:
  - 'typescript'
  - 'mcp-server'
---

# Remove auth_login Tool

## Objective

Delete the `auth_login` tool and remove its registration from the MCP server, since authentication
is now handled by Claude Code's "Authenticate" button.

## Skills Required

- typescript: Code removal, import cleanup
- mcp-server: Tool registration patterns

## Acceptance Criteria

- [ ] Delete `src/tools/auth/login.ts` file
- [ ] Remove `auth_login` tool registration from server setup (likely in `src/index.ts`)
- [ ] Remove any imports related to auth login tool
- [ ] Remove auth login tool tests
- [ ] File compiles without errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

Files to modify:

- Delete: `src/tools/auth/login.ts`
- Update: `src/index.ts` (or wherever tools are registered)
- Delete: Test files for auth_login

Look for patterns like:

- `server.setRequestHandler(CallToolRequestSchema, ...)`
- Tool name: `"auth_login"`
- Local tool handlers

## Input Dependencies

- Task 7: Device flow infrastructure removed

## Output Artifacts

- `src/tools/auth/login.ts` deleted
- Tool registration code removed from server setup

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Check if tool file exists**:

   ```bash
   ls -la src/tools/auth/login.ts
   ```

2. **Delete the tool file**:

   ```bash
   rm -f src/tools/auth/login.ts
   ```

3. **Find tool registration**: Search for where `auth_login` is registered:

   ```bash
   grep -r "auth_login" src/
   ```

4. **Remove registration code**: In the server setup file (likely `src/index.ts`), remove:
   - Tool definition in tools list
   - Tool handler implementation
   - Related imports

5. **Example patterns to remove**:

   ```typescript
   // Tool definition
   {
     name: "auth_login",
     description: "...",
     inputSchema: {...}
   }

   // Tool handler
   if (request.params.name === "auth_login") {
     // ... handler code
   }

   // Import
   import { handleAuthLogin } from './tools/auth/login.js';
   ```

6. **Remove tests**:

   ```bash
   find src tests -name "*auth*login*.test.ts" -type f
   # Delete any found
   ```

7. **Verify compilation**: Run `npm run type-check`

8. **Rationale**: Claude Code's "Authenticate" button provides superior OAuth UX compared to a
   custom tool. Removing this simplifies the codebase and enforces proper separation of concerns
   (MCP server = resource server, not OAuth client).

</details>
