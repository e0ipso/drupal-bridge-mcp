# Integration Tests

This directory contains integration tests that verify end-to-end functionality of the MCP server.

## Running Integration Tests

```bash
npm run test:integration
```

## Test Files

### oauth-metadata-discovery.test.ts

Tests OAuth metadata discovery functionality when the server starts without pre-configured client
credentials.

**Test Coverage:**

1. **Server Startup Without Credentials**
   - Verifies server starts successfully with `AUTH_ENABLED=true` and no
     `OAUTH_CLIENT_ID`/`OAUTH_CLIENT_SECRET`
   - Confirms OAuth initialization succeeds using metadata discovery

2. **Metadata Endpoint Availability**
   - Tests `GET /.well-known/oauth-authorization-server` endpoint
   - Verifies response format and content-type

3. **Required Metadata Fields**
   - Validates presence of `registration_endpoint` (critical for dynamic client registration)
   - Verifies `issuer`, `authorization_endpoint`, `token_endpoint`, `jwks_uri`
   - Checks `response_types_supported` and `grant_types_supported`

4. **Metadata Content Validation**
   - Confirms metadata matches Drupal's OAuth server configuration
   - Validates all URLs are properly formatted

5. **Error Handling**
   - Tests graceful degradation when Drupal metadata endpoint is unavailable
   - Verifies handling of invalid metadata responses

## Configuration

Integration tests use a separate Jest configuration (`jest.config.integration.json`) with:

- Longer timeout (15 seconds) for server startup
- Single worker for predictable test execution
- Separate cache directory

## Prerequisites

Integration tests mock external HTTP calls using `nock`:

- Drupal OAuth metadata endpoint (`/.well-known/oauth-authorization-server`)
- Drupal tools discovery endpoint (`/mcp/tools/list`)

Tests run against a local server instance on port 6299 to avoid conflicts with development servers.

## Notes

- Integration tests are excluded from the main test suite (`npm test`)
- Tests verify the complete OAuth metadata discovery flow, not just unit functionality
- Server instances are properly cleaned up after tests using `afterAll` hooks
