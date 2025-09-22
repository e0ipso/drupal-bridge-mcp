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

      // Check cache stats
      const stats = getDiscoveryCacheStats();
      expect(stats.size).toBe(1);
      expect(stats.entries).toContain('https://example.com');
    });
  });

  describe('fallback logic', () => {
    it('should determine fallback behavior correctly for various failure types', async () => {
      // Test network error fallback
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const networkFailure = await discoverOAuthEndpoints({
        baseUrl: 'https://example.com',
        timeout: 1000,
        retries: 0,
      });
      expect(networkFailure.isFallback).toBe(true);
      expect(networkFailure.authorizationEndpoint).toBe(
        'https://example.com/oauth/authorize'
      );

      clearDiscoveryCache();
      jest.clearAllMocks();

      // Test invalid JSON fallback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: jest.fn().mockReturnValue('application/json'),
        },
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      });
      const jsonFailure = await discoverOAuthEndpoints({
        baseUrl: 'https://example.com',
        retries: 0,
      });
      expect(jsonFailure.isFallback).toBe(true);

      clearDiscoveryCache();
      jest.clearAllMocks();

      // Test missing required fields fallback
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
      const missingFieldsFailure = await discoverOAuthEndpoints({
        baseUrl: 'https://example.com',
        retries: 0,
      });
      expect(missingFieldsFailure.isFallback).toBe(true);
    });
  });

  describe('error handling', () => {
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
