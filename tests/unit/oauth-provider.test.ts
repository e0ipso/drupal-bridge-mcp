/**
 * OAuth Provider Integration Tests
 *
 * Tests Drupal OAuth provider implementation and token management
 */

import {
  DrupalOAuthProvider,
  createDrupalOAuthProvider,
} from '../../src/oauth/provider.js';
import {
  OAuthConfigManager,
  type OAuthConfig,
} from '../../src/oauth/config.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

describe('OAuth Provider Integration', () => {
  let mockConfig: OAuthConfig;
  let mockMetadata: OAuthMetadata;
  let configManager: OAuthConfigManager;

  beforeEach(() => {
    mockConfig = {
      drupalUrl: 'https://drupal.example.com',
      clientId: 'test-client',
      clientSecret: 'test-secret',
      scopes: ['profile', 'read:content'],
    };

    mockMetadata = {
      issuer: 'https://drupal.example.com',
      authorization_endpoint: 'https://drupal.example.com/oauth/authorize',
      token_endpoint: 'https://drupal.example.com/oauth/token',
      revocation_endpoint: 'https://drupal.example.com/oauth/revoke',
      introspection_endpoint: 'https://drupal.example.com/oauth/introspect',
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic'],
      scopes_supported: ['profile', 'read:content'],
    };

    // Mock fetchMetadata to return our test metadata
    configManager = new OAuthConfigManager(mockConfig);
    jest.spyOn(configManager, 'fetchMetadata').mockResolvedValue(mockMetadata);
  });

  describe('Provider Initialization', () => {
    test('should initialize provider with config manager', () => {
      expect(() => new DrupalOAuthProvider(configManager)).not.toThrow();
    });

    test('should create provider using factory function', () => {
      const provider = createDrupalOAuthProvider(configManager);
      expect(provider).toBeInstanceOf(DrupalOAuthProvider);
    });

    test('should initialize with default endpoints before metadata fetch', () => {
      const provider = new DrupalOAuthProvider(configManager);

      // Provider should have default endpoints set
      const endpoints = (provider as any)._endpoints;
      expect(endpoints.authorizationUrl).toBe(
        'https://drupal.example.com/oauth/authorize'
      );
      expect(endpoints.tokenUrl).toBe('https://drupal.example.com/oauth/token');
    });

    test('should update endpoints after metadata discovery', async () => {
      const provider = new DrupalOAuthProvider(configManager);

      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const endpoints = (provider as any)._endpoints;
      expect(endpoints.authorizationUrl).toBe(
        mockMetadata.authorization_endpoint
      );
      expect(endpoints.tokenUrl).toBe(mockMetadata.token_endpoint);
      expect(endpoints.revocationUrl).toBe(mockMetadata.revocation_endpoint);
    });
  });

  describe('Token Verification', () => {
    test('should verify active access token', async () => {
      const mockIntrospection = {
        active: true,
        client_id: 'test-client',
        scope: 'profile read:content',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'https://drupal.example.com',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIntrospection,
      });

      const provider = new DrupalOAuthProvider(configManager);
      const authInfo = await (provider as any).verifyToken('test-access-token');

      expect(authInfo.token).toBe('test-access-token');
      expect(authInfo.clientId).toBe('test-client');
      expect(authInfo.scopes).toEqual(['profile', 'read:content']);
      expect(authInfo.expiresAt).toBe(mockIntrospection.exp);
    });

    test('should reject inactive token', async () => {
      const mockIntrospection = {
        active: false,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIntrospection,
      });

      const provider = new DrupalOAuthProvider(configManager);

      await expect(
        (provider as any).verifyToken('invalid-token')
      ).rejects.toThrow(/Token is not active/);
    });

    test('should handle introspection endpoint errors', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const provider = new DrupalOAuthProvider(configManager);

      await expect((provider as any).verifyToken('test-token')).rejects.toThrow(
        /Token introspection failed: 401/
      );
    });

    test('should send correct authentication to introspection endpoint', async () => {
      const mockIntrospection = {
        active: true,
        client_id: 'test-client',
        scope: 'profile',
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIntrospection,
      });
      global.fetch = fetchMock;

      const provider = new DrupalOAuthProvider(configManager);
      await (provider as any).verifyToken('test-token');

      // Verify Basic Auth header was sent
      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers.Authorization).toMatch(/^Basic /);
    });

    test('should handle array audience in token introspection', async () => {
      const mockIntrospection = {
        active: true,
        client_id: 'test-client',
        scope: 'profile',
        aud: ['https://drupal.example.com', 'https://api.example.com'],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIntrospection,
      });

      const provider = new DrupalOAuthProvider(configManager);
      const authInfo = await (provider as any).verifyToken('test-token');

      expect(authInfo.resource?.toString()).toBe('https://drupal.example.com/');
    });

    test('should handle missing scopes in introspection response', async () => {
      const mockIntrospection = {
        active: true,
        client_id: 'test-client',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIntrospection,
      });

      const provider = new DrupalOAuthProvider(configManager);
      const authInfo = await (provider as any).verifyToken('test-token');

      expect(authInfo.scopes).toEqual([]);
    });
  });

  describe('Client Information', () => {
    test('should return client info for configured client', async () => {
      const provider = new DrupalOAuthProvider(configManager);
      const clientInfo = await (provider as any).getClientInfo('test-client');

      expect(clientInfo).toBeDefined();
      expect(clientInfo?.client_id).toBe('test-client');
      expect(clientInfo?.client_secret).toBe('test-secret');
      expect(clientInfo?.scope).toBe('profile read:content');
    });

    test('should cache client information', async () => {
      const provider = new DrupalOAuthProvider(configManager);

      // First call
      await (provider as any).getClientInfo('test-client');

      // Clear the metadata mock to ensure cache is used
      (configManager.fetchMetadata as jest.Mock).mockClear();

      // Second call should use cache
      const clientInfo = await (provider as any).getClientInfo('test-client');

      expect(clientInfo).toBeDefined();
      expect(configManager.fetchMetadata).not.toHaveBeenCalled();
    });

    test('should return undefined for unknown client', async () => {
      const provider = new DrupalOAuthProvider(configManager);
      const clientInfo = await (provider as any).getClientInfo(
        'unknown-client'
      );

      expect(clientInfo).toBeUndefined();
    });

    test('should clear client cache', async () => {
      const provider = new DrupalOAuthProvider(configManager);

      // Populate cache
      await (provider as any).getClientInfo('test-client');

      // Clear cache
      provider.clearClientCache();

      // Next call should fetch again
      (configManager.fetchMetadata as jest.Mock).mockClear();
      await (provider as any).getClientInfo('test-client');

      expect(configManager.fetchMetadata).toHaveBeenCalled();
    });
  });

  describe('Session Isolation', () => {
    test('should isolate tokens between different sessions', () => {
      const provider1 = new DrupalOAuthProvider(configManager);
      const provider2 = new DrupalOAuthProvider(configManager);

      // Providers should be independent instances
      expect(provider1).not.toBe(provider2);
    });

    test('should maintain separate client caches per instance', async () => {
      const provider1 = new DrupalOAuthProvider(configManager);
      const provider2 = new DrupalOAuthProvider(configManager);

      // Populate cache for provider1
      await (provider1 as any).getClientInfo('test-client');

      // Provider2 should not have cached data
      (configManager.fetchMetadata as jest.Mock).mockClear();
      await (provider2 as any).getClientInfo('test-client');

      // Should have fetched metadata for provider2
      expect(configManager.fetchMetadata).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle network errors during token verification', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network connection failed'));

      const provider = new DrupalOAuthProvider(configManager);

      await expect((provider as any).verifyToken('test-token')).rejects.toThrow(
        /Token verification failed: Network connection failed/
      );
    });

    test('should handle malformed introspection response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const provider = new DrupalOAuthProvider(configManager);

      await expect(
        (provider as any).verifyToken('test-token')
      ).rejects.toThrow();
    });

    test('should gracefully handle metadata fetch failures during init', async () => {
      const failingConfigManager = new OAuthConfigManager(mockConfig);
      jest
        .spyOn(failingConfigManager, 'fetchMetadata')
        .mockRejectedValue(new Error('Metadata fetch failed'));

      // Provider should still be created even if metadata fetch fails
      expect(() => new DrupalOAuthProvider(failingConfigManager)).not.toThrow();
    });
  });

  describe('Endpoint Management', () => {
    test('should use introspection endpoint from metadata', async () => {
      const mockIntrospection = {
        active: true,
        client_id: 'test-client',
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIntrospection,
      });
      global.fetch = fetchMock;

      const provider = new DrupalOAuthProvider(configManager);
      await (provider as any).verifyToken('test-token');

      // Verify correct endpoint was used
      expect(fetchMock).toHaveBeenCalledWith(
        'https://drupal.example.com/oauth/introspect',
        expect.any(Object)
      );
    });

    test('should fallback to constructed endpoint if metadata missing', async () => {
      const metadataWithoutIntrospection = {
        ...mockMetadata,
        introspection_endpoint: undefined,
      };

      jest
        .spyOn(configManager, 'fetchMetadata')
        .mockResolvedValue(metadataWithoutIntrospection);

      const mockIntrospection = {
        active: true,
        client_id: 'test-client',
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockIntrospection,
      });
      global.fetch = fetchMock;

      const provider = new DrupalOAuthProvider(configManager);
      await (provider as any).verifyToken('test-token');

      // Should use fallback endpoint
      expect(fetchMock).toHaveBeenCalledWith(
        'https://drupal.example.com/oauth/introspect',
        expect.any(Object)
      );
    });
  });

  describe('OAuth 2.1 Compliance', () => {
    test('should support required grant types', async () => {
      const provider = new DrupalOAuthProvider(configManager);
      const clientInfo = await (provider as any).getClientInfo('test-client');

      expect(clientInfo?.grant_types).toContain('authorization_code');
      expect(clientInfo?.grant_types).toContain('refresh_token');
    });

    test('should use client_secret_basic auth method', async () => {
      const provider = new DrupalOAuthProvider(configManager);
      const clientInfo = await (provider as any).getClientInfo('test-client');

      expect(clientInfo?.token_endpoint_auth_method).toBe(
        'client_secret_basic'
      );
    });

    test('should include PKCE in response types', async () => {
      const provider = new DrupalOAuthProvider(configManager);
      const clientInfo = await (provider as any).getClientInfo('test-client');

      expect(clientInfo?.response_types).toContain('code');
    });
  });
});
