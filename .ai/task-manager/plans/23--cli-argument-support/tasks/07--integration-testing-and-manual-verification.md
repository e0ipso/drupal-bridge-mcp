---
id: 7
group: 'testing'
dependencies: [5, 6]
status: 'completed'
created: '2025-11-04'
completed: '2025-11-04'
skills:
  - 'bash'
  - 'testing'
---

# Integration Testing and Manual Verification

## Objective

Perform end-to-end integration testing to verify the complete CLI argument flow works correctly,
including building, executing with various argument combinations, and validating backward
compatibility with environment variables.

## Skills Required

- bash: Shell scripting for test automation and manual testing
- testing: Integration test design and verification

## Acceptance Criteria

- [ ] Server builds successfully with `npm run build`
- [ ] `--help` displays formatted help and exits cleanly
- [ ] `--version` displays version and exits cleanly
- [ ] Valid arguments start server successfully
- [ ] Invalid arguments show helpful error messages
- [ ] Server runs without CLI args (backward compatibility verified)
- [ ] npx execution works: `npx . --drupal-url=https://example.com --no-auth`
- [ ] Type checking passes

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Important: Meaningful Test Strategy**

Focus on integration paths and critical user workflows:

- CLI argument parsing through server startup
- Validation error handling and user feedback
- Backward compatibility with env vars
- npx execution flow

**Do NOT create extensive test suites** - this is manual verification and smoke testing, not
comprehensive automation.

**Test Scenarios**:

1. **Build Verification**:
   - `npm run build` succeeds
   - `dist/server.js` is executable
   - TypeScript compilation has no errors

2. **Help/Version Display**:
   - `node dist/server.js --help` shows help and exits
   - `node dist/server.js -h` (shorthand) works
   - `node dist/server.js --version` shows version
   - `node dist/server.js -v` (shorthand) works

3. **Valid Argument Scenarios**:
   - Basic: `--drupal-url=https://example.com`
   - With auth: `--drupal-url=https://example.com --no-auth`
   - Multiple args: `--drupal-url=https://example.com --port=4000 --log-level=debug`

4. **Invalid Argument Scenarios**:
   - Invalid URL: `--drupal-url=not-a-url` (should show error)
   - Invalid port: `--port=99999` (should show error)
   - Invalid log level: `--log-level=invalid` (should show error)

5. **Backward Compatibility**:
   - No args: `DRUPAL_BASE_URL=https://example.com node dist/server.js`
   - Mixed: `DRUPAL_BASE_URL=https://old.com node dist/server.js --drupal-url=https://new.com` (CLI
     should win)

6. **npx Execution**:
   - Local: `npx . --drupal-url=https://example.com --no-auth`
   - Verify it reads from built dist/

## Input Dependencies

- Integrated server.ts with CLI parsing (task 5)
- Unit tests passing (task 6)
- All CLI modules built and available in dist/

## Output Artifacts

- Manual test results documented (can be in commit message or test notes)
- Confirmation that all success criteria met
- Any issues identified for fixing

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Build the project**:

   ```bash
   npm run build
   ```

   Verify:
   - No TypeScript errors
   - dist/server.js exists
   - dist/utils/cli-parser.js, cli-help.js, config-manager.js exist

2. **Test help display**:

   ```bash
   node dist/server.js --help
   node dist/server.js -h
   ```

   Verify:
   - Help text appears with all arguments documented
   - Examples section shows usage
   - Exits with code 0 (check with `echo $?`)

3. **Test version display**:

   ```bash
   node dist/server.js --version
   node dist/server.js -v
   ```

   Verify:
   - Prints version number from package.json
   - Exits with code 0

4. **Test with valid arguments** (requires running Drupal instance or use --no-auth):

   ```bash
   # Basic usage
   node dist/server.js --drupal-url=https://drupal-contrib.ddev.site --no-auth

   # With multiple args
   node dist/server.js \
     --drupal-url=https://drupal-contrib.ddev.site \
     --no-auth \
     --port=4000 \
     --log-level=debug
   ```

   Verify:
   - Server starts successfully
   - Configuration applied correctly (check startup logs)
   - Can connect to server on specified port
   - Ctrl+C shuts down cleanly

5. **Test with invalid arguments**:

   ```bash
   # Invalid URL
   node dist/server.js --drupal-url=not-a-url

   # Invalid port
   node dist/server.js --drupal-url=https://example.com --port=99999

   # Invalid log level
   node dist/server.js --drupal-url=https://example.com --log-level=invalid
   ```

   Verify:
   - Error message displayed for each case
   - Error message is clear and helpful
   - Suggests running --help
   - Exits with code 1 (check with `echo $?`)

