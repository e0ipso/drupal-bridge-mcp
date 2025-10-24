---
id: 4
group: 'testing'
dependencies: [1, 3]
status: 'pending'
created: '2025-10-24'
skills:
  - jest
  - typescript
---

# Update test suite for resource server pattern

## Objective

Remove tests for dormant proxy pattern functionality and add/update tests for resource server token
verification, maintaining 80% coverage threshold while focusing on actual execution paths.

## Skills Required

- **Jest**: Write unit tests, mock dependencies, test async functions
- **TypeScript**: Type-safe test implementations with strict mode

## Acceptance Criteria

- [ ] Delete `src/oauth/__tests__/reactive-refresh.test.ts` (tests dormant refresh logic)
- [ ] Update `src/oauth/__tests__/jwt-verifier.test.ts` to test DrupalTokenVerifier
- [ ] Add tests for AuthInfo extraction from JWT claims
- [ ] Add tests for verification error handling (expired, invalid signature, missing claims)
- [ ] Test coverage maintained at 80%+: `npm test -- --coverage`
- [ ] All tests pass: `npm test`

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**IMPORTANT: Meaningful Test Strategy Guidelines**

Your critical mantra for test generation is: "write a few tests, mostly integration".

**Definition of "Meaningful Tests":** Tests that verify custom business logic, critical paths, and
edge cases specific to the application. Focus on testing YOUR code, not the framework or library
functionality.

**When TO Write Tests:**

- Custom business logic: JWT → AuthInfo mapping logic
- Critical paths: Token verification flow
- Edge cases: Expired tokens, invalid signatures, missing claims
- Integration points: DrupalTokenVerifier with jwt-verifier.ts

**When NOT to Write Tests:**

- Framework functionality (Jest, MCP SDK itself)
- Third-party library behavior (jose package JWT validation - already tested upstream)
- Simple property access or getters

**Test File Changes**:

1. **DELETE**: `src/oauth/__tests__/reactive-refresh.test.ts`
   - Reason: Tests code that never executes (refresh logic requires refresh_token which never
     arrives)
   - Impact: Removes ~200 lines of tests for dormant code

2. **UPDATE**: `src/oauth/__tests__/jwt-verifier.test.ts`
   - Add tests for `DrupalTokenVerifier.verifyAccessToken()`
   - Focus on JWT → AuthInfo mapping logic (YOUR code)
   - Don't test `verifyJWT()` internals (already tested)

**Test Scenarios to Add**:

```typescript
describe('DrupalTokenVerifier', () => {
  describe('verifyAccessToken', () => {
    it('returns correct AuthInfo for valid JWT', async () => {
      // Test JWT claims → AuthInfo field mapping
    });

    it('throws error for expired JWT', async () => {
      // Test error handling for exp claim validation
    });

    it('throws error for invalid signature', async () => {
      // Test error handling for signature verification failure
    });

    it('throws error for missing required claims', async () => {
      // Test error handling for aud, scope, exp missing
    });

    it('handles scope claim as string or array', async () => {
      // Test scope parsing logic
    });
  });
});
```

## Input Dependencies

- Task 1: `DrupalTokenVerifier` implementation to test
- Task 3: Removed proxy pattern code confirms no tests needed for that
- Existing `jwt-verifier.test.ts` as base structure

## Output Artifacts

- Deleted `reactive-refresh.test.ts`
- Updated `jwt-verifier.test.ts` with DrupalTokenVerifier tests
- Test coverage report showing 80%+ coverage

## Implementation Notes

<details>
<summary>Detailed Implementation Guidance</summary>

### Test Structure Pattern

Follow existing test patterns in `src/oauth/__tests__/`:

- Use `jest.mock()` for external dependencies
- Mock Drupal OAuth endpoints with `nock` or fetch mocks
- Use fixture data for JWT tokens

### Mock JWT Tokens

Create fixture JWTs with:

- Valid signature (or mock verification to return success)
- Various claim combinations
- Expired timestamps for negative tests
- Missing claims for validation tests

Example fixture:

```typescript
const validJWT = {
  header: { alg: 'RS256', typ: 'JWT' },
  payload: {
    aud: 'client-id-123',
    scope: 'mcp:tools',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
  },
  signature: '...',
};
```

### Coverage Focus Areas

Priority for test coverage:

1. **High Priority**: AuthInfo extraction logic (JWT claims → AuthInfo fields)
2. **High Priority**: Error handling paths (expired, invalid, missing)
3. **Medium Priority**: Edge cases (scope as string vs array, optional claims)
4. **Low Priority**: Constructor, configuration passing (trivial)

### Removing Reactive Refresh Tests

Simply delete the file:

```bash
rm src/oauth/__tests__/reactive-refresh.test.ts
```

No other test files reference this one, so no dependency cleanup needed.

### Coverage Verification

After changes, run:

```bash
npm test -- --coverage --coverageDirectory=coverage
```

Check `coverage/lcov-report/index.html` for detailed coverage report.

Target: 80%+ for branches, functions, lines, statements.

</details>
