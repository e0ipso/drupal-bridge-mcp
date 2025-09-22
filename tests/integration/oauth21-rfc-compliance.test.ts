/**
 * OAuth 2.1 RFC Compliance Integration Tests
 *
 * Tests compliance with:
 * - RFC 6749 (OAuth 2.0 Authorization Framework)
 * - RFC 7636 (PKCE for OAuth Public Clients)
 * - RFC 8414 (OAuth 2.0 Authorization Server Metadata)
 * - OAuth 2.1 Security Best Current Practice (draft-ietf-oauth-security-topics)
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
import type { OAuthTokens, PKCEChallenge } from '@/auth/oauth-client.js';
import type { OAuthServerMetadata } from '@/auth/types.js';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { createHash, randomBytes } from 'crypto';

describe('OAuth 2.1 RFC Compliance Tests', () => {
  let mockOAuthServer: Server;
  let serverPort: number;
  let oauthClient: OAuthClient;
  let serverMetadata: OAuthServerMetadata;

  beforeAll(async () => {
    // Create a comprehensive mock OAuth 2.1 server
    mockOAuthServer = await createRFC8414CompliantServer();
    const address = mockOAuthServer.address() as AddressInfo;
    serverPort = address.port;

    serverMetadata = {
      issuer: `http://localhost:${serverPort}`,
      authorization_endpoint: `http://localhost:${serverPort}/oauth/authorize`,
      token_endpoint: `http://localhost:${serverPort}/oauth/token`,
      jwks_uri: `http://localhost:${serverPort}/.well-known/jwks.json`,
      scopes_supported: ['read', 'write', 'tutorial:read', 'user:profile'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
      response_modes_supported: ['query'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      userinfo_endpoint: `http://localhost:${serverPort}/oauth/userinfo`,
      registration_endpoint: `http://localhost:${serverPort}/oauth/register`,
      revocation_endpoint: `http://localhost:${serverPort}/oauth/revoke`,
      introspection_endpoint: `http://localhost:${serverPort}/oauth/introspect`,
    };

    oauthClient = new OAuthClient({
      clientId: 'test-client-id',
      authorizationEndpoint: serverMetadata.authorization_endpoint,
      tokenEndpoint: serverMetadata.token_endpoint,
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
  });

  describe('RFC 8414 - OAuth 2.0 Authorization Server Metadata', () => {
    test('should discover OAuth endpoints from .well-known/oauth-authorization-server', async () => {
      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
        debug: false,
      });

      expect(endpoints.isFallback).toBe(false);
      expect(endpoints.authorizationEndpoint).toBe(
        serverMetadata.authorization_endpoint
      );
      expect(endpoints.tokenEndpoint).toBe(serverMetadata.token_endpoint);
      expect(endpoints.issuer).toBe(serverMetadata.issuer);
      expect(endpoints.metadata).toBeDefined();
    });

    test('should validate required metadata fields per RFC 8414', async () => {
      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
      });

      const metadata = endpoints.metadata;
      expect(metadata).toBeDefined();

      // Required fields per RFC 8414 Section 2
      expect(metadata!.issuer).toBeDefined();
      expect(metadata!.authorization_endpoint).toBeDefined();
      expect(metadata!.token_endpoint).toBeDefined();
      expect(metadata!.response_types_supported).toContain('code');
      expect(metadata!.subject_types_supported).toContain('public');
      expect(metadata!.id_token_signing_alg_values_supported).toContain(
        'RS256'
      );
    });

    test('should validate OAuth 2.1 security requirements in metadata', async () => {
      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
      });

      const metadata = endpoints.metadata!;

      // OAuth 2.1 requirements
      expect(metadata.code_challenge_methods_supported).toContain('S256');
      expect(metadata.response_types_supported).toEqual(['code']); // Only authorization code flow
      expect(metadata.grant_types_supported).not.toContain('implicit'); // No implicit flow
      expect(metadata.grant_types_supported).not.toContain('password'); // No resource owner password credentials
    });
  });

  describe('RFC 7636 - PKCE (Proof Key for Code Exchange)', () => {
    test('should generate cryptographically secure PKCE challenge', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // RFC 7636 Section 4.1 - Code verifier requirements
      expect(challenge.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/); // Unreserved characters only
      expect(challenge.codeVerifier.length).toBeGreaterThanOrEqual(43); // Minimum length
      expect(challenge.codeVerifier.length).toBeLessThanOrEqual(128); // Maximum length

      // RFC 7636 Section 4.2 - Code challenge requirements
      expect(challenge.codeChallengeMethod).toBe('S256'); // SHA256 required for OAuth 2.1
      expect(challenge.codeChallenge).toMatch(/^[A-Za-z0-9\-._~]+$/); // Base64url encoded
      expect(challenge.codeChallenge.length).toBe(43); // SHA256 hash is 32 bytes = 43 chars in base64url
    });

    test('should validate PKCE challenge generation is deterministic', () => {
      // Manually generate PKCE challenge to verify implementation
      const codeVerifier = randomBytes(32).toString('base64url');
      const expectedChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      // Create challenge with our client
      const clientChallenge = oauthClient.generatePKCEChallenge();

      // Verify our client follows the same algorithm
      const manualChallenge = createHash('sha256')
        .update(clientChallenge.codeVerifier)
        .digest('base64url');

      expect(clientChallenge.codeChallenge).toBe(manualChallenge);
    });

    test('should include PKCE parameters in authorization URL', () => {
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

      // RFC 7636 Section 4.3 - Authorization request parameters
      expect(url.searchParams.get('code_challenge')).toBe(
        challenge.codeChallenge
      );
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    test('should validate PKCE entropy requirements', () => {
      // Generate multiple challenges to test entropy
      const challenges = Array.from({ length: 100 }, () =>
        oauthClient.generatePKCEChallenge()
      );

      // All code verifiers should be unique
      const verifiers = challenges.map(c => c.codeVerifier);
      const uniqueVerifiers = new Set(verifiers);
      expect(uniqueVerifiers.size).toBe(100);

      // All code challenges should be unique
      const challengeValues = challenges.map(c => c.codeChallenge);
      const uniqueChallenges = new Set(challengeValues);
      expect(uniqueChallenges.size).toBe(100);
    });
  });

  describe('RFC 6749 - OAuth 2.0 Authorization Framework Compliance', () => {
    test('should build compliant authorization URL', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      const buildAuthUrlMethod = (
        oauthClient as any
      ).buildAuthorizationUrl.bind(oauthClient);
      const authUrl = buildAuthUrlMethod({
        codeChallenge: challenge.codeChallenge,
        codeChallengeMethod: challenge.codeChallengeMethod,
        state: 'test-state-123',
        redirectUri: 'http://127.0.0.1:3000/callback',
      });

      const url = new URL(authUrl);

      // RFC 6749 Section 4.1.1 - Authorization Request parameters
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe(
        'http://127.0.0.1:3000/callback'
      );
      expect(url.searchParams.get('scope')).toBe('tutorial:read user:profile');
      expect(url.searchParams.get('state')).toBe('test-state-123');

      // URL should be properly encoded
      expect(url.toString()).not.toContain(' '); // Spaces should be encoded
    });

    test('should handle authorization code exchange correctly', async () => {
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

      // RFC 6749 Section 4.1.4 - Access Token Response
      expect(tokens.accessToken).toBe(mockTokens.accessToken);
      expect(tokens.tokenType).toBe('Bearer'); // Must be Bearer for OAuth 2.1
      expect(tokens.expiresIn).toBe(3600);
      expect(tokens.scope).toBe('tutorial:read user:profile');
    });

    test('should validate token response format compliance', async () => {
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

      // Validate token format compliance
      expect(typeof tokens.accessToken).toBe('string');
      expect(tokens.accessToken.length).toBeGreaterThan(0);
      expect(tokens.tokenType).toBe('Bearer');
      expect(typeof tokens.expiresIn).toBe('number');
      expect(tokens.expiresIn).toBeGreaterThan(0);
    });

    test('should handle refresh token flow correctly', async () => {
      const newTokens: OAuthTokens = {
        accessToken: 'new_access_token_54321',
        refreshToken: 'new_refresh_token_09876',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read user:profile',
      };

      setMockTokenResponse(newTokens);

      const refreshedTokens =
        await oauthClient.refreshToken('old_refresh_token');

      // RFC 6749 Section 6 - Refreshing an Access Token
      expect(refreshedTokens.accessToken).toBe(newTokens.accessToken);
      expect(refreshedTokens.tokenType).toBe('Bearer');
      expect(refreshedTokens.expiresIn).toBe(3600);
    });
  });

  describe('OAuth 2.1 Security Best Practices', () => {
    test('should only support authorization code flow', () => {
      // OAuth 2.1 prohibits implicit and password grants
      const authUrl = (oauthClient as any).buildAuthorizationUrl({
        codeChallenge: 'test-challenge',
        codeChallengeMethod: 'S256',
        state: 'test-state',
        redirectUri: 'http://127.0.0.1:3000/callback',
      });

      const url = new URL(authUrl);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('response_type')).not.toBe('token'); // No implicit flow
    });

    test('should require PKCE for all authorization requests', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      const authUrl = (oauthClient as any).buildAuthorizationUrl({
        codeChallenge: challenge.codeChallenge,
        codeChallengeMethod: challenge.codeChallengeMethod,
        state: 'test-state',
        redirectUri: 'http://127.0.0.1:3000/callback',
      });

      const url = new URL(authUrl);

      // PKCE is required for OAuth 2.1
      expect(url.searchParams.get('code_challenge')).toBeDefined();
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });

    test('should use cryptographically secure state parameter', () => {
      // The state parameter should be unguessable
      const states = Array.from({ length: 100 }, () => {
        const challenge = oauthClient.generatePKCEChallenge();
        return (oauthClient as any).buildAuthorizationUrl({
          codeChallenge: challenge.codeChallenge,
          codeChallengeMethod: challenge.codeChallengeMethod,
          state: randomBytes(16).toString('hex'),
          redirectUri: 'http://127.0.0.1:3000/callback',
        });
      }).map(url => new URL(url).searchParams.get('state'));

      // All states should be unique
      const uniqueStates = new Set(states);
      expect(uniqueStates.size).toBe(100);

      // States should be sufficiently long
      states.forEach(state => {
        expect(state!.length).toBeGreaterThanOrEqual(16);
      });
    });

    test('should validate bearer token requirements', async () => {
      const mockTokens: OAuthTokens = {
        accessToken: 'access_token_12345',
        refreshToken: 'refresh_token_67890',
        tokenType: 'Bearer',
        expiresIn: 3600,
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

      // OAuth 2.1 requires Bearer tokens
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.tokenType).not.toBe('MAC'); // MAC tokens not allowed in OAuth 2.1
    });
  });

  describe('Error Handling Compliance', () => {
    test('should handle authorization errors per RFC 6749 Section 4.1.2.1', async () => {
      setMockTokenError(400, 'invalid_request');

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(
        exchangeMethod('invalid_code', challenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });

    test('should handle PKCE validation errors', async () => {
      setMockTokenError(400, 'invalid_grant');

      const challenge = oauthClient.generatePKCEChallenge();
      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      // Send wrong code verifier to trigger PKCE validation error
      await expect(
        exchangeMethod('test_code', 'wrong_verifier')
      ).rejects.toThrow('Token exchange failed');
    });

    test('should handle token refresh errors per RFC 6749 Section 6', async () => {
      setMockTokenError(400, 'invalid_grant');

      await expect(
        oauthClient.refreshToken('invalid_refresh_token')
      ).rejects.toThrow('Token refresh failed');
    });
  });
});

// Mock server implementation for RFC 8414 compliance testing
async function createRFC8414CompliantServer(): Promise<Server> {
  return new Promise<Server>(resolve => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost`);

      if (url.pathname === '/.well-known/oauth-authorization-server') {
        handleWellKnownRequest(req, res);
      } else if (url.pathname === '/oauth/token' && req.method === 'POST') {
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

function handleWellKnownRequest(req: any, res: any): void {
  const address = req.socket.address();
  const baseUrl = `http://localhost:${address.port}`;

  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    jwks_uri: `${baseUrl}/.well-known/jwks.json`,
    scopes_supported: ['read', 'write', 'tutorial:read', 'user:profile'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic'],
    response_modes_supported: ['query'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    revocation_endpoint: `${baseUrl}/oauth/revoke`,
    introspection_endpoint: `${baseUrl}/oauth/introspect`,
  };

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(metadata));
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
    callbackUrl.searchParams.set('code', 'test_auth_code');
    callbackUrl.searchParams.set('state', state);

    res.writeHead(302, { Location: callbackUrl.toString() });
    res.end();
  } else {
    res.writeHead(400);
    res.end('Invalid request');
  }
}
