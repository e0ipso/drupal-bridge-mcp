---
id: 6
group: 'testing'
dependencies: [1, 2, 3, 4, 5]
status: 'completed'
created: '2025-10-21'
completed: '2025-10-21'
skills:
  - jest
  - typescript
---

# Test Reactive Token Refresh Flow

## Objective

Write integration tests that verify the complete reactive refresh flow: 401 detection, automatic
token refresh, request retry, and error handling for both valid and expired refresh tokens.

## Skills Required

- **Jest**: Write integration tests with mocked fetch responses and time control
- **TypeScript**: Test async token refresh logic and error scenarios

## Acceptance Criteria

- [ ] Test: 401 triggers reactive refresh and successful retry
- [ ] Test: Expired refresh token returns clear error (invalid_grant)
- [ ] Test: Proactive refresh failure preserves tokens for reactive refresh
- [ ] Test: Permanent OAuth errors clear tokens appropriately
- [ ] Test: Temporary network errors don't clear tokens
- [ ] All tests pass with `npm test`
- [ ] Test coverage for new code paths ≥80%

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Meaningful Test Strategy Guidelines**:

Your critical mantra for test generation is: "write a few tests, mostly integration".

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

**Test file location**: `src/oauth/__tests__/reactive-refresh.test.ts` (new file)

**Test framework**: Jest with ts-jest for TypeScript

**Mock strategy**:

- Mock `fetch` for Drupal HTTP responses
- Mock `Date.now()` for time-based token expiry
- Use real DrupalOAuthProvider and makeRequest logic (integration test)

## Input Dependencies

- All previous tasks (1-5) completed
- Existing test infrastructure in `src/oauth/__tests__/`
- Jest configuration with ts-jest

## Output Artifacts

- New test file: `src/oauth/__tests__/reactive-refresh.test.ts`
- Passing test suite covering reactive refresh scenarios
- Test coverage report showing ≥80% coverage for new code

## Implementation Notes

<details>
<summary>Implementation Guide</summary>

### Test File Structure

Create `src/oauth/__tests__/reactive-refresh.test.ts`:

```typescript
/**
 * Integration tests for reactive token refresh and request retry logic
 *
 * Tests the complete flow:
 * 1. Request with expired token → 401
 * 2. Automatic token refresh using refresh_token
 * 3. Request retry with new token → Success
 *
 * Also tests error cases: expired refresh tokens, network failures, etc.
 */

import { DrupalOAuthProvider } from '../provider.js';
import { OAuthConfigManager } from '../config.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('Reactive Token Refresh Integration', () => {
  let provider: DrupalOAuthProvider;
  let configManager: OAuthConfigManager;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup config manager with test configuration
    configManager = new OAuthConfigManager({
      drupalUrl: 'https://drupal.test',
      scopes: ['profile'],
      additionalScopes: [],
    });

    provider = new DrupalOAuthProvider(configManager);
  });

  describe('Reactive refresh on 401', () => {
    it('should refresh token and retry request on 401 response', async () => {
      // Test implementation here
      // 1. Store initial tokens with expired access_token
      // 2. Mock 401 response from Drupal
      // 3. Mock successful refresh response
      // 4. Mock successful retry response
      // 5. Verify request succeeded transparently
    });

    it('should fail with clear error when refresh token expired', async () => {
      // Test implementation here
      // 1. Store tokens with expired refresh_token
      // 2. Mock 401 response
      // 3. Mock refresh failure with invalid_grant
      // 4. Verify error includes "invalid_grant"
      // 5. Verify tokens were cleared
    });

    it('should not retry more than once (prevents retry loops)', async () => {
      // Test implementation here
      // Mock 401 on both initial request AND retry
      // Verify only 1 refresh attempt, then fail
    });
  });

  describe('Proactive refresh soft-fail', () => {
    it('should preserve tokens on temporary proactive refresh failure', async () => {
      // Test implementation here
      // 1. Store valid tokens
      // 2. Mock network error on proactive refresh
      // 3. Verify tokens NOT cleared
      // 4. Verify expired token returned
    });

    it('should clear tokens on permanent proactive refresh failure', async () => {
      // Test implementation here
      // 1. Store tokens
      // 2. Mock invalid_grant error on proactive refresh
      // 3. Verify tokens cleared
      // 4. Verify error thrown
    });
  });

  describe('Error classification', () => {
    it('should identify invalid_grant as permanent failure', async () => {
      // Test isPermanentAuthFailure() method
    });

    it('should identify invalid_token as permanent failure', async () => {
      // Test isPermanentAuthFailure() method
    });

    it('should identify network errors as temporary failure', async () => {
      // Test isPermanentAuthFailure() method
    });
  });

  describe('Cross-session token update', () => {
    it('should update tokens for all user sessions on reactive refresh', async () => {
      // Test implementation here
      // 1. Create 2 sessions for same user
      // 2. Trigger reactive refresh from session 1
      // 3. Verify session 2 also has new tokens
    });
  });
});
```

