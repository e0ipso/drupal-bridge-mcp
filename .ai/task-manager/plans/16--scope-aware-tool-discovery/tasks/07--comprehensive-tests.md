---
id: 7
group: 'testing'
dependencies: [1, 2, 3, 5]
status: 'pending'
created: '2025-10-19'
skills:
  - jest
  - typescript
---

# Add Comprehensive Tests for Scope Discovery and Validation

## Objective

Create comprehensive test suite covering scope extraction, validation, OAuth configuration updates,
and runtime access control to ensure >80% code coverage.

## Skills Required

**jest**: Test suite creation, mocking, and async testing patterns **typescript**: Type-safe test
implementation and mock typing

## Acceptance Criteria

- [ ] New test file `src/discovery/__tests__/scope-discovery.test.ts` created
- [ ] Tests cover scope extraction from tool metadata
- [ ] Tests verify additional scopes merging
- [ ] Tests validate scope deduplication
- [ ] Tests check tool access validation with various scope combinations
- [ ] Tests verify public tool access (no auth metadata)
- [ ] Tests confirm auth level inference
- [ ] Tests added to `src/oauth/__tests__/config.test.ts` for additional scopes
- [ ] Tests use nock for HTTP mocking
- [ ] All tests pass with >80% coverage on new code
- [ ] Tests follow existing codebase patterns

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Test Files:**

1. `src/discovery/__tests__/scope-discovery.test.ts` (new)
2. `src/oauth/__tests__/config.test.ts` (add tests)

**Testing Framework:**

- Jest with ts-jest
- nock for HTTP mocking
- Existing test patterns from `src/discovery/__tests__/integration.test.ts`

**Test Categories:**

1. Scope extraction and merging
2. Access validation (positive and negative cases)
3. Auth level inference
4. OAuth config additional scopes parsing

## Input Dependencies

- Task 1: `extractRequiredScopes()`, `validateToolAccess()`, `getAuthLevel()` implementations
- Task 2: OAuth config with `additionalScopes` and `updateScopes()`
- Task 3: `getTokenScopes()` method
- Task 5: Runtime validation implementation

## Output Artifacts

- New test file: `src/discovery/__tests__/scope-discovery.test.ts`
- Updated test file: `src/oauth/__tests__/config.test.ts`
- > 80% test coverage on new functions
- Verification that scope management works correctly

## Implementation Notes

**IMPORTANT - Meaningful Test Strategy Guidelines:**

Your critical mantra for test generation is: "write a few tests, mostly integration".

**When TO Write Tests:**

- Custom business logic (scope extraction, validation)
- Critical workflows (auth level inference, access control)
- Edge cases (missing scopes, invalid tokens)
- Integration points (tool discovery → scope extraction → OAuth config update)

**When NOT to Write Tests:**

- Third-party library functionality (nock, zod)
- Framework features (Jest setup, TypeScript compilation)
- Simple CRUD operations without custom logic
- Getter/setter methods

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Create scope-discovery.test.ts

Create `src/discovery/__tests__/scope-discovery.test.ts`:

```typescript
/**
 * Tests for OAuth Scope Discovery and Validation
 *
 * Covers scope extraction from tool metadata, auth level inference,
 * and runtime access validation.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import nock from 'nock';
import {
  discoverTools,
  extractRequiredScopes,
  validateToolAccess,
  getAuthLevel,
} from '../tool-discovery.js';

describe('Scope Discovery', () => {
  const MOCK_DRUPAL_URL = 'https://drupal.example.com';

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should extract scopes from tool definitions', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, {
        tools: [
          {
            name: 'content.list',
            description: 'List content',
            inputSchema: { type: 'object', properties: {} },
            annotations: {
              auth: {
                scopes: ['content:read'],
              },
            },
          },
          {
            name: 'content.create',
            description: 'Create content',
            inputSchema: { type: 'object', properties: {} },
            annotations: {
              auth: {
                scopes: ['content:write'],
              },
            },
          },
        ],
      });

    const tools = await discoverTools(MOCK_DRUPAL_URL);
    const scopes = extractRequiredScopes(tools);

    expect(scopes).toEqual(['content:read', 'content:write', 'profile']);
  });

  it('should include additional scopes', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, {
        tools: [
          {
            name: 'content.list',
            description: 'List content',
            inputSchema: { type: 'object', properties: {} },
            annotations: {
              auth: {
                scopes: ['content:read'],
              },
            },
          },
        ],
      });

    const tools = await discoverTools(MOCK_DRUPAL_URL);
    const additionalScopes = ['admin:access', 'experimental:features'];
    const scopes = extractRequiredScopes(tools, additionalScopes);

    expect(scopes).toEqual(['admin:access', 'content:read', 'experimental:features', 'profile']);
  });

  it('should deduplicate scopes', () => {
    const tools = [
      {
        name: 'tool1',
        description: 'Tool 1',
        inputSchema: { type: 'object', properties: {} },
        annotations: {
          auth: {
            scopes: ['content:read', 'content:write'],
          },
        },
      },
      {
        name: 'tool2',
        description: 'Tool 2',
        inputSchema: { type: 'object', properties: {} },
        annotations: {
          auth: {
            scopes: ['content:read'], // Duplicate
          },
        },
      },
    ];

    const additionalScopes = ['content:write', 'admin:access']; // One duplicate
    const scopes = extractRequiredScopes(tools, additionalScopes);

    expect(scopes).toEqual(['admin:access', 'content:read', 'content:write', 'profile']);
  });

  it('should validate tool access with correct scopes', () => {
    const tool = {
      name: 'content.list',
      description: 'List content',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        auth: {
          scopes: ['content:read'],
        },
      },
    };

    expect(() => {
      validateToolAccess(tool, ['profile', 'content:read']);
    }).not.toThrow();
  });

  it('should reject tool access with missing scopes', () => {
    const tool = {
      name: 'content.create',
      description: 'Create content',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        auth: {
          scopes: ['content:write'],
        },
      },
    };

    expect(() => {
      validateToolAccess(tool, ['profile', 'content:read']);
    }).toThrow(/Insufficient OAuth scopes/);
  });

  it('should allow anonymous access to public tools', () => {
    const tool = {
      name: 'public.hello',
      description: 'Public tool',
      inputSchema: { type: 'object', properties: {} },
      // No auth field
    };

    expect(() => {
      validateToolAccess(tool, []);
    }).not.toThrow();
  });

  it('should infer auth level as required when scopes present', () => {
    const authMetadata = {
      scopes: ['content:read'],
      // No explicit level
    };

    expect(getAuthLevel(authMetadata)).toBe('required');
  });

  it('should return explicit auth level when provided', () => {
    const authMetadata = {
      level: 'optional' as const,
      scopes: ['content:read'],
    };

    expect(getAuthLevel(authMetadata)).toBe('optional');
  });

  it('should return none for undefined auth metadata', () => {
    expect(getAuthLevel(undefined)).toBe('none');
  });

  it('should return none when no scopes and no level', () => {
    const authMetadata = {
      description: 'No scopes',
    };

    expect(getAuthLevel(authMetadata)).toBe('none');
  });
});
```

