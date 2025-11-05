---
id: 2
group: 'config-manager'
dependencies: [1]
status: 'completed'
created: 2025-11-05
skills:
  - typescript
  - validation
---

# Update Config Manager Auth Validation

## Objective

Update the configuration manager to validate auth string values (enabled/disabled) and map them to
the AUTH_ENABLED environment variable with proper defaults.

## Skills Required

- TypeScript: For type-safe validation logic
- Validation: Input validation and error handling

## Acceptance Criteria

- [ ] `auth: 'enabled'` maps to `AUTH_ENABLED=true`
- [ ] `auth: 'disabled'` maps to `AUTH_ENABLED=false`
- [ ] `auth: undefined` maps to `AUTH_ENABLED=true` (default)
- [ ] Invalid values throw descriptive error
- [ ] Error message lists valid values: enabled, disabled

## Technical Requirements

**File to modify**: `src/utils/config-manager.ts`

**Changes needed**:

1. Update auth validation logic in `applyArgsToEnv()`:
   - Accept string values instead of boolean
   - Validate against allowed values: 'enabled', 'disabled'
   - Default undefined to 'enabled'
   - Map 'enabled' → 'true', 'disabled' → 'false'

2. Error message format:
   ```
   Invalid --auth value: '{value}'. Must be 'enabled' or 'disabled'. Example: --auth=disabled
   ```

## Input Dependencies

- Updated `ParsedCliArgs` interface from Task 1 with `auth?: string`

## Output Artifacts

- Updated `config-manager.ts` with string-based auth validation
- Validated environment variable mapping

## Implementation Notes

<details>
<summary>Implementation Details</summary>

### Current Implementation (to be replaced):

```typescript
// Auth (convert boolean to string for process.env)
if (args.auth !== undefined) {
  process.env.AUTH_ENABLED = args.auth.toString();
}
```

### New Implementation:

```typescript
// Auth (validate and map string values to boolean env var)
if (args.auth !== undefined) {
  const validValues = ['enabled', 'disabled'];
  if (!validValues.includes(args.auth)) {
    throw new Error(
      `Invalid --auth value: '${args.auth}'. Must be 'enabled' or 'disabled'. Example: --auth=disabled`
    );
  }
  process.env.AUTH_ENABLED = (args.auth === 'enabled').toString();
} else {
  // Default to enabled if not provided
  if (process.env.AUTH_ENABLED === undefined) {
    process.env.AUTH_ENABLED = 'true';
  }
}
```

**Important**: The default behavior should only apply the default if `args.auth` is `undefined` AND
`process.env.AUTH_ENABLED` is not already set (to respect existing environment variables).

</details>
