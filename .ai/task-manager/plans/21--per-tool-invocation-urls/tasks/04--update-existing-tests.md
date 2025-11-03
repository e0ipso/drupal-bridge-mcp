---
id: 4
group: 'testing'
dependencies: [1]
status: 'completed'
created: '2025-11-03'
skills:
  - jest
  - typescript
---

# Update Existing Tests for Per-Tool URLs

## Objective

Update existing test files to work with per-tool URL patterns, including removing
`DRUPAL_JSONRPC_ENDPOINT` environment variable assignments and updating mock fetch URLs to expect
`/mcp/tools/{tool_name}` patterns.

## Skills Required

- **jest**: Update test mocks and assertions for new URL patterns
- **typescript**: Modify test code in strict TypeScript mode

## Acceptance Criteria

- [x] All `process.env.DRUPAL_JSONRPC_ENDPOINT` assignments removed from test setup
- [x] Mock fetch URLs updated to expect `/mcp/tools/{tool_name}` pattern
- [x] Mock assertions verify new URL structure
- [x] Test descriptions updated to reflect per-tool endpoint behavior
- [x] Error message assertions account for new URL format
- [x] `npm test` passes with all tests updated
- [x] `npm run type-check` passes with zero errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand detailed implementation requirements</summary>

### Meaningful Test Strategy Guidelines

**IMPORTANT**: Your critical mantra for test generation is: "write a few tests, mostly integration".

**Definition of "Meaningful Tests":** Tests that verify custom business logic, critical paths, and
edge cases specific to the application. Focus on testing YOUR code, not the framework or library
functionality.

**When TO Write Tests:**

- Custom business logic and algorithms
- Critical user workflows and data transformations
- Edge cases and error conditions for core functionality
- Integration points between different system components
- Complex validation logic or calculations

**When NOT to Write Tests:**

- Third-party library functionality (already tested upstream)
- Framework features (React hooks, Express middleware, etc.)
- Simple CRUD operations without custom logic
- Getter/setter methods or basic property access
- Configuration files or static data
- Obvious functionality that would break immediately if incorrect

**Test Task Creation Rules:**

- Combine related test scenarios into single tasks
- Focus on integration and critical path testing over unit test coverage
- Avoid creating separate tasks for testing each CRUD operation individually
- Question whether simple functions need dedicated test tasks

### Test File Discovery

Find all test files that may reference the old endpoint pattern:

```bash
# Find test files
find src -name "*.test.ts" -o -name "*.spec.ts"

# Search for DRUPAL_JSONRPC_ENDPOINT references in tests
grep -r "DRUPAL_JSONRPC_ENDPOINT" --include="*.test.ts" --include="*.spec.ts" src/
```

### Expected Test Changes

#### 1. Environment Variable Cleanup

**Remove** all instances like:

```typescript
process.env.DRUPAL_JSONRPC_ENDPOINT = '/jsonrpc';
process.env.DRUPAL_JSONRPC_ENDPOINT = '/mcp/tools/invoke';
```

These are no longer needed since the endpoint is constructed per-tool.

#### 2. Mock Fetch URL Patterns

**Old pattern:**

```typescript
fetch.mockImplementationOnce(async url => {
  expect(url).toContain('/jsonrpc');
  // or
  expect(url).toContain('/mcp/tools/invoke');
  // ...
});
```

**New pattern:**

```typescript
fetch.mockImplementationOnce(async url => {
  expect(url).toContain('/mcp/tools/cache.rebuild');
  // Verify tool-specific URL pattern
  expect(url).toMatch(/\/mcp\/tools\/[a-z._-]+/i);
  // ...
});
```

#### 3. Test Description Updates

**Old:**

```typescript
it('should invoke tool via configured endpoint', async () => {
```

**New:**

```typescript
it('should invoke tool via per-tool URL endpoint', async () => {
```

#### 4. Error Message Assertions

**Old:**

```typescript
expect(error.message).toContain('Request to /jsonrpc failed');
```

**New:**

```typescript
expect(error.message).toContain('Request to /mcp/tools/');
expect(error.message).toContain('cache.rebuild'); // or specific tool name
```

### Test Execution Strategy

1. **Identify all affected test files**:
   - Use grep to find references to old endpoint patterns
   - Check test setup/teardown code for environment variable assignments
   - Review mock configurations

2. **Update each test file**:
   - Remove deprecated environment variables
   - Update URL expectations in mocks
   - Verify test descriptions are accurate
   - Ensure error message assertions match new format

3. **Validate changes**:
   - Run `npm test` after each file update
   - Check for TypeScript errors with `npm run type-check`
   - Verify test coverage hasn't decreased

4. **Focus areas**:
   - Tool invocation tests (primary focus)
   - Error handling tests (URL references in error messages)
   - Integration tests that mock full request/response cycles

### Example Test Update

**Before:**

```typescript
describe('Tool Invocation', () => {
  beforeEach(() => {
    process.env.DRUPAL_BASE_URL = 'https://example.com';
    process.env.DRUPAL_JSONRPC_ENDPOINT = '/jsonrpc';
  });

  it('should construct correct endpoint URL', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success' }),
    });
    global.fetch = mockFetch;

    await invokeTools('cache.rebuild', {});

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/jsonrpc'),
      expect.any(Object)
    );
  });
});
```

**After:**

```typescript
describe('Tool Invocation', () => {
  beforeEach(() => {
    process.env.DRUPAL_BASE_URL = 'https://example.com';
    // Removed: process.env.DRUPAL_JSONRPC_ENDPOINT
  });

  it('should construct per-tool URL endpoint', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: 'success' }),
    });
    global.fetch = mockFetch;

    await invokeTool('cache.rebuild', {});

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/mcp/tools/cache.rebuild'),
      expect.any(Object)
    );
  });
});
```

</details>

## Input Dependencies

Task 1 must be completed first, as the test updates must match the new implementation.

## Output Artifacts

- Updated test files with per-tool URL patterns
- Passing test suite (`npm test`)
- Zero TypeScript errors (`npm run type-check`)

## Implementation Notes

This task focuses on updating EXISTING tests, not creating new ones. The goal is to ensure the
current test suite passes with the new per-tool URL implementation.

If tests are found that extensively mock the old centralized endpoint pattern and are difficult to
adapt, document those cases and consider whether they're testing critical business logic or just
framework integration. Focus updates on tests that verify URL construction, tool invocation, and
error handling.

The automatic POST fallback mechanism (URL > 2000 chars) should still be tested, as it will work
with the new per-tool URLs.