### Key Test Scenarios

**Test 1: Happy Path - Reactive Refresh Success**

```typescript
it('should refresh token and retry request on 401 response', async () => {
  const sessionId = 'session-1';
  const userId = 'user-123';

  // Store initial tokens with short-lived access token
  provider.storeSessionTokens(sessionId, {
    access_token: 'expired-token',
    token_type: 'Bearer',
    expires_in: -100, // Already expired
    refresh_token: 'valid-refresh-token',
    scope: 'profile',
  });

  // Mock OAuth metadata
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      token_endpoint: 'https://drupal.test/oauth/token',
      jwks_uri: 'https://drupal.test/oauth/jwks',
    }),
  });

  // Mock successful token refresh
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    text: async () =>
      JSON.stringify({
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        refresh_token: 'new-refresh-token',
        scope: 'profile',
      }),
  });

  // Execute refresh
  const newToken = await provider.refreshSessionToken(sessionId);

  expect(newToken).toBe('new-access-token');
  expect(fetch).toHaveBeenCalledWith(
    'https://drupal.test/oauth/token',
    expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('grant_type=refresh_token'),
      body: expect.stringContaining('refresh_token=valid-refresh-token'),
    })
  );
});
```

**Test 2: Expired Refresh Token**

```typescript
it('should fail with clear error when refresh token expired', async () => {
  const sessionId = 'session-1';

  provider.storeSessionTokens(sessionId, {
    access_token: 'expired-token',
    token_type: 'Bearer',
    expires_in: -100,
    refresh_token: 'expired-refresh-token',
    scope: 'profile',
  });

  // Mock OAuth metadata
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      token_endpoint: 'https://drupal.test/oauth/token',
    }),
  });

  // Mock refresh failure with invalid_grant
  (fetch as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status: 400,
    statusText: 'Bad Request',
    text: async () =>
      JSON.stringify({
        error: 'invalid_grant',
        error_description: 'The refresh token is invalid.',
      }),
  });

  await expect(provider.refreshSessionToken(sessionId)).rejects.toThrow(/invalid_grant/);
});
```

### Running Tests

```bash
# Run all tests
npm test

# Run only reactive refresh tests
npx jest reactive-refresh.test.ts

# Run with coverage
npm test -- --coverage

# Run in watch mode
npx jest --watch reactive-refresh.test.ts
```

### Coverage Targets

Ensure ≥80% coverage for:

- `refreshSessionToken()` method
- `makeRequest()` reactive refresh logic
- `ensureSessionToken()` soft-fail logic
- `isPermanentAuthFailure()` method
- `performTokenRefresh()` error handling

### Integration Testing Notes

These are integration tests, not unit tests:

- Use real class instances (DrupalOAuthProvider)
- Mock only external dependencies (fetch, time)
- Test complete user flows, not individual methods
- Verify cross-component interactions

</details>
