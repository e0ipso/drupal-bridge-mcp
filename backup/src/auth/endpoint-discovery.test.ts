/**
 * Test suite for OAuth 2.1 endpoint discovery
 */

/**
 * @jest-environment node
 */
import {
  discoverOAuthEndpoints,
  clearDiscoveryCache,
} from './endpoint-discovery.js';
import { DiscoveryError, DiscoveryErrorType } from './types.js';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('OAuth Endpoint Discovery', () => {
  beforeEach(() => {
    clearDiscoveryCache();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('discovery logic', () => {
    it('should parse and validate OAuth metadata correctly', async () => {
      const mockMetadata = {
        issuer: 'https://example.com',
        authorization_endpoint: 'https://example.com/oauth/authorize',
        token_endpoint: 'https://example.com/oauth/token',
        jwks_uri: 'https://example.com/.well-known/jwks.json',
        scopes_supported: ['read', 'write'],
        code_challenge_methods_supported: ['S256'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn().mockResolvedValue(mockMetadata),
      });

      const config = {
        baseUrl: 'https://example.com',
        timeout: 5000,
        debug: true,
      };

      const endpoints = await discoverOAuthEndpoints(config);

      expect(endpoints).toEqual({
        authorizationEndpoint: 'https://example.com/oauth/authorize',
        tokenEndpoint: 'https://example.com/oauth/token',
        issuer: 'https://example.com',
        discoveredAt: expect.any(Date),
        metadata: mockMetadata,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/.well-known/oauth-authorization-server',
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: {
            Accept: 'application/json',
            'User-Agent': 'Drupal-MCP-Bridge/1.0.0',
          },
        })
      );
    });

    it('should cache discovered endpoints with proper TTL handling', async () => {
      const mockMetadata = {
        issuer: 'https://example.com',
        authorization_endpoint: 'https://example.com/oauth/authorize',
        token_endpoint: 'https://example.com/oauth/token',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn().mockResolvedValue(mockMetadata),
      });

      const config = {
        baseUrl: 'https://example.com',
        cacheTtl: 60000, // 1 minute
      };

      // First call should fetch
      await discoverOAuthEndpoints(config);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await discoverOAuthEndpoints(config);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify caching is working - no additional fetch calls were made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should throw DiscoveryError for network failures', async () => {
      // Test network error - should throw, not fallback
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        discoverOAuthEndpoints({
          baseUrl: 'https://example.com',
          timeout: 1000,
          retries: 0,
        })
      ).rejects.toThrow(DiscoveryError);

      await expect(
        discoverOAuthEndpoints({
          baseUrl: 'https://example.com',
          timeout: 1000,
          retries: 0,
        })
      ).rejects.toThrow(
        expect.objectContaining({
          type: DiscoveryErrorType.DISCOVERY_FAILED,
        })
      );
    });

    it('should throw DiscoveryError for invalid JSON responses', async () => {
      // Test invalid JSON - should throw, not fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await expect(
        discoverOAuthEndpoints({
          baseUrl: 'https://example.com',
          retries: 0,
        })
      ).rejects.toThrow(DiscoveryError);
    });

    it('should throw DiscoveryError for missing required fields', async () => {
      // Test missing required fields - should throw, not fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn().mockResolvedValue({
          issuer: 'https://example.com',
          // Missing authorization_endpoint and token_endpoint
        }),
      });

      await expect(
        discoverOAuthEndpoints({
          baseUrl: 'https://example.com',
          retries: 0,
        })
      ).rejects.toThrow(DiscoveryError);
    });

    it('should throw DiscoveryError for HTTPS requirement in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const config = {
          baseUrl: 'http://example.com',
          validateHttps: true,
        };

        await expect(discoverOAuthEndpoints(config)).rejects.toThrow(
          DiscoveryError
        );
        await expect(discoverOAuthEndpoints(config)).rejects.toThrow(
          expect.objectContaining({
            type: DiscoveryErrorType.HTTPS_REQUIRED,
          })
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
