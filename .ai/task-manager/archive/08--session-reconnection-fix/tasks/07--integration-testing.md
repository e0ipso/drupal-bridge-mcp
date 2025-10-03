---
id: 7
group: 'testing'
dependencies: [5, 6]
status: 'completed'
created: '2025-10-02'
skills:
  - typescript
  - testing
---

# Integration Testing for Reconnection and Multi-User Scenarios

## Objective

Validate the session and token management refactoring through integration tests covering
reconnection, multi-user isolation, and logout scenarios.

## Skills Required

- **TypeScript**: Integration test implementation
- **Testing**: Test scenario design, assertions, async test patterns

## Acceptance Criteria

- [ ] Reconnection test validates token persistence across disconnect/reconnect
- [ ] Multi-user test validates token isolation between users
- [ ] Logout test validates explicit token removal
- [ ] Token persistence test validates token reuse across multiple reconnections
- [ ] All tests pass and document expected behavior

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary><strong>Implementation Details</strong></summary>

## Meaningful Test Strategy Guidelines

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

- Combine related test scenarios into single tasks (e.g., "Test user authentication flow" not
  separate tasks for login, logout, validation)
- Focus on integration and critical path testing over unit test coverage
- Avoid creating separate tasks for testing each CRUD operation individually
- Question whether simple functions need dedicated test tasks

### Test File Location

Create `src/__tests__/session-reconnection.test.ts`

### Test Suite Structure

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DrupalMCPHttpServer } from '../index.js';
import type { TokenResponse } from '../oauth/device-flow-types.js';

