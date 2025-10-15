---
id: 12
group: 'test-updates'
dependencies: [2]
status: 'completed'
created: '2025-10-15'
skills:
  - 'jest'
  - 'typescript'
---

# Create JWT Verification Tests

## Objective

Write unit tests for the `verifyJWT()` function to ensure proper JWT validation and error handling.

## Skills Required

- jest: Test writing, mocking, assertions
- typescript: Async test patterns

## Acceptance Criteria

- [ ] Create test file `src/oauth/__tests__/jwt-verifier.test.ts`
- [ ] Test successful JWT verification with valid token
- [ ] Test error when JWKS URI is missing from metadata
- [ ] Test error when JWT signature is invalid
- [ ] Test error when JWT issuer doesn't match
- [ ] Mock the `jose` library functions
- [ ] All tests pass

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

### Test Focus

Test the custom logic:

- JWKS URI validation
- Error message formatting
- Integration with OAuth metadata

Don't test:

- `jose` library functionality (already tested upstream)
- JWT crypto verification (that's jose's job)

## Input Dependencies

- Task 2: `verifyJWT()` function implemented

## Output Artifacts

- Test file: `src/oauth/__tests__/jwt-verifier.test.ts`

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Create test file**: `src/oauth/__tests__/jwt-verifier.test.ts`

2. **Test structure**:

   ```typescript
   import { verifyJWT } from '../jwt-verifier.js';
   import { jwtVerify, createRemoteJWKSet } from 'jose';
   import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

   jest.mock('jose');

   describe('verifyJWT', () => {
     const mockMetadata: OAuthMetadata = {
       issuer: 'https://drupal.test',
       jwks_uri: 'https://drupal.test/oauth/jwks',
       authorization_endpoint: 'https://drupal.test/oauth/authorize',
       token_endpoint: 'https://drupal.test/oauth/token',
     };

     it('should verify valid JWT and return payload', async () => {
       const mockPayload = { sub: '123', client_id: 'test-client', scope: 'read write' };
       (jwtVerify as jest.Mock).mockResolvedValue({ payload: mockPayload });

       const result = await verifyJWT('valid.jwt.token', mockMetadata);

       expect(result).toEqual(mockPayload);
       expect(jwtVerify).toHaveBeenCalledWith(
         'valid.jwt.token',
         expect.any(Object), // JWKS
         { issuer: 'https://drupal.test' }
       );
     });

     it('should throw error when jwks_uri is missing', async () => {
       const metadataWithoutJWKS = { ...mockMetadata, jwks_uri: undefined };

       await expect(verifyJWT('token', metadataWithoutJWKS as any)).rejects.toThrow(
         'JWKS URI not available'
       );
     });

     it('should propagate verification errors', async () => {
       (jwtVerify as jest.Mock).mockRejectedValue(new Error('Invalid signature'));

       await expect(verifyJWT('invalid.token', mockMetadata)).rejects.toThrow('Invalid signature');
     });
   });
   ```

3. **Run tests**:

   ```bash
   npm test -- jwt-verifier.test.ts
   ```

4. **Key testing principles**:
   - Mock the `jose` library - don't test its crypto implementation
   - Test our error handling and metadata validation
   - Verify correct parameters passed to `jwtVerify`
   - Test edge cases (missing JWKS URI, invalid tokens)

</details>