6. **Test backward compatibility**:

   ```bash
   # Via env vars only
   DRUPAL_BASE_URL=https://drupal-contrib.ddev.site \
   AUTH_ENABLED=false \
   node dist/server.js

   # Via .env file (if one exists)
   node dist/server.js

   # CLI overrides env
   DRUPAL_BASE_URL=https://old.com \
   node dist/server.js --drupal-url=https://new.com --no-auth
   ```

   Verify:
   - Server starts with env vars when no CLI args
   - .env file still works
   - CLI args take precedence over env vars (check logs for URL)

7. **Test npx execution**:

   ```bash
   npx . --drupal-url=https://drupal-contrib.ddev.site --no-auth
   ```

   Verify:
   - npx finds and executes dist/server.js
   - Arguments passed correctly
   - Server starts successfully

8. **Type checking**:

   ```bash
   npm run type-check
   ```

   Verify:
   - No TypeScript errors
   - All new modules type-safe

9. **Run unit tests**:

   ```bash
   npm test
   ```

   Verify:
   - All tests pass
   - Coverage meets thresholds

**Manual Testing Checklist**:

- [ ] Build succeeds
- [ ] Help displays correctly
- [ ] Version displays correctly
- [ ] Valid args start server
- [ ] Invalid args show errors
- [ ] Env vars still work
- [ ] CLI overrides env
- [ ] npx execution works
- [ ] Type check passes
- [ ] Unit tests pass

**Issues to Watch For**:

- Path resolution issues (dist/ vs src/)
- Missing built files
- Incorrect error messages
- Exit codes wrong (0 vs 1)
- Process doesn't exit after help/version

**Documentation of Results**: Create a simple test log:

```
Integration Test Results - 2025-11-04

✅ Build successful
✅ Help display works
✅ Version display works
✅ Valid arguments start server
✅ Invalid arguments show errors
✅ Backward compatibility maintained
✅ npx execution works
✅ Type checking passes
✅ Unit tests pass (10/10)

All success criteria met. Ready for documentation.
```

</details>

## Test Results

**Integration Test Results - 2025-11-04**

All acceptance criteria verified successfully:

### Build Verification

- [x] `npm run build` completed without errors
- [x] All CLI modules built to dist/ (server.js, cli-parser.js, cli-help.js, config-manager.js)
- [x] TypeScript compilation successful

### Help/Version Display

- [x] `node dist/server.js --help` shows formatted help and exits with code 0
- [x] `node dist/server.js -h` (shorthand) works correctly
- [x] `node dist/server.js --version` shows version 1.11.1 and exits with code 0
- [x] `node dist/server.js -v` (shorthand) works correctly

### Valid Argument Scenarios

- [x] Basic usage: `--drupal-url=https://example.com --no-auth` starts server successfully
- [x] Multiple args: `--drupal-url=https://example.com --no-auth --port=4000 --log-level=debug`
      parses all arguments correctly

### Invalid Argument Scenarios

- [x] Invalid URL `--drupal-url=not-a-url` shows clear error message and exits with code 1
- [x] Invalid port `--port=99999` shows range validation error and exits with code 1
- [x] Invalid log level `--log-level=invalid` shows valid options and exits with code 1
- [x] All error messages include "Run with --help for usage information"

### Backward Compatibility

- [x] Server starts using `DRUPAL_BASE_URL` and `AUTH_ENABLED` env vars without CLI args
- [x] CLI args override env vars:
      `DRUPAL_BASE_URL=https://old.com node dist/server.js --drupal-url=https://new.com` correctly
      uses new.com

### npx Execution

- [x] `npx . --drupal-url=https://example.com --no-auth` successfully executes from dist/server.js
- [x] Arguments passed correctly through npx

### Type Checking and Tests

- [x] `npm run type-check` passes with no TypeScript errors
- [x] `npm test` passes: 264 tests across 10 test suites

**Status**: All success criteria met. CLI argument support is fully functional and ready for
production use.

**Notes**:

- All error messages are clear and helpful
- Exit codes are correct (0 for success, 1 for errors)
- Backward compatibility is maintained - existing users using env vars will continue to work
- CLI args take precedence over env vars as designed
- Help text is well-formatted with examples section
