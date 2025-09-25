/**
 * Authentication Mode Integration Tests
 *
 * Tests authentication behavior for both enabled and disabled modes:
 * - Verifies no OAuth discovery when AUTH_ENABLED=false
 * - Tests server startup in both authentication configurations
 * - Validates authentication tool responses in disabled mode
 * - Tests configuration loading without OAuth validation when disabled
 * - Verifies OAuth provider is conditionally created based on auth setting
 * - Performance benchmarks show startup improvement when auth disabled
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
  beforeAll,
  afterAll,
} from '@jest/globals';
import nock from 'nock';
import { DrupalMcpServer } from '@/mcp/server.js';
import { loadConfig, createOAuthProvider } from '@/config/index.js';
import type { AppConfig } from '@/types/index.js';
import { discoverOAuthEndpoints } from '@/auth/endpoint-discovery.js';
import { tmpdir } from 'os';

describe('Authentication Mode Integration Tests', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalHomedir: string | undefined;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    originalHomedir = process.env.HOME;
    process.env.HOME = tmpdir();
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
    process.env.HOME = originalHomedir;
  });

  beforeEach(() => {
    // Reset environment to clean state for each test
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('AUTH_') || key.startsWith('OAUTH_')) {
        delete process.env[key];
      }
    });

    // Clear all HTTP mocks
    nock.cleanAll();
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any remaining mocks
    nock.cleanAll();
  });

  describe('AUTH_ENABLED=false Mode', () => {
    beforeEach(() => {
      process.env.AUTH_ENABLED = 'false';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';
      process.env.OAUTH_CLIENT_ID = ''; // No client ID required when auth disabled
    });

    test('should skip OAuth discovery during configuration loading', async () => {
      // Set up network interceptor to detect any OAuth discovery attempts
      const discoveryScope = nock('http://localhost')
        .get('/drupal/.well-known/oauth-authorization-server')
        .reply(200, {
          issuer: 'http://localhost/drupal',
          authorization_endpoint: 'http://localhost/drupal/oauth/authorize',
          token_endpoint: 'http://localhost/drupal/oauth/token',
        });

      const config = await loadConfig();

      // Verify OAuth discovery was NOT called
      expect(discoveryScope.isDone()).toBe(false);

      // Verify config reflects disabled authentication
      expect(config.auth.enabled).toBe(false);
      expect(config.oauth.discoveredEndpoints).toBeUndefined();

      nock.cleanAll();
    });

    test('should create null OAuth provider', async () => {
      const config = await loadConfig();
      const provider = createOAuthProvider(config);

      expect(provider).toBeNull();
    });

    test('should return helpful messages for auth tools', async () => {
      const config = await loadConfig();
      const server = new DrupalMcpServer(config);

      try {
        // Test auth_login
        const loginResponse = await (server as any).executeAuthTool(
          'auth_login',
          {}
        );
        expect(loginResponse.content).toBeDefined();
        expect(loginResponse.content[0].type).toBe('text');

        const loginResult = JSON.parse(loginResponse.content[0].text);
        expect(loginResult.success).toBe(true);
        expect(loginResult.authenticationDisabled).toBe(true);
        expect(loginResult.serverMode).toBe('non-authenticated');
        expect(loginResult.message).toContain('Authentication is disabled');
        expect(loginResult.message).toContain('No login required');
        expect(loginResult.availableTools).toContain('search_tutorials');

        // Test auth_status
        const statusResponse = await (server as any).executeAuthTool(
          'auth_status',
          {}
        );
        expect(statusResponse.content).toBeDefined();
        expect(statusResponse.content[0].type).toBe('text');

        const statusResult = JSON.parse(statusResponse.content[0].text);
        expect(statusResult.success).toBe(true);
        expect(statusResult.authenticationDisabled).toBe(true);
        expect(statusResult.serverMode).toBe('non-authenticated');
        expect(statusResult.message).toContain(
          'Authentication status: DISABLED'
        );

        // Test auth_logout
        const logoutResponse = await (server as any).executeAuthTool(
          'auth_logout',
          {}
        );
        expect(logoutResponse.content).toBeDefined();
        expect(logoutResponse.content[0].type).toBe('text');

        const logoutResult = JSON.parse(logoutResponse.content[0].text);
        expect(logoutResult.success).toBe(true);
        expect(logoutResult.authenticationDisabled).toBe(true);
        expect(logoutResult.serverMode).toBe('non-authenticated');
        expect(logoutResult.message).toContain('Authentication is disabled');
        expect(logoutResult.message).toContain('No logout action is needed');
      } finally {
        await server.close();
      }
    });

    test('should start server successfully without OAuth config', async () => {
      // Remove OAuth configuration entirely
      delete process.env.OAUTH_CLIENT_ID;

      const config = await loadConfig();
      const server = new DrupalMcpServer(config);

      try {
        // Verify server initialized successfully
        expect(server).toBeInstanceOf(DrupalMcpServer);

        // Verify tools are available
        const tools = (server as any).getTools();
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);

        // Verify auth tools are still present but return disabled responses
        const authTools = tools.filter((tool: any) =>
          tool.name.startsWith('auth_')
        );
        expect(authTools).toHaveLength(3);

        // Verify data tools work without authentication
        const testConnectionResponse = await (server as any).executeTool(
          'test_connection',
          {}
        );
        expect(testConnectionResponse.content).toBeDefined();
      } finally {
        await server.close();
      }
    });

    test('should allow invalid OAuth config without failing', async () => {
      // Set invalid OAuth configuration
      process.env.OAUTH_CLIENT_ID = 'invalid-client';
      process.env.OAUTH_AUTHORIZATION_ENDPOINT = 'invalid-url';
      process.env.OAUTH_TOKEN_ENDPOINT = 'invalid-url';

      // Should not throw error because auth is disabled
      const config = await loadConfig();
      expect(config.auth.enabled).toBe(false);

      const server = new DrupalMcpServer(config);
      try {
        expect(server).toBeInstanceOf(DrupalMcpServer);
      } finally {
        await server.close();
      }
    });

    test('should work without OAUTH_CLIENT_ID when auth disabled', async () => {
      // Explicitly remove OAuth client ID
      delete process.env.OAUTH_CLIENT_ID;

      const config = await loadConfig();
      expect(config.auth.enabled).toBe(false);
      expect(config.oauth.clientId).toBe('');

      const server = new DrupalMcpServer(config);
      try {
        expect(server).toBeInstanceOf(DrupalMcpServer);
      } finally {
        await server.close();
      }
    });
  });

  describe('AUTH_ENABLED=true Mode', () => {
    beforeEach(() => {
      process.env.AUTH_ENABLED = 'true';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';
      process.env.OAUTH_CLIENT_ID = 'test-client-id';
    });

    test('should maintain existing OAuth behavior with discovery', async () => {
      // Mock OAuth discovery endpoint
      nock('http://localhost')
        .get('/drupal/.well-known/oauth-authorization-server')
        .reply(200, {
          issuer: 'http://localhost/drupal',
          authorization_endpoint: 'http://localhost/drupal/oauth/authorize',
          token_endpoint: 'http://localhost/drupal/oauth/token',
          scopes_supported: ['tutorial:read', 'user:profile'],
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
        });

      const config = await loadConfig();

      expect(config.auth.enabled).toBe(true);
      expect(config.oauth.discoveredEndpoints).toBeDefined();
      expect(config.oauth.authorizationEndpoint).toBe(
        'http://localhost/drupal/oauth/authorize'
      );
      expect(config.oauth.tokenEndpoint).toBe(
        'http://localhost/drupal/oauth/token'
      );

      const provider = createOAuthProvider(config);
      expect(provider).not.toBeNull();
    });

    test('should require OAUTH_CLIENT_ID when auth enabled', async () => {
      delete process.env.OAUTH_CLIENT_ID;

      await expect(loadConfig()).rejects.toThrow(
        'OAUTH_CLIENT_ID is required when authentication is enabled'
      );
    });

    test('should fail configuration loading when OAuth discovery fails', async () => {
      // Clear any existing discovery cache first
      const { clearDiscoveryCache } = await import(
        '@/auth/endpoint-discovery.js'
      );
      clearDiscoveryCache();

      // Mock failed OAuth discovery
      nock('http://localhost')
        .get('/drupal/.well-known/oauth-authorization-server')
        .reply(404, 'Not Found');

      await expect(loadConfig()).rejects.toThrow();
    });

    test('should work with static OAuth endpoint configuration', async () => {
      // Provide static OAuth endpoints
      process.env.OAUTH_AUTHORIZATION_ENDPOINT =
        'http://localhost/drupal/oauth/authorize';
      process.env.OAUTH_TOKEN_ENDPOINT = 'http://localhost/drupal/oauth/token';

      const config = await loadConfig();

      expect(config.auth.enabled).toBe(true);
      expect(config.oauth.authorizationEndpoint).toBe(
        'http://localhost/drupal/oauth/authorize'
      );
      expect(config.oauth.tokenEndpoint).toBe(
        'http://localhost/drupal/oauth/token'
      );
      expect(config.oauth.discoveredEndpoints).toBeUndefined();

      const provider = createOAuthProvider(config);
      expect(provider).not.toBeNull();
    });
  });

  describe('Network Call Verification', () => {
    test('should verify no OAuth network calls when AUTH_ENABLED=false', async () => {
      process.env.AUTH_ENABLED = 'false';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

      // Set up comprehensive network monitoring
      const interceptor = nock('http://localhost')
        .persist()
        .get(/.*/)
        .reply(200, {});

      const config = await loadConfig();
      const server = new DrupalMcpServer(config);

      try {
        // Verify no network calls were made
        expect(interceptor.isDone()).toBe(false);

        // Verify no pending interceptors (indicating no network activity)
        const pendingMocks = nock.pendingMocks();
        expect(pendingMocks.length).toBeGreaterThan(0); // Interceptor is still pending (unused)
      } finally {
        await server.close();
        nock.cleanAll();
      }
    });

    test('should capture and verify OAuth discovery network calls when enabled', async () => {
      // Clear discovery cache to ensure fresh discovery
      const { clearDiscoveryCache } = await import(
        '@/auth/endpoint-discovery.js'
      );
      clearDiscoveryCache();

      process.env.AUTH_ENABLED = 'true';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

      const scope = nock('http://localhost')
        .get('/drupal/.well-known/oauth-authorization-server')
        .reply(200, {
          issuer: 'http://localhost/drupal',
          authorization_endpoint: 'http://localhost/drupal/oauth/authorize',
          token_endpoint: 'http://localhost/drupal/oauth/token',
        });

      const config = await loadConfig();

      // Verify the discovery call was made
      expect(scope.isDone()).toBe(true);

      // Verify config has discovered endpoints
      expect(config.oauth.discoveredEndpoints).toBeDefined();
      expect(config.oauth.authorizationEndpoint).toBe(
        'http://localhost/drupal/oauth/authorize'
      );
    });
  });

  describe('Performance Benchmarks', () => {
    test('should show startup time improvement when auth is disabled', async () => {
      // Clear discovery cache for clean test
      const { clearDiscoveryCache } = await import(
        '@/auth/endpoint-discovery.js'
      );
      clearDiscoveryCache();

      // Benchmark with auth enabled first
      process.env.AUTH_ENABLED = 'true';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

      // Mock OAuth discovery with delay
      const authEnabledScope = nock('http://localhost')
        .get('/drupal/.well-known/oauth-authorization-server')
        .delay(50) // Add 50ms delay to simulate network
        .reply(200, {
          issuer: 'http://localhost/drupal',
          authorization_endpoint: 'http://localhost/drupal/oauth/authorize',
          token_endpoint: 'http://localhost/drupal/oauth/token',
        });

      const authEnabledStart = Date.now();
      const authEnabledConfig = await loadConfig();
      const authEnabledConfigTime = Date.now() - authEnabledStart;

      // Verify the discovery call was made
      expect(authEnabledScope.isDone()).toBe(true);

      // Clean up for auth disabled test
      nock.cleanAll();
      clearDiscoveryCache();

      // Reset environment for auth disabled test
      process.env.AUTH_ENABLED = 'false';
      delete process.env.OAUTH_CLIENT_ID;

      const authDisabledStart = Date.now();
      const authDisabledConfig = await loadConfig();
      const authDisabledConfigTime = Date.now() - authDisabledStart;

      // Verify disabled mode is faster (should not have network delay)
      expect(authDisabledConfigTime).toBeLessThan(authEnabledConfigTime);

      // Log performance results for analysis
      console.log(`Auth enabled config time: ${authEnabledConfigTime}ms`);
      console.log(`Auth disabled config time: ${authDisabledConfigTime}ms`);
      console.log(
        `Config improvement: ${authEnabledConfigTime - authDisabledConfigTime}ms`
      );

      // Verify configs are correct
      expect(authEnabledConfig.auth.enabled).toBe(true);
      expect(authDisabledConfig.auth.enabled).toBe(false);
    });

    test('should measure configuration loading performance difference', async () => {
      const { clearDiscoveryCache } = await import(
        '@/auth/endpoint-discovery.js'
      );
      const iterations = 3; // Reduced for faster test execution

      // Benchmark auth enabled (with mocked network delay)
      process.env.AUTH_ENABLED = 'true';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

      nock('http://localhost')
        .persist()
        .get('/drupal/.well-known/oauth-authorization-server')
        .delay(30)
        .reply(200, {
          issuer: 'http://localhost/drupal',
          authorization_endpoint: 'http://localhost/drupal/oauth/authorize',
          token_endpoint: 'http://localhost/drupal/oauth/token',
        });

      const authEnabledTimes: number[] = [];
      for (let i = 0; i < iterations; i++) {
        clearDiscoveryCache(); // Clear cache between iterations
        const start = Date.now();
        await loadConfig();
        authEnabledTimes.push(Date.now() - start);
      }

      nock.cleanAll();

      // Benchmark auth disabled
      process.env.AUTH_ENABLED = 'false';
      delete process.env.OAUTH_CLIENT_ID;

      const authDisabledTimes: number[] = [];
      for (let i = 0; i < iterations; i++) {
        clearDiscoveryCache(); // Clear cache between iterations
        const start = Date.now();
        await loadConfig();
        authDisabledTimes.push(Date.now() - start);
      }

      const avgAuthEnabled =
        authEnabledTimes.reduce((a, b) => a + b, 0) / iterations;
      const avgAuthDisabled =
        authDisabledTimes.reduce((a, b) => a + b, 0) / iterations;

      expect(avgAuthDisabled).toBeLessThan(avgAuthEnabled);

      console.log(`Average auth enabled: ${avgAuthEnabled.toFixed(2)}ms`);
      console.log(`Average auth disabled: ${avgAuthDisabled.toFixed(2)}ms`);
      console.log(
        `Average improvement: ${(avgAuthEnabled - avgAuthDisabled).toFixed(2)}ms`
      );
    });
  });

  describe('Configuration Edge Cases', () => {
    test('should handle AUTH_ENABLED=false in production environment', async () => {
      const originalNodeEnv = process.env.NODE_ENV;

      try {
        process.env.NODE_ENV = 'production';
        process.env.AUTH_ENABLED = 'false';
        process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

        const config = await loadConfig();
        expect(config.auth.enabled).toBe(false);
        expect(config.environment).toBe('production');

        const server = new DrupalMcpServer(config);
        try {
          expect(server).toBeInstanceOf(DrupalMcpServer);
        } finally {
          await server.close();
        }
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('Integration Points', () => {
    test('should verify MCP tool registration works in both configurations', async () => {
      // Test with auth disabled first
      process.env.AUTH_ENABLED = 'false';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

      const disabledConfig = await loadConfig();
      const disabledServer = new DrupalMcpServer(disabledConfig);

      let disabledTools: any[];
      try {
        disabledTools = (disabledServer as any).getTools();
        expect(Array.isArray(disabledTools)).toBe(true);
        expect(disabledTools.length).toBeGreaterThan(0);

        // Verify auth tools are present
        const authTools = disabledTools.filter((tool: any) =>
          tool.name.startsWith('auth_')
        );
        expect(authTools).toHaveLength(3);

        // Verify data tools are present
        const dataTools = disabledTools.filter(
          (tool: any) => !tool.name.startsWith('auth_')
        );
        expect(dataTools.length).toBeGreaterThan(0);
      } finally {
        await disabledServer.close();
      }

      // Test with auth enabled
      process.env.AUTH_ENABLED = 'true';
      process.env.OAUTH_CLIENT_ID = 'test-client';

      nock('http://localhost')
        .get('/drupal/.well-known/oauth-authorization-server')
        .reply(200, {
          issuer: 'http://localhost/drupal',
          authorization_endpoint: 'http://localhost/drupal/oauth/authorize',
          token_endpoint: 'http://localhost/drupal/oauth/token',
        });

      const enabledConfig = await loadConfig();
      const enabledServer = new DrupalMcpServer(enabledConfig);

      try {
        const enabledTools = (enabledServer as any).getTools();
        expect(Array.isArray(enabledTools)).toBe(true);

        // Should have same number of tools
        expect(enabledTools.length).toEqual(disabledTools.length);

        // Both should have auth tools
        const enabledAuthTools = enabledTools.filter((tool: any) =>
          tool.name.startsWith('auth_')
        );
        expect(enabledAuthTools).toHaveLength(3);
      } finally {
        await enabledServer.close();
      }
    });

    test('should verify data tools work normally regardless of auth mode', async () => {
      // Test with auth disabled
      process.env.AUTH_ENABLED = 'false';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

      const config = await loadConfig();
      const server = new DrupalMcpServer(config);

      try {
        // Test that test_connection tool works
        const response = await (server as any).executeTool(
          'test_connection',
          {}
        );
        expect(response.content).toBeDefined();
        expect(response.content[0].type).toBe('text');

        const result = JSON.parse(response.content[0].text);
        expect(result.connected).toBeDefined();
        expect(result.config).toBeDefined();
      } finally {
        await server.close();
      }
    });

    test('should verify no auth-related errors in logs when auth is disabled', async () => {
      process.env.AUTH_ENABLED = 'false';
      process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

      // Capture console output
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const config = await loadConfig();
      const server = new DrupalMcpServer(config);

      try {
        // Execute various operations
        await (server as any).executeAuthTool('auth_status', {});
        await (server as any).executeTool('test_connection', {});

        // Verify no auth-related errors
        const errorCalls = errorSpy.mock.calls.filter(call =>
          call.some(
            arg =>
              typeof arg === 'string' &&
              (arg.includes('auth') ||
                arg.includes('oauth') ||
                arg.includes('OAuth'))
          )
        );
        expect(errorCalls).toHaveLength(0);
      } finally {
        await server.close();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
      }
    });
  });
});
