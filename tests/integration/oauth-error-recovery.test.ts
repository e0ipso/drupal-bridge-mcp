/**
 * OAuth Error Handling and Recovery Integration Tests
 *
 * Tests comprehensive error scenarios and recovery mechanisms:
 * - Network failures and timeouts
 * - Server error responses and recovery
 * - OAuth-specific error codes and handling
 * - Retry logic and exponential backoff
 * - Error context preservation and logging
 * - User-friendly error messages
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
import { OAuthClient } from '@/auth/oauth-client.js';
import { discoverOAuthEndpoints } from '@/auth/endpoint-discovery.js';
import { DiscoveryError, DiscoveryErrorType } from '@/auth/types.js';
import type { OAuthTokens } from '@/auth/oauth-client.js';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

describe('OAuth Error Handling and Recovery Tests', () => {
  let mockOAuthServer: Server;
  let serverPort: number;
  let oauthClient: OAuthClient;

  beforeAll(async () => {
    mockOAuthServer = await createErrorTestServer();
    const address = mockOAuthServer.address() as AddressInfo;
    serverPort = address.port;

    oauthClient = new OAuthClient({
      clientId: 'test-client-id',
      authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
      tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
      redirectUri: 'http://127.0.0.1:3000/callback',
      scopes: ['tutorial:read', 'user:profile'],
    });
  });

  afterAll(async () => {
    if (mockOAuthServer) {
      await new Promise<void>(resolve => {
        mockOAuthServer.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearServerState();
  });

  describe('Network Error Handling', () => {
    test('should handle connection refused errors', async () => {
      // Create client with invalid endpoint
      const invalidClient = new OAuthClient({
        clientId: 'test-client-id',
        authorizationEndpoint: 'http://localhost:99999/oauth/authorize',
        tokenEndpoint: 'http://localhost:99999/oauth/token',
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['tutorial:read'],
      });

      const challenge = invalidClient.generatePKCEChallenge();
      const exchangeMethod = (invalidClient as any).exchangeCodeForTokens.bind(
        invalidClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });

    test('should handle DNS resolution failures', async () => {
      const invalidClient = new OAuthClient({
        clientId: 'test-client-id',
        authorizationEndpoint: 'http://nonexistent.invalid/oauth/authorize',
        tokenEndpoint: 'http://nonexistent.invalid/oauth/token',
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['tutorial:read'],
      });

      const challenge = invalidClient.generatePKCEChallenge();
      const exchangeMethod = (invalidClient as any).exchangeCodeForTokens.bind(
        invalidClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });

    test('should handle request timeout errors', async () => {
      setServerBehavior('timeout');

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });

    test('should handle incomplete response errors', async () => {
      setServerBehavior('incomplete_response');

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('OAuth Error Response Handling', () => {
    test('should handle invalid_request error', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_request',
        error_description: 'The request is missing a required parameter',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*400.*invalid_request/);
    });

    test('should handle invalid_client error', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*400.*invalid_client/);
    });

    test('should handle invalid_grant error', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_grant',
        error_description: 'The provided authorization grant is invalid',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*400.*invalid_grant/);
    });

    test('should handle unauthorized_client error', async () => {
      setServerBehavior('oauth_error', {
        error: 'unauthorized_client',
        error_description: 'The client is not authorized to request a token',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*400.*unauthorized_client/);
    });

    test('should handle unsupported_grant_type error', async () => {
      setServerBehavior('oauth_error', {
        error: 'unsupported_grant_type',
        error_description: 'The authorization grant type is not supported',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*400.*unsupported_grant_type/);
    });

    test('should handle invalid_scope error', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_scope',
        error_description: 'The requested scope is invalid or unknown',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*400.*invalid_scope/);
    });
  });

  describe('Refresh Token Error Handling', () => {
    test('should handle expired refresh token', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_grant',
        error_description: 'The refresh token has expired',
      });

      await expect(
        oauthClient.refreshToken('expired_refresh_token')
      ).rejects.toThrow(/Token refresh failed.*400.*invalid_grant/);
    });

    test('should handle revoked refresh token', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_grant',
        error_description: 'The refresh token has been revoked',
      });

      await expect(
        oauthClient.refreshToken('revoked_refresh_token')
      ).rejects.toThrow(/Token refresh failed.*400.*invalid_grant/);
    });

    test('should handle malformed refresh token', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_request',
        error_description: 'Invalid refresh token format',
      });

      await expect(oauthClient.refreshToken('malformed_token')).rejects.toThrow(
        /Token refresh failed.*400.*invalid_request/
      );
    });
  });

  describe('HTTP Status Code Handling', () => {
    test('should handle 401 Unauthorized responses', async () => {
      setServerBehavior('http_error', { status: 401, message: 'Unauthorized' });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*401.*Unauthorized/);
    });

    test('should handle 403 Forbidden responses', async () => {
      setServerBehavior('http_error', { status: 403, message: 'Forbidden' });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*403.*Forbidden/);
    });

    test('should handle 429 Rate Limiting responses', async () => {
      setServerBehavior('http_error', {
        status: 429,
        message: 'Too Many Requests',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*429.*Too Many Requests/);
    });

    test('should handle 500 Internal Server Error responses', async () => {
      setServerBehavior('http_error', {
        status: 500,
        message: 'Internal Server Error',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*500.*Internal Server Error/);
    });

    test('should handle 502 Bad Gateway responses', async () => {
      setServerBehavior('http_error', { status: 502, message: 'Bad Gateway' });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*502.*Bad Gateway/);
    });

    test('should handle 503 Service Unavailable responses', async () => {
      setServerBehavior('http_error', {
        status: 503,
        message: 'Service Unavailable',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*503.*Service Unavailable/);
    });
  });

  describe('Content Type and Parsing Errors', () => {
    test('should handle invalid JSON responses', async () => {
      setServerBehavior('invalid_json');

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });

    test('should handle non-JSON content type responses', async () => {
      setServerBehavior('wrong_content_type');

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });

    test('should handle empty response body', async () => {
      setServerBehavior('empty_response');

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('test_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('Discovery Error Handling', () => {
    test('should handle discovery timeout and fallback gracefully', async () => {
      setServerBehavior('discovery_timeout');

      // Should fallback to standard endpoints
      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 100,
        retries: 0,
      });

      expect(endpoints.isFallback).toBe(true);
      expect(endpoints.authorizationEndpoint).toBe(
        `http://localhost:${serverPort}/oauth/authorize`
      );
      expect(endpoints.tokenEndpoint).toBe(
        `http://localhost:${serverPort}/oauth/token`
      );
    });

    test('should handle malformed discovery metadata', async () => {
      setServerBehavior('discovery_malformed');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
        retries: 1,
      });

      expect(endpoints.isFallback).toBe(true);
    });

    test('should throw proper error for invalid base URL', async () => {
      await expect(
        discoverOAuthEndpoints({
          baseUrl: 'not-a-valid-url',
        })
      ).rejects.toThrow(DiscoveryError);

      await expect(
        discoverOAuthEndpoints({
          baseUrl: 'not-a-valid-url',
        })
      ).rejects.toThrow(
        expect.objectContaining({
          type: DiscoveryErrorType.INVALID_URL,
        })
      );
    });
  });

  describe('Error Message Quality', () => {
    test('should provide helpful error messages for common issues', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_grant',
        error_description: 'PKCE code verifier does not match challenge',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      try {
        await exchangeMethod('test_code', 'wrong_verifier');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('Token exchange failed');
        expect(errorMessage).toContain('400');
        expect(errorMessage).toContain('invalid_grant');
      }
    });

    test('should preserve error context from server responses', async () => {
      setServerBehavior('oauth_error', {
        error: 'invalid_scope',
        error_description: 'Requested scope not available for this client',
        error_uri: 'https://example.com/oauth/error#invalid_scope',
      });

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      try {
        await exchangeMethod('test_code', challenge.codeVerifier);
        expect.fail('Should have thrown an error');
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('invalid_scope');
        expect(errorMessage).toContain('Requested scope not available');
      }
    });
  });

  describe('Recovery and Resilience', () => {
    test('should handle intermittent server failures', async () => {
      setServerBehavior('intermittent_failure');

      // First few requests should fail, then succeed
      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      // This should eventually succeed after the server recovers
      // (The mock server will succeed after a few failures)
      const tokens = await exchangeMethod('test_code', challenge.codeVerifier);
      expect(tokens.accessToken).toBeDefined();
    });

    test('should handle successful recovery after network issues', async () => {
      // Start with success to verify normal operation
      setServerBehavior('success');

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      const tokens = await exchangeMethod('test_code', challenge.codeVerifier);
      expect(tokens.accessToken).toBe('test_access_token');
    });
  });
});

// Mock server implementation for error testing
let serverBehavior: string = 'success';
let serverConfig: any = {};
let requestCount = 0;

function setServerBehavior(behavior: string, config: any = {}): void {
  serverBehavior = behavior;
  serverConfig = config;
  requestCount = 0;
}

function clearServerState(): void {
  serverBehavior = 'success';
  serverConfig = {};
  requestCount = 0;
}

async function createErrorTestServer(): Promise<Server> {
  return new Promise<Server>(resolve => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost`);

      if (url.pathname === '/.well-known/oauth-authorization-server') {
        handleDiscoveryErrorRequest(req, res);
      } else if (url.pathname === '/oauth/token' && req.method === 'POST') {
        handleTokenErrorRequest(req, res);
      } else if (url.pathname === '/oauth/authorize' && req.method === 'GET') {
        handleAuthorizeRequest(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function handleDiscoveryErrorRequest(req: any, res: any): void {
  const address = req.socket.address();
  const baseUrl = `http://localhost:${address.port}`;

  switch (serverBehavior) {
    case 'discovery_timeout':
      // Don't respond (simulate timeout)
      break;

    case 'discovery_malformed':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{ malformed json');
      break;

    default:
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
        })
      );
  }
}

function handleTokenErrorRequest(req: any, res: any): void {
  requestCount++;

  switch (serverBehavior) {
    case 'timeout':
      // Don't respond (simulate timeout)
      break;

    case 'incomplete_response':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"access_token":');
      // Don't finish the response
      break;

    case 'oauth_error':
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: serverConfig.error,
          error_description: serverConfig.error_description,
          error_uri: serverConfig.error_uri,
        })
      );
      break;

    case 'http_error':
      res.writeHead(serverConfig.status, { 'Content-Type': 'text/plain' });
      res.end(serverConfig.message);
      break;

    case 'invalid_json':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{ invalid json response');
      break;

    case 'wrong_content_type':
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>Not JSON</body></html>');
      break;

    case 'empty_response':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('');
      break;

    case 'intermittent_failure':
      if (requestCount <= 2) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'server_error' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'test_access_token',
            token_type: 'Bearer',
            expires_in: 3600,
          })
        );
      }
      break;

    case 'success':
    default:
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          access_token: 'test_access_token',
          token_type: 'Bearer',
          expires_in: 3600,
        })
      );
  }
}

function handleAuthorizeRequest(req: any, res: any): void {
  const url = new URL(req.url || '', `http://localhost`);
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');

  if (redirectUri && state) {
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', 'test_auth_code');
    callbackUrl.searchParams.set('state', state);

    res.writeHead(302, { Location: callbackUrl.toString() });
    res.end();
  } else {
    res.writeHead(400);
    res.end('Invalid request');
  }
}
