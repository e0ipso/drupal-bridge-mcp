/**
 * OAuth Backward Compatibility Tests
 *
 * Tests compatibility with existing OAuth configurations and legacy setups:
 * - Legacy configuration format support
 * - Migration from older OAuth implementations
 * - Compatibility with existing Drupal OAuth setups
 * - Configuration validation and graceful degradation
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
import type { OAuthTokens, OAuthConfig } from '@/auth/oauth-client.js';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

describe('OAuth Backward Compatibility Tests', () => {
  let mockOAuthServer: Server;
  let serverPort: number;

  beforeAll(async () => {
    mockOAuthServer = await createCompatibilityTestServer();
    const address = mockOAuthServer.address() as AddressInfo;
    serverPort = address.port;
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
  });

  describe('Legacy Configuration Support', () => {
    test('should support traditional OAuth 2.0 configuration format', () => {
      const legacyConfig: OAuthConfig = {
        clientId: 'legacy-client-id',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['read', 'write'],
      };

      expect(() => new OAuthClient(legacyConfig)).not.toThrow();

      const client = new OAuthClient(legacyConfig);
      expect(client).toBeInstanceOf(OAuthClient);
    });

    test('should handle Drupal-specific OAuth configuration', () => {
      const drupalConfig: OAuthConfig = {
        clientId: 'drupal-oauth-client',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['tutorial:read', 'node:read', 'user:profile'],
      };

      const client = new OAuthClient(drupalConfig);
      const challenge = client.generatePKCEChallenge();

      expect(challenge.codeVerifier).toBeDefined();
      expect(challenge.codeChallenge).toBeDefined();
      expect(challenge.codeChallengeMethod).toBe('S256');
    });

    test('should work with minimal required configuration', () => {
      const minimalConfig: OAuthConfig = {
        clientId: 'minimal-client',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['read'],
      };

      const client = new OAuthClient(minimalConfig);
      expect(() => client.generatePKCEChallenge()).not.toThrow();
    });

    test('should handle standard OAuth 2.0 scope formats', () => {
      const configs = [
        {
          scopes: ['read', 'write'],
          expectedScope: 'read write',
        },
        {
          scopes: ['tutorial:read', 'user:profile'],
          expectedScope: 'tutorial:read user:profile',
        },
        {
          scopes: ['openid', 'profile', 'email'],
          expectedScope: 'openid profile email',
        },
      ];

      configs.forEach(({ scopes, expectedScope }) => {
        const config: OAuthConfig = {
          clientId: 'scope-test-client',
          authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
          tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
          redirectUri: 'http://127.0.0.1:3000/callback',
          scopes,
        };

        const client = new OAuthClient(config);
        const challenge = client.generatePKCEChallenge();

        const buildAuthUrlMethod = (client as any).buildAuthorizationUrl.bind(
          client
        );
        const authUrl = buildAuthUrlMethod({
          codeChallenge: challenge.codeChallenge,
          codeChallengeMethod: challenge.codeChallengeMethod,
          state: 'test-state',
          redirectUri: config.redirectUri,
        });

        const url = new URL(authUrl);
        expect(url.searchParams.get('scope')).toBe(expectedScope);
      });
    });
  });

  describe('Legacy Server Compatibility', () => {
    test('should work with servers that support PKCE optionally', async () => {
      setServerBehavior('optional_pkce');

      const config: OAuthConfig = {
        clientId: 'optional-pkce-client',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['read'],
      };

      const client = new OAuthClient(config);
      const challenge = client.generatePKCEChallenge();

      setMockTokenResponse({
        accessToken: 'optional-pkce-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      const exchangeMethod = (client as any).exchangeCodeForTokens.bind(client);
      const tokens = await exchangeMethod('test_code', challenge.codeVerifier);

      expect(tokens.accessToken).toBe('optional-pkce-token');
    });

    test('should work with legacy Drupal Simple OAuth servers', async () => {
      setServerBehavior('drupal_legacy');

      const config: OAuthConfig = {
        clientId: 'drupal-legacy-client',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['tutorial:read'],
      };

      const client = new OAuthClient(config);
      const challenge = client.generatePKCEChallenge();

      setMockTokenResponse({
        accessToken: 'drupal-legacy-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read',
      });

      const exchangeMethod = (client as any).exchangeCodeForTokens.bind(client);
      const tokens = await exchangeMethod('test_code', challenge.codeVerifier);

      expect(tokens.accessToken).toBe('drupal-legacy-token');
      expect(tokens.scope).toBe('tutorial:read');
    });

    test('should handle servers without .well-known endpoint discovery', async () => {
      setServerBehavior('no_discovery');

      // Should fallback to standard endpoints
      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 1000,
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

    test('should work with non-standard endpoint paths', async () => {
      const config: OAuthConfig = {
        clientId: 'non-standard-client',
        authorizationEndpoint: `http://localhost:${serverPort}/custom/auth`,
        tokenEndpoint: `http://localhost:${serverPort}/custom/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['custom:scope'],
      };

      const client = new OAuthClient(config);
      const challenge = client.generatePKCEChallenge();

      setServerBehavior('custom_endpoints');
      setMockTokenResponse({
        accessToken: 'custom-endpoint-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      const exchangeMethod = (client as any).exchangeCodeForTokens.bind(client);
      const tokens = await exchangeMethod('test_code', challenge.codeVerifier);

      expect(tokens.accessToken).toBe('custom-endpoint-token');
    });
  });

  describe('Token Format Compatibility', () => {
    test('should handle various token response formats', async () => {
      const tokenFormats = [
        {
          name: 'standard',
          response: {
            access_token: 'standard_token',
            refresh_token: 'standard_refresh',
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'read write',
          },
          expected: {
            accessToken: 'standard_token',
            refreshToken: 'standard_refresh',
            tokenType: 'Bearer',
            expiresIn: 3600,
            scope: 'read write',
          },
        },
        {
          name: 'minimal',
          response: {
            access_token: 'minimal_token',
            token_type: 'Bearer',
          },
          expected: {
            accessToken: 'minimal_token',
            tokenType: 'Bearer',
          },
        },
        {
          name: 'no_refresh',
          response: {
            access_token: 'no_refresh_token',
            token_type: 'Bearer',
            expires_in: 7200,
          },
          expected: {
            accessToken: 'no_refresh_token',
            tokenType: 'Bearer',
            expiresIn: 7200,
          },
        },
      ];

      const config: OAuthConfig = {
        clientId: 'format-test-client',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['read'],
      };

      const client = new OAuthClient(config);

      for (const format of tokenFormats) {
        setMockRawTokenResponse(format.response);

        const challenge = client.generatePKCEChallenge();
        const exchangeMethod = (client as any).exchangeCodeForTokens.bind(
          client
        );
        const tokens = await exchangeMethod(
          'test_code',
          challenge.codeVerifier
        );

        expect(tokens.accessToken).toBe(format.expected.accessToken);
        expect(tokens.tokenType).toBe(format.expected.tokenType);

        if (format.expected.refreshToken) {
          expect(tokens.refreshToken).toBe(format.expected.refreshToken);
        }

        if (format.expected.expiresIn) {
          expect(tokens.expiresIn).toBe(format.expected.expiresIn);
        }

        if (format.expected.scope) {
          expect(tokens.scope).toBe(format.expected.scope);
        }
      }
    });

    test('should handle legacy bearer token format variations', async () => {
      const bearerVariations = ['Bearer', 'bearer', 'BEARER'];

      const config: OAuthConfig = {
        clientId: 'bearer-test-client',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['read'],
      };

      const client = new OAuthClient(config);

      for (const tokenType of bearerVariations) {
        setMockRawTokenResponse({
          access_token: 'bearer_variation_token',
          token_type: tokenType,
          expires_in: 3600,
        });

        const challenge = client.generatePKCEChallenge();
        const exchangeMethod = (client as any).exchangeCodeForTokens.bind(
          client
        );
        const tokens = await exchangeMethod(
          'test_code',
          challenge.codeVerifier
        );

        expect(tokens.accessToken).toBe('bearer_variation_token');
        expect(tokens.tokenType).toBe(tokenType); // Preserve original case
      }
    });
  });

  describe('Error Handling Compatibility', () => {
    test('should handle legacy OAuth error formats', async () => {
      const config: OAuthConfig = {
        clientId: 'error-test-client',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['read'],
      };

      const client = new OAuthClient(config);
      const challenge = client.generatePKCEChallenge();

      setMockErrorResponse({
        error: 'invalid_request',
        error_description: 'Legacy error description format',
      });

      const exchangeMethod = (client as any).exchangeCodeForTokens.bind(client);

      await expect(
        exchangeMethod('invalid_code', challenge.codeVerifier)
      ).rejects.toThrow(/Token exchange failed.*400.*invalid_request/);
    });

    test('should handle servers with non-standard error responses', async () => {
      const config: OAuthConfig = {
        clientId: 'non-standard-error-client',
        authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
        tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['read'],
      };

      const client = new OAuthClient(config);
      const challenge = client.generatePKCEChallenge();

      setServerBehavior('non_standard_error');

      const exchangeMethod = (client as any).exchangeCodeForTokens.bind(client);

      await expect(
        exchangeMethod('error_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('Graceful Degradation', () => {
    test('should continue working when discovery partially fails', async () => {
      setServerBehavior('partial_discovery');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
        retries: 1,
      });

      // Should fallback but still provide working endpoints
      expect(endpoints.authorizationEndpoint).toBeDefined();
      expect(endpoints.tokenEndpoint).toBeDefined();
    });

    test('should work with servers that have extended metadata', async () => {
      setServerBehavior('extended_metadata');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
      });

      expect(endpoints.isFallback).toBe(false);
      expect(endpoints.metadata).toBeDefined();
      // Should ignore unknown fields gracefully
      expect(endpoints.authorizationEndpoint).toBeDefined();
      expect(endpoints.tokenEndpoint).toBeDefined();
    });
  });
});

// Mock server implementation for compatibility testing
let serverBehavior = 'standard';
let mockTokenResponse: any = null;
let mockErrorResponse: any = null;

function setServerBehavior(behavior: string): void {
  serverBehavior = behavior;
}

function setMockTokenResponse(tokens: OAuthTokens): void {
  mockTokenResponse = {
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    token_type: tokens.tokenType,
    expires_in: tokens.expiresIn,
    scope: tokens.scope,
  };
  mockErrorResponse = null;
}

function setMockRawTokenResponse(response: any): void {
  mockTokenResponse = response;
  mockErrorResponse = null;
}

function setMockErrorResponse(error: any): void {
  mockErrorResponse = error;
  mockTokenResponse = null;
}

async function createCompatibilityTestServer(): Promise<Server> {
  return new Promise<Server>(resolve => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost`);

      if (url.pathname === '/.well-known/oauth-authorization-server') {
        handleCompatibilityDiscoveryRequest(req, res);
      } else if (url.pathname === '/oauth/token' && req.method === 'POST') {
        handleCompatibilityTokenRequest(req, res);
      } else if (url.pathname === '/custom/token' && req.method === 'POST') {
        handleCompatibilityTokenRequest(req, res);
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

function handleCompatibilityDiscoveryRequest(req: any, res: any): void {
  const address = req.socket.address();
  const baseUrl = `http://localhost:${address.port}`;

  switch (serverBehavior) {
    case 'no_discovery':
      res.writeHead(404);
      res.end('Not Found');
      break;

    case 'partial_discovery':
      res.writeHead(500);
      res.end('Server Error');
      break;

    case 'extended_metadata':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          // Standard OAuth 2.1 fields
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          // Extended/custom fields
          custom_field: 'custom_value',
          vendor_specific: {
            feature: 'enabled',
            version: '2.1.0',
          },
          extra_endpoints: [
            `${baseUrl}/oauth/introspect`,
            `${baseUrl}/oauth/revoke`,
          ],
        })
      );
      break;

    default:
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
        })
      );
  }
}

function handleCompatibilityTokenRequest(req: any, res: any): void {
  if (mockErrorResponse) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockErrorResponse));
    return;
  }

  if (serverBehavior === 'non_standard_error') {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error - Non-standard format');
    return;
  }

  if (mockTokenResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(mockTokenResponse));
  } else {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'server_error' }));
  }
}
