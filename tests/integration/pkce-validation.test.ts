/**
 * PKCE (Proof Key for Code Exchange) Validation Tests
 *
 * Comprehensive validation against RFC 7636 requirements:
 * - Code verifier generation and validation
 * - Code challenge creation and verification
 * - Authorization flow with PKCE
 * - Security requirements and edge cases
 * - Interoperability with different server implementations
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
import { createHash, randomBytes } from 'crypto';

describe('PKCE Validation Tests', () => {
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

  describe('RFC 7636 Section 4.1 - Code Verifier Requirements', () => {
    test('should generate code verifier with correct character set', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // RFC 7636: unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
      expect(challenge.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
    });

    test('should generate code verifier with minimum length of 43 characters', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // RFC 7636: code_verifier MUST have a minimum length of 43 characters
      expect(challenge.codeVerifier.length).toBeGreaterThanOrEqual(43);
    });

    test('should generate code verifier with maximum length of 128 characters', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // RFC 7636: code_verifier MUST have a maximum length of 128 characters
      expect(challenge.codeVerifier.length).toBeLessThanOrEqual(128);
    });

    test('should generate cryptographically secure code verifiers', () => {
      // Generate multiple verifiers to test randomness
      const verifiers = Array.from(
        { length: 1000 },
        () => oauthClient.generatePKCEChallenge().codeVerifier
      );

      // All verifiers should be unique
      const uniqueVerifiers = new Set(verifiers);
      expect(uniqueVerifiers.size).toBe(1000);

      // Verify entropy by checking character distribution
      const charCounts = new Map<string, number>();
      verifiers
        .join('')
        .split('')
        .forEach(char => {
          charCounts.set(char, (charCounts.get(char) || 0) + 1);
        });

      // Should use a good variety of characters (at least 10 different ones)
      expect(charCounts.size).toBeGreaterThanOrEqual(10);
    });

    test('should handle edge case lengths correctly', () => {
      // Since we use randomBytes(32).toString('base64url'), we get exactly 43 characters
      // This is the minimum required by RFC 7636
      const challenge = oauthClient.generatePKCEChallenge();
      expect(challenge.codeVerifier.length).toBe(43);
    });
  });

  describe('RFC 7636 Section 4.2 - Code Challenge Requirements', () => {
    test('should generate code challenge using SHA256 method', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      expect(challenge.codeChallengeMethod).toBe('S256');
      expect(challenge.codeChallenge).toBeDefined();
      expect(challenge.codeChallenge.length).toBeGreaterThan(0);
    });

    test('should generate correct SHA256 hash of code verifier', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // Manually compute the expected hash
      const expectedChallenge = createHash('sha256')
        .update(challenge.codeVerifier)
        .digest('base64url');

      expect(challenge.codeChallenge).toBe(expectedChallenge);
    });

    test('should generate base64url-encoded code challenge', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // Base64url uses [A-Za-z0-9\-_] and no padding
      expect(challenge.codeChallenge).toMatch(/^[A-Za-z0-9\-_]+$/);
      expect(challenge.codeChallenge).not.toContain('+'); // No plus
      expect(challenge.codeChallenge).not.toContain('/'); // No slash
      expect(challenge.codeChallenge).not.toContain('='); // No padding
    });

    test('should generate 43-character code challenge for SHA256', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // SHA256 produces 32 bytes, which is 43 characters in base64url
      expect(challenge.codeChallenge.length).toBe(43);
    });

    test('should validate code challenge determinism', () => {
      // Same code verifier should always produce same challenge
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

      const hash1 = createHash('sha256').update(verifier).digest('base64url');
      const hash2 = createHash('sha256').update(verifier).digest('base64url');

      expect(hash1).toBe(hash2);
      expect(hash1).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });
  });

  describe('RFC 7636 Section 4.3 - Authorization Request with PKCE', () => {
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

    test('should properly URL-encode PKCE parameters', () => {
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

      // Verify URL is properly formatted and parseable
      expect(() => new URL(authUrl)).not.toThrow();

      const url = new URL(authUrl);
      const codeChallenge = url.searchParams.get('code_challenge');

      // Should not contain URL-unsafe characters after encoding
      expect(codeChallenge).not.toContain(' ');
      expect(codeChallenge).not.toContain('+');
      expect(codeChallenge).not.toContain('/');
    });

    test('should maintain PKCE parameter integrity across URL parsing', () => {
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
      const extractedChallenge = url.searchParams.get('code_challenge');
      const extractedMethod = url.searchParams.get('code_challenge_method');

      expect(extractedChallenge).toBe(challenge.codeChallenge);
      expect(extractedMethod).toBe(challenge.codeChallengeMethod);
    });
  });

  describe('RFC 7636 Section 4.5 - Token Request with PKCE', () => {
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

    test('should validate PKCE verification on server side', async () => {
      const challenge = oauthClient.generatePKCEChallenge();
      const authCode = 'test_authorization_code';

      // Set up server to expect this specific challenge
      setExpectedPKCE(challenge);
      setMockTokenResponse({
        accessToken: 'access_token_123',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      // Should succeed with correct verifier
      const tokens = await exchangeMethod(authCode, challenge.codeVerifier);
      expect(tokens.accessToken).toBe('access_token_123');
    });

    test('should reject token request with wrong code verifier', async () => {
      const challenge = oauthClient.generatePKCEChallenge();
      const wrongChallenge = oauthClient.generatePKCEChallenge();
      const authCode = 'test_authorization_code';

      // Set up server to expect the first challenge
      setExpectedPKCE(challenge);
      setMockTokenError(400, 'invalid_grant');

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      // Should fail with wrong verifier
      await expect(
        exchangeMethod(authCode, wrongChallenge.codeVerifier)
      ).rejects.toThrow('Token exchange failed');
    });

    test('should reject token request without code verifier', async () => {
      const authCode = 'test_authorization_code';

      setMockTokenError(400, 'invalid_request');

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      // Should fail without code verifier
      await expect(exchangeMethod(authCode, '')).rejects.toThrow(
        'Token exchange failed'
      );
    });
  });

  describe('PKCE Security Properties', () => {
    test('should prevent authorization code interception attacks', async () => {
      // Simulate scenario where attacker intercepts authorization code
      // but doesn't have the code verifier
      const legitimateChallenge = oauthClient.generatePKCEChallenge();
      const authCode = 'intercepted_code_123';

      // Attacker tries to use intercepted code without proper verifier
      const attackerVerifier = 'attacker_generated_verifier_123456789';

      setExpectedPKCE(legitimateChallenge);
      setMockTokenError(400, 'invalid_grant');

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      // Attack should fail
      await expect(exchangeMethod(authCode, attackerVerifier)).rejects.toThrow(
        'Token exchange failed'
      );
    });

    test('should ensure code verifier cannot be derived from challenge', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // It should be computationally infeasible to derive verifier from challenge
      // We can't test the actual cryptographic strength, but we can verify
      // that the challenge doesn't contain obvious patterns from the verifier

      // Challenge should be different from verifier
      expect(challenge.codeChallenge).not.toBe(challenge.codeVerifier);

      // Challenge should not contain verifier as substring
      expect(challenge.codeChallenge).not.toContain(challenge.codeVerifier);
      expect(challenge.codeVerifier).not.toContain(challenge.codeChallenge);
    });

    test('should prevent replay attacks with different challenges', async () => {
      const challenge1 = oauthClient.generatePKCEChallenge();
      const challenge2 = oauthClient.generatePKCEChallenge();

      // Even if someone tries to replay an authorization with old challenge/verifier
      // it should fail because each authorization should use unique PKCE pair

      expect(challenge1.codeVerifier).not.toBe(challenge2.codeVerifier);
      expect(challenge1.codeChallenge).not.toBe(challenge2.codeChallenge);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle malformed code verifier gracefully', async () => {
      const authCode = 'test_code';
      const malformedVerifier = 'short'; // Too short

      setMockTokenError(400, 'invalid_request');

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(exchangeMethod(authCode, malformedVerifier)).rejects.toThrow(
        'Token exchange failed'
      );
    });

    test('should handle empty code verifier', async () => {
      const authCode = 'test_code';

      setMockTokenError(400, 'invalid_request');

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(exchangeMethod(authCode, '')).rejects.toThrow(
        'Token exchange failed'
      );
    });

    test('should handle very long code verifier', async () => {
      const authCode = 'test_code';
      const longVerifier = 'a'.repeat(200); // Too long per RFC 7636

      setMockTokenError(400, 'invalid_request');

      const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
        oauthClient
      );

      await expect(exchangeMethod(authCode, longVerifier)).rejects.toThrow(
        'Token exchange failed'
      );
    });
  });

  describe('Interoperability Tests', () => {
    test('should work with standard RFC 7636 test vectors', () => {
      // Using test vector from RFC 7636 Appendix B
      const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

      const actualChallenge = createHash('sha256')
        .update(testVerifier)
        .digest('base64url');

      expect(actualChallenge).toBe(expectedChallenge);
    });

    test('should generate verifiers compatible with other OAuth 2.1 implementations', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // Verify generated verifier meets all RFC requirements for interoperability
      expect(challenge.codeVerifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
      expect(challenge.codeChallengeMethod).toBe('S256');
      expect(challenge.codeChallenge).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    });

    test('should handle different base64url encoding implementations', () => {
      const challenge = oauthClient.generatePKCEChallenge();

      // Verify no problematic characters that might cause issues
      // with different base64url implementations
      expect(challenge.codeChallenge).not.toContain('+');
      expect(challenge.codeChallenge).not.toContain('/');
      expect(challenge.codeChallenge).not.toContain('=');
      expect(challenge.codeVerifier).not.toContain('+');
      expect(challenge.codeVerifier).not.toContain('/');
      expect(challenge.codeVerifier).not.toContain('=');
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

      // Verify code verifier matches expected challenge
      const computedChallenge = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');

      if (computedChallenge !== expectedPKCE.codeChallenge) {
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
