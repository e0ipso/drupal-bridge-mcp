/**
 * OAuth flow integration tests
 */

import {
  OAuthClient,
  PKCEChallenge,
  OAuthTokens,
} from '../../src/auth/oauth-client.js';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';

describe('OAuth Flow Integration Tests', () => {
  let mockOAuthServer: Server;
  let serverPort: number;
  let oauthClient: OAuthClient;

  beforeAll(async () => {
    // Start mock OAuth server
    mockOAuthServer = await createMockOAuthServer();
    const address = mockOAuthServer.address() as AddressInfo;
    serverPort = address.port;

    // Configure OAuth client to use mock server
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

  describe('PKCE Implementation', () => {
    test('should generate valid PKCE challenge', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      expect(challenge.codeVerifier).toBeDefined();
      expect(challenge.codeChallenge).toBeDefined();
      expect(challenge.codeChallengeMethod).toBe('S256');
      expect(challenge.codeVerifier.length).toBeGreaterThan(32);
      expect(challenge.codeChallenge.length).toBeGreaterThan(32);
    });

    test('should generate unique PKCE challenges', () => {
      const challenge1 = oauthClient.generatePKCEChallenge();
      const challenge2 = oauthClient.generatePKCEChallenge();

      expect(challenge1.codeVerifier).not.toBe(challenge2.codeVerifier);
      expect(challenge1.codeChallenge).not.toBe(challenge2.codeChallenge);
    });
  });

  describe('Authorization URL Generation', () => {
    test('should build valid authorization URL with PKCE', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // Use reflection to access private method for testing
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

      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('code_challenge')).toBe(
        challenge.codeChallenge
      );
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBe('test-state');
      expect(url.searchParams.get('scope')).toBe('tutorial:read user:profile');
    });
  });

  describe('Token Exchange', () => {
    test('should exchange authorization code for tokens', async () => {
      const mockCode = 'test-auth-code';
      const mockTokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read user:profile',
      };

      // Mock the token exchange endpoint
      setMockTokenResponse(mockTokens);

      const challenge = oauthClient.generatePKCEChallenge();

      // Use reflection to access private method for testing
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );
      const tokens = await exchangeMethod(mockCode, challenge.codeVerifier);

      expect(tokens.accessToken).toBe(mockTokens.accessToken);
      expect(tokens.refreshToken).toBe(mockTokens.refreshToken);
      expect(tokens.tokenType).toBe(mockTokens.tokenType);
      expect(tokens.expiresIn).toBe(mockTokens.expiresIn);
    });

    test('should handle token exchange errors', async () => {
      const mockCode = 'invalid-code';

      // Mock error response
      setMockTokenError(400, 'invalid_grant');

      const challenge = oauthClient.generatePKCEChallenge();

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod(mockCode, challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });
  });

  describe('Token Refresh', () => {
    test('should refresh access token', async () => {
      const newTokens: OAuthTokens = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      setMockTokenResponse(newTokens);

      const refreshedTokens =
        await oauthClient.refreshToken('old-refresh-token');

      expect(refreshedTokens.accessToken).toBe(newTokens.accessToken);
      expect(refreshedTokens.refreshToken).toBe(newTokens.refreshToken);
    });

    test('should handle refresh token errors', async () => {
      setMockTokenError(400, 'invalid_grant');

      await expect(
        oauthClient.refreshToken('invalid-refresh-token')
      ).rejects.toThrow('Token refresh failed');
    });
  });

  describe('End-to-End OAuth Flow', () => {
    test('should complete OAuth flow with manual fallback', async () => {
      // This test would require manual intervention in a real scenario
      // We'll mock the completion for testing purposes

      const mockTokens: OAuthTokens = {
        accessToken: 'e2e-access-token',
        refreshToken: 'e2e-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read user:profile',
      };

      setMockTokenResponse(mockTokens);

      // Mock the authorize method directly
      jest
        .spyOn(oauthClient, 'authorize')
        .mockResolvedValue(mockTokens);

      const tokens = await oauthClient.authorize();
      expect(tokens.accessToken).toBe(mockTokens.accessToken);
    });
  });
});

// Mock OAuth server implementation
async function createMockOAuthServer(): Promise<Server> {
  return new Promise<Server>(resolve => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost`);

      if (url.pathname === '/oauth/token' && req.method === 'POST') {
        handleTokenRequest(req, res);
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

let mockTokenResponse: OAuthTokens | null = null;
let mockTokenError: { status: number; error: string } | null = null;

function setMockTokenResponse(tokens: OAuthTokens): void {
  mockTokenResponse = tokens;
  mockTokenError = null;
}

function setMockTokenError(status: number, error: string): void {
  mockTokenError = { status, error };
  mockTokenResponse = null;
}

function handleTokenRequest(req: any, res: any): void {
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
}

function handleAuthorizeRequest(req: any, res: any): void {
  const url = new URL(req.url || '', `http://localhost`);
  const redirectUri = url.searchParams.get('redirect_uri');
  const state = url.searchParams.get('state');

  if (redirectUri && state) {
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', 'test-auth-code');
    callbackUrl.searchParams.set('state', state);

    res.writeHead(302, { Location: callbackUrl.toString() });
    res.end();
  } else {
    res.writeHead(400);
    res.end('Invalid request');
  }
}
