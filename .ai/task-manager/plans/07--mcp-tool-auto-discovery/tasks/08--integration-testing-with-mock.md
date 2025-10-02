---
id: 8
group: 'testing'
dependencies: [2, 3, 6]
status: 'pending'
created: '2025-10-02'
skills: ['typescript', 'jest']
---

# Create Integration Tests with Mock Endpoint

## Objective

Write integration tests for the complete discovery and registration flow using a mocked
`/mcp/tools/list` endpoint to verify the system works without a real Drupal backend.

**Note**: The real Drupal endpoint is implemented by the `jsonrpc_mcp` module:
https://github.com/e0ipso/jsonrpc_mcp

## Skills Required

- **typescript**: Test code, async testing patterns
- **jest**: HTTP mocking (nock or msw), test assertions

## Acceptance Criteria

- [ ] Create test file `src/discovery/__tests__/integration.test.ts`
- [ ] Mock `/mcp/tools/list` HTTP endpoint with sample tool definitions
- [ ] Test successful discovery with 5+ tools
- [ ] Test discovery failure scenarios (404, timeout, invalid JSON, empty tools)
- [ ] Test schema conversion for valid and invalid schemas
- [ ] Test dynamic handler registration
- [ ] Test tool invocation through MCP CallToolRequest
- [ ] Test OAuth token propagation for requiresAuth tools
- [ ] All tests pass with >80% coverage of discovery code

## Technical Requirements

**Test File Location**: `src/discovery/__tests__/integration.test.ts`

**Mocking Library**: Use `nock` or `msw` (Mock Service Worker)

**Test Scenarios**:

1. **Happy Path**: Discovery → Registration → Invocation
2. **Empty Tools**: Discovery returns empty array
3. **HTTP 404**: Endpoint not found
4. **Invalid JSON**: Malformed response
5. **Missing Fields**: Tool missing required fields
6. **Invalid Schema**: JSON Schema that fails Zod conversion
7. **Timeout**: Request takes >5 seconds
8. **OAuth Flow**: Tool with requiresAuth=true

**Sample Mock Data**:

```json
{
  "tools": [
    {
      "name": "test_tool",
      "description": "A test tool",
      "inputSchema": {
        "type": "object",
        "properties": {
          "param1": { "type": "string" }
        },
        "required": ["param1"]
      },
      "endpoint": "/jsonrpc",
      "method": "test.method",
      "requiresAuth": false
    }
  ]
}
```

## Input Dependencies

- Discovery functions from Tasks 2, 3, 4
- Jest testing framework (check `package.json` devDependencies)
- HTTP mocking library (nock or msw)

## Output Artifacts

- `src/discovery/__tests__/integration.test.ts` with test suite
- Passing tests verifying discovery and registration
- Code coverage report showing >80% discovery code coverage

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Meaningful Test Strategy Guidelines

**IMPORTANT**: Copy this section into the test file as comments:

Your critical mantra for test generation is: "write a few tests, mostly integration".

**When TO Write Tests**:

- Custom business logic: discovery, schema conversion, handler registration
- Critical user workflows: startup sequence, tool invocation
- Edge cases: empty responses, malformed data, missing fields
- Integration points: HTTP requests, MCP SDK, Drupal connector

**When NOT to Write Tests**:

- Third-party library functionality (`zod-from-json-schema` already tested)
- Framework features (MCP SDK, fetch API)
- Simple CRUD operations without custom logic
- Getter/setter methods

**Test Task Focus**:

- Combine related test scenarios into single file
- Focus on integration and critical path testing
- Avoid testing each function individually if covered by integration

### Step 1: Install Test Dependencies (if needed)

Check if testing setup exists:

```bash
grep -E "jest|vitest" package.json
```

If not present, add Jest:

```bash
npm install --save-dev jest @types/jest ts-jest nock @types/node
```

Configure Jest (create `jest.config.js` if missing):

```javascript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
      },
    ],
  },
};
```

### Step 2: Create Test Directory and File

```bash
mkdir -p src/discovery/__tests__
touch src/discovery/__tests__/integration.test.ts
```

### Step 3: Write Test Setup

```typescript
/**
 * Integration Tests for Tool Discovery and Dynamic Registration
 *
 * These tests verify the complete flow from discovery to tool invocation
 * using mocked HTTP endpoints.
 */

import nock from 'nock';
import { discoverTools } from '../tool-discovery.js';
import { registerDynamicTools } from '../dynamic-handlers.js';
import { getDiscoveredTools, clearToolCache } from '../tool-cache.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const MOCK_DRUPAL_URL = 'https://mock-drupal.test';

// Sample tool definitions for testing
const SAMPLE_TOOLS = [
  {
    name: 'test_tool_simple',
    description: 'A simple test tool',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    endpoint: '/jsonrpc',
    method: 'test.simple',
    requiresAuth: false,
  },
  {
    name: 'test_tool_auth',
    description: 'A test tool requiring auth',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string' },
      },
      required: ['data'],
    },
    endpoint: '/jsonrpc',
    method: 'test.auth',
    requiresAuth: true,
  },
];

// Clean up after each test
afterEach(() => {
  nock.cleanAll();
  clearToolCache();
});
```

### Step 4: Write Discovery Tests

