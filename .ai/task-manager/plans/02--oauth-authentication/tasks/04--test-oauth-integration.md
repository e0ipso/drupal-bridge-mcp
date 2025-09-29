---
id: 4
group: 'testing-validation'
dependencies: [3]
status: 'completed'
created: '2025-09-29'
completed: '2025-09-29'
skills: ['testing', 'oauth']
---

# Test OAuth Integration and Validate Authentication Flows

## Objective

Validate that both Authorization Code with PKCE and Device Authorization Grant flows work correctly
end-to-end, ensuring secure authentication between MCP clients and Drupal OAuth server.

## Skills Required

- **testing**: Integration testing, test automation, and validation procedures
- **oauth**: OAuth flow verification, token validation, and security compliance testing

## Acceptance Criteria

- [ ] Authorization Code flow (browser-based) tested and working
- [ ] Device Authorization Grant flow (headless) tested and working
- [ ] Token refresh mechanism validated
- [ ] OAuth discovery endpoints verified
- [ ] Session isolation between multiple clients confirmed
- [ ] Error handling for expired tokens and invalid credentials tested
- [ ] PKCE enforcement validation completed
- [ ] Token security and storage verified

## Technical Requirements

- Test both OAuth flows in realistic environments
- Validate JWT token structure and claims
- Test token introspection and validation
- Verify CORS and security headers
- Test multi-session scenarios
- Validate RFC 8628 and RFC 7636 compliance

## Input Dependencies

- Configured Drupal OAuth server (external, assumed ready)
- MCP server with OAuth client from Task 2
- Device flow implementation from Task 3
- Valid OAuth client credentials

## Output Artifacts

- Integration test suite
- OAuth flow validation results
- Security compliance report
- Performance and reliability metrics
- Troubleshooting documentation

## Implementation Notes

<details>
<summary>Meaningful Test Strategy Guidelines</summary>

**IMPORTANT** Make sure to copy this _Meaningful Test Strategy Guidelines_ section into all the
tasks focused on testing, and **also** keep them in mind when generating tasks.

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

**Test Task Creation Rules:**

- Combine related test scenarios into single tasks (e.g., "Test user authentication flow" not
  separate tasks for login, logout, validation)
- Focus on integration and critical path testing over unit test coverage
- Avoid creating separate tasks for testing each CRUD operation individually
- Question whether simple functions need dedicated test tasks
</details>

### Test Scenarios Overview

This task focuses on integration testing of the OAuth authentication system, validating the critical
paths that ensure secure authentication between MCP clients and the Drupal server.

### Step 1: Authorization Code Flow Integration Test

Test the complete browser-based OAuth flow:

```typescript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { DrupalMCPServer } from '../src/server';

describe('OAuth Authorization Code Flow Integration', () => {
  let server: DrupalMCPServer;
  let testSessionId: string;

  beforeEach(async () => {
    server = new DrupalMCPServer();
    await server.initialize();
    testSessionId = crypto.randomUUID();
  });

  test('should complete full authorization code flow with PKCE', async () => {
    // This tests the complete integration flow
    const authUrl = await server.generateAuthorizationUrl(testSessionId);

    // Verify PKCE parameters are included
    const url = new URL(authUrl);
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('response_type')).toBe('code');

    // Simulate authorization callback with code
    const mockAuthCode = 'test_auth_code_123';
    const tokens = await server.exchangeCodeForTokens(testSessionId, mockAuthCode);

    expect(tokens.access_token).toBeTruthy();
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.refresh_token).toBeTruthy();

    // Verify token is properly stored and can be retrieved
    const storedToken = await server.getAccessToken(testSessionId);
    expect(storedToken).toBe(tokens.access_token);
  });

  test('should handle PKCE validation failures', async () => {
    // Test OAuth 2.1 security enforcement
    await expect(server.exchangeCodeForTokens(testSessionId, 'invalid_code')).rejects.toThrow(
      'PKCE validation failed'
    );
  });
});
```

### Step 2: Device Flow Integration Test

Test the headless environment OAuth flow:

