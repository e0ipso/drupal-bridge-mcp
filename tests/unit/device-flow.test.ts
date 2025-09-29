/**
 * Device Authorization Grant Flow Integration Tests
 *
 * Tests RFC 8628 device flow implementation for headless OAuth authentication
 */

import { DeviceFlow } from '../../src/oauth/device-flow.js';
import { DeviceFlowHandler } from '../../src/oauth/device-flow-handler.js';
import { DeviceTokenPoller } from '../../src/oauth/device-token-poller.js';
import { DeviceFlowDetector } from '../../src/oauth/device-flow-detector.js';
import type { OAuthConfig } from '../../src/oauth/config.js';
import type {
  DeviceAuthResponse,
  TokenResponse,
  OAuthErrorResponse,
} from '../../src/oauth/device-flow-types.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

describe('Device Authorization Grant Flow Integration', () => {
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
      grant_types_supported: [
        'authorization_code',
        'refresh_token',
        'urn:ietf:params:oauth:grant-type:device_code',
      ],
      response_types_supported: ['code'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic'],
      scopes_supported: ['profile', 'read:content'],
    };
  });

  describe('Device Flow Initiation', () => {
    test('should initiate device flow with correct parameters', async () => {
      const mockDeviceResponse: DeviceAuthResponse = {
        device_code: 'test-device-code-123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://drupal.example.com/oauth/device',
        verification_uri_complete:
          'https://drupal.example.com/oauth/device?code=ABCD-EFGH',
        expires_in: 600,
        interval: 5,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDeviceResponse,
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      const result = await handler.initiateDeviceFlow();

      expect(result.device_code).toBe('test-device-code-123');
      expect(result.user_code).toBe('ABCD-EFGH');
      expect(result.verification_uri).toBe(
        'https://drupal.example.com/oauth/device'
      );
      expect(result.expires_in).toBe(600);
      expect(result.interval).toBe(5);

      // Verify fetch was called with correct parameters
      expect(global.fetch).toHaveBeenCalledWith(
        'https://drupal.example.com/oauth/device_authorization',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    test('should include all required scopes in device authorization request', async () => {
      const mockDeviceResponse: DeviceAuthResponse = {
        device_code: 'test-device-code-123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://drupal.example.com/oauth/device',
        expires_in: 600,
        interval: 5,
      };

      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDeviceResponse,
      });
      global.fetch = fetchMock;

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      await handler.initiateDeviceFlow();

      // Check that scopes were included in the request
      const callArgs = fetchMock.mock.calls[0];
      const requestBody = callArgs[1].body as string;
      expect(requestBody).toContain('scope=profile+read%3Acontent');
      expect(requestBody).toContain('client_id=test-client');
    });

    test('should handle device authorization endpoint errors', async () => {
      const errorResponse = {
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify(errorResponse),
        json: async () => errorResponse,
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);

      await expect(handler.initiateDeviceFlow()).rejects.toThrow(
        /Device authorization failed: invalid_client/
      );
    });

    test('should throw error if device endpoint missing from metadata', async () => {
      const metadataWithoutDeviceEndpoint = {
        ...mockMetadata,
        device_authorization_endpoint: undefined,
      };

      const handler = new DeviceFlowHandler(
        mockConfig,
        metadataWithoutDeviceEndpoint
      );

      await expect(handler.initiateDeviceFlow()).rejects.toThrow(
        /Device authorization endpoint not available in OAuth metadata/
      );
    });
  });

  describe('Token Polling', () => {
    test('should successfully poll for token after authorization', async () => {
      const mockTokenResponse: TokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        scope: 'profile read:content',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTokenResponse,
      });

      const poller = new DeviceTokenPoller(mockConfig, mockMetadata);
      const tokens = await poller.pollForToken('test-device-code', 5, 600);

      expect(tokens.access_token).toBe('test-access-token');
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.refresh_token).toBe('test-refresh-token');
      expect(tokens.expires_in).toBe(3600);
    });

    test('should handle authorization_pending and continue polling', async () => {
      const mockPendingResponse: OAuthErrorResponse = {
        error: 'authorization_pending',
        error_description: 'User has not completed authorization',
      };

      const mockTokenResponse: TokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
      };

      // First call returns pending, second returns token
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => mockPendingResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTokenResponse,
        });

      global.fetch = fetchMock;

      const poller = new DeviceTokenPoller(mockConfig, mockMetadata);
      const tokens = await poller.pollForToken('test-device-code', 1, 600);

      expect(tokens.access_token).toBe('test-access-token');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('should handle slow_down and increase polling interval', async () => {
      const mockSlowDownResponse: OAuthErrorResponse = {
        error: 'slow_down',
        error_description: 'Polling too frequently',
      };

      const mockTokenResponse: TokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => mockSlowDownResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTokenResponse,
        });

      global.fetch = fetchMock;

      const poller = new DeviceTokenPoller(mockConfig, mockMetadata);
      const startTime = Date.now();
      await poller.pollForToken('test-device-code', 1, 600);
      const duration = Date.now() - startTime;

      // Verify that polling interval increased (should wait longer after slow_down)
      expect(duration).toBeGreaterThanOrEqual(1000);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }, 10000);

    test('should handle expired_token error', async () => {
      const mockErrorResponse: OAuthErrorResponse = {
        error: 'expired_token',
        error_description: 'Device code has expired',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => mockErrorResponse,
      });

      const poller = new DeviceTokenPoller(mockConfig, mockMetadata);

      await expect(
        poller.pollForToken('test-device-code', 5, 600)
      ).rejects.toThrow(/Device code expired/);
    });

    test('should handle access_denied error', async () => {
      const mockErrorResponse: OAuthErrorResponse = {
        error: 'access_denied',
        error_description: 'User denied authorization',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => mockErrorResponse,
      });

      const poller = new DeviceTokenPoller(mockConfig, mockMetadata);

      await expect(
        poller.pollForToken('test-device-code', 5, 600)
      ).rejects.toThrow(/denied/i);
    });

    test('should timeout if polling exceeds expiration time', async () => {
      const mockPendingResponse: OAuthErrorResponse = {
        error: 'authorization_pending',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => mockPendingResponse,
      });

      const poller = new DeviceTokenPoller(mockConfig, mockMetadata);

      // Set very short expiration for testing
      await expect(
        poller.pollForToken('test-device-code', 1, 2)
      ).rejects.toThrow(/timed out|expired/i);
    }, 10000);
  });

  describe('Complete Device Flow', () => {
    test('should complete full device flow successfully', async () => {
      const mockDeviceResponse: DeviceAuthResponse = {
        device_code: 'test-device-code-123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://drupal.example.com/oauth/device',
        expires_in: 600,
        interval: 5,
      };

      const mockTokenResponse: TokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'test-refresh-token',
        scope: 'profile read:content',
      };

      // Mock device authorization then token polling
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDeviceResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTokenResponse,
        });

      global.fetch = fetchMock;

      const deviceFlow = new DeviceFlow(mockConfig, mockMetadata);
      const tokens = await deviceFlow.authenticate();

      expect(tokens.access_token).toBe('test-access-token');
      expect(tokens.token_type).toBe('Bearer');
      expect(tokens.refresh_token).toBe('test-refresh-token');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('should retry on transient failures', async () => {
      const mockDeviceResponse: DeviceAuthResponse = {
        device_code: 'test-device-code-123',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://drupal.example.com/oauth/device',
        expires_in: 600,
        interval: 1,
      };

      const mockTokenResponse: TokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600,
      };

      // First attempt fails, second succeeds
      const fetchMock = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDeviceResponse,
        })
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDeviceResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockTokenResponse,
        });

      global.fetch = fetchMock;

      const deviceFlow = new DeviceFlow(mockConfig, mockMetadata, {
        maxRetries: 2,
        enableAutoRetry: true,
        baseInterval: 1,
      });

      const tokens = await deviceFlow.authenticate();

      expect(tokens.access_token).toBe('test-access-token');
    }, 15000);

    test('should not retry on terminal errors', async () => {
      const errorResponse = {
        error: 'access_denied',
        error_description: 'User denied access',
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify(errorResponse),
        json: async () => errorResponse,
      });

      const deviceFlow = new DeviceFlow(mockConfig, mockMetadata, {
        maxRetries: 3,
        enableAutoRetry: true,
        baseInterval: 1,
      });

      await expect(deviceFlow.authenticate()).rejects.toThrow(/denied/i);
    }, 10000);
  });

  describe('Device Flow Detection', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    test('should detect headless environment in CI', () => {
      process.env.CI = 'true';
      delete process.env.DISPLAY;

      expect(DeviceFlowDetector.isHeadlessEnvironment()).toBe(true);
    });

    test('should detect headless environment in container', () => {
      process.env.CONTAINER = 'true';
      delete process.env.DISPLAY;

      expect(DeviceFlowDetector.isHeadlessEnvironment()).toBe(true);
    });

    test('should detect non-headless with DISPLAY and DESKTOP_SESSION', () => {
      process.env.DISPLAY = ':0';
      process.env.DESKTOP_SESSION = 'gnome';
      delete process.env.CI;
      delete process.env.CONTAINER;
      delete process.env.TERM;

      expect(DeviceFlowDetector.isHeadlessEnvironment()).toBe(false);
    });

    test('should use device flow when forced', () => {
      process.env.OAUTH_FORCE_DEVICE_FLOW = 'true';
      process.env.DISPLAY = ':0';
      process.env.DESKTOP_SESSION = 'gnome';

      expect(DeviceFlow.shouldUseDeviceFlow()).toBe(true);
    });

    test('should not use device flow when browser flow forced', () => {
      process.env.OAUTH_FORCE_BROWSER_FLOW = 'true';
      process.env.CI = 'true';

      expect(DeviceFlow.shouldUseDeviceFlow()).toBe(false);
    });
  });

  describe('RFC 8628 Compliance', () => {
    test('should generate user codes in correct format', async () => {
      const mockDeviceResponse: DeviceAuthResponse = {
        device_code: 'test-device-code',
        user_code: 'BCDF-GHJK',
        verification_uri: 'https://drupal.example.com/oauth/device',
        expires_in: 600,
        interval: 5,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDeviceResponse,
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      const result = await handler.initiateDeviceFlow();

      // RFC 8628 recommends using uppercase letters without vowels
      expect(result.user_code).toMatch(
        /^[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}$/
      );
    });

    test('should respect minimum polling interval', async () => {
      const mockDeviceResponse: DeviceAuthResponse = {
        device_code: 'test-device-code',
        user_code: 'BCDF-GHJK',
        verification_uri: 'https://drupal.example.com/oauth/device',
        expires_in: 600,
        interval: 5,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDeviceResponse,
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      const result = await handler.initiateDeviceFlow();

      // RFC 8628 recommends minimum 5 seconds
      expect(result.interval).toBeGreaterThanOrEqual(5);
    });

    test('should include device code expiration time', async () => {
      const mockDeviceResponse: DeviceAuthResponse = {
        device_code: 'test-device-code',
        user_code: 'BCDF-GHJK',
        verification_uri: 'https://drupal.example.com/oauth/device',
        expires_in: 600,
        interval: 5,
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockDeviceResponse,
      });

      const handler = new DeviceFlowHandler(mockConfig, mockMetadata);
      const result = await handler.initiateDeviceFlow();

      // Device codes should have reasonable expiration
      expect(result.expires_in).toBeGreaterThan(0);
      expect(result.expires_in).toBeLessThanOrEqual(1800); // 30 minutes max
    });
  });
});
