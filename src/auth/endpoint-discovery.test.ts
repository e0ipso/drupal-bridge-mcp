/**
 * Test suite for OAuth 2.1 endpoint discovery
 */

/**
 * @jest-environment node
 */
import {
  discoverOAuthEndpoints,
  clearDiscoveryCache,
  getDiscoveryCacheStats,
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

  describe('successful discovery', () => {
    it('should discover OAuth endpoints from .well-known metadata', async () => {
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
        isFallback: false,
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

    it('should cache discovered endpoints', async () => {
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

      // Check cache stats
      const stats = getDiscoveryCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toContain('https://example.com');
    });
  });

  describe('fallback behavior', () => {
    it('should return fallback endpoints when discovery fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const config = {
        baseUrl: 'https://example.com',
        timeout: 1000,
        retries: 1,
      };

      const endpoints = await discoverOAuthEndpoints(config);

      expect(endpoints).toEqual({
        authorizationEndpoint: 'https://example.com/oauth/authorize',
        tokenEndpoint: 'https://example.com/oauth/token',
        issuer: 'https://example.com',
        discoveredAt: expect.any(Date),
        isFallback: true,
      });
    });

    it('should return fallback endpoints for invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      const config = {
        baseUrl: 'https://example.com',
        retries: 0,
      };

      const endpoints = await discoverOAuthEndpoints(config);
      expect(endpoints.isFallback).toBe(true);
    });

    it('should return fallback endpoints for missing required fields', async () => {
      const mockMetadata = {
        issuer: 'https://example.com',
        // Missing authorization_endpoint and token_endpoint
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
        retries: 0,
      };

      const endpoints = await discoverOAuthEndpoints(config);
      expect(endpoints.isFallback).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw DiscoveryError for invalid base URL', async () => {
      const config = {
        baseUrl: 'invalid-url',
      };

      await expect(discoverOAuthEndpoints(config)).rejects.toThrow(
        DiscoveryError
      );
      await expect(discoverOAuthEndpoints(config)).rejects.toThrow(
        expect.objectContaining({
          type: DiscoveryErrorType.INVALID_URL,
        })
      );
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

    it('should handle timeout errors', async () => {
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 100)
          )
      );

      const config = {
        baseUrl: 'https://example.com',
        timeout: 50, // Very short timeout
        retries: 0,
      };

      const endpoints = await discoverOAuthEndpoints(config);
      expect(endpoints.isFallback).toBe(true);
    });
  });

  describe('URL handling', () => {
    it('should handle base URLs with trailing slashes', async () => {
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
        baseUrl: 'https://example.com/', // Trailing slash
      };

      await discoverOAuthEndpoints(config);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/.well-known/oauth-authorization-server',
        expect.any(Object)
      );
    });

    it('should handle base URLs without trailing slashes', async () => {
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
        baseUrl: 'https://example.com', // No trailing slash
      };

      await discoverOAuthEndpoints(config);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/.well-known/oauth-authorization-server',
        expect.any(Object)
      );
    });
  });
});
