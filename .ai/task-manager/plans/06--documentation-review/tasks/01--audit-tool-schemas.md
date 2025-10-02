---
id: 1
group: 'documentation-audit'
dependencies: []
status: 'completed'
created: '2025-10-02'
skills:
  - typescript
  - technical-writing
---

# Audit Tool Schemas Against Source Code

## Objective

Extract actual tool schemas from source code to identify discrepancies between current README
documentation and actual implementation, creating a reference document for documentation updates.

## Skills Required

- **typescript**: Reading TypeScript source files and understanding Zod schema definitions
- **technical-writing**: Documenting technical findings clearly and concisely

## Acceptance Criteria

- [ ] All 5 tool implementation files read and schemas extracted
- [ ] Tool names verified against `src/index.ts` ListToolsRequestSchema
- [ ] Parameter schemas documented from Zod definitions
- [ ] Current README tool documentation compared against actual implementation
- [ ] Audit findings documented with specific discrepancies identified

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand implementation details</summary>

### Tool Files to Audit

Read and extract schemas from:

1. **src/tools/auth/login.ts**
   - Tool name: `auth_login`
   - Schema: `authLoginSchema`
   - Expected: No parameters (empty object or no required fields)

2. **src/tools/auth/logout.ts**
   - Tool name: `auth_logout`
   - Schema: `authLogoutSchema`
   - Expected: No parameters

3. **src/tools/auth/status.ts**
   - Tool name: `auth_status`
   - Schema: `authStatusSchema`
   - Expected: No parameters

4. **src/tools/content/search.ts**
   - Tool name: `search_tutorial`
   - Schema: `searchTutorialSchema`
   - Expected parameters:
     - `query`: string (required)
     - `limit`: number (optional, default: 10)

5. **src/tools/content/get.ts**
   - Tool name: `get_tutorial`
   - Schema: `getTutorialSchema`
   - Expected parameter:
     - `id`: string (required)

### Verification Against Main Server

Read `src/index.ts` and locate the `ListToolsRequestSchema` handler (around line 228-289) to verify:

- All tool names match exactly
- Tool descriptions are accurate
- InputSchema definitions match Zod schemas

### Current README Analysis

Read `README.md` section "Available Tools" (lines 56-92) and document:

- **Incorrect tool names**: List tools documented but not implemented
- **Missing tools**: List implemented tools not documented
- **Schema mismatches**: Parameter differences between docs and code
- **Description inaccuracies**: Misleading or outdated descriptions

### Audit Output Format

Create a temporary audit document (can be in task notes or separate file) with:

```markdown
# Tool Schema Audit Results

## Discrepancies Found

### Tool Name Mismatches

- README documents `search_tutorials` but implementation uses `search_tutorial`
- README documents `load_node` but implementation uses `get_tutorial`
- (etc.)

### Missing Tools in README

- `auth_login` - Authenticate with Drupal using OAuth Device Flow
- `auth_logout` - Log out and clear OAuth session
- `auth_status` - Check current authentication status

### Schema Mismatches

**search_tutorial:**

- README shows: `keywords`, `types`, `drupal_version`, `limit`
- Actual schema: `query` (string, required), `limit` (number, optional, default 10)

**get_tutorial:**

- README shows: `nodeId`
- Actual schema: `id` (string, required)

### Tools to Remove from README

- `test_connection` - Not found in implementation
- `create_node` - Not found in implementation
```

### Key Validation Points

1. **Exact Name Matching**: Tool names are case-sensitive and must match exactly
2. **Parameter Types**: Verify Zod types (z.string(), z.number(), z.optional(), etc.)
3. **Defaults**: Note any `.default()` values in Zod schemas
4. **Descriptions**: Extract JSDoc comments or inline descriptions from tool files

</details>

## Input Dependencies

- Source code files in `src/tools/auth/` and `src/tools/content/`
- Current README.md (lines 56-92 "Available Tools" section)
- `src/index.ts` ListToolsRequestSchema handler

## Output Artifacts

- Audit findings document listing all discrepancies
- Extracted correct schemas for all 5 tools
- List of corrections needed for README update task

## Implementation Notes

This is a research and documentation task, not a coding task. The goal is to create a clear
reference of what needs to change in the README. Be thorough and precise - the next task will use
these findings to update the documentation.

Focus on user-facing information only. Internal implementation details don't need to be audited
unless they affect the documented API.
