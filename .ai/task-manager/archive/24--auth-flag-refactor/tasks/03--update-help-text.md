---
id: 3
group: 'documentation'
dependencies: [1]
status: 'pending'
created: 2025-11-05
skills:
  - technical-writing
---

# Update CLI Help Text

## Objective

Update the help text to document the new `--auth` flag with its accepted values and default
behavior, replacing the old `--no-auth` documentation.

## Skills Required

- Technical Writing: Clear, user-friendly documentation

## Acceptance Criteria

- [ ] `--no-auth` removed from help text
- [ ] `--auth <enabled|disabled>` documented in Optional section
- [ ] Default value clearly stated (enabled by default)
- [ ] Examples include `--auth=disabled`
- [ ] Examples section updated appropriately

## Technical Requirements

**File to modify**: `src/utils/cli-help.ts`

**Changes needed**:

1. Replace `--no-auth` line with `--auth` documentation
2. Show value format: `<enabled|disabled>`
3. Indicate default: "(enabled by default)" or "(default: enabled)"
4. Update examples to use `--auth=disabled`

## Input Dependencies

- Understanding of new flag behavior from Task 1

## Output Artifacts

- Updated help text in `cli-help.ts`
- User-facing documentation

## Implementation Notes

<details>
<summary>Implementation Details</summary>

### Current Text (to be replaced):

```
Optional:
  --no-auth                       Disable OAuth authentication (enabled by default)
```

### New Text:

```
Optional:
  --auth <enabled|disabled>       OAuth authentication mode (default: enabled)
```

### Example Updates:

Replace:

```
  drupal-bridge-mcp --drupal-url=https://example.com --no-auth
```

With:

```
  drupal-bridge-mcp --drupal-url=https://example.com --auth=disabled
```

Keep the basic example without auth flag to demonstrate default behavior.

</details>