```typescript
describe('OAuth Device Authorization Grant Integration', () => {
  test('should complete device flow for headless environments', async () => {
    // Mock headless environment
    process.env.CONTAINER = 'true';

    const deviceAuth = await server.initiateDeviceFlow();

    // Verify device authorization response structure
    expect(deviceAuth.device_code).toBeTruthy();
    expect(deviceAuth.user_code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(deviceAuth.verification_uri).toContain('/oauth/device');
    expect(deviceAuth.expires_in).toBeGreaterThan(0);
    expect(deviceAuth.interval).toBeGreaterThanOrEqual(5);

    // Test polling logic (with mocked authorization)
    const mockTokenResponse = {
      access_token: 'device_flow_token_123',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'device_refresh_token_123',
    };

    // Mock successful polling after 2 attempts
    let pollCount = 0;
    server.mockDevicePolling(() => {
      pollCount++;
      if (pollCount < 2) {
        return { error: 'authorization_pending' };
      }
      return mockTokenResponse;
    });

    const tokens = await server.pollForDeviceToken(deviceAuth.device_code, deviceAuth.interval);

    expect(tokens).toEqual(mockTokenResponse);
    expect(pollCount).toBe(2);
  });

  test('should handle device flow error conditions', async () => {
    const deviceAuth = await server.initiateDeviceFlow();

    // Test expired token error
    server.mockDevicePolling(() => ({ error: 'expired_token' }));

    await expect(server.pollForDeviceToken(deviceAuth.device_code, 5)).rejects.toThrow(
      'Device code expired'
    );

    // Test access denied
    server.mockDevicePolling(() => ({ error: 'access_denied' }));

    await expect(server.pollForDeviceToken(deviceAuth.device_code, 5)).rejects.toThrow(
      'Authentication was denied'
    );
  });
});
```

### Step 3: Token Management and Refresh Testing

Test critical token lifecycle management:

```typescript
describe('Token Management Integration', () => {
  test('should automatically refresh expired tokens', async () => {
    const sessionId = crypto.randomUUID();

    // Set up initial tokens with short expiry
    const initialTokens = {
      access_token: 'initial_token',
      refresh_token: 'refresh_token_123',
      expires_in: 1, // 1 second for testing
    };

    await server.storeTokens(sessionId, initialTokens);

    // Wait for token to expire
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock refresh token response
    server.mockTokenRefresh(() => ({
      access_token: 'refreshed_token',
      refresh_token: 'new_refresh_token',
      expires_in: 3600,
    }));

    // Requesting token should trigger automatic refresh
    const currentToken = await server.getAccessToken(sessionId);
    expect(currentToken).toBe('refreshed_token');
  });

  test('should isolate tokens between sessions', async () => {
    const session1 = crypto.randomUUID();
    const session2 = crypto.randomUUID();

    await server.storeTokens(session1, { access_token: 'token1' });
    await server.storeTokens(session2, { access_token: 'token2' });

    expect(await server.getAccessToken(session1)).toBe('token1');
    expect(await server.getAccessToken(session2)).toBe('token2');
  });
});
```

### Step 4: OAuth Discovery and Metadata Validation

Test automatic endpoint discovery and metadata validation:

```typescript
describe('OAuth Discovery Integration', () => {
  test('should discover OAuth endpoints from Drupal metadata', async () => {
    const metadata = await server.fetchOAuthMetadata();

    // Verify all required endpoints are present
    expect(metadata.authorization_endpoint).toContain('/oauth/authorize');
    expect(metadata.token_endpoint).toContain('/oauth/token');
    expect(metadata.device_authorization_endpoint).toContain('/oauth/device_authorization');

    // Verify supported grant types
    expect(metadata.grant_types_supported).toContain('authorization_code');
    expect(metadata.grant_types_supported).toContain('refresh_token');
    expect(metadata.grant_types_supported).toContain(
      'urn:ietf:params:oauth:grant-type:device_code'
    );

    // Verify PKCE support
    expect(metadata.code_challenge_methods_supported).toContain('S256');

    // Verify token endpoint auth methods
    expect(metadata.token_endpoint_auth_methods_supported).toBeTruthy();
  });

  test('should handle discovery endpoint failures gracefully', async () => {
    // Test with invalid Drupal URL
    const originalUrl = process.env.DRUPAL_URL;
    process.env.DRUPAL_URL = 'https://invalid-url.example.com';

    await expect(server.fetchOAuthMetadata()).rejects.toThrow('OAuth discovery failed');

    process.env.DRUPAL_URL = originalUrl;
  });
});
```

