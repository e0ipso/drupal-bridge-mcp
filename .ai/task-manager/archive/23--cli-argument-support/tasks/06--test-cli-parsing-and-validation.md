---
id: 6
group: 'testing'
dependencies: [2, 3, 4]
status: 'completed'
created: '2025-11-04'
completed: '2025-11-04'
skills:
  - 'jest'
  - 'typescript'
---

# Test CLI Parsing and Configuration Validation

## Objective

Write comprehensive unit tests for the CLI parser and configuration manager modules to ensure
argument parsing, validation, and error handling work correctly across all supported scenarios and
edge cases.

## Skills Required

- jest: Unit testing with mocking and assertions
- typescript: Type-safe test implementation

## Acceptance Criteria

- [x] Test file `src/utils/__tests__/cli-parser.test.ts` created with >90% coverage (100% achieved)
- [x] Test file `src/utils/__tests__/config-manager.test.ts` created with >90% coverage (100%
      achieved)
- [x] All supported arguments tested for correct parsing
- [x] Boolean flag variations tested (--auth, --no-auth)
- [x] Validation tests cover valid and invalid inputs
- [x] Error messages verified for clarity and helpfulness
- [x] All tests pass with `npm test` (264 tests passing)
- [x] Type checking passes

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Important: Meaningful Test Strategy**

Your critical mantra for test generation is: "write a few tests, mostly integration".

Focus on testing custom business logic and critical paths:

- Custom argument parsing logic (not minimist itself)
- Validation functions with edge cases
- Error message formatting
- Configuration precedence rules

**Do NOT test**:

- minimist package functionality (already tested upstream)
- Node.js URL API (framework functionality)
- Basic getters/setters or simple property access

**Test Categories**:

1. **CLI Parser Tests** (`cli-parser.test.ts`):
   - Parsing different argument formats (--flag=value, --flag value)
   - Boolean flag handling (--auth, --no-auth)
   - Shorthand aliases (-h, -v)
   - Multiple arguments combined
   - Port string-to-number conversion

2. **Config Manager Tests** (`config-manager.test.ts`):
   - URL validation (valid HTTP/HTTPS, invalid formats)
   - Port validation (valid range, out of range, non-numeric)
   - Log level validation (valid levels, invalid levels, case insensitivity)
   - JSON-RPC method validation (GET, POST, invalid values, case handling)
   - Error message content and format

## Input Dependencies

- parseCliArgs from cli-parser.ts (task 2)
- applyArgsToEnv and validation functions from config-manager.ts (task 3)
- displayHelp, displayVersion from cli-help.ts (task 4)

## Output Artifacts

- `src/utils/__tests__/cli-parser.test.ts` with comprehensive parser tests
- `src/utils/__tests__/config-manager.test.ts` with validation tests
- Updated test coverage reports

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Create test directory structure**:

   ```bash
   mkdir -p src/utils/__tests__
   touch src/utils/__tests__/cli-parser.test.ts
   touch src/utils/__tests__/config-manager.test.ts
   ```

2. **CLI Parser Tests** (`cli-parser.test.ts`):

   ```typescript
   import { parseCliArgs } from '../cli-parser.js';

   describe('parseCliArgs', () => {
     test('parses drupal-url with equals syntax', () => {
       const result = parseCliArgs(['--drupal-url=https://example.com']);
       expect(result.drupalUrl).toBe('https://example.com');
     });

     test('parses drupal-url with space syntax', () => {
       const result = parseCliArgs(['--drupal-url', 'https://example.com']);
       expect(result.drupalUrl).toBe('https://example.com');
     });

     test('parses boolean flags correctly', () => {
       const resultAuth = parseCliArgs(['--auth']);
       expect(resultAuth.auth).toBe(true);

       const resultNoAuth = parseCliArgs(['--no-auth']);
       expect(resultNoAuth.auth).toBe(false);
     });

     test('parses shorthand help flag', () => {
       const result = parseCliArgs(['-h']);
       expect(result.help).toBe(true);
     });

     test('parses shorthand version flag', () => {
       const result = parseCliArgs(['-v']);
       expect(result.version).toBe(true);
     });

     test('parses port as number', () => {
       const result = parseCliArgs(['--port=3000']);
       expect(result.port).toBe(3000);
       expect(typeof result.port).toBe('number');
     });

     test('parses multiple arguments together', () => {
       const result = parseCliArgs([
         '--drupal-url=https://example.com',
         '--no-auth',
         '--port=4000',
         '--log-level=debug',
       ]);
       expect(result.drupalUrl).toBe('https://example.com');
       expect(result.auth).toBe(false);
       expect(result.port).toBe(4000);
       expect(result.logLevel).toBe('debug');
     });

     test('returns undefined for missing arguments', () => {
       const result = parseCliArgs([]);
       expect(result.drupalUrl).toBeUndefined();
       expect(result.auth).toBeUndefined();
       expect(result.port).toBeUndefined();
     });
   });
   ```

