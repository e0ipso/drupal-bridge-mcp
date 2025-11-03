---
id: 2
group: 'configuration'
dependencies: [1]
status: 'completed'
created: '2025-11-03'
skills:
  - documentation
---

# Update Environment Configuration

## Objective

Remove the deprecated `DRUPAL_JSONRPC_ENDPOINT` environment variable from `.env.example` and add
migration notes explaining the breaking change.

## Skills Required

- **documentation**: Update configuration files and add clear migration guidance

## Acceptance Criteria

- [ ] `DRUPAL_JSONRPC_ENDPOINT` removed from `.env.example`
- [ ] Migration note added explaining the breaking change
- [ ] `DRUPAL_JSONRPC_METHOD` remains in configuration (still controls GET/POST)
- [ ] `DRUPAL_BASE_URL` remains in configuration (still required)
- [ ] Comments clarify the per-tool URL pattern

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand detailed implementation requirements</summary>

### File to Modify

- `.env.example`

### Current Content Pattern

The file currently contains:

```bash
# DRUPAL_JSONRPC_ENDPOINT: JSON-RPC endpoint path
#   - /jsonrpc (default): Standard JSON-RPC endpoint
#   - /mcp/tools/invoke: Legacy A2A endpoint (backward compatibility)
DRUPAL_JSONRPC_ENDPOINT=/jsonrpc
```

### Target Content Pattern

Remove the above section entirely. Add a migration note:

```bash
# Tool Invocation Configuration
# Tools are invoked at per-tool URLs: /mcp/tools/{tool_name}
# Example: /mcp/tools/cache.rebuild, /mcp/tools/dme_mcp-search_content

# DRUPAL_JSONRPC_METHOD: HTTP method for tool invocation
#   - GET (default): URL-encoded query parameter (CDN-friendly, automatic POST fallback if URL > 2000 chars)
#   - POST: JSON body
DRUPAL_JSONRPC_METHOD=GET

# Migration Note (Breaking Change):
# The DRUPAL_JSONRPC_ENDPOINT variable has been removed.
# All tools now use per-tool URLs (/mcp/tools/{tool_name}).
# Requires Drupal backend with PR #3 changes (per-tool routing).
```

### Validation

- Ensure no trailing whitespace
- Verify consistent comment style (# prefix)
- Confirm all required variables are documented

</details>

## Input Dependencies

Task 1 must be completed first to ensure code no longer references `DRUPAL_JSONRPC_ENDPOINT`.

## Output Artifacts

- Updated `.env.example` file without deprecated configuration
- Migration notes for users upgrading from previous versions

## Implementation Notes

This is a documentation task with no code changes. The key is to make the breaking change clear to
users while providing sufficient guidance for migration. The `DRUPAL_JSONRPC_METHOD` variable
remains important for controlling GET/POST behavior.