### Step 5: Security and Compliance Validation

Test OAuth 2.1 security requirements and compliance:

```typescript
describe('OAuth Security and Compliance', () => {
  test('should enforce PKCE for all authorization code flows', async () => {
    // Attempt authorization without PKCE should fail
    const authUrlWithoutPKCE = await server.generateAuthorizationUrl(crypto.randomUUID(), {
      disablePKCE: true,
    });

    // Should still include PKCE (forced by OAuth 2.1 compliance)
    const url = new URL(authUrlWithoutPKCE);
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
  });

  test('should validate JWT token structure and claims', async () => {
    const token = await server.getAccessToken(testSessionId);
    const decoded = server.decodeJWT(token);

    expect(decoded.iss).toContain(process.env.DRUPAL_URL);
    expect(decoded.aud).toBe(process.env.OAUTH_CLIENT_ID);
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
    expect(decoded.scope).toContain('read:tutorials');
  });

  test('should enforce HTTPS in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    expect(() => {
      new DrupalMCPServer({
        drupalUrl: 'http://insecure-url.com',
      });
    }).toThrow('HTTPS required in production');

    process.env.NODE_ENV = originalEnv;
  });
});
```

### Step 6: End-to-End MCP Tool Authentication

Test that OAuth-protected MCP tools work correctly:

```typescript
describe('MCP Tool Authentication Integration', () => {
  test('should authenticate MCP tool calls with valid tokens', async () => {
    const sessionId = crypto.randomUUID();
    await server.authenticateSession(sessionId);

    // Call a protected MCP tool
    const response = await server.handleToolCall(sessionId, {
      name: 'test_drupal_connection',
      arguments: {},
    });

    expect(response.success).toBe(true);
    expect(response.authenticated).toBe(true);
  });

  test('should reject MCP tool calls without authentication', async () => {
    const sessionId = crypto.randomUUID();

    await expect(
      server.handleToolCall(sessionId, {
        name: 'test_drupal_connection',
        arguments: {},
      })
    ).rejects.toThrow('Authentication required');
  });
});
```

### Step 7: Performance and Reliability Testing

Test system reliability under various conditions:

```typescript
describe('OAuth System Reliability', () => {
  test('should handle concurrent authentication requests', async () => {
    const sessions = Array.from({ length: 5 }, () => crypto.randomUUID());

    const authPromises = sessions.map(sessionId => server.authenticateSession(sessionId));

    const results = await Promise.allSettled(authPromises);

    // All authentications should succeed
    results.forEach((result, index) => {
      expect(result.status).toBe('fulfilled');
    });

    // Verify each session has isolated tokens
    for (const sessionId of sessions) {
      const token = await server.getAccessToken(sessionId);
      expect(token).toBeTruthy();
    }
  });

  test('should maintain service during OAuth server temporary failures', async () => {
    // Mock temporary OAuth server failure
    server.mockTemporaryFailure(2000); // 2 second outage

    const sessionId = crypto.randomUUID();

    // Should retry and eventually succeed
    const token = await server.getAccessToken(sessionId);
    expect(token).toBeTruthy();
  });
});
```

### Environment Setup for Testing

Create test environment configuration:

```bash
# Test environment variables
export DRUPAL_URL=http://localhost:8080
export OAUTH_CLIENT_ID=test-mcp-client
export OAUTH_CLIENT_SECRET=test-client-secret
export NODE_ENV=test
export MCP_SERVER_PORT=3001

# Run tests
npm test -- --testPathPattern=oauth-integration
```

### Validation Checklist

Before marking this task complete, verify:

- [ ] Both OAuth flows complete successfully in realistic environments
- [ ] Token refresh works automatically without user intervention
- [ ] Session isolation prevents token leakage between clients
- [ ] Error conditions are handled gracefully with appropriate user feedback
- [ ] PKCE enforcement cannot be bypassed
- [ ] Device codes follow RFC 8628 security requirements
- [ ] JWT tokens contain correct claims and signatures
- [ ] MCP tools work correctly with Bearer token authentication
- [ ] System maintains availability during temporary OAuth server issues
- [ ] Multiple concurrent users can authenticate simultaneously
</details>
