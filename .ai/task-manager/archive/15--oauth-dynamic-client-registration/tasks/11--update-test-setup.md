---
id: 11
group: test-updates
dependencies:
  - 10
status: completed
created: '2025-10-15'
skills:
  - jest
  - typescript
---

# Update Test Setup to Remove Credential Mocking

## Objective

Remove client credential setup from test configuration files (setup.ts, jest config, etc.) since
credentials are no longer required.

## Skills Required

- jest: Test configuration, global setup
- typescript: Test utilities

## Acceptance Criteria

- [ ] Remove `OAUTH_CLIENT_ID` from test environment setup
- [ ] Remove `OAUTH_CLIENT_SECRET` from test environment setup
- [ ] Keep other required OAuth test config (Drupal URL, etc.)
- [ ] All test suites pass

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

Files to check:

- `tests/unit/setup.ts`
- `tests/integration/setup.ts`
- `jest.config.js` or `jest.config.ts`
- Any `.env.test` or similar files

Look for patterns:

- `process.env.OAUTH_CLIENT_ID = 'test-client'`
- `process.env.OAUTH_CLIENT_SECRET = 'test-secret'`

## Input Dependencies

- Task 10: OAuth config tests updated

## Output Artifacts

- Test setup files without credential mocking
- All tests passing

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Find test setup files**:

   ```bash
   find tests -name "setup.ts" -o -name "setup.js"
   find . -name ".env.test" -o -name "jest.setup.*"
   ```

2. **Check each setup file**: Look for environment variable assignments:

   ```typescript
   // Remove these lines:
   process.env.OAUTH_CLIENT_ID = 'test-client-id';
   process.env.OAUTH_CLIENT_SECRET = 'test-client-secret';
   ```

3. **Keep required test config**: Don't remove:

   ```typescript
   process.env.DRUPAL_BASE_URL = 'http://test-drupal.local';
   process.env.AUTH_ENABLED = 'true';
   // Other non-credential config
   ```

4. **Check .env.test file** (if exists):
   - Remove `OAUTH_CLIENT_ID=...` lines
   - Remove `OAUTH_CLIENT_SECRET=...` lines
   - Keep `DRUPAL_BASE_URL` and other required vars

5. **Run full test suite**:

   ```bash
   npm test
   ```

6. **Fix any failures**: Some integration tests might have expected credentials. Update those tests
   to work without credentials.

7. **Rationale**: Tests should match production behavior - the server should work without
   pre-configured client credentials.

</details>
