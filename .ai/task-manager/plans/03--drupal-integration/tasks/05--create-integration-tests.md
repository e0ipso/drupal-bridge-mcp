---
id: 5
group: 'testing'
dependencies: [1, 2, 3, 4]
status: 'pending'
created: '2025-09-30'
skills:
  - jest
  - typescript
---

# Create Integration Tests for Drupal Tools

## Objective

Create focused integration tests for the DrupalConnector and MCP tools using mocked Drupal JSON-RPC
responses, verifying authentication flows, error handling, and content retrieval functionality.

## Skills Required

- **Jest**: Test suites, mocking fetch requests, async test patterns
- **TypeScript**: Type-safe test implementations, interface mocking

## Acceptance Criteria

- [ ] Test file created: `src/__tests__/drupal-integration.test.ts`
- [ ] Mock Drupal JSON-RPC responses with realistic tutorial data
- [ ] Test DrupalConnector methods (searchTutorial, getTutorial)
- [ ] Test authentication error handling (401, 403)
- [ ] Test content not found error (404)
- [ ] Test successful search and retrieval flows
- [ ] All tests pass: `npm test`
- [ ] Tests focus on business logic, not framework functionality

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

### Meaningful Test Strategy Guidelines

**IMPORTANT:** Your critical mantra for test generation is: "write a few tests, mostly integration".

**Definition of "Meaningful Tests":** Tests that verify custom business logic, critical paths, and
edge cases specific to the application. Focus on testing YOUR code, not the framework or library
functionality.

**When TO Write Tests:**

- Custom business logic: DrupalConnector error mapping
- Critical user workflows: Authentication → Search → Retrieve
- Edge cases: Missing tokens, network failures, invalid IDs
- Integration points: OAuth provider + DrupalConnector interaction

**When NOT to Write Tests:**

- JSON-RPC library functionality (already tested upstream)
- MCP SDK features (tool registration, schemas)
- Zod validation (framework testing)
- Simple getter/setter methods

**Test Priorities:**

1. **Critical Path**: User authenticates → searches tutorials → retrieves specific tutorial
2. **Error Mapping**: HTTP status codes correctly mapped to MCP errors
3. **Session Management**: Token retrieval and validation

**Dependencies:**

- `jest` (already configured)
- `@types/jest` (already installed)
- Mock fixtures for Drupal responses

## Input Dependencies

- All implemented tools and connectors from Tasks 1-4
- Jest configuration from `jest.config.js`

## Output Artifacts

- `src/__tests__/drupal-integration.test.ts` - Integration test suite
- `src/__tests__/fixtures/tutorials.json` - Mock tutorial data

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Create Mock Tutorial Fixtures

Create `src/__tests__/fixtures/tutorials.json`:

```json
{
  "searchResponse": {
    "results": [
      {
        "id": "tutorial-123",
        "title": "Introduction to MCP",
        "summary": "Learn the basics of Model Context Protocol",
        "url": "https://drupal.site/tutorial/123",
        "difficulty": "beginner"
      },
      {
        "id": "tutorial-456",
        "title": "Advanced OAuth Integration",
        "summary": "Deep dive into OAuth 2.1",
        "url": "https://drupal.site/tutorial/456",
        "difficulty": "advanced"
      }
    ],
    "total": 2,
    "limit": 10
  },
  "tutorialDetail": {
    "id": "tutorial-123",
    "title": "Introduction to MCP",
    "summary": "Learn the basics of Model Context Protocol",
    "body": "<p>Full tutorial content here...</p>",
    "url": "https://drupal.site/tutorial/123",
    "author": "Jane Doe",
    "created": "2025-01-15T10:30:00Z",
    "updated": "2025-01-20T14:45:00Z",
    "tags": ["mcp", "tutorial", "beginner"],
    "difficulty": "beginner"
  }
}
```

### Step 2: Create Integration Test Suite

Create `src/__tests__/drupal-integration.test.ts`:

```typescript
import { DrupalConnector } from '../drupal/connector';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import tutorialFixtures from './fixtures/tutorials.json';

// Mock global fetch
global.fetch = jest.fn();

describe('Drupal Integration', () => {
  let connector: DrupalConnector;
  const mockToken = 'test-oauth-token';

  beforeEach(() => {
    // Set required environment variables
    process.env.DRUPAL_BASE_URL = 'https://drupal-test.example.com';
    process.env.DRUPAL_JSONRPC_ENDPOINT = '/jsonrpc';

    connector = new DrupalConnector();

    // Reset fetch mock
    (global.fetch as jest.Mock).mockReset();
  });

  describe('DrupalConnector - searchTutorial', () => {
    it('should return search results with valid token', async () => {
      // Mock successful JSON-RPC response
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => tutorialFixtures.searchResponse,
      });

      const result = await connector.searchTutorial('MCP', mockToken, 10);

      expect(result.results).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.results[0].title).toBe('Introduction to MCP');

      // Verify fetch called with correct parameters
      expect(global.fetch).toHaveBeenCalledWith(
        'https://drupal-test.example.com/jsonrpc',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should throw Unauthorized error for 401 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      await expect(connector.searchTutorial('MCP', mockToken)).rejects.toThrow(McpError);

      await expect(connector.searchTutorial('MCP', mockToken)).rejects.toMatchObject({
        code: ErrorCode.Unauthorized,
        message: 'Authentication required',
      });
    });

    it('should throw Forbidden error for 403 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(connector.searchTutorial('MCP', mockToken)).rejects.toMatchObject({
        code: ErrorCode.Forbidden,
      });
    });

    it('should throw InternalError for network failures', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      await expect(connector.searchTutorial('MCP', mockToken)).rejects.toMatchObject({
        code: ErrorCode.InternalError,
        message: expect.stringContaining('Drupal communication failed'),
      });
    });
  });

  describe('DrupalConnector - getTutorial', () => {
    it('should return tutorial detail with valid ID and token', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => tutorialFixtures.tutorialDetail,
      });

      const result = await connector.getTutorial('tutorial-123', mockToken);

      expect(result.id).toBe('tutorial-123');
      expect(result.title).toBe('Introduction to MCP');
      expect(result.body).toContain('Full tutorial content');
    });

    it('should throw InvalidRequest error for 404 response', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await expect(connector.getTutorial('invalid-id', mockToken)).rejects.toMatchObject({
        code: ErrorCode.InvalidRequest,
        message: expect.stringContaining('Tutorial not found'),
      });
    });
  });

  describe('Critical Path Integration', () => {
    it('should complete full workflow: search → retrieve', async () => {
      // Step 1: Search for tutorials
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => tutorialFixtures.searchResponse,
      });

      const searchResults = await connector.searchTutorial('MCP', mockToken, 10);
      expect(searchResults.results).toHaveLength(2);

      // Step 2: Retrieve first result
      const firstId = searchResults.results[0].id;

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => tutorialFixtures.tutorialDetail,
      });

      const tutorial = await connector.getTutorial(firstId, mockToken);
      expect(tutorial.id).toBe(firstId);
      expect(tutorial.body).toBeDefined();
    });
  });

  describe('Error Mapping Validation', () => {
    const errorCases = [
      { status: 401, expectedCode: ErrorCode.Unauthorized },
      { status: 403, expectedCode: ErrorCode.Forbidden },
      { status: 404, expectedCode: ErrorCode.InvalidRequest },
      { status: 500, expectedCode: ErrorCode.InternalError },
    ];

    errorCases.forEach(({ status, expectedCode }) => {
      it(`should map HTTP ${status} to ${expectedCode}`, async () => {
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          status,
        });

        await expect(connector.searchTutorial('test', mockToken)).rejects.toMatchObject({
          code: expectedCode,
        });
      });
    });
  });
});
```

### Step 3: Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test drupal-integration
```

### Step 4: Validation

- [ ] All tests pass
- [ ] Tests cover critical paths (search → retrieve)
- [ ] Error mapping validated for all status codes
- [ ] Mock fixtures are realistic
- [ ] No tests for framework functionality

### Test Philosophy

**Focus on:**

- Business logic (error mapping, token handling)
- Integration between components
- Critical user workflows

**Avoid:**

- Testing Zod schemas (framework)
- Testing MCP SDK tool registration (framework)
- Testing JSON-RPC library (upstream)

</details>