```typescript
describe('Tool Discovery', () => {
  test('successfully discovers tools from endpoint', async () => {
    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('test_tool_simple');
    expect(tools[1].requiresAuth).toBe(true);
  });

  test('throws error on HTTP 404', async () => {
    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(404);

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(/HTTP 404/);
  });

  test('throws error on invalid JSON', async () => {
    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(200, 'not json');

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(/Invalid JSON/);
  });

  test('throws error on empty tools array', async () => {
    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(200, { tools: [] });

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(/No tools returned/);
  });

  test('throws error on missing required field', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, {
        tools: [
          {
            name: 'incomplete_tool',
            description: 'Missing fields',
            // Missing: inputSchema, endpoint, method, requiresAuth
          },
        ],
      });

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(/missing required field/);
  });

  test('handles timeout', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .delay(6000) // Longer than 5s timeout
      .reply(200, { tools: SAMPLE_TOOLS });

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(/timed out/);
  }, 10000); // Increase Jest timeout for this test

  test('includes OAuth token in request when provided', async () => {
    const scope = nock(MOCK_DRUPAL_URL, {
      reqheaders: {
        authorization: 'Bearer test-token-123',
      },
    })
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    await discoverTools(MOCK_DRUPAL_URL, 'test-token-123');

    expect(scope.isDone()).toBe(true);
  });
});
```

### Step 5: Write Cache Tests

```typescript
describe('Tool Caching', () => {
  test('returns cached tools on second call', async () => {
    const scope = nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .once() // Only mock one request
      .reply(200, { tools: SAMPLE_TOOLS });

    // First call - fetches from endpoint
    const tools1 = await getDiscoveredTools(MOCK_DRUPAL_URL);
    expect(tools1).toHaveLength(2);

    // Second call - should use cache (no HTTP request)
    const tools2 = await getDiscoveredTools(MOCK_DRUPAL_URL);
    expect(tools2).toHaveLength(2);

    expect(scope.isDone()).toBe(true); // Only one request made
  });

  test('bypasses cache with forceFresh parameter', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .twice() // Expect two requests
      .reply(200, { tools: SAMPLE_TOOLS });

    await getDiscoveredTools(MOCK_DRUPAL_URL);
    await getDiscoveredTools(MOCK_DRUPAL_URL, undefined, true); // Force fresh

    // Both requests should have been made
  });

  test('cache is cleared by clearToolCache', async () => {
    const scope = nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .twice()
      .reply(200, { tools: SAMPLE_TOOLS });

    await getDiscoveredTools(MOCK_DRUPAL_URL);
    clearToolCache();
    await getDiscoveredTools(MOCK_DRUPAL_URL);

    expect(scope.isDone()).toBe(true); // Two requests made
  });
});
```

### Step 6: Write Schema Conversion Tests

```typescript
describe('Schema Conversion', () => {
  test('converts valid JSON Schema to Zod', async () => {
    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    // Schema conversion happens in registerDynamicTools
    // Verify no errors thrown
    const mockServer = {} as Server; // Mock server
    const mockConnector = {} as any;
    const mockGetSession = async () => null;

    // This should not throw
    expect(() => {
      registerDynamicTools(mockServer, tools, mockConnector, mockGetSession);
    }).not.toThrow();
  });

  test('skips tool with invalid schema', async () => {
    const toolsWithInvalidSchema = [
      ...SAMPLE_TOOLS,
      {
        name: 'invalid_schema_tool',
        description: 'Has invalid schema',
        inputSchema: 'not an object' as any, // Invalid
        endpoint: '/jsonrpc',
        method: 'test.invalid',
        requiresAuth: false,
      },
    ];

    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(200, { tools: toolsWithInvalidSchema });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    const mockServer = {
      setRequestHandler: jest.fn(),
    } as any;
    const mockConnector = {} as any;
    const mockGetSession = async () => null;

    // Should log warning but not throw
    registerDynamicTools(mockServer, tools, mockConnector, mockGetSession);

    // Handler should still be registered (for valid tools)
    expect(mockServer.setRequestHandler).toHaveBeenCalled();
  });
});
```

### Step 7: Run Tests

```bash
npm test src/discovery/__tests__/integration.test.ts
```

Expected output:

```
 PASS  src/discovery/__tests__/integration.test.ts
  Tool Discovery
    ✓ successfully discovers tools from endpoint
    ✓ throws error on HTTP 404
    ✓ throws error on invalid JSON
    ✓ throws error on empty tools array
    ✓ throws error on missing required field
    ✓ handles timeout
    ✓ includes OAuth token in request when provided
  Tool Caching
    ✓ returns cached tools on second call
    ✓ bypasses cache with forceFresh parameter
    ✓ cache is cleared by clearToolCache
  Schema Conversion
    ✓ converts valid JSON Schema to Zod
    ✓ skips tool with invalid schema

Test Suites: 1 passed, 1 total
Tests:       12 passed, 12 total
```

### Step 8: Check Coverage

```bash
npm test -- --coverage src/discovery/
```

Verify >80% coverage for:

- `tool-discovery.ts`
- `tool-cache.ts`
- `dynamic-handlers.ts`

### Troubleshooting

**Issue: nock Not Intercepting Requests**

- Ensure nock is imported before other modules
- Check URL matches exactly (including protocol)
- Use `nock.recorder.rec()` to debug

**Issue: ESM Import Errors**

- Jest may have issues with ESM
- Check `jest.config.js` has correct ESM configuration
- May need to use `ts-jest` with `useESM: true`

**Issue: Tests Timeout**

- Increase timeout for specific tests: `test('name', async () => {}, 10000)`
- Check for unresolved promises
- Ensure all nock mocks are cleaned up

</details>
