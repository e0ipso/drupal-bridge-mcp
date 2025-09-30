---
id: 1
group: 'server-consolidation'
dependencies: []
status: 'completed'
created: '2025-10-01'
skills:
  - typescript
  - nodejs
---

# Replace stdio server with HTTP server as default entry point

## Objective

Replace the stdio-based server implementation in `src/index.ts` with the HTTP server code from
`src/server-http.ts`, making the HTTP server the default entry point for npx execution.

## Skills Required

- **typescript**: Handling TypeScript source code manipulation and ensuring proper syntax
- **nodejs**: Understanding Node.js module execution patterns and CLI entry points

## Acceptance Criteria

- [ ] `src/index.ts` contains the HTTP server implementation (DrupalMCPHttpServer)
- [ ] Shebang (`#!/usr/bin/env node`) is preserved at the top of `src/index.ts`
- [ ] All imports, class definitions, and exports from server-http.ts are intact
- [ ] Module execution check is preserved
- [ ] `src/server-http.ts` file is deleted
- [ ] Code compiles without TypeScript errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

- Copy entire content from `src/server-http.ts` to `src/index.ts`
- Preserve the shebang line for CLI execution
- Maintain module execution pattern: `if (import.meta.url === \`file://\${process.argv[1]}\`)`
- Ensure all OAuth and HTTP transport functionality is preserved
- Delete `src/server-http.ts` after successful replacement

## Input Dependencies

None - this is the first task in the consolidation

## Output Artifacts

- Updated `src/index.ts` containing HTTP server implementation
- Removed `src/server-http.ts` file

## Implementation Notes

<details>
<summary>Detailed implementation steps</summary>

1. **Read the HTTP server file**:
   - Read the complete content of `src/server-http.ts`
   - Verify it contains the DrupalMCPHttpServer class

2. **Replace index.ts**:
   - Read current `src/index.ts` to understand its structure
   - Replace the entire content with `src/server-http.ts` content
   - Ensure the shebang line `#!/usr/bin/env node` is at the very top

3. **Verify critical components are present**:
   - DrupalMCPHttpServer class
   - OAuth imports and configuration
   - Express setup and middleware
   - StreamableHTTPServerTransport
   - main() function with proper error handling
   - Module execution check at the bottom

4. **Delete the old server-http.ts file**:
   - Use file system operations to remove `src/server-http.ts`

5. **Validate the changes**:
   - Run TypeScript type-check: `npm run type-check`
   - Ensure no compilation errors occur
   - Verify imports are resolved correctly

**Key considerations**:

- The HTTP server has all the functionality of the stdio server plus OAuth support
- No functionality is lost in this replacement
- The bin entry in package.json will still point to `dist/index.js` after compilation
</details>