### Step 2: Add OAuth Config Tests

Add to existing `src/oauth/__tests__/config.test.ts`:

```typescript
describe('OAuth Config - Additional Scopes', () => {
  test('should parse additional scopes from environment', () => {
    process.env.OAUTH_ADDITIONAL_SCOPES = 'admin:access experimental:features';
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual(['admin:access', 'experimental:features']);

    delete process.env.OAUTH_ADDITIONAL_SCOPES;
  });

  test('should handle empty additional scopes', () => {
    delete process.env.OAUTH_ADDITIONAL_SCOPES;
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual([]);
  });

  test('should parse comma-separated additional scopes', () => {
    process.env.OAUTH_ADDITIONAL_SCOPES = 'admin:access, experimental:features, debug:mode';
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual([
      'admin:access',
      'experimental:features',
      'debug:mode',
    ]);

    delete process.env.OAUTH_ADDITIONAL_SCOPES;
  });

  test('should allow updating scopes after tool discovery', () => {
    const config = createOAuthConfigFromEnv();
    const manager = new OAuthConfigManager(config);

    const newScopes = ['profile', 'content:read', 'content:write'];
    manager.updateScopes(newScopes);

    expect(manager.getConfig().scopes).toEqual(newScopes);
  });

  test('should throw error when updating with empty scopes', () => {
    const config = createOAuthConfigFromEnv();
    const manager = new OAuthConfigManager(config);

    expect(() => {
      manager.updateScopes([]);
    }).toThrow(/non-empty array/);
  });
});
```

### Step 3: Run Tests

Execute the test suite:

```bash
npm test
```

Verify:

- All new tests pass
- Coverage is >80% on new functions
- No TypeScript errors in test files

### Step 4: Check Coverage

Run with coverage reporting:

```bash
npm test -- --coverage
```

Look for coverage on:

- `getAuthLevel()`
- `extractRequiredScopes()`
- `validateToolAccess()`
- `OAuthConfigManager.updateScopes()`

### Important Testing Notes

- **Mock Strategy**: Use nock for HTTP mocking (consistent with existing tests)
- **Test Organization**: Group related tests in describe blocks
- **Edge Cases**: Test boundary conditions (empty arrays, undefined values)
- **Error Messages**: Verify error message format and content
- **Integration**: Test the flow from discovery → extraction → validation

### Example Test Output

```
PASS  src/discovery/__tests__/scope-discovery.test.ts
  Scope Discovery
    ✓ should extract scopes from tool definitions (25ms)
    ✓ should include additional scopes (12ms)
    ✓ should deduplicate scopes (3ms)
    ✓ should validate tool access with correct scopes (2ms)
    ✓ should reject tool access with missing scopes (3ms)
    ✓ should allow anonymous access to public tools (1ms)
    ✓ should infer auth level as required when scopes present (1ms)
    ✓ should return explicit auth level when provided (1ms)
    ✓ should return none for undefined auth metadata (1ms)
    ✓ should return none when no scopes and no level (1ms)

Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Coverage:    >80% on tool-discovery.ts
```

</details>
