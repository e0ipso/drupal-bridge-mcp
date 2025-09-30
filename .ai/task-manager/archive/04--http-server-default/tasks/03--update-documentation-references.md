---
id: 3
group: 'documentation-updates'
dependencies: [1, 2]
status: 'completed'
created: '2025-10-01'
completed: '2025-10-01'
skills:
  - documentation
---

# Update documentation to reflect single HTTP server architecture

## Objective

Search and update all documentation references to remove mentions of the stdio variant,
server-http.ts file, and dual-server architecture, ensuring documentation accurately reflects the
new single HTTP server implementation.

## Skills Required

- **documentation**: Writing and updating technical documentation for accuracy and clarity

## Acceptance Criteria

- [ ] All references to `server-http.ts` are updated (except in archived plans)
- [ ] No mentions of stdio variant server remain in active documentation
- [ ] Instructions for running the server refer to standard npm scripts
- [ ] OAuth documentation reflects HTTP server as the default
- [ ] No references to `:http` script variants remain

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

- Search for references to:
  - `server-http.ts`
  - `server-http`
  - stdio variant
  - `dev:http` or `start:http`
  - Dual server architecture
- Update found references in:
  - README files (if present at project root)
  - `src/oauth/README.md`
  - Active plan documents in `.ai/task-manager/plans/`
  - Code comments mentioning server variants
- Do NOT update archived plans (`.ai/task-manager/archive/`)

## Input Dependencies

- Task 1: HTTP server is now in src/index.ts
- Task 2: Package.json scripts are updated

## Output Artifacts

- Updated documentation files with accurate references to the single HTTP server implementation

## Implementation Notes

<details>
<summary>Detailed implementation steps</summary>

1. **Search for references to server-http**:
   - Use grep or search tools to find all occurrences of:
     - `server-http.ts`
     - `server-http`
     - `stdio` (in context of server implementation)
     - `dev:http`
     - `start:http`

2. **Review OAuth documentation**:
   - Read `src/oauth/README.md`
   - Check for any references to the HTTP server variant
   - Update any instructions that mention running the server with `:http` scripts
   - Ensure examples use standard `npm run dev` or `npm start`

3. **Check for README files**:
   - Look for README.md at project root
   - If it exists, update any server running instructions
   - Remove references to choosing between stdio and HTTP variants

4. **Review active plans**:
   - Check `.ai/task-manager/plans/03--drupal-integration/` for references
   - Update any mentions of server-http.ts to index.ts
   - Update script references from `:http` variants to base scripts

5. **Update code comments** (if any):
   - Search source files for comments mentioning server variants
   - Update comments to reflect single HTTP server architecture

6. **Verify archive plans are untouched**:
   - Do NOT modify files in `.ai/task-manager/archive/`
   - These are historical records and should remain unchanged

**Search commands to use**:

- `grep -r "server-http" --include="*.md" .ai/task-manager/plans/`
- `grep -r "stdio" --include="*.md" src/oauth/`
- `grep -r "dev:http\|start:http" --include="*.md"`

**Common updates needed**:

- "Run the HTTP server with `npm run dev:http`" → "Run the server with `npm run dev`"
- "The server-http.ts implementation" → "The HTTP server implementation in index.ts"
- "Choose between stdio and HTTP servers" → "The server uses HTTP transport with OAuth support"
</details>
