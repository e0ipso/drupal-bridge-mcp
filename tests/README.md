# OAuth Integration Test Suite

## Quick Start

Run all tests:

```bash
npm test
```

Run tests without coverage:

```bash
npm test -- --no-coverage
```

Run specific test file:

```bash
npm test -- --testPathPattern=oauth-config
npm test -- --testPathPattern=device-flow
npm test -- --testPathPattern=oauth-provider
npm test -- --testPathPattern=oauth-security
```

## Test Files

### Unit Tests (`/tests/unit/`)

1. **oauth-config.test.ts** - Configuration management and OAuth discovery
2. **device-flow.test.ts** - RFC 8628 Device Authorization Grant flow
3. **oauth-provider.test.ts** - Drupal OAuth provider and token management
4. **oauth-security.test.ts** - OAuth 2.1 security and compliance

### Setup

- **setup.ts** - Jest configuration and custom matchers

## What's Tested

✅ **OAuth Configuration**

- Environment variable parsing
- URL validation
- Scope handling
- Metadata discovery and caching

✅ **Device Flow (RFC 8628)**

- Device authorization initiation
- Token polling with retry logic
- User code generation
- Error handling (expired, denied, slow_down)
- Environment detection

✅ **OAuth Provider**

- Token verification via introspection
- Client information management
- Session isolation
- Endpoint management

✅ **Security & Compliance**

- OAuth 2.1 compliance
- PKCE enforcement (RFC 7636)
- HTTPS enforcement
- Secure error handling
- Rate limiting

## Test Statistics

- **Total Tests**: 94
- **Test Files**: 4
- **Execution Time**: ~12 seconds
- **Status**: All passing ✅

## Test Environment

Tests use mocked Drupal OAuth server responses and do not require a live Drupal instance.
Environment variables are set in `setup.ts`:

```typescript
process.env.DRUPAL_URL = 'https://test-drupal.example.com';
process.env.OAUTH_SCOPES = 'profile read:content';
```

## Coverage Report

See [TEST_COVERAGE_REPORT.md](./TEST_COVERAGE_REPORT.md) for detailed coverage information.

## Writing New Tests

Follow the "Meaningful Test Strategy":

✅ **DO test:**

- Custom business logic
- Integration points between components
- Edge cases and error conditions
- RFC compliance requirements

❌ **DON'T test:**

- Third-party library functionality
- Framework features
- Simple CRUD without custom logic
- Obvious functionality

## Test Structure

Each test file follows this structure:

```typescript
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup mocks and state
  });

  describe('Sub-feature', () => {
    test('should do something specific', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

## Debugging Tests

Run single test:

```bash
npm test -- --testNamePattern="should complete full device flow"
```

Run with verbose output:

```bash
npm test -- --verbose
```

Run in watch mode:

```bash
npm test -- --watch
```

## CI/CD Integration

Tests are designed to run reliably in CI/CD environments:

- No external dependencies
- No flaky tests
- Fast execution (~12s)
- Deterministic results

Add to your CI pipeline:

```yaml
- name: Run OAuth Tests
  run: npm test
```

## Related Documentation

- [OAuth Configuration Guide](/src/oauth/README.md)
- [Device Flow Implementation](/src/oauth/device-flow.md)
- [Test Coverage Report](./TEST_COVERAGE_REPORT.md)
