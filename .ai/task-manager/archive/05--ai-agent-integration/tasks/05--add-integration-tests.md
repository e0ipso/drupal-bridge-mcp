---
id: 5
group: 'testing'
dependencies: [4]
status: 'completed'
created: '2025-10-01'
completed: '2025-10-02'
skills:
  - jest
  - typescript
---

# Add Integration Tests for AI-Enhanced Search

## Objective

Create integration tests that verify the complete AI-enhanced search workflow, including capability
detection, query analysis, graceful fallback scenarios, and backward compatibility.

## Skills Required

- **jest**: Writing integration tests with mocking and assertions
- **typescript**: Implementing test fixtures and mock objects

## Acceptance Criteria

- [ ] Test search succeeds when sampling is unavailable (backward compatibility)
- [ ] Test search succeeds with AI enhancement when sampling is available
- [ ] Test graceful fallback when query analysis returns null (timeout/error)
- [ ] Test response includes correct `aiEnhanced` metadata
- [ ] Test capability detection for different session scenarios
- [ ] All tests pass and maintain existing test coverage

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand implementation details</summary>

### Meaningful Test Strategy Guidelines

**IMPORTANT**: Your critical mantra for test generation is: "write a few tests, mostly integration".

**Definition of "Meaningful Tests":** Tests that verify custom business logic, critical paths, and
edge cases specific to the application. Focus on testing YOUR code, not the framework or library
functionality.

**When TO Write Tests:**

- Custom business logic and algorithms (AI query analysis logic)
- Critical user workflows and data transformations (search enhancement flow)
- Edge cases and error conditions for core functionality (fallback scenarios)
- Integration points between different system components (query analyzer + search tool)

**When NOT to Write Tests:**

- Third-party library functionality (MCP SDK internals, Zod validation)
- Framework features (Express middleware, Jest itself)
- Simple CRUD operations without custom logic
- Getter/setter methods or basic property access
- Configuration files or static data
- Obvious functionality that would break immediately if incorrect

### Test File Location

Create or extend: `src/__tests__/ai-enhanced-search.test.ts`

### Test Structure

```typescript
import { analyzeQuery } from '../sampling/query-analyzer';
import { searchTutorial } from '../tools/content/search';

describe('AI-Enhanced Search Integration', () => {
  // Test 1: Backward compatibility - no sampling
  describe('without sampling capability', () => {
    it('should perform keyword search successfully', async () => {
      // Mock context without sampling capabilities
      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: undefined,
      };

      const result = await searchTutorial({ query: 'views tutorial', limit: 10 }, context);

      // Verify search executed with original query
      expect(mockDrupalConnector.searchTutorial).toHaveBeenCalledWith(
        'views tutorial',
        expect.any(String),
        10
      );

      // Verify metadata indicates no AI enhancement
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.aiEnhanced).toBe(false);
    });
  });

  // Test 2: AI enhancement available
  describe('with sampling capability', () => {
    it('should enhance search with AI analysis', async () => {
      // Mock context with sampling support
      const mockServer = {
        createMessage: jest.fn().mockResolvedValue({
          content: JSON.stringify({
            optimizedKeywords: ['views', 'create'],
            contentTypes: ['tutorial'],
            drupalVersions: ['10'],
            intent: 'Learn to create Views in Drupal 10',
          }),
        }),
      };

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { sampling: { supported: true } },
        server: mockServer,
      };

      const result = await searchTutorial(
        { query: 'How do I create views in Drupal 10', limit: 10 },
        context
      );

      // Verify AI analysis was called
      expect(mockServer.createMessage).toHaveBeenCalled();

      // Verify search used optimized keywords
      expect(mockDrupalConnector.searchTutorial).toHaveBeenCalledWith(
        'views create',
        expect.any(String),
        10
      );

      // Verify metadata shows AI enhancement
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.aiEnhanced).toBe(true);
      expect(response.metadata.intent).toBe('Learn to create Views in Drupal 10');
    });
  });

  // Test 3: Graceful fallback on AI failure
  describe('with AI analysis failure', () => {
    it('should fall back to keyword search on timeout', async () => {
      const mockServer = {
        createMessage: jest.fn().mockRejectedValue(new Error('Timeout')),
      };

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { sampling: { supported: true } },
        server: mockServer,
      };

      const result = await searchTutorial({ query: 'views tutorial', limit: 10 }, context);

      // Verify search still executed with original query
      expect(mockDrupalConnector.searchTutorial).toHaveBeenCalledWith(
        'views tutorial',
        expect.any(String),
        10
      );

      // Verify metadata shows no AI enhancement
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.aiEnhanced).toBe(false);
    });

    it('should fall back on unparseable AI response', async () => {
      const mockServer = {
        createMessage: jest.fn().mockResolvedValue({
          content: 'This is not valid JSON',
        }),
      };

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { sampling: { supported: true } },
        server: mockServer,
      };

      const result = await searchTutorial({ query: 'views tutorial', limit: 10 }, context);

      // Verify fallback to keyword search
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.aiEnhanced).toBe(false);
    });
  });

  // Test 4: Query analyzer timeout
  describe('query analyzer timeout', () => {
    it('should timeout after 5 seconds', async () => {
      const mockServer = {
        createMessage: jest
          .fn()
          .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 10000))),
      };

      const result = await analyzeQuery(
        'test query',
        { server: mockServer, sessionId: 'test' },
        5000 // 5 second timeout
      );

      // Should return null after timeout
      expect(result).toBeNull();
    }, 7000); // Test timeout slightly longer than query timeout
  });
});
```

### Mock Setup

Create helper functions for mock objects:

```typescript
const mockOAuthProvider = {
  getToken: jest.fn().mockResolvedValue('mock-token'),
};

const mockDrupalConnector = {
  searchTutorial: jest.fn().mockResolvedValue({
    results: [{ id: '1', title: 'Test Tutorial', body: 'Content' }],
  }),
};
```

### Test Coverage Focus

These tests focus on:

1. **Integration points**: Query analyzer + search tool integration
2. **Critical paths**: AI enhancement flow and fallback flow
3. **Edge cases**: Timeout, parsing errors, capability detection
4. **Business logic**: Our custom AI enhancement logic

These tests DO NOT focus on:

- MCP SDK internal functionality (already tested by SDK)
- Zod validation (already tested by Zod)
- Express routing (framework-level concern)
- Simple property assignments

### Running Tests

```bash
npm test -- ai-enhanced-search
```

</details>

## Input Dependencies

- Task 4: Integrated search tool with AI enhancement
- Existing Jest test infrastructure (`src/__tests__/`)
- Mock patterns from existing tests (e.g., `drupal-integration.test.ts`)

## Output Artifacts

- New test file: `src/__tests__/ai-enhanced-search.test.ts`
- Integration tests covering critical AI enhancement scenarios
- Verified graceful fallback behavior
- Confirmed backward compatibility

## Implementation Notes

Focus on integration tests, not unit tests. Test the complete workflow from capability detection
through search execution. Use mocks for external dependencies (Drupal connector, OAuth provider, MCP
server) but test the integration of our custom code.

Keep tests simple and readable. Each test should verify one scenario clearly. Avoid over-mocking -
only mock what's necessary to isolate the behavior under test.

The timeout test is particularly important - verify that long-running AI analysis doesn't block
search requests indefinitely.
