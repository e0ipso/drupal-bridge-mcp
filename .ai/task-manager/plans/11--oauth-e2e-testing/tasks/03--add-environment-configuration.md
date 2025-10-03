---
id: 3
group: 'test-infrastructure'
dependencies: [1]
status: 'completed'
created: '2025-10-03'
skills:
  - 'configuration'
---

# Add E2E Test Environment Configuration

## Objective

Create environment configuration files and validation logic to support manual execution of OAuth e2e
tests with proper Drupal server settings.

## Skills Required

- **configuration**: Environment variable management and validation setup

## Acceptance Criteria

- [ ] `.env.test.example` file created with required OAuth server variables
- [ ] Environment validation script checks for required configuration
- [ ] npm script added for e2e test execution with proper env loading
- [ ] Clear error messages for missing or invalid configuration

## Technical Requirements

- Create `.env.test.example` with:
  - `DRUPAL_BASE_URL`: Target Drupal OAuth server URL
  - `OAUTH_CLIENT_ID`: OAuth client identifier
  - `OAUTH_CLIENT_SECRET`: OAuth client secret (optional)
  - `E2E_TEST_TIMEOUT`: Timeout for manual interactions (default: 120000ms)
- Add environment validation at test startup
- Create npm script: `test:e2e:oauth`
- Validate Drupal server availability before running tests

## Input Dependencies

- Inspector package installed (Task 1)
- Existing `.env` pattern in the project

## Output Artifacts

- `.env.test.example` - Example environment configuration
- Environment validation helper function
- npm script in package.json for test execution

## Implementation Notes

<details>
<summary>Click to expand implementation details</summary>

### .env.test.example

```env
# OAuth E2E Test Configuration
DRUPAL_BASE_URL=https://drupal-contrib.ddev.site
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
E2E_TEST_TIMEOUT=120000
```

### Environment Validation

Create a helper in the test file or separate utility:

```typescript
const validateE2EEnvironment = () => {
  const required = ['DRUPAL_BASE_URL', 'OAUTH_CLIENT_ID'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for e2e tests: ${missing.join(', ')}\n` +
        'Please copy .env.test.example to .env.test and configure values.'
    );
  }

  // Test server connectivity
  const serverUrl = process.env.DRUPAL_BASE_URL;
  console.log(`Validating connection to OAuth server: ${serverUrl}`);
};

// Call at test suite start
beforeAll(() => {
  validateE2EEnvironment();
});
```

### npm Script

Add to package.json scripts:

```json
{
  "scripts": {
    "test:e2e:oauth": "NODE_ENV=test node --env-file=.env.test npx jest src/__tests__/e2e/oauth-flow.e2e.test.ts --testTimeout=120000"
  }
}
```

### Documentation in Example File

Add comments explaining each variable:

```env
# The base URL of your Drupal OAuth server
# Example: https://drupal-contrib.ddev.site
DRUPAL_BASE_URL=

# OAuth client ID from your Drupal OAuth configuration
OAUTH_CLIENT_ID=

# OAuth client secret (optional for public clients)
OAUTH_CLIENT_SECRET=

# Test timeout in milliseconds (allows time for manual OAuth approval)
E2E_TEST_TIMEOUT=120000
```

</details>
