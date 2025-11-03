---
id: 3
group: 'documentation'
dependencies: [1]
status: 'pending'
created: '2025-11-03'
skills:
  - documentation
---

# Update Documentation Files

## Objective

Update all documentation files (`AGENTS.md`, `.github/DEPLOYMENT.md`) to reflect the per-tool URL
architecture and remove references to the deprecated centralized endpoint pattern.

## Skills Required

- **documentation**: Update technical documentation with accurate architectural details

## Acceptance Criteria

- [ ] `AGENTS.md` updated with per-tool URL architecture
- [ ] "Tool Discovery Flow" section (step 7) reflects new invocation pattern
- [ ] "Common Workflows > Migrating to Standard JSON-RPC Endpoint" section updated or removed
- [ ] `.github/DEPLOYMENT.md` updated to remove endpoint configuration
- [ ] Migration guide added for users upgrading from previous versions
- [ ] Archived plan documents left unchanged (historical accuracy)
- [ ] No references to `DRUPAL_JSONRPC_ENDPOINT` remain in documentation

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand detailed implementation requirements</summary>

### Files to Modify

#### 1. `AGENTS.md`

**Section: Tool Discovery Flow (step 7)**

Current:

```markdown
7. **Invocation**: Tools execute via standard `/jsonrpc` endpoint using JSON-RPC 2.0 protocol
```

Update to:

```markdown
7. **Invocation**: Tools execute via per-tool URLs `/mcp/tools/{tool_name}` using JSON-RPC 2.0
   protocol
```

**Section: Tool Discovery (Component 3)**

Current:

```markdown
- Tool invocation: Uses standard `/jsonrpc` endpoint (configurable via `DRUPAL_JSONRPC_ENDPOINT`)
```

Update to:

```markdown
- Tool invocation: Uses per-tool URLs following `/mcp/tools/{tool_name}` pattern
```

**Section: Common Workflows > Migrating to Standard JSON-RPC Endpoint**

This entire section should be removed or significantly rewritten. It references the old pattern
where `DRUPAL_JSONRPC_ENDPOINT` was configurable. Replace with a new section:

```markdown
### Tool Invocation Architecture

**Current Implementation**: Each tool is invoked at its own dedicated endpoint following the pattern
`/mcp/tools/{tool_name}`.

**Examples**:

- Cache rebuild: `POST /mcp/tools/cache.rebuild`
- Content search: `POST /mcp/tools/dme_mcp-search_content`

**Request Format**: Standard JSON-RPC 2.0 with method field matching tool name **Method Support**:
Both GET (URL-encoded) and POST (JSON body) **Authentication**: OAuth2 Bearer token via
Authorization header

**Breaking Change**: This replaces the previous centralized endpoint pattern. Deployments require
Drupal backend with per-tool routing support (post-PR #3).
```

#### 2. `.github/DEPLOYMENT.md`

Find and remove references to `DRUPAL_JSONRPC_ENDPOINT`:

Current (approximately line 64):

```markdown
- `DRUPAL_JSONRPC_ENDPOINT`: JSON-RPC endpoint path (default: `/jsonrpc`)
```

Replace with:

```markdown
- Tool invocation uses per-tool URLs: `/mcp/tools/{tool_name}` (no configuration needed)
```

Add migration guidance section:

```markdown
### Migration from Previous Versions

**Breaking Change**: Version X.X.X introduces per-tool invocation URLs.

**Requirements**:

- Drupal backend must have PR #3 changes (per-tool routing)
- Remove `DRUPAL_JSONRPC_ENDPOINT` from environment configuration if set
- Test on staging environment before production deployment

**No backward compatibility**: Previous centralized endpoint pattern is not supported.
```

### Validation Steps

1. Search for all occurrences of `DRUPAL_JSONRPC_ENDPOINT` in documentation:

   ```bash
   grep -r "DRUPAL_JSONRPC_ENDPOINT" --include="*.md" --exclude-dir=".ai/task-manager/archive" .
   ```

2. Search for references to `/jsonrpc` or `/mcp/tools/invoke` as endpoints:

   ```bash
   grep -r "/jsonrpc\|/mcp/tools/invoke" --include="*.md" --exclude-dir=".ai/task-manager/archive" . | grep -v "jsonrpc_mcp"
   ```

3. Ensure archived plan documents are NOT modified (maintain historical accuracy)

</details>

## Input Dependencies

Task 1 must be completed first to ensure the documentation accurately reflects the implementation.

## Output Artifacts

- Updated `AGENTS.md` with per-tool URL architecture
- Updated `.github/DEPLOYMENT.md` with migration guidance
- No remaining references to deprecated centralized endpoint pattern

## Implementation Notes

Focus on clarity and completeness. Users upgrading from previous versions need clear guidance on the
breaking change and migration requirements. The documentation should emphasize that this requires
coordinated Drupal backend updates.

Archived plan documents (under `.ai/task-manager/archive/`) should NOT be modified, as they
represent historical implementation details that should remain accurate to their time of execution.
