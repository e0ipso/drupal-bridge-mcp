/**
 * OAuth Integration Tests
 *
 * Tests application-specific OAuth integration behavior
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { OAuthClient } from '@/auth/oauth-client.js';
import { discoverOAuthEndpoints } from '@/auth/endpoint-discovery.js';
import type { OAuthTokens } from '@/auth/oauth-client.js';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

describe('OAuth Integration Tests', () => {
  let mockOAuthServer: Server;
  let serverPort: number;
  let oauthClient: OAuthClient;

  beforeAll(async () => {
    mockOAuthServer = await createTestServer();
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

  describe('Application OAuth Integration', () => {
    test('should discover OAuth endpoints for application use', async () => {
      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
        debug: false,
      });

      expect(endpoints.isFallback).toBe(false);
      expect(endpoints.authorizationEndpoint).toBeDefined();
      expect(endpoints.tokenEndpoint).toBeDefined();
      expect(endpoints.issuer).toBeDefined();
    });

    test('should handle token exchange for application workflow', async () => {
      const mockTokens: OAuthTokens = {
        accessToken: 'access_token_12345',
        refreshToken: 'refresh_token_67890',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read user:profile',
      };

      setMockTokenResponse(mockTokens);

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      const tokens = await exchangeMethod(
        'test_code_123',
        challenge.codeVerifier
      );

      expect(tokens.accessToken).toBe(mockTokens.accessToken);
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(3600);
    });
  });
});

// Minimal mock server for application testing
async function createTestServer(): Promise<Server> {
  return new Promise<Server>(resolve => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost`);

      if (url.pathname === '/.well-known/oauth-authorization-server') {
        const address = req.socket.address();
        const baseUrl = `http://localhost:${address.port}`;

        const metadata = {
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(metadata));
      } else if (url.pathname === '/oauth/token' && req.method === 'POST') {
        handleTokenRequest(req, res);
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

let mockTokenResponse: OAuthTokens | null = null;

function setMockTokenResponse(tokens: OAuthTokens): void {
  mockTokenResponse = tokens;
}

function handleTokenRequest(req: any, res: any): void {
  if (mockTokenResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        access_token: mockTokenResponse.accessToken,
        refresh_token: mockTokenResponse.refreshToken,
        token_type: mockTokenResponse.tokenType,
        expires_in: mockTokenResponse.expiresIn,
        scope: mockTokenResponse.scope,
      })
    );
    return;
  }

  res.writeHead(500, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'server_error' }));
}
