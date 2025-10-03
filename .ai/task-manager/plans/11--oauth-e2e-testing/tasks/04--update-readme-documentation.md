---
id: 4
group: 'documentation'
dependencies: [2, 3]
status: 'completed'
created: '2025-10-03'
skills:
  - 'documentation'
---

# Update README with OAuth E2E Testing Documentation

## Objective

Add comprehensive documentation to the README explaining how to set up and run the OAuth e2e tests,
including prerequisites, configuration, execution, and troubleshooting.

## Skills Required

- **documentation**: Technical writing for developer audience with clear setup instructions

## Acceptance Criteria

- [ ] New "OAuth E2E Testing" section added to README
- [ ] Prerequisites clearly listed (Node.js version, Drupal server, etc.)
- [ ] Step-by-step setup instructions provided
- [ ] Test execution commands documented with expected output
- [ ] Troubleshooting guide covers at least 5 common issues
- [ ] Links to methodology document included

## Technical Requirements

- Add section after existing testing documentation
- Include code examples for setup and execution
- Document the 7-step test flow at high level
- Emphasize manual execution requirement
- Provide expected output examples
- Link to `.ai/testing/oauth-flow-test-methodology.md`

## Input Dependencies

- Completed e2e test script (Task 2)
- Environment configuration setup (Task 3)
- Installed Inspector version from Task 1

## Output Artifacts

- Updated README.md with OAuth E2E Testing section

## Implementation Notes

<details>
<summary>Click to expand implementation details</summary>

### Section Structure

Add this section to README.md:

````markdown
## 🧪 OAuth E2E Testing

### Overview

The OAuth e2e test suite validates the complete OAuth authentication flow using the MCP Inspector
CLI. These tests verify session management, token persistence, and authenticated tool execution
against a real Drupal OAuth server.

**Note**: These tests require manual execution due to external Drupal server dependencies and
interactive OAuth approval steps.

### Prerequisites

- Node.js 20+
- Access to a Drupal instance with OAuth 2.0 server configured
- OAuth client credentials (client ID and optional secret)
- MCP Inspector CLI (installed as dev dependency)

### Setup

1. **Copy environment configuration**:
   ```bash
   cp .env.test.example .env.test
   ```
````

2. **Configure OAuth server settings** in `.env.test`:

   ```env
   DRUPAL_BASE_URL=https://your-drupal-site.com
   OAUTH_CLIENT_ID=your-client-id
   OAUTH_CLIENT_SECRET=your-client-secret  # Optional
   E2E_TEST_TIMEOUT=120000
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

### Running the Tests

Execute the OAuth e2e test suite:

```bash
npm run test:e2e:oauth
```

**Expected Test Flow**:

1. ✅ Connection validation
2. ✅ OAuth flow initiation
3. ⏸️ Manual OAuth approval (interactive pause)
4. ✅ Reconnection after OAuth callback
5. ✅ Token association verification
6. ✅ Authenticated tool execution
7. ✅ Session state validation

The test will pause at step 3 and prompt you to complete OAuth authorization in your browser. Press
Enter after approving to continue.

### Test Architecture

The e2e tests use `@modelcontextprotocol/inspector` CLI mode to programmatically interact with the
MCP server:

- Executes Inspector commands via child process
- Validates JSON responses with assertions
- Detects the documented OAuth token association bug
- Verifies session lifecycle and token persistence

For detailed test specifications, see
[OAuth Flow Test Methodology](.ai/testing/oauth-flow-test-methodology.md).

### Troubleshooting

**Issue: "Missing required environment variables"**

- Solution: Ensure `.env.test` file exists with all required variables from `.env.test.example`

**Issue: "Connection failed to Drupal server"**

- Solution: Verify `DRUPAL_BASE_URL` is correct and server is accessible
- Check: `curl https://your-drupal-site.com/health`

**Issue: "OAuth authorization failed"**

- Solution: Verify OAuth client credentials are correct in Drupal admin
- Check: Client ID matches the one configured in Drupal OAuth settings

**Issue: "Tool execution returns 403 Forbidden"**

- This is the expected bug the test is designed to detect
- Indicates OAuth tokens are not properly associated with reconnected sessions
- See methodology document for root cause analysis

**Issue: "Test timeout exceeded"**

- Solution: Increase `E2E_TEST_TIMEOUT` in `.env.test` (default: 120000ms)
- Complete OAuth approval more quickly when prompted

**Issue: "Inspector CLI not found"**

- Solution: Run `npm install` to ensure dev dependencies are installed
- Verify: `npx @modelcontextprotocol/inspector --help`

### Supported Inspector Version

This test suite is compatible with `@modelcontextprotocol/inspector` version `X.Y.Z` (the version
installed in Task 1).

```

### Key Points to Emphasize
1. **Manual execution only** - not automated CI/CD
2. **Interactive approval step** - user must complete OAuth in browser
3. **Purpose**: Regression detection for OAuth bugs
4. **Test validates the bug** - 403 errors are expected
5. **Links to methodology** for detailed specifications
</details>
```
