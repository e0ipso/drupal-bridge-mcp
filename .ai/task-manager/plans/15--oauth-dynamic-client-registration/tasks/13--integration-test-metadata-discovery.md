---
id: 13
group: 'validation-testing'
dependencies: [4, 5, 6]
status: 'pending'
created: '2025-10-15'
skills:
  - 'typescript'
  - 'oauth'
  - 'integration-testing'
---

# Integration Test: OAuth Metadata Discovery

## Objective

Verify that OAuth metadata discovery works end-to-end when the server starts without client
credentials.

## Skills Required

- typescript: Server startup, HTTP requests
- oauth: Metadata discovery endpoint
- integration-testing: Real server testing

## Acceptance Criteria

- [ ] Start server with `AUTH_ENABLED=true` and no client credentials
- [ ] Verify server starts successfully without credential errors
- [ ] Request `GET /.well-known/oauth-authorization-server`
- [ ] Verify response contains Drupal's metadata
- [ ] Verify `registration_endpoint` is present in metadata
- [ ] Verify metadata includes other required endpoints (authorization, token, etc.)

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

### Meaningful Test Strategy Guidelines

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

This is a critical integration test that validates the entire OAuth initialization and metadata
serving flow.

Environment setup:

- Set `AUTH_ENABLED=true`
- Remove `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET`
- Set valid `DRUPAL_BASE_URL`

Expected metadata response should include:

- `issuer`
- `authorization_endpoint`
- `token_endpoint`
- `registration_endpoint` (key requirement!)
- `jwks_uri`

## Input Dependencies

- Task 4: OAuth config works without credentials
- Task 5: Token verification uses JWT
- Task 6: getClientInfo removed

## Output Artifacts

- Integration test demonstrating successful metadata discovery
- Documented test procedure

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Set up test environment**: Create a test `.env` or set environment variables:

   ```bash
   AUTH_ENABLED=true
   DRUPAL_BASE_URL=https://drupal-contrib.ddev.site
   # NO OAUTH_CLIENT_ID
   # NO OAUTH_CLIENT_SECRET
   ```

2. **Start the server**:

   ```bash
   npm run build
   npm start
   ```

3. **Verify server starts**: Check logs for:
   - No "OAUTH_CLIENT_ID environment variable is required" error
   - "OAuth enabled" or similar message
   - Server listening message

4. **Test metadata endpoint**:

   ```bash
   curl -i http://localhost:6200/.well-known/oauth-authorization-server
   ```

5. **Verify response**:
   - Status: 200 OK
   - Content-Type: application/json
   - Body contains JSON with:
     ```json
     {
       "issuer": "https://drupal-contrib.ddev.site",
       "registration_endpoint": "https://drupal-contrib.ddev.site/oauth/register",
       "authorization_endpoint": "...",
       "token_endpoint": "...",
       "jwks_uri": "...",
       ...
     }
     ```

6. **Key validation**: The `registration_endpoint` MUST be present - this is what Claude Code needs
   to register.

7. **Automated test option**: You could create a test script:

   ```typescript
   // tests/integration/metadata-discovery.test.ts
   import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

   describe('OAuth Metadata Discovery', () => {
     let serverProcess;

     beforeAll(async () => {
       // Start server programmatically or via child_process
     });

     afterAll(async () => {
       // Stop server
     });

     it('should serve metadata without client credentials', async () => {
       const response = await fetch('http://localhost:6200/.well-known/oauth-authorization-server');
       expect(response.status).toBe(200);

       const metadata = await response.json();
       expect(metadata.registration_endpoint).toBeDefined();
       expect(metadata.issuer).toBeDefined();
     });
   });
   ```

8. **Success criteria**: Server starts and serves metadata without requiring pre-configured client
   credentials.

</details>
