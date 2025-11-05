---
id: 5
group: 'testing'
dependencies: [2]
status: 'completed'
created: 2025-11-05
skills:
  - typescript
  - jest-testing
---

# Update Config Manager Tests

## Objective

Update the config manager test suite to validate the new auth value validation logic, including
enabled/disabled mapping, default behavior, and error handling.

## Skills Required

- TypeScript: For test implementation
- Jest Testing: Test framework, mocking, and assertions

## Acceptance Criteria

- [ ] Test `auth: 'enabled'` maps to `AUTH_ENABLED=true`
- [ ] Test `auth: 'disabled'` maps to `AUTH_ENABLED=false`
- [ ] Test `auth: undefined` defaults to `AUTH_ENABLED=true`
- [ ] Test invalid values throw appropriate error
- [ ] Test error message format and content
- [ ] Test that existing `AUTH_ENABLED` env var is not overridden when arg is undefined
- [ ] All tests pass

## Technical Requirements

**File to modify**: `src/utils/__tests__/config-manager.test.ts`

**Test cases to implement**:

1. Valid value 'enabled' mapping
2. Valid value 'disabled' mapping
3. Default behavior when undefined
4. Invalid value error throwing
5. Error message validation
6. Environment variable precedence

## Input Dependencies

- Updated config manager validation from Task 2
- Understanding of new auth interface

## Output Artifacts

- Updated test suite in `config-manager.test.ts`
- Passing test results

## Implementation Notes

<details>
<summary>Implementation Details</summary>

### Meaningful Test Strategy Guidelines

**IMPORTANT**: Remember: "write a few tests, mostly integration".

Focus on:

- Custom validation logic (enabled/disabled check)
- Environment variable mapping behavior
- Error handling for invalid input
- Default value application

### Tests to Add/Update:

```typescript
describe('auth argument validation and mapping', () => {
  beforeEach(() => {
    delete process.env.AUTH_ENABLED;
  });

  it('should map auth=enabled to AUTH_ENABLED=true', () => {
    const args = { auth: 'enabled' };
    applyArgsToEnv(args);
    expect(process.env.AUTH_ENABLED).toBe('true');
  });

  it('should map auth=disabled to AUTH_ENABLED=false', () => {
    const args = { auth: 'disabled' };
    applyArgsToEnv(args);
    expect(process.env.AUTH_ENABLED).toBe('false');
  });

  it('should default to enabled when auth is undefined and AUTH_ENABLED not set', () => {
    const args = {};
    applyArgsToEnv(args);
    expect(process.env.AUTH_ENABLED).toBe('true');
  });

  it('should not override existing AUTH_ENABLED when auth is undefined', () => {
    process.env.AUTH_ENABLED = 'false';
    const args = {};
    applyArgsToEnv(args);
    expect(process.env.AUTH_ENABLED).toBe('false');
  });

  it('should throw error for invalid auth value', () => {
    const args = { auth: 'yes' };
    expect(() => applyArgsToEnv(args)).toThrow(
      "Invalid --auth value: 'yes'. Must be 'enabled' or 'disabled'"
    );
  });

  it('should include example in error message', () => {
    const args = { auth: 'invalid' };
    expect(() => applyArgsToEnv(args)).toThrow('Example: --auth=disabled');
  });
});
```

**Important**: Update any existing auth-related tests that expect boolean values to expect string
values instead.

</details>
