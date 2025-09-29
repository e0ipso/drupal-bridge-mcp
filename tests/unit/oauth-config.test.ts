/**
 * OAuth Configuration Integration Tests
 *
 * Tests OAuth metadata discovery and configuration validation
 */

import {
  OAuthConfigManager,
  createOAuthConfigFromEnv,
  type OAuthConfig,
} from '../../src/oauth/config.js';

describe('OAuth Configuration Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Configuration from Environment', () => {
    test('should create valid config from environment variables', () => {
      process.env.DRUPAL_URL = 'https://drupal.example.com';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.OAUTH_CLIENT_SECRET = 'test-secret';
      process.env.OAUTH_SCOPES = 'profile read:content';

      const config = createOAuthConfigFromEnv();

      expect(config.drupalUrl).toBe('https://drupal.example.com');
      expect(config.clientId).toBe('test-client');
      expect(config.clientSecret).toBe('test-secret');
      expect(config.scopes).toEqual(['profile', 'read:content']);
    });

    test('should accept DRUPAL_BASE_URL as alternative', () => {
      delete process.env.DRUPAL_URL;
      process.env.DRUPAL_BASE_URL = 'https://drupal-alt.example.com';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.OAUTH_CLIENT_SECRET = 'test-secret';

      const config = createOAuthConfigFromEnv();

      expect(config.drupalUrl).toBe('https://drupal-alt.example.com');
    });

    test('should parse comma-separated scopes', () => {
      process.env.DRUPAL_URL = 'https://drupal.example.com';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.OAUTH_CLIENT_SECRET = 'test-secret';
      process.env.OAUTH_SCOPES = 'profile, read:content, write:content';

      const config = createOAuthConfigFromEnv();

      expect(config.scopes).toEqual([
        'profile',
        'read:content',
        'write:content',
      ]);
    });

    test('should use default profile scope if not specified', () => {
      process.env.DRUPAL_URL = 'https://drupal.example.com';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.OAUTH_CLIENT_SECRET = 'test-secret';
      delete process.env.OAUTH_SCOPES;

      const config = createOAuthConfigFromEnv();

      expect(config.scopes).toEqual(['profile']);
    });

    test('should throw error if DRUPAL_URL is missing', () => {
      delete process.env.DRUPAL_URL;
      delete process.env.DRUPAL_BASE_URL;
      process.env.OAUTH_CLIENT_ID = 'test-client';
      process.env.OAUTH_CLIENT_SECRET = 'test-secret';

      expect(() => createOAuthConfigFromEnv()).toThrow(
        /DRUPAL_URL or DRUPAL_BASE_URL environment variable is required/
      );
    });

    test('should throw error if OAUTH_CLIENT_ID is missing', () => {
      process.env.DRUPAL_URL = 'https://drupal.example.com';
      delete process.env.OAUTH_CLIENT_ID;
      process.env.OAUTH_CLIENT_SECRET = 'test-secret';

      expect(() => createOAuthConfigFromEnv()).toThrow(
        /OAUTH_CLIENT_ID environment variable is required/
      );
    });

    test('should throw error if OAUTH_CLIENT_SECRET is missing', () => {
      process.env.DRUPAL_URL = 'https://drupal.example.com';
      process.env.OAUTH_CLIENT_ID = 'test-client';
      delete process.env.OAUTH_CLIENT_SECRET;

      expect(() => createOAuthConfigFromEnv()).toThrow(
        /OAUTH_CLIENT_SECRET environment variable is required/
      );
    });
  });

  describe('Configuration Validation', () => {
    test('should validate required configuration fields', () => {
      const validConfig: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      expect(() => new OAuthConfigManager(validConfig)).not.toThrow();
    });

    test('should reject invalid URL format', () => {
      const invalidConfig: OAuthConfig = {
        drupalUrl: 'not-a-valid-url',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      expect(() => new OAuthConfigManager(invalidConfig)).toThrow(
        /DRUPAL_URL must be a valid URL/
      );
    });

    test('should reject empty client ID', () => {
      const invalidConfig: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: '',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      expect(() => new OAuthConfigManager(invalidConfig)).toThrow(
        /OAUTH_CLIENT_ID is required/
      );
    });

    test('should reject empty scopes array', () => {
      const invalidConfig: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: [],
      };

      expect(() => new OAuthConfigManager(invalidConfig)).toThrow(
        /OAUTH_SCOPES must be a non-empty array/
      );
    });
  });

  describe('OAuth Discovery Integration', () => {
    test('should build correct discovery URL', () => {
      const config: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      const manager = new OAuthConfigManager(config);
      const discoveryUrl = (manager as any).getDiscoveryUrl();

      expect(discoveryUrl).toBe(
        'https://drupal.example.com/.well-known/oauth-authorization-server'
      );
    });

    test('should fetch and cache metadata', async () => {
      const mockMetadata = {
        issuer: 'https://drupal.example.com',
        authorization_endpoint: 'https://drupal.example.com/oauth/authorize',
        token_endpoint: 'https://drupal.example.com/oauth/token',
        revocation_endpoint: 'https://drupal.example.com/oauth/revoke',
        grant_types_supported: ['authorization_code', 'refresh_token'],
        response_types_supported: ['code'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        scopes_supported: ['profile', 'read:content'],
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });

      const config: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      const manager = new OAuthConfigManager(config);
      const metadata = await manager.fetchMetadata();

      expect(metadata.issuer).toBe('https://drupal.example.com');
      expect(metadata.authorization_endpoint).toBe(
        'https://drupal.example.com/oauth/authorize'
      );
      expect(metadata.token_endpoint).toBe(
        'https://drupal.example.com/oauth/token'
      );
      expect(metadata.code_challenge_methods_supported).toContain('S256');
    });

    test('should use cached metadata on subsequent calls', async () => {
      const mockMetadata = {
        issuer: 'https://drupal.example.com',
        authorization_endpoint: 'https://drupal.example.com/oauth/authorize',
        token_endpoint: 'https://drupal.example.com/oauth/token',
        grant_types_supported: ['authorization_code'],
        response_types_supported: ['code'],
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });
      global.fetch = fetchMock;

      const config: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      const manager = new OAuthConfigManager(config, 60000); // 60 second TTL

      // First call
      await manager.fetchMetadata();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await manager.fetchMetadata();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('should clear and refetch metadata after cache expiration', async () => {
      const mockMetadata = {
        issuer: 'https://drupal.example.com',
        authorization_endpoint: 'https://drupal.example.com/oauth/authorize',
        token_endpoint: 'https://drupal.example.com/oauth/token',
        grant_types_supported: ['authorization_code'],
        response_types_supported: ['code'],
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });
      global.fetch = fetchMock;

      const config: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      const manager = new OAuthConfigManager(config, 10); // 10ms TTL for testing

      // First call
      await manager.fetchMetadata();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 15));

      // Second call should fetch again
      await manager.fetchMetadata();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('should handle discovery endpoint failures', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      const config: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      const manager = new OAuthConfigManager(config);

      await expect(manager.fetchMetadata()).rejects.toThrow(
        /OAuth discovery failed: 404 Not Found/
      );
    });

    test('should handle network errors during discovery', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network connection failed'));

      const config: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      const manager = new OAuthConfigManager(config);

      await expect(manager.fetchMetadata()).rejects.toThrow(
        /Failed to discover OAuth metadata: Network connection failed/
      );
    });
  });

  describe('Cache Management', () => {
    test('should clear cache manually', async () => {
      const mockMetadata = {
        issuer: 'https://drupal.example.com',
        authorization_endpoint: 'https://drupal.example.com/oauth/authorize',
        token_endpoint: 'https://drupal.example.com/oauth/token',
        grant_types_supported: ['authorization_code'],
        response_types_supported: ['code'],
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockMetadata,
      });
      global.fetch = fetchMock;

      const config: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      const manager = new OAuthConfigManager(config);

      // First call
      await manager.fetchMetadata();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Clear cache
      manager.clearCache();

      // Next call should fetch again
      await manager.fetchMetadata();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
