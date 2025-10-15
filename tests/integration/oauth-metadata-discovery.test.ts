/**
 * Integration Test: OAuth Metadata Discovery
 *
 * Tests that the server can start without client credentials and serve
 * OAuth metadata from Drupal's /.well-known/oauth-authorization-server endpoint
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import nock from 'nock';
import { DrupalMCPHttpServer } from '../../src/index.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

describe('OAuth Metadata Discovery Integration', () => {
  let server: DrupalMCPHttpServer;
  const TEST_HOST = 'localhost';
  const TEST_PORT = 6299; // Different port to avoid conflicts
  const DRUPAL_BASE_URL = 'https://drupal-test.example.com';

  // Mock OAuth metadata response from Drupal
  const mockOAuthMetadata: OAuthMetadata = {
    issuer: DRUPAL_BASE_URL,
    authorization_endpoint: `${DRUPAL_BASE_URL}/oauth/authorize`,
    token_endpoint: `${DRUPAL_BASE_URL}/oauth/token`,
    registration_endpoint: `${DRUPAL_BASE_URL}/oauth/register`,
    jwks_uri: `${DRUPAL_BASE_URL}/oauth/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['client_secret_basic'],
    scopes_supported: ['profile', 'email'],
  };

  // Mock tools response from Drupal
  const mockToolsResponse = [
    {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];

  beforeAll(() => {
    // Set required environment variables
    process.env.AUTH_ENABLED = 'true';
    process.env.DRUPAL_BASE_URL = DRUPAL_BASE_URL;
    process.env.HTTP_PORT = String(TEST_PORT);
    process.env.HTTP_HOST = TEST_HOST;

    // Remove client credentials to test metadata discovery mode
    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;

    // Set default scopes
    process.env.OAUTH_SCOPES = 'profile email';
  });

  beforeEach(() => {
    // Clear all nock mocks before each test
    nock.cleanAll();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    nock.cleanAll();
    nock.restore();
  });

  it('should start server successfully without client credentials when AUTH_ENABLED=true', async () => {
    // Mock Drupal OAuth metadata endpoint
    nock(DRUPAL_BASE_URL)
      .get('/.well-known/oauth-authorization-server')
      .reply(200, mockOAuthMetadata);

    // Mock Drupal tools discovery endpoint
    nock(DRUPAL_BASE_URL).get('/mcp/tools/list').reply(200, mockToolsResponse);

    // Create and start server
    server = new DrupalMCPHttpServer({
      name: 'test-mcp',
      version: '1.0.0',
      port: TEST_PORT,
      host: TEST_HOST,
      enableAuth: true,
    });

    // Should not throw - server starts without client credentials
    await expect(server.start()).resolves.not.toThrow();

    // Verify the server is running by checking health endpoint
    const healthResponse = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/health`
    );
    expect(healthResponse.ok).toBe(true);

    const healthData = await healthResponse.json();
    expect(healthData.status).toBe('healthy');
    expect(healthData.authEnabled).toBe(true);
  }, 10000);

  it('should serve OAuth metadata from /.well-known/oauth-authorization-server endpoint', async () => {
    // The server should already be running from the previous test
    // The metadata router should proxy Drupal's metadata

    // Make request to our server's metadata endpoint
    const response = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/.well-known/oauth-authorization-server`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');

    const metadata = await response.json();

    // Verify it's valid OAuth metadata
    expect(metadata).toHaveProperty('issuer');
    expect(metadata).toHaveProperty('authorization_endpoint');
    expect(metadata).toHaveProperty('token_endpoint');
    expect(metadata).toHaveProperty('registration_endpoint');
    expect(metadata).toHaveProperty('jwks_uri');
  }, 10000);

  it('should include registration_endpoint in metadata (required for dynamic client registration)', async () => {
    const response = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/.well-known/oauth-authorization-server`
    );

    const metadata = await response.json();

    // The critical field for dynamic client registration
    expect(metadata.registration_endpoint).toBeDefined();
    expect(typeof metadata.registration_endpoint).toBe('string');
    expect(metadata.registration_endpoint).toMatch(/^https?:\/\//);
  }, 10000);

  it('should include all required OAuth metadata fields', async () => {
    const response = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/.well-known/oauth-authorization-server`
    );

    const metadata = await response.json();

    // Required OAuth 2.0 Authorization Server Metadata fields
    const requiredFields = [
      'issuer',
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
    ];

    requiredFields.forEach(field => {
      expect(metadata).toHaveProperty(field);
      expect(typeof metadata[field]).toBe('string');
      expect(metadata[field]).toBeTruthy();
    });
  }, 10000);

  it('should include response_types_supported and grant_types_supported', async () => {
    const response = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/.well-known/oauth-authorization-server`
    );

    const metadata = await response.json();

    expect(metadata.response_types_supported).toBeDefined();
    expect(Array.isArray(metadata.response_types_supported)).toBe(true);
    expect(metadata.response_types_supported.length).toBeGreaterThan(0);

    expect(metadata.grant_types_supported).toBeDefined();
    expect(Array.isArray(metadata.grant_types_supported)).toBe(true);
    expect(metadata.grant_types_supported.length).toBeGreaterThan(0);
  }, 10000);

  it('should serve metadata that matches Drupal OAuth server configuration', async () => {
    const response = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/.well-known/oauth-authorization-server`
    );

    const metadata = await response.json();

    // Verify the metadata points to the Drupal server
    expect(metadata.issuer).toBe(mockOAuthMetadata.issuer);
    expect(metadata.authorization_endpoint).toBe(
      mockOAuthMetadata.authorization_endpoint
    );
    expect(metadata.token_endpoint).toBe(mockOAuthMetadata.token_endpoint);
    expect(metadata.registration_endpoint).toBe(
      mockOAuthMetadata.registration_endpoint
    );
    expect(metadata.jwks_uri).toBe(mockOAuthMetadata.jwks_uri);
  }, 10000);
});

describe('OAuth Metadata Discovery - Error Scenarios', () => {
  const TEST_HOST = 'localhost';
  const TEST_PORT = 6298; // Different port
  const DRUPAL_BASE_URL = 'https://drupal-error-test.example.com';

  beforeAll(() => {
    process.env.AUTH_ENABLED = 'true';
    process.env.DRUPAL_BASE_URL = DRUPAL_BASE_URL;
    process.env.HTTP_PORT = String(TEST_PORT);
    process.env.HTTP_HOST = TEST_HOST;
    process.env.OAUTH_SCOPES = 'profile';

    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.cleanAll();
    nock.restore();
  });

  it('should handle gracefully when Drupal metadata endpoint is unavailable', async () => {
    // Mock Drupal metadata endpoint to return 503
    nock(DRUPAL_BASE_URL)
      .get('/.well-known/oauth-authorization-server')
      .reply(503, 'Service Unavailable');

    // Mock tools endpoint to succeed
    nock(DRUPAL_BASE_URL)
      .get('/mcp/tools/list')
      .reply(200, [
        {
          name: 'test_tool',
          description: 'Test',
          inputSchema: { type: 'object', properties: {} },
        },
      ]);

    const server = new DrupalMCPHttpServer({
      name: 'test-mcp',
      version: '1.0.0',
      port: TEST_PORT,
      host: TEST_HOST,
      enableAuth: true,
    });

    // Server should start but with auth disabled due to metadata failure
    await server.start();

    const healthResponse = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/health`
    );
    const healthData = await healthResponse.json();

    // Auth should be disabled after failed metadata fetch
    expect(healthData.authEnabled).toBe(false);

    await server.stop();
  }, 10000);

  it('should handle invalid metadata response gracefully', async () => {
    // Mock Drupal metadata endpoint to return invalid JSON
    nock(DRUPAL_BASE_URL)
      .get('/.well-known/oauth-authorization-server')
      .reply(200, { invalid: 'metadata' }); // Missing required fields

    // Mock tools endpoint
    nock(DRUPAL_BASE_URL)
      .get('/mcp/tools/list')
      .reply(200, [
        {
          name: 'test_tool',
          description: 'Test',
          inputSchema: { type: 'object', properties: {} },
        },
      ]);

    const server = new DrupalMCPHttpServer({
      name: 'test-mcp',
      version: '1.0.0',
      port: TEST_PORT,
      host: TEST_HOST,
      enableAuth: true,
    });

    // Server should handle validation error and disable auth
    await server.start();

    const healthResponse = await fetch(
      `http://${TEST_HOST}:${TEST_PORT}/health`
    );
    const healthData = await healthResponse.json();

    // Auth should be disabled due to invalid metadata
    expect(healthData.authEnabled).toBe(false);

    await server.stop();
  }, 10000);
});
