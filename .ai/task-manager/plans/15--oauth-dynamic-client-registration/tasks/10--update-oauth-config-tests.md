---
id: 10
group: 'test-updates'
dependencies: [4]
status: 'pending'
created: '2025-10-15'
skills:
  - 'jest'
  - 'typescript'
---

# Update OAuth Config Tests

## Objective

Remove or update tests in `oauth-config.test.ts` that rely on client credential validation, since
credentials are no longer required.

## Skills Required

- jest: Test modification, assertion updates
- typescript: Understanding test structure

## Acceptance Criteria

- [ ] Remove tests that expect errors for missing `OAUTH_CLIENT_ID`
- [ ] Remove tests that expect errors for missing `OAUTH_CLIENT_SECRET`
- [ ] Update tests to verify config creation succeeds without credentials
- [ ] Verify tests for `drupalUrl` and `scopes` still work
- [ ] All tests pass

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

File location: `tests/unit/oauth-config.test.ts` (or similar path)

Tests to remove/update:

- Tests checking `OAUTH_CLIENT_ID` is required
- Tests checking `OAUTH_CLIENT_SECRET` is required
- Tests that mock client credentials in environment

Tests to keep:

- Tests validating `DRUPAL_BASE_URL` requirement
- Tests for scope parsing
- Tests for optional parameters

## Input Dependencies

- Task 4: `createOAuthConfigFromEnv()` no longer requires credentials

## Output Artifacts

- Updated test file with passing tests

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Find the test file**:

   ```bash
   find tests src -name "*oauth*config*.test.ts"
   ```

2. **Open the file and identify tests to remove**:
   - Tests with descriptions like "should throw when OAUTH_CLIENT_ID is missing"
   - Tests with descriptions like "should throw when OAUTH_CLIENT_SECRET is missing"
   - Tests that validate credential format

3. **Remove credential validation tests**: Delete entire test blocks like:

   ```typescript
   it('should throw when OAUTH_CLIENT_ID is missing', () => {
     delete process.env.OAUTH_CLIENT_ID;
     expect(() => createOAuthConfigFromEnv()).toThrow('OAUTH_CLIENT_ID');
   });
   ```

4. **Update happy path tests**: Ensure tests verify config is created successfully:

   ```typescript
   it('should create config without client credentials', () => {
     const config = createOAuthConfigFromEnv();
     expect(config.drupalUrl).toBeDefined();
     expect(config.scopes).toBeDefined();
     expect(config).not.toHaveProperty('clientId');
     expect(config).not.toHaveProperty('clientSecret');
   });
   ```

5. **Update setup/teardown**: If `beforeEach` or `beforeAll` sets mock credentials:
   - Remove `process.env.OAUTH_CLIENT_ID` assignments
   - Remove `process.env.OAUTH_CLIENT_SECRET` assignments

6. **Run tests**:

   ```bash
   npm test -- oauth-config.test.ts
   ```

7. **Verify all tests pass**: Address any remaining failures.

</details>
