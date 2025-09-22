/**
 * PKCE Business Logic Tests
 *
 * Tests application-specific PKCE functionality:
 * - Authorization flow with PKCE
 * - Token exchange using PKCE
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
import type { OAuthTokens, PKCEChallenge } from '@/auth/oauth-client.js';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

describe('PKCE Business Logic Tests', () => {
  let mockOAuthServer: Server;
  let serverPort: number;
  let oauthClient: OAuthClient;

  beforeAll(async () => {
    mockOAuthServer = await createPKCETestServer();
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

  describe('Authorization Request with PKCE', () => {
    test('should include PKCE parameters in authorization URL', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      const buildAuthUrlMethod = (
        oauthClient as any
      ).buildAuthorizationUrl.bind(oauthClient);
      const authUrl = buildAuthUrlMethod({
        codeChallenge: challenge.codeChallenge,
        codeChallengeMethod: challenge.codeChallengeMethod,
        state: 'test-state',
        redirectUri: 'http://127.0.0.1:3000/callback',
      });

      const url = new URL(authUrl);

      expect(url.searchParams.get('code_challenge')).toBe(
        challenge.codeChallenge
      );
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
  });

  describe('Token Request with PKCE', () => {
    test('should include code verifier in token exchange request', async () => {
      const challenge = oauthClient.generatePKCEChallenge();
      const authCode = 'test_authorization_code';

      setMockTokenResponse({
        accessToken: 'access_token_123',
        refreshToken: 'refresh_token_456',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      // Store the challenge for server verification
      setExpectedPKCE(challenge);

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      const tokens = await exchangeMethod(authCode, challenge.codeVerifier);

      expect(tokens.accessToken).toBe('access_token_123');

      // Verify the server received correct PKCE parameters
      expect(getLastTokenRequest()).toEqual(
        expect.objectContaining({
          grant_type: 'authorization_code',
          client_id: 'test-client-id',
          code: authCode,
          redirect_uri: 'http://127.0.0.1:3000/callback',
          code_verifier: challenge.codeVerifier,
        })
      );
    });
  });
});

// Mock server implementation for PKCE testing
let expectedPKCE: PKCEChallenge | null = null;
let mockTokenResponse: OAuthTokens | null = null;
let mockTokenError: { status: number; error: string } | null = null;
let lastTokenRequest: Record<string, string> | null = null;

function setExpectedPKCE(challenge: PKCEChallenge): void {
  expectedPKCE = challenge;
}

function setMockTokenResponse(tokens: OAuthTokens): void {
  mockTokenResponse = tokens;
  mockTokenError = null;
}

function setMockTokenError(status: number, error: string): void {
  mockTokenError = { status, error };
  mockTokenResponse = null;
}

function getLastTokenRequest(): Record<string, string> | null {
  return lastTokenRequest;
}

function clearServerState(): void {
  expectedPKCE = null;
  mockTokenResponse = null;
  mockTokenError = null;
  lastTokenRequest = null;
}

async function createPKCETestServer(): Promise<Server> {
  return new Promise<Server>(resolve => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost`);

      if (url.pathname === '/oauth/token' && req.method === 'POST') {
        handlePKCETokenRequest(req, res);
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

function handlePKCETokenRequest(req: any, res: any): void {
  let body = '';
  req.on('data', (chunk: Buffer) => {
    body += chunk.toString();
  });

  req.on('end', () => {
    const params = new URLSearchParams(body);
    lastTokenRequest = Object.fromEntries(params.entries());

    // Validate PKCE if expected
    if (expectedPKCE) {
      const codeVerifier = params.get('code_verifier');
      if (!codeVerifier) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'invalid_request',
            error_description: 'Missing code_verifier',
          })
        );
        return;
      }

      // Simple PKCE validation for testing business logic
      if (codeVerifier !== expectedPKCE.codeVerifier) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'invalid_grant',
            error_description: 'PKCE verification failed',
          })
        );
        return;
      }
    }

    // Return configured response
    if (mockTokenError) {
      res.writeHead(mockTokenError.status, {
        'Content-Type': 'application/json',
      });
      res.end(JSON.stringify({ error: mockTokenError.error }));
      return;
    }

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
  });
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
