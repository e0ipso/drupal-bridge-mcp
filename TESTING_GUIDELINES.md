# Testing Guidelines

## Overview

This document outlines the testing architecture and guidelines for the Drupal Bridge MCP project.
Our test suite is optimized for maintainability, performance, and clear separation of concerns.

## Test Architecture

### Test Suite Structure

```
tests/
├── unit/                    # Unit test setup and utilities
│   └── setup.ts            # Unit test configuration
├── integration/            # Integration tests
│   ├── setup.ts           # Integration test configuration
│   └── *.test.ts          # Integration test files
├── mcp/                   # MCP-specific integration tests
│   └── *.test.ts         # MCP integration tests
└── setup.ts              # Legacy setup (being phased out)

src/
├── **/*.test.ts           # Co-located unit tests
└── **/*.spec.ts           # Co-located specification tests
```

### Test Types and Boundaries

#### Unit Tests

**Location**: `src/**/*.test.ts` and `tests/unit/**/*.test.ts` **Purpose**: Test individual
functions, classes, and modules in isolation **Timeout**: 5 seconds **Workers**: 75% of CPU cores
**Execution**: Fail-fast (bail on first failure)

**Guidelines**:

- Test pure functions and business logic
- Mock all external dependencies
- Focus on edge cases and error conditions
- Should run in under 30 seconds total
- No network calls, file I/O, or database operations

**Example**:

```typescript
// ✅ Good unit test
describe('TokenValidator', () => {
  it('should validate JWT token format', () => {
    const validator = new TokenValidator();
    const validToken = 'eyJ0eXAiOiJKV1QiLCJhbGc...';
    expect(validator.isValidFormat(validToken)).toBe(true);
  });
});

// ❌ Avoid in unit tests
describe('TokenValidator', () => {
  it('should validate token with real OAuth server', async () => {
    const response = await fetch('https://oauth.server.com/validate');
    // This belongs in integration tests
  });
});
```

#### Integration Tests

**Location**: `tests/integration/**/*.test.ts` and `tests/mcp/**/*.test.ts` **Purpose**: Test
component interactions, workflows, and external integrations **Timeout**: 30 seconds **Workers**: 1
(sequential execution to avoid conflicts) **Execution**: Continue on failure to gather comprehensive
results

**Guidelines**:

- Test OAuth flows end-to-end
- Validate MCP protocol compliance
- Test error handling and recovery
- Mock external services when possible, use real implementations selectively
- Focus on integration points and data flow

**Example**:

```typescript
// ✅ Good integration test
describe('OAuth Flow Integration', () => {
  it('should complete full PKCE authorization flow', async () => {
    const authService = new AuthService(mockConfig);
    const authUrl = await authService.startAuthFlow();
    const token = await authService.exchangeCodeForToken(mockCode);
    expect(token).toBeValidToken();
  });
});
```

## Test Organization Decision Tree

Use this decision tree to determine where to place your test:

```
Is this testing a single function/method in isolation?
├─ YES → Unit Test (src/**/*.test.ts)
└─ NO → Is this testing component interactions or workflows?
    ├─ YES → Is this MCP-specific functionality?
    │   ├─ YES → Integration Test (tests/mcp/**/*.test.ts)
    │   └─ NO → Integration Test (tests/integration/**/*.test.ts)
    └─ NO → Consider if this test is necessary
```

## Performance Targets

### Unit Tests

- **Total execution time**: < 30 seconds
- **Individual test timeout**: 5 seconds
- **Coverage targets**: 80% branches, functions, lines, statements

### Integration Tests

- **Total execution time**: < 5 minutes
- **Individual test timeout**: 30 seconds
- **Coverage targets**: Focus on critical paths and error handling

## Anti-Patterns to Avoid

Based on our cleanup experience, avoid these patterns:

### ❌ Upstream Dependency Testing

```typescript
// Don't test library functionality
describe('@modelcontextprotocol/sdk', () => {
  it('should create valid JSON-RPC requests', () => {
    // This tests the library, not our code
  });
});
```

### ❌ Cross-Suite Redundancy

```typescript
// Don't duplicate the same test logic across unit and integration suites
// Unit test: Test the logic
// Integration test: Test the workflow
```

### ❌ Backward Compatibility Testing

```typescript
// Don't test deprecated features in a new codebase
describe('Legacy OAuth 1.0 support', () => {
  // This project only supports OAuth 2.1
});
```

### ❌ Environment-Specific Code in Source

```typescript
// Don't put test-specific logic in production code
if (process.env.NODE_ENV === 'test') {
  // This violates separation of concerns
}
```

## Test Scripts Usage

### Development

```bash
npm test                    # Run unit tests (fast feedback)
npm run test:unit:watch     # Watch mode for unit tests
npm run test:integration    # Run integration tests
npm run test:all           # Run both test suites
```

### Coverage

```bash
npm run test:unit:coverage      # Unit test coverage
npm run test:integration:coverage # Integration test coverage
npm run test:coverage:all       # Comprehensive coverage report
```

### CI/CD

```bash
npm run test:ci            # Optimized for continuous integration
                          # Runs both suites with optimal settings
```

## Best Practices

### 1. Test Naming

- Use descriptive names that explain the scenario
- Format: `should [expected behavior] when [condition]`
- Examples:
  - `should throw InvalidTokenError when token is malformed`
  - `should complete OAuth flow when valid PKCE parameters provided`

### 2. Test Structure

Follow the Arrange-Act-Assert pattern:

```typescript
it('should validate token signature', () => {
  // Arrange
  const token = 'eyJ0eXAiOiJKV1QiLCJhbGc...';
  const validator = new TokenValidator(mockKey);

  // Act
  const result = validator.verify(token);

  // Assert
  expect(result.isValid).toBe(true);
});
```

### 3. Mock Strategy

- **Unit tests**: Mock everything external
- **Integration tests**: Mock selectively, prefer real implementations for core functionality

### 4. Test Data

- Use factories for test data generation
- Keep test data minimal and focused
- Avoid hardcoded values that obscure test intent

### 5. Async Testing

- Always await async operations
- Use proper error handling
- Set appropriate timeouts

## Continuous Improvement

### Metrics to Monitor

- Test execution time (aim for faster feedback)
- Coverage percentages (maintain quality gates)
- Test reliability (reduce flaky tests)
- Maintenance burden (keep tests simple)

### Regular Reviews

- Monthly review of test execution times
- Quarterly review of test architecture
- Remove obsolete tests promptly
- Refactor when code changes significantly

## Questions and Decisions

When in doubt, ask these questions:

1. **Am I testing my code or someone else's?** (Test your code)
2. **Can this test run in isolation?** (Unit test characteristic)
3. **Does this test require external resources?** (Integration test characteristic)
4. **Will this test help catch regressions?** (If no, consider removing)
5. **Is this test maintainable?** (Complex tests become technical debt)

Remember: The goal is confidence in code quality with minimum maintenance overhead. Good tests are
an investment in long-term productivity.
