/**
 * MCP Authentication Integration Tests (Fixed version)
 * Testing authentication tools and middleware with direct method calls
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { DrupalMcpServer } from '@/mcp/server.js';
import type { AppConfig } from '@/types/index.js';
import { tmpdir } from 'os';

describe('MCP Authentication Integration Tests', () => {
  let testConfig: AppConfig;
  let mcpServer: DrupalMcpServer;
  let originalHomedir: string | undefined;

  beforeAll(() => {
    originalHomedir = process.env.HOME;
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
        name: 'test-drupal-bridge-mcp',
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
      await fs.rm(join(tmpdir(), '.drupal-bridge-mcp'), {
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
      // Test tool listing directly
      const tools = (mcpServer as any).getTools();

      const authTools = tools.filter((tool: any) =>
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
      // Call the auth tool directly
      const response = await (mcpServer as any).executeAuthTool(
        'auth_status',
        {}
      );

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const result = JSON.parse(response.content[0].text);
      expect(result.isAuthenticated).toBe(false);
      expect(result.needsAuthentication).toBe(true);
    });

    test('should handle auth_logout', async () => {
      // Call the auth tool directly
      const response = await (mcpServer as any).executeAuthTool(
        'auth_logout',
        {}
      );

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Logout successful');
    });
  });

  describe('Authentication Middleware', () => {
    test('should require authentication for protected tools when auth is enabled', async () => {
      // Test with auth enabled config
      const authEnabledConfig = {
        ...testConfig,
        auth: { ...testConfig.auth, enabled: true, skipAuth: false },
      };
      const authServer = new DrupalMcpServer(authEnabledConfig);

      // Call executeToolWithAuth which includes the authentication check
      const response = await (authServer as any).executeToolWithAuth(
        'load_node',
        { nodeId: '1' }
      );

      // Should return an MCP-formatted error response
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const errorResponse = JSON.parse(response.content[0].text);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error.message).toContain('authenticate');

      await authServer.close();
    });

    test('should allow tools when authentication is skipped', async () => {
      const skipAuthConfig = {
        ...testConfig,
        auth: {
          ...testConfig.auth,
          skipAuth: true,
        },
      };

      const skipAuthServer = new DrupalMcpServer(skipAuthConfig);

      // This should not require authentication
      const response = await (skipAuthServer as any).executeTool(
        'test_connection',
        {}
      );

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
      // Mock the OAuth client authorize method
      const mockTokens = {
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      jest
        .spyOn((mcpServer as any).oauthClient, 'authorize')
        .mockResolvedValue(mockTokens);

      const response = await (mcpServer as any).executeAuthTool(
        'auth_login',
        {}
      );

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
    });

    test('should handle authentication failure gracefully', async () => {
      // Mock the OAuth client to throw an error
      jest
        .spyOn((mcpServer as any).oauthClient, 'authorize')
        .mockRejectedValue(new Error('Authentication failed'));

      const response = await (mcpServer as any).executeAuthTool(
        'auth_login',
        {}
      );

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication failed');
    });
  });

  describe('Token Integration with Drupal Client', () => {
    test('should set access token on Drupal client after authentication', async () => {
      const mockTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      jest
        .spyOn((mcpServer as any).oauthClient, 'authorize')
        .mockResolvedValue(mockTokens);

      jest.spyOn((mcpServer as any).drupalClient, 'setAccessToken');

      // First authenticate
      await (mcpServer as any).executeAuthTool('auth_login', {});

      // Verify that the Drupal client received the access token
      expect(
        (mcpServer as any).drupalClient.setAccessToken
      ).toHaveBeenCalledWith('test-access-token');
    });

    test('should clear access token on logout', async () => {
      // Set up initial authentication state
      jest.spyOn((mcpServer as any).drupalClient, 'clearAccessToken');

      await (mcpServer as any).executeAuthTool('auth_logout', {});

      expect(
        (mcpServer as any).drupalClient.clearAccessToken
      ).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should return proper MCP error format for authentication errors', async () => {
      // Test with auth enabled and no authentication
      const authEnabledConfig = {
        ...testConfig,
        auth: { ...testConfig.auth, enabled: true, skipAuth: false },
      };
      const authServer = new DrupalMcpServer(authEnabledConfig);

      const response = await (authServer as any).executeTool('load_node', {
        nodeId: '1',
      });

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');

      const result = JSON.parse(response.content[0].text);
      expect(result.error).toBeDefined();
      expect(result.error.type).toBeDefined();

      await authServer.close();
    });

    test('should handle OAuth flow errors in auth tools', async () => {
      const oauthError = new Error('OAuth flow failed');
      jest
        .spyOn((mcpServer as any).oauthClient, 'authorize')
        .mockRejectedValue(oauthError);

      const response = await (mcpServer as any).executeAuthTool(
        'auth_login',
        {}
      );

      expect(response.content).toBeDefined();
      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth flow failed');
    });
  });

  describe('Cross-Client Compatibility', () => {
    test('should work consistently across different MCP client environments', async () => {
      // Test tool listing
      const tools = (mcpServer as any).getTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);

      // Test auth status
      const authStatusResponse = await (mcpServer as any).executeAuthTool(
        'auth_status',
        {}
      );
      expect(authStatusResponse.content).toBeDefined();
      expect(authStatusResponse.content[0].type).toBe('text');

      const authStatus = JSON.parse(authStatusResponse.content[0].text);
      expect(typeof authStatus.isAuthenticated).toBe('boolean');
      expect(typeof authStatus.needsAuthentication).toBe('boolean');
    });
  });
});
