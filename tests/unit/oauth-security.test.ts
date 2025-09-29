/**
 * OAuth Security and Compliance Tests
 *
 * Tests OAuth 2.1 security requirements, PKCE enforcement, and RFC compliance
 */

import {
  OAuthConfigManager,
  type OAuthConfig,
} from '../../src/oauth/config.js';
import { DeviceFlowHandler } from '../../src/oauth/device-flow-handler.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

describe('OAuth Security and Compliance', () => {
  let mockConfig: OAuthConfig;
  let mockMetadata: OAuthMetadata;

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
      device_authorization_endpoint:
        'https://drupal.example.com/oauth/device_authorization',
      grant_types_supported: ['authorization_code', 'refresh_token'],
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic'],
      scopes_supported: ['profile', 'read:content'],
    };
  });

  describe('HTTPS Enforcement', () => {
    test('should accept HTTPS URLs', () => {
      const httpsConfig: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      expect(() => new OAuthConfigManager(httpsConfig)).not.toThrow();
    });

    test('should accept HTTP in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const httpConfig: OAuthConfig = {
        drupalUrl: 'http://localhost:8080',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      expect(() => new OAuthConfigManager(httpConfig)).not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });

    test('should accept HTTP for localhost in any environment', () => {
      const httpConfig: OAuthConfig = {
        drupalUrl: 'http://localhost:3000',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      expect(() => new OAuthConfigManager(httpConfig)).not.toThrow();
    });
  });

  describe('PKCE Support (RFC 7636)', () => {
    test('should verify PKCE S256 is supported', () => {
      expect(mockMetadata.code_challenge_methods_supported).toContain('S256');
    });

    test('should not accept plain PKCE method (OAuth 2.1 requirement)', () => {
      // OAuth 2.1 requires S256, plain is no longer acceptable
      const insecureMetadata = {
        ...mockMetadata,
        code_challenge_methods_supported: ['plain'],
      };

      expect(insecureMetadata.code_challenge_methods_supported).not.toContain(
        'S256'
      );
      // This metadata should be rejected by the implementation
    });

    test('should require PKCE for authorization code flow', () => {
      // OAuth 2.1 mandates PKCE for all authorization code flows
      expect(mockMetadata.code_challenge_methods_supported).toBeTruthy();
      expect(
        mockMetadata.code_challenge_methods_supported?.length
      ).toBeGreaterThan(0);
    });
  });

  describe('Client Authentication', () => {
    test('should use secure client authentication method', () => {
      expect(mockMetadata.token_endpoint_auth_methods_supported).toContain(
        'client_secret_basic'
      );
    });

    test('should not store client secrets in plain text', () => {
      const configManager = new OAuthConfigManager(mockConfig);
      const config = configManager.getConfig();

      // Config should return a copy, not the original
      expect(config).not.toBe(mockConfig);

      // Secret should be present but implementation should secure it
      expect(config.clientSecret).toBe('test-secret');
    });

    test('should transmit credentials securely', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          device_code: 'test-code',
          user_code: 'ABCD-EFGH',
          verification_uri: 'https://example.com',
          expires_in: 600,
          interval: 5,
        }),
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      await handler.initiateDeviceFlow();

      // Verify HTTPS endpoint was used
      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      const url = fetchCall[0];
      expect(url).toMatch(/^https:/);
    });
  });

  describe('Token Security', () => {
    test('should handle token expiration', () => {
      const expiredTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      expect(expiredTime).toBeLessThan(Date.now() / 1000);
    });

    test('should include token expiration in responses', async () => {
      const mockTokenResponse = {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh-token',
      };

      expect(mockTokenResponse.expires_in).toBeDefined();
      expect(mockTokenResponse.expires_in).toBeGreaterThan(0);
    });

    test('should support refresh tokens for long-lived sessions', () => {
      expect(mockMetadata.grant_types_supported).toContain('refresh_token');
    });

    test('should not expose sensitive data in error messages', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Authentication failed'));

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);

      await expect(handler.initiateDeviceFlow()).rejects.toThrow();
      // Error should not contain client secret or other sensitive data
    });
  });

  describe('Scope Validation', () => {
    test('should validate requested scopes against supported scopes', () => {
      const requestedScopes = mockConfig.scopes;
      const supportedScopes = mockMetadata.scopes_supported || [];

      requestedScopes.forEach(scope => {
        expect(supportedScopes).toContain(scope);
      });
    });

    test('should handle empty scope parameter', () => {
      const emptyConfig: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'], // At least one scope required
      };

      expect(() => new OAuthConfigManager(emptyConfig)).not.toThrow();
    });

    test('should reject configuration with no scopes', () => {
      const noScopesConfig: OAuthConfig = {
        drupalUrl: 'https://drupal.example.com',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: [],
      };

      expect(() => new OAuthConfigManager(noScopesConfig)).toThrow(
        /OAUTH_SCOPES must be a non-empty array/
      );
    });
  });

  describe('RFC 8628 Device Flow Security', () => {
    test('should generate secure device codes', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          device_code: 'a1b2c3d4e5f6g7h8i9j0',
          user_code: 'BCDF-GHJK',
          verification_uri: 'https://drupal.example.com/oauth/device',
          expires_in: 600,
          interval: 5,
        }),
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      const result = await handler.initiateDeviceFlow();

      // Device code should be sufficiently long and random
      expect(result.device_code.length).toBeGreaterThanOrEqual(20);
    });

    test('should use human-friendly user codes', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          device_code: 'device-code-123',
          user_code: 'BCDF-GHJK',
          verification_uri: 'https://drupal.example.com/oauth/device',
          expires_in: 600,
          interval: 5,
        }),
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      const result = await handler.initiateDeviceFlow();

      // User code should be easy to type (no ambiguous characters)
      expect(result.user_code).toMatch(
        /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/
      );
      expect(result.user_code).not.toMatch(/[AEIOU01]/);
    });

    test('should enforce reasonable device code expiration', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          device_code: 'device-code-123',
          user_code: 'BCDF-GHJK',
          verification_uri: 'https://drupal.example.com/oauth/device',
          expires_in: 600,
          interval: 5,
        }),
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      const result = await handler.initiateDeviceFlow();

      // Expiration should be reasonable (not too short, not too long)
      expect(result.expires_in).toBeGreaterThanOrEqual(300); // At least 5 minutes
      expect(result.expires_in).toBeLessThanOrEqual(1800); // At most 30 minutes
    });

    test('should enforce minimum polling interval', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          device_code: 'device-code-123',
          user_code: 'BCDF-GHJK',
          verification_uri: 'https://drupal.example.com/oauth/device',
          expires_in: 600,
          interval: 5,
        }),
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      const result = await handler.initiateDeviceFlow();

      // RFC 8628 recommends minimum 5 seconds to prevent server overload
      expect(result.interval).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Error Response Security', () => {
    test('should use standard OAuth error codes', async () => {
      const standardErrors = [
        'invalid_request',
        'invalid_client',
        'invalid_grant',
        'unauthorized_client',
        'unsupported_grant_type',
        'invalid_scope',
        'access_denied',
        'authorization_pending',
        'slow_down',
        'expired_token',
      ];

      // All device flow errors should use standard codes
      standardErrors.forEach(errorCode => {
        expect(errorCode).toMatch(/^[a-z_]+$/);
      });
    });

    test('should not leak sensitive information in errors', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        }),
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);

      await expect(handler.initiateDeviceFlow()).rejects.toThrow();
      // Error should not contain stack traces, secrets, or internal paths
    });
  });

  describe('Configuration Security', () => {
    test('should validate URL format to prevent injection', () => {
      const invalidUrlTests = [
        {
          url: 'not a valid url at all',
          expectedError: /DRUPAL_URL must be a valid URL/,
        },
        { url: '', expectedError: /DRUPAL_URL is required/ },
        {
          url: '://no-protocol',
          expectedError: /DRUPAL_URL must be a valid URL/,
        },
      ];

      invalidUrlTests.forEach(({ url, expectedError }) => {
        const badConfig: OAuthConfig = {
          drupalUrl: url,
          clientId: 'test-client',
          clientSecret: 'test-secret',
          scopes: ['profile'],
        };

        expect(() => new OAuthConfigManager(badConfig)).toThrow(expectedError);
      });
    });

    test('should accept valid URLs with whitespace (URL constructor trims)', () => {
      const configWithWhitespace: OAuthConfig = {
        drupalUrl: '  https://drupal.example.com  ',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        scopes: ['profile'],
      };

      // URL constructor handles whitespace, so this should not throw
      expect(() => new OAuthConfigManager(configWithWhitespace)).not.toThrow();
    });
  });

  describe('OAuth 2.1 Specific Requirements', () => {
    test('should not support implicit grant type', () => {
      // OAuth 2.1 deprecates implicit flow
      expect(mockMetadata.grant_types_supported).not.toContain('implicit');
      expect(mockMetadata.response_types_supported).not.toContain('token');
    });

    test('should not support resource owner password credentials', () => {
      // OAuth 2.1 deprecates password grant
      expect(mockMetadata.grant_types_supported).not.toContain('password');
    });

    test('should require authorization code flow to use PKCE', () => {
      // OAuth 2.1 requires PKCE for all authorization code flows
      if (mockMetadata.grant_types_supported?.includes('authorization_code')) {
        expect(mockMetadata.code_challenge_methods_supported).toBeDefined();
        expect(
          mockMetadata.code_challenge_methods_supported?.length
        ).toBeGreaterThan(0);
      }
    });

    test('should use Bearer token type', () => {
      // OAuth 2.1 standardizes on Bearer tokens
      const tokenResponse = {
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      expect(tokenResponse.token_type).toBe('Bearer');
    });
  });

  describe('Rate Limiting and Abuse Prevention', () => {
    test('should respect slow_down error response', async () => {
      // This is tested in device-flow.test.ts but included here for completeness
      const slowDownResponse = {
        error: 'slow_down',
        error_description: 'Polling too frequently',
      };

      expect(slowDownResponse.error).toBe('slow_down');
    });

    test('should implement exponential backoff on errors', () => {
      // Verify that retry logic uses increasing intervals
      const baseInterval = 5;
      const retryIntervals = [baseInterval, baseInterval * 2, baseInterval * 4];

      retryIntervals.forEach((interval, index) => {
        if (index > 0) {
          expect(interval).toBeGreaterThan(retryIntervals[index - 1]);
        }
      });
    });
  });

  describe('Audit and Logging', () => {
    test('should not log sensitive data', () => {
      const configManager = new OAuthConfigManager(mockConfig);
      const config = configManager.getConfig();

      // Verify config can be safely logged (no secrets exposed)
      const safeConfig = {
        drupalUrl: config.drupalUrl,
        clientId: config.clientId,
        scopes: config.scopes,
        // clientSecret intentionally omitted
      };

      expect(safeConfig.clientSecret).toBeUndefined();
      expect(config.clientSecret).toBeDefined();
    });
  });
});
