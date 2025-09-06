/**
 * MCP authentication integration tests
 */

import { DrupalMcpServer } from '../../src/mcp/server.js';
import { AppConfig } from '../../src/config/index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { OAuthTokens } from '../../src/auth/oauth-client.js';
import { tmpdir } from 'os';

describe('MCP Authentication Integration Tests', () => {
  let mcpServer: DrupalMcpServer;
  let testConfig: AppConfig;
  let originalHomedir: string;

  beforeAll(() => {
    // Mock homedir for testing
    originalHomedir = process.env.HOME || '';
    process.env.HOME = tmpdir();

    testConfig = {
      drupal: {
        baseUrl: 'http://localhost/drupal',
        endpoint: '/jsonrpc',
        timeout: 10000,
        retries: 3,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
      oauth: {
        clientId: 'test-client-id',
        authorizationEndpoint: 'http://localhost/drupal/oauth/authorize',
        tokenEndpoint: 'http://localhost/drupal/oauth/token',
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['tutorial:read', 'user:profile'],
      },
      auth: {
        enabled: true,
        requiredScopes: ['tutorial:read'],
        skipAuth: false,
      },
      mcp: {
        name: 'test-drupalizeme-mcp-server',
        version: '1.0.0-test',
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: { subscribe: true, listChanged: true },
          tools: { listChanged: true },
          prompts: { listChanged: true },
        },
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      logging: {
        level: 'error' as const,
      },
      environment: 'test' as const,
    };
  });

  afterAll(() => {
    process.env.HOME = originalHomedir;
  });

  beforeEach(async () => {
    mcpServer = new DrupalMcpServer(testConfig);

    // Clean up test tokens before each test
    try {
      const { promises: fs } = await import('fs');
      const { join } = await import('path');
      await fs.rm(join(tmpdir(), '.drupalizeme-mcp'), {
        recursive: true,
        force: true,
      });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  afterEach(async () => {
    await mcpServer.close();
  });

  describe('Authentication Tools', () => {
    test('should list authentication tools', async () => {
      const server = mcpServer.getServer();
      const tools = (await server.request(
        {
          method: 'tools/list',
        },
        {}
      )) as any;

      const authTools = tools.tools.filter((tool: any) =>
        tool.name.startsWith('auth_')
      );

      expect(authTools).toHaveLength(3);
      expect(authTools.some((tool: any) => tool.name === 'auth_login')).toBe(
        true
      );
      expect(authTools.some((tool: any) => tool.name === 'auth_status')).toBe(
        true
      );
      expect(authTools.some((tool: any) => tool.name === 'auth_logout')).toBe(
        true
      );
    });

    test('should handle auth_status without authentication', async () => {
      const server = mcpServer.getServer();

      const response = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'auth_status',
            arguments: {},
          },
        },
        {}
      )) as any;

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const result = JSON.parse(response.content[0].text);
      expect(result.isAuthenticated).toBe(false);
      expect(result.needsAuthentication).toBe(true);
    });

    test('should handle auth_logout', async () => {
      const server = mcpServer.getServer();

      const response = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'auth_logout',
            arguments: {},
          },
        },
        {}
      )) as any;

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Logout successful');
    });
  });

  describe('Authentication Middleware', () => {
    test('should require authentication for protected tools when auth is enabled', async () => {
      const server = mcpServer.getServer();

      const response = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'load_node',
            arguments: { nodeId: '1' },
          },
        },
        {}
      )) as any;

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const result = JSON.parse(response.content[0].text);

      // Should contain authentication error
      expect(result.jsonrpc).toBe('2.0');
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(-32001); // AUTHENTICATION_REQUIRED
    });

    test('should allow tools when authentication is skipped', async () => {
      // Create server with auth disabled
      const skipAuthConfig = {
        ...testConfig,
        auth: {
          ...testConfig.auth,
          skipAuth: true,
        },
      };

      const skipAuthServer = new DrupalMcpServer(skipAuthConfig);
      const server = skipAuthServer.getServer();

      // This should not require authentication
      const response = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'test_connection',
            arguments: {},
          },
        },
        {}
      )) as any;

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const result = JSON.parse(response.content[0].text);

      // Should succeed without authentication error
      expect(result.connected).toBeDefined();
      expect(result.config).toBeDefined();

      await skipAuthServer.close();
    });
  });

  describe('Session Management', () => {
    test('should create session after successful authentication', async () => {
      const server = mcpServer.getServer();

      // Mock OAuth client to simulate successful login
      const mockTokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read user:profile',
      };

      // Spy on OAuth client authorize method
      jest
        .spyOn((mcpServer as any).oauthClient, 'authorize')
        .mockResolvedValue(mockTokens);

      const response = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'auth_login',
            arguments: {},
          },
        },
        {}
      )) as any;

      expect(response.content).toBeDefined();

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.sessionId).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      expect(result.scopes).toEqual(['tutorial:read']);
    });

    test('should handle authentication failure gracefully', async () => {
      const server = mcpServer.getServer();

      // Mock OAuth client to simulate failed login
      jest
        .spyOn((mcpServer as any).oauthClient, 'authorize')
        .mockRejectedValue(new Error('Authentication failed'));

      const response = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'auth_login',
            arguments: {},
          },
        },
        {}
      )) as any;

      expect(response.content).toBeDefined();

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
      expect(result.hint).toContain('complete the OAuth flow');
    });
  });

  describe('Token Integration with Drupal Client', () => {
    test('should set access token on Drupal client after authentication', async () => {
      const server = mcpServer.getServer();

      const mockTokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read user:profile',
      };

      // Mock successful authentication
      jest
        .spyOn((mcpServer as any).oauthClient, 'authorize')
        .mockResolvedValue(mockTokens);
      jest.spyOn((mcpServer as any).drupalClient, 'setAccessToken');

      // First authenticate
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'auth_login',
            arguments: {},
          },
        },
        {}
      );

      // Then try to use a protected tool
      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'test_connection',
            arguments: {},
          },
        },
        {}
      );

      // Verify that access token was set on Drupal client
      expect(
        (mcpServer as any).drupalClient.setAccessToken
      ).toHaveBeenCalledWith(mockTokens.accessToken);
    });

    test('should clear access token on logout', async () => {
      const server = mcpServer.getServer();

      jest.spyOn((mcpServer as any).drupalClient, 'clearAccessToken');

      await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'auth_logout',
            arguments: {},
          },
        },
        {}
      );

      expect(
        (mcpServer as any).drupalClient.clearAccessToken
      ).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should return proper MCP error format for authentication errors', async () => {
      const server = mcpServer.getServer();

      const response = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'search_tutorials',
            arguments: { query: 'test' },
          },
        },
        {}
      )) as any;

      expect(response.content).toBeDefined();

      const result = JSON.parse(response.content[0].text);

      expect(result.jsonrpc).toBe('2.0');
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(-32001); // AUTHENTICATION_REQUIRED
      expect(result.error.message).toContain('authenticate');
      expect(result.error.data).toBeDefined();
      expect(result.error.data.errorCode).toBe('AUTHENTICATION_REQUIRED');
    });

    test('should handle OAuth flow errors in auth tools', async () => {
      const server = mcpServer.getServer();

      // Mock OAuth client to throw specific error
      const oauthError = new Error('Manual authorization code entry required');
      jest
        .spyOn((mcpServer as any).oauthClient, 'authorize')
        .mockRejectedValue(oauthError);

      const response = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'auth_login',
            arguments: {},
          },
        },
        {}
      )) as any;

      expect(response.content).toBeDefined();

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain(
        'Manual authorization code entry required'
      );
    });
  });

  describe('Cross-Client Compatibility', () => {
    test('should work consistently across different MCP client environments', async () => {
      // Simulate different client environments by varying request patterns
      const server = mcpServer.getServer();

      // Test tool listing (common across all clients)
      const toolsResponse = (await server.request(
        {
          method: 'tools/list',
        },
        {}
      )) as any;

      expect(toolsResponse.tools).toBeDefined();
      expect(Array.isArray(toolsResponse.tools)).toBe(true);

      // Test auth status (should work in any environment)
      const statusResponse = (await server.request(
        {
          method: 'tools/call',
          params: {
            name: 'auth_status',
            arguments: {},
          },
        },
        {}
      )) as any;

      expect(statusResponse.content).toBeDefined();
      const statusResult = JSON.parse(statusResponse.content[0].text);
      expect(statusResult.isAuthenticated).toBe(false);
      expect(statusResult.needsAuthentication).toBe(true);
    });
  });
});
