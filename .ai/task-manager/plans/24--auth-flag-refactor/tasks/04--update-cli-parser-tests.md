---
id: 4
group: 'testing'
dependencies: [1]
status: 'pending'
created: 2025-11-05
skills:
  - typescript
  - jest-testing
---

# Update CLI Parser Tests

## Objective

Update the CLI parser test suite to validate the new string-based `--auth` flag behavior, removing
old `--no-auth` boolean tests and adding comprehensive coverage for the new interface.

## Skills Required

- TypeScript: For test implementation
- Jest Testing: Test framework and assertion patterns

## Acceptance Criteria

- [ ] Old `--no-auth` tests removed or updated
- [ ] Test for `--auth=enabled` parsing
- [ ] Test for `--auth=disabled` parsing
- [ ] Test for `--auth` with space syntax: `--auth enabled`
- [ ] Test for undefined when no auth flag provided
- [ ] Test for invalid values passing through (validation happens in config-manager)
- [ ] All tests pass

## Technical Requirements

**File to modify**: `src/utils/__tests__/cli-parser.test.ts`

**Test cases to implement**:

1. `--auth=enabled` → `result.auth === 'enabled'`
2. `--auth=disabled` → `result.auth === 'disabled'`
3. `--auth enabled` (space) → `result.auth === 'enabled'`
4. No flag → `result.auth === undefined`
5. Invalid value (e.g., `--auth=yes`) → passes through as string (no validation in parser)
6. Multiple args with `--auth`

## Input Dependencies

- Updated CLI parser implementation from Task 1

## Output Artifacts

- Updated test suite in `cli-parser.test.ts`
- Passing test results

## Implementation Notes

<details>
<summary>Implementation Details</summary>

### Meaningful Test Strategy Guidelines

**IMPORTANT**: Remember the mantra: "write a few tests, mostly integration".

**When TO Write Tests:**

- Custom parsing logic (the auth string parsing is custom behavior)
- Integration between CLI args and parsed output

**When NOT to Write Tests:**

- minimist library functionality (already tested upstream)
- Every possible invalid value combination

### Tests to Remove/Update:

```typescript
describe('auth boolean flag', () => {
  it('should parse --no-auth as false', () => {
    // REMOVE - no longer boolean
  });

  it('should return false as default when auth not provided', () => {
    // UPDATE - should now expect undefined
  });
});
```

### New Tests to Add:

```typescript
describe('auth string argument', () => {
  it('should parse --auth=enabled', () => {
    const result = parseCliArgs(['--auth=enabled']);
    expect(result.auth).toBe('enabled');
  });

  it('should parse --auth=disabled', () => {
    const result = parseCliArgs(['--auth=disabled']);
    expect(result.auth).toBe('disabled');
  });

  it('should parse --auth with space syntax', () => {
    const result = parseCliArgs(['--auth', 'enabled']);
    expect(result.auth).toBe('enabled');
  });

  it('should return undefined when auth not provided', () => {
    const result = parseCliArgs([]);
    expect(result.auth).toBeUndefined();
  });

  it('should pass through invalid values without validation', () => {
    // Parser doesn't validate - that's config-manager's job
    const result = parseCliArgs(['--auth=invalid']);
    expect(result.auth).toBe('invalid');
  });
});
```

**Also update**: Tests in "multiple arguments" section that use `--no-auth` to use `--auth=disabled`
instead.

</details>