describe('Session Reconnection and Token Management', () => {
  let server: DrupalMCPHttpServer;

  beforeEach(async () => {
    // Initialize server with test configuration
    server = new DrupalMCPHttpServer({
      name: 'test-server',
      version: '1.0.0',
      port: 6299,
      host: 'localhost',
      enableAuth: true,
    });

    await server.start();
  });

  afterEach(async () => {
    await server.stop();
  });

  // Test scenarios below
});
```

### Test 1: Reconnection Test

```typescript
it('should persist tokens across session reconnection', async () => {
  // Simulate session 1
  const session1 = 'session-abc-123';
  const mockTokens: TokenResponse = {
    access_token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
    token_type: 'Bearer',
    expires_in: 3600,
  };

  // Authenticate session 1
  await server['handleDeviceFlow'](session1);
  // Note: In real test, mock deviceFlow.authenticate() to return mockTokens

  // Get tokens for session 1
  const session1Tokens = await server['getSession'](session1);
  expect(session1Tokens).toBeTruthy();
  expect(session1Tokens?.accessToken).toBe(mockTokens.access_token);

  // Simulate disconnect (session close)
  await server['transport']?.['onsessionclosed']?.(session1);

  // Simulate reconnection with new session ID
  const session2 = 'session-xyz-789';
  await server['handleDeviceFlow'](session2);

  // Verify tokens still available for session 2 (same user)
  const session2Tokens = await server['getSession'](session2);
  expect(session2Tokens).toBeTruthy();
  expect(session2Tokens?.accessToken).toBe(mockTokens.access_token);
});
```

### Test 2: Multi-User Isolation Test

```typescript
it('should isolate tokens between different users', async () => {
  const sessionA = 'session-user-a';
  const sessionB = 'session-user-b';

  const tokensA: TokenResponse = {
    access_token: 'token-for-user-a', // JWT with sub: user-a
    token_type: 'Bearer',
    expires_in: 3600,
  };

  const tokensB: TokenResponse = {
    access_token: 'token-for-user-b', // JWT with sub: user-b
    token_type: 'Bearer',
    expires_in: 3600,
  };

  // Authenticate both users
  // Mock to return different user IDs
  await server['handleDeviceFlow'](sessionA);
  await server['handleDeviceFlow'](sessionB);

  // Verify each session gets correct tokens
  const retrievedA = await server['getSession'](sessionA);
  const retrievedB = await server['getSession'](sessionB);

  expect(retrievedA?.accessToken).toBe(tokensA.access_token);
  expect(retrievedB?.accessToken).toBe(tokensB.access_token);
  expect(retrievedA?.accessToken).not.toBe(retrievedB?.accessToken);
});
```

### Test 3: Explicit Logout Test

```typescript
it('should remove tokens on explicit logout', async () => {
  const session = 'session-logout-test';

  // Authenticate
  await server['handleDeviceFlow'](session);

  // Verify tokens exist
  const tokensBeforeLogout = await server['getSession'](session);
  expect(tokensBeforeLogout).toBeTruthy();

  // Logout
  await server.handleLogout(session);

  // Verify tokens removed
  const tokensAfterLogout = await server['getSession'](session);
  expect(tokensAfterLogout).toBeNull();
});
```

### Test 4: Token Persistence Across Multiple Reconnections

```typescript
it('should reuse tokens across multiple reconnections', async () => {
  const sessions = ['session-1', 'session-2', 'session-3', 'session-4', 'session-5'];

  // Initial authentication
  await server['handleDeviceFlow'](sessions[0]);
  const originalToken = (await server['getSession'](sessions[0]))?.accessToken;

  // Simulate 4 reconnections
  for (let i = 1; i < sessions.length; i++) {
    // Close previous session
    await server['transport']?.['onsessionclosed']?.(sessions[i - 1]);

    // Authenticate with new session
    await server['handleDeviceFlow'](sessions[i]);

    // Verify same token reused
    const token = (await server['getSession'](sessions[i]))?.accessToken;
    expect(token).toBe(originalToken);
  }

  // Verify only 1 user in storage (not 5 duplicates)
  const activeUsers = server['userTokens'].size;
  expect(activeUsers).toBe(1);
});
```

### Test 5: Health Endpoint Validation

```typescript
it('should report accurate session and user counts in health endpoint', async () => {
  // Authenticate 2 users with 3 sessions total
  await server['handleDeviceFlow']('session-user1-a');
  await server['handleDeviceFlow']('session-user1-b'); // Same user, different session
  await server['handleDeviceFlow']('session-user2');

  // Mock HTTP request to /health
  const response = await fetch(`http://localhost:6299/health`);
  const health = await response.json();

  expect(health.activeUsers).toBe(2); // 2 unique users
  expect(health.activeSessions).toBe(3); // 3 sessions
  expect(health.sessionMappings).toHaveProperty('session-user1-a');
  expect(health.sessionMappings).toHaveProperty('session-user1-b');
  expect(health.sessionMappings).toHaveProperty('session-user2');
});
```

### Mocking Strategy

Since we can't easily trigger real OAuth flow in tests, mock these components:

```typescript
// Mock DeviceFlow.authenticate() to return controlled tokens
jest.mock('../oauth/device-flow.js', () => ({
  DeviceFlow: jest.fn().mockImplementation(() => ({
    authenticate: jest.fn().mockResolvedValue({
      access_token: 'mock-token-with-sub-claim',
      token_type: 'Bearer',
      expires_in: 3600,
    }),
  })),
  shouldUseDeviceFlow: jest.fn().mockReturnValue(true),
}));
```

### Test Execution

Run with:

```bash
npm test -- session-reconnection.test.ts
```

</details>

## Input Dependencies

- All refactored session management logic from Tasks 1-6
- Enhanced debugging endpoints from Task 5

## Output Artifacts

- Integration test file `src/__tests__/session-reconnection.test.ts`
- Test coverage for critical reconnection scenarios
- Documentation of expected behavior through test assertions

## Implementation Notes

These are integration tests validating the complete session lifecycle, not unit tests for individual
functions. Focus on testing critical user journeys:

1. **User authenticates → disconnects → reconnects → calls tool** (most important)
2. **Two users authenticate → verify token isolation**
3. **User logs out → tokens removed**
4. **User reconnects 5 times → same tokens reused**

Mock the OAuth flow but test real session management logic. These tests validate that the
refactoring achieves the goal: MCP Inspector can reconnect without 403 errors.
