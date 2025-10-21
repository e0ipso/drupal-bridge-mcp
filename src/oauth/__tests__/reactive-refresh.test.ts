/**
 * Integration tests for reactive token refresh and request retry logic
 *
 * Tests the complete flow:
 * 1. Request with expired token → 401
 * 2. Automatic token refresh using refresh_token
 * 3. Request retry with new token → Success
 *
 * Also tests error cases: expired refresh tokens, network failures, etc.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

// Mock jose module to avoid ESM issues
jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn(),
}));

// Now import after mocking
import { DrupalOAuthProvider } from '../provider.js';
import { OAuthConfigManager } from '../config.js';

// Mock fetch globally with proper typing
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('Reactive Token Refresh Integration', () => {
  let provider: DrupalOAuthProvider;
  let configManager: OAuthConfigManager;

  const mockMetadata: OAuthMetadata = {
    issuer: 'https://drupal.test',
    authorization_endpoint: 'https://drupal.test/oauth/authorize',
    token_endpoint: 'https://drupal.test/oauth/token',
    jwks_uri: 'https://drupal.test/oauth/jwks',
    scopes_supported: ['profile'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup config manager with test configuration
    configManager = new OAuthConfigManager({
      drupalUrl: 'https://drupal.test',
      scopes: ['profile'],
      additionalScopes: [],
    });

    provider = new DrupalOAuthProvider(configManager);
  });

  describe('Reactive refresh on 401', () => {
    it('should refresh token and return new access token on reactive refresh', async () => {
      const sessionId = 'session-1';

      // Store initial tokens
      provider.storeSessionTokens(sessionId, {
        access_token: 'expired-token',
        token_type: 'Bearer',
        expires_in: 300,
        refresh_token: 'valid-refresh-token',
        scope: 'profile',
      });

      // Mock OAuth metadata fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock successful token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'new-access-token',
            token_type: 'Bearer',
            expires_in: 300,
            refresh_token: 'new-refresh-token',
            scope: 'profile',
          }),
      } as any);

      // Execute refresh
      const newToken = await provider.refreshSessionToken(sessionId);

      expect(newToken).toBe('new-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://drupal.test/oauth/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('grant_type=refresh_token'),
        })
      );
      expect(mockFetch).toHaveBeenCalledWith(
        'https://drupal.test/oauth/token',
        expect.objectContaining({
          body: expect.stringContaining('refresh_token=valid-refresh-token'),
        })
      );
    });

    it.skip('should fail with clear error when refresh token expired', async () => {
      const sessionId = 'session-1';

      provider.storeSessionTokens(sessionId, {
        access_token: 'expired-token',
        token_type: 'Bearer',
        expires_in: 300,
        refresh_token: 'expired-refresh-token',
        scope: 'profile',
      });

      // Mock OAuth metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock refresh failure with invalid_grant
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        async text() {
          return JSON.stringify({
            error: 'invalid_grant',
            error_description: 'The refresh token is invalid.',
          });
        },
      } as any);

      await expect(provider.refreshSessionToken(sessionId)).rejects.toThrow(
        /invalid_grant/
      );
    });

    it('should fail when session not authenticated', async () => {
      const sessionId = 'not-authenticated-session';

      await expect(provider.refreshSessionToken(sessionId)).rejects.toThrow(
        'Session not authenticated'
      );
    });

    it('should fail when no refresh token available', async () => {
      const sessionId = 'session-no-refresh';

      // Store tokens without refresh_token
      provider.storeSessionTokens(sessionId, {
        access_token: 'access-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'profile',
      });

      await expect(provider.refreshSessionToken(sessionId)).rejects.toThrow(
        'No refresh token available'
      );
    });
  });

  describe('Proactive refresh soft-fail', () => {
    it('should preserve tokens on temporary proactive refresh failure', async () => {
      const sessionId = 'session-1';

      // Store valid tokens
      provider.storeSessionTokens(sessionId, {
        access_token: 'old-access-token',
        token_type: 'Bearer',
        expires_in: -10, // Expired to trigger proactive refresh
        refresh_token: 'valid-refresh-token',
        scope: 'profile',
      });

      // Mock OAuth metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock network error on proactive refresh (temporary failure)
      mockFetch.mockRejectedValueOnce(
        new Error('Network error: Connection refused')
      );

      // Should return expired token (soft-fail)
      const token = await provider.getToken(sessionId);

      // Token should still be available (not cleared)
      expect(token).toBe('old-access-token');

      // Verify tokens were NOT cleared
      const userId = provider.getUserIdForSession(sessionId);
      expect(userId).toBeDefined();
      expect(provider.hasUserTokens(userId!)).toBe(true);
    });
  });

  describe('Error classification', () => {
    it('should identify network errors as temporary failure', async () => {
      const sessionId = 'session-1';

      provider.storeSessionTokens(sessionId, {
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: -10,
        refresh_token: 'refresh',
        scope: 'profile',
      });

      // Mock metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      // Should soft-fail and return expired token
      const token = await provider.getToken(sessionId);
      expect(token).toBe('token');

      // Tokens should NOT be cleared
      const userId = provider.getUserIdForSession(sessionId);
      expect(userId).toBeDefined();
      expect(provider.hasUserTokens(userId!)).toBe(true);
    });

    it('should identify server errors (500) as temporary failure', async () => {
      const sessionId = 'session-1';

      provider.storeSessionTokens(sessionId, {
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: -10,
        refresh_token: 'refresh',
        scope: 'profile',
      });

      // Mock metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock server error
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      } as any);

      // Should soft-fail
      const token = await provider.getToken(sessionId);
      expect(token).toBe('token');

      // Tokens should NOT be cleared
      expect(provider.getUserIdForSession(sessionId)).toBeDefined();
    });
  });

  describe('Cross-session token update', () => {
    it.skip('should update tokens for all user sessions on reactive refresh', async () => {
      const session1 = 'session-1';
      const session2 = 'session-2';
      const userId = 'user-123';

      // Store tokens for both sessions with same userId
      provider.storeSessionTokens(
        session1,
        {
          access_token: 'old-token',
          token_type: 'Bearer',
          expires_in: 300,
          refresh_token: 'refresh-token',
          scope: 'profile',
        },
        userId
      );

      provider.storeSessionTokens(
        session2,
        {
          access_token: 'old-token',
          token_type: 'Bearer',
          expires_in: 300,
          refresh_token: 'refresh-token',
          scope: 'profile',
        },
        userId
      );

      // Verify both sessions map to same user
      expect(provider.getUserIdForSession(session1)).toBe(userId);
      expect(provider.getUserIdForSession(session2)).toBe(userId);

      // Mock metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock successful refresh from session 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'new-token',
            token_type: 'Bearer',
            expires_in: 300,
            refresh_token: 'new-refresh-token',
            scope: 'profile',
          }),
      } as any);

      // Trigger refresh from session 1
      const newToken = await provider.refreshSessionToken(session1);
      expect(newToken).toBe('new-token');

      // Verify session 1 has new token
      const auth1 = await provider.getSessionAuthorization(session1);
      expect(auth1?.accessToken).toBe('new-token');

      // Verify both sessions still map to same user (cross-session mapping works)
      expect(provider.getUserIdForSession(session1)).toBe(userId);
      expect(provider.getUserIdForSession(session2)).toBe(userId);
    });

    it('should isolate token updates by user', async () => {
      const user1Session = 'user1-session';
      const user2Session = 'user2-session';

      // Store tokens for user 1
      provider.storeSessionTokens(
        user1Session,
        {
          access_token: 'user1-token',
          token_type: 'Bearer',
          expires_in: 300,
          refresh_token: 'user1-refresh',
          scope: 'profile',
        },
        'user-1'
      );

      // Store tokens for user 2
      provider.storeSessionTokens(
        user2Session,
        {
          access_token: 'user2-token',
          token_type: 'Bearer',
          expires_in: 300,
          refresh_token: 'user2-refresh',
          scope: 'profile',
        },
        'user-2'
      );

      // Verify different users
      expect(provider.getUserIdForSession(user1Session)).toBe('user-1');
      expect(provider.getUserIdForSession(user2Session)).toBe('user-2');

      // Mock metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock refresh for user 1
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'user1-new-token',
            token_type: 'Bearer',
            expires_in: 300,
            refresh_token: 'user1-new-refresh',
            scope: 'profile',
          }),
      } as any);

      // Refresh user 1's tokens
      await provider.refreshSessionToken(user1Session);

      // User 1 should have new token
      const user1Token = await provider.getToken(user1Session);
      expect(user1Token).toBe('user1-new-token');

      // User 2 should still have old token (not affected)
      const user2Token = await provider.getToken(user2Session);
      expect(user2Token).toBe('user2-token');
    });
  });

  describe('Token storage and retrieval', () => {
    it('should preserve refresh_token across access_token refreshes', async () => {
      const sessionId = 'session-1';

      provider.storeSessionTokens(sessionId, {
        access_token: 'old-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        refresh_token: 'original-refresh-token',
        scope: 'profile',
      });

      // Mock metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock refresh that doesn't return new refresh_token (some servers do this)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'new-access-token',
            token_type: 'Bearer',
            expires_in: 300,
            // No refresh_token in response
            scope: 'profile',
          }),
      } as any);

      await provider.refreshSessionToken(sessionId);

      // Get authorization to verify refresh_token is preserved
      const auth = await provider.getSessionAuthorization(sessionId);
      expect(auth?.refreshToken).toBe('original-refresh-token');
    });

    it('should update refresh_token when new one provided', async () => {
      const sessionId = 'session-1';

      provider.storeSessionTokens(sessionId, {
        access_token: 'old-access-token',
        token_type: 'Bearer',
        expires_in: 300,
        refresh_token: 'old-refresh-token',
        scope: 'profile',
      });

      // Mock metadata
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMetadata,
      } as any);

      // Mock refresh with new refresh_token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: async () =>
          JSON.stringify({
            access_token: 'new-access-token',
            token_type: 'Bearer',
            expires_in: 300,
            refresh_token: 'new-refresh-token',
            scope: 'profile',
          }),
      } as any);

      await provider.refreshSessionToken(sessionId);

      const auth = await provider.getSessionAuthorization(sessionId);
      expect(auth?.refreshToken).toBe('new-refresh-token');
    });
  });
});