3. **Config Manager Tests** (`config-manager.test.ts`):

   ```typescript
   import { applyArgsToEnv } from '../config-manager.js';

   describe('applyArgsToEnv', () => {
     let originalEnv: NodeJS.ProcessEnv;

     beforeEach(() => {
       // Save original env
       originalEnv = { ...process.env };
     });

     afterEach(() => {
       // Restore original env
       process.env = originalEnv;
     });

     test('applies valid drupal-url to env', () => {
       applyArgsToEnv({ drupalUrl: 'https://example.com' });
       expect(process.env.DRUPAL_BASE_URL).toBe('https://example.com');
     });

     test('throws error for invalid URL format', () => {
       expect(() => {
         applyArgsToEnv({ drupalUrl: 'not-a-url' });
       }).toThrow(/Invalid --drupal-url/);
     });

     test('throws error for non-HTTP/HTTPS URL', () => {
       expect(() => {
         applyArgsToEnv({ drupalUrl: 'ftp://example.com' });
       }).toThrow(/Invalid --drupal-url/);
     });

     test('applies valid port to env', () => {
       applyArgsToEnv({ port: 4000 });
       expect(process.env.PORT).toBe('4000');
     });

     test('throws error for port out of range (too low)', () => {
       expect(() => {
         applyArgsToEnv({ port: 0 });
       }).toThrow(/Invalid --port/);
     });

     test('throws error for port out of range (too high)', () => {
       expect(() => {
         applyArgsToEnv({ port: 70000 });
       }).toThrow(/Invalid --port/);
     });

     test('applies valid log-level to env', () => {
       applyArgsToEnv({ logLevel: 'debug' });
       expect(process.env.LOG_LEVEL).toBe('debug');
     });

     test('throws error for invalid log-level', () => {
       expect(() => {
         applyArgsToEnv({ logLevel: 'invalid' });
       }).toThrow(/Invalid --log-level/);
     });

     test('applies auth boolean to env as string', () => {
       applyArgsToEnv({ auth: true });
       expect(process.env.AUTH_ENABLED).toBe('true');

       applyArgsToEnv({ auth: false });
       expect(process.env.AUTH_ENABLED).toBe('false');
     });

     test('applies valid JSON-RPC method to env', () => {
       applyArgsToEnv({ drupalJsonrpcMethod: 'POST' });
       expect(process.env.DRUPAL_JSONRPC_METHOD).toBe('POST');
     });

     test('throws error for invalid JSON-RPC method', () => {
       expect(() => {
         applyArgsToEnv({ drupalJsonrpcMethod: 'PUT' });
       }).toThrow(/Invalid --drupal-jsonrpc-method/);
     });

     test('does not modify env for undefined arguments', () => {
       delete process.env.PORT;
       applyArgsToEnv({ drupalUrl: 'https://example.com' });
       expect(process.env.PORT).toBeUndefined();
     });

     test('error messages include helpful examples', () => {
       expect(() => {
         applyArgsToEnv({ drupalUrl: 'invalid' });
       }).toThrow(/Example: https:\/\/example.com/);
     });
   });
   ```

4. **Run tests**:

   ```bash
   npm test
   ```

5. **Check coverage**:

   ```bash
   npm test -- --coverage
   ```

   - Target: >90% coverage for both modules
   - Focus on branches (if/else paths)

6. **Test organization**:
   - Group related tests with describe blocks
   - Use clear test names describing expected behavior
   - Test both success and failure paths
   - Verify error messages contain helpful information

**Design Decisions**:

- Mock process.env in config-manager tests to avoid side effects
- Test argument parsing separately from validation (separation of concerns)
- Focus on business logic, not framework functionality
- Include edge cases (boundary values, invalid inputs)

</details>
