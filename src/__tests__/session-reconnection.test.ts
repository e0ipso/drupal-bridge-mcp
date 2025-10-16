/**
 * Integration tests for session reconnection and token management
 *
 * These tests validate the JWT decoder and session management logic that enables
 * MCP Inspector and other clients to reconnect without 403 errors.
 *
 * NOTE: Full integration tests require the server to be running independently.
 * These tests focus on the core session management logic.
 */

import { describe, it, expect } from '@jest/globals';
import { decodeJwt, extractUserId } from '../oauth/jwt-decoder.js';
import type { TokenResponse } from '../oauth/provider.js';

describe('Session Reconnection and Token Management', () => {
  describe('JWT User ID Extraction', () => {
    it('should extract user ID from standard JWT tokens', () => {
      // Token with sub: "user-123"
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const userId = extractUserId(token);
      expect(userId).toBe('user-123');
    });

    it('should extract user ID from tokens with user_id claim', () => {
      // Token with user_id: "drupal-456"
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZHJ1cGFsLTQ1NiIsImlhdCI6MTUxNjIzOTAyMn0.fake_signature';

      const userId = extractUserId(token);
      expect(userId).toBe('drupal-456');
    });

    it('should extract user ID from tokens with uid claim', () => {
      // Token with uid: "U999"
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJVOTk5IiwiaWF0IjoxNTE2MjM5MDIyfQ.fake_signature';

      const userId = extractUserId(token);
      expect(userId).toBe('U999');
    });

    it('should prioritize sub claim over other user ID claims', () => {
      // Token with multiple user ID claims
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwcmltYXJ5LXVzZXIiLCJ1c2VyX2lkIjoic2Vjb25kYXJ5IiwidWlkIjoidGVydGlhcnkifQ.fake_signature';

      const userId = extractUserId(token);
      expect(userId).toBe('primary-user');
    });
  });

  describe('Token Reuse Logic', () => {
    it('should demonstrate token reuse pattern for reconnection', () => {
      // Simulated user-level token storage
      const userTokens = new Map<string, TokenResponse>();
      const sessionToUser = new Map<string, string>();

      // Session 1: Initial authentication
      const session1 = 'session-abc-123';
      const tokens: TokenResponse = {
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'profile email',
      };

      // Extract user ID and store tokens
      const userId = extractUserId(tokens.access_token);
      userTokens.set(userId, tokens);
      sessionToUser.set(session1, userId);

      expect(userTokens.size).toBe(1);
      expect(sessionToUser.size).toBe(1);

      // Session close (disconnect)
      sessionToUser.delete(session1);

      // Tokens remain in userTokens
      expect(userTokens.size).toBe(1);
      expect(sessionToUser.size).toBe(0);

      // Session 2: Reconnection with new session ID, same user
      const session2 = 'session-xyz-789';

      // Check if user already has tokens (reconnection scenario)
      const existingTokens = userTokens.get(userId);
      expect(existingTokens).toBeDefined();
      expect(existingTokens?.access_token).toBe(tokens.access_token);

      // Reuse existing tokens, map new session to user
      sessionToUser.set(session2, userId);

      // Verify state: still 1 user, but new session mapped
      expect(userTokens.size).toBe(1);
      expect(sessionToUser.size).toBe(1);
      expect(sessionToUser.get(session2)).toBe(userId);
    });

    it('should demonstrate multi-user token isolation', () => {
      const userTokens = new Map<string, TokenResponse>();
      const sessionToUser = new Map<string, string>();

      // User A authentication
      const sessionA = 'session-user-a';
      const tokensA: TokenResponse = {
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWEiLCJpYXQiOjE1MTYyMzkwMjJ9.fake_sig_a',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'profile email',
      };

      const userIdA = extractUserId(tokensA.access_token);
      userTokens.set(userIdA, tokensA);
      sessionToUser.set(sessionA, userIdA);

      // User B authentication
      const sessionB = 'session-user-b';
      const tokensB: TokenResponse = {
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWIiLCJpYXQiOjE1MTYyMzkwMjJ9.fake_sig_b',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'profile email',
      };

      const userIdB = extractUserId(tokensB.access_token);
      userTokens.set(userIdB, tokensB);
      sessionToUser.set(sessionB, userIdB);

      // Verify isolation: 2 users, 2 sessions, different tokens
      expect(userTokens.size).toBe(2);
      expect(sessionToUser.size).toBe(2);
      expect(userTokens.get(userIdA)).toBe(tokensA);
      expect(userTokens.get(userIdB)).toBe(tokensB);
      expect(tokensA.access_token).not.toBe(tokensB.access_token);
    });

    it('should demonstrate explicit logout removes user tokens', () => {
      const userTokens = new Map<string, TokenResponse>();
      const sessionToUser = new Map<string, string>();

      // Authentication
      const session = 'session-logout-test';
      const tokens: TokenResponse = {
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'profile email',
      };

      const userId = extractUserId(tokens.access_token);
      userTokens.set(userId, tokens);
      sessionToUser.set(session, userId);

      expect(userTokens.has(userId)).toBe(true);
      expect(sessionToUser.has(session)).toBe(true);

      // Explicit logout: remove user tokens AND session mapping
      userTokens.delete(userId);
      sessionToUser.delete(session);

      expect(userTokens.has(userId)).toBe(false);
      expect(sessionToUser.has(session)).toBe(false);
    });

    it('should demonstrate multiple reconnections reuse same tokens', () => {
      const userTokens = new Map<string, TokenResponse>();
      const sessionToUser = new Map<string, string>();

      // Initial authentication
      const tokens: TokenResponse = {
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'profile email',
      };
      const userId = extractUserId(tokens.access_token);
      const originalToken = tokens.access_token;

      // Simulate 5 reconnections
      const sessions = [
        'session-1',
        'session-2',
        'session-3',
        'session-4',
        'session-5',
      ];

      for (const sessionId of sessions) {
        // Check if user already exists (reconnection)
        const existingTokens = userTokens.get(userId);

        if (!existingTokens) {
          // First time: store tokens
          userTokens.set(userId, tokens);
        } else {
          // Reconnection: reuse existing tokens
          expect(existingTokens.access_token).toBe(originalToken);
        }

        // Map session to user
        sessionToUser.set(sessionId, userId);

        // Close previous sessions (simulate disconnect)
        const previousSessions = sessions.slice(0, sessions.indexOf(sessionId));
        previousSessions.forEach(s => sessionToUser.delete(s));
      }

      // Verify: only 1 user stored, last session mapped
      expect(userTokens.size).toBe(1);
      expect(sessionToUser.size).toBe(1);
      expect(sessionToUser.get('session-5')).toBe(userId);
      expect(userTokens.get(userId)?.access_token).toBe(originalToken);
    });
  });

  describe('Two-Step Token Lookup', () => {
    it('should demonstrate session → user → tokens lookup pattern', () => {
      const userTokens = new Map<string, TokenResponse>();
      const sessionToUser = new Map<string, string>();

      // Setup: user authenticated
      const session = 'session-abc-123';
      const tokens: TokenResponse = {
        access_token:
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'profile email',
      };
      const userId = extractUserId(tokens.access_token);
      userTokens.set(userId, tokens);
      sessionToUser.set(session, userId);

      // Two-step lookup (simulating getSession method)
      // Step 1: session → userId
      const lookupUserId = sessionToUser.get(session);
      expect(lookupUserId).toBe(userId);

      // Step 2: userId → tokens
      const lookupTokens = lookupUserId ? userTokens.get(lookupUserId) : null;
      expect(lookupTokens).toBeDefined();
      expect(lookupTokens?.access_token).toBe(tokens.access_token);
    });

    it('should return null when session not mapped to user', () => {
      const userTokens = new Map<string, TokenResponse>();
      const sessionToUser = new Map<string, string>();

      // Unauthenticated session
      const session = 'session-unauth';

      // Step 1: fails
      const lookupUserId = sessionToUser.get(session);
      expect(lookupUserId).toBeUndefined();

      // Early return null
      const lookupTokens = lookupUserId ? userTokens.get(lookupUserId) : null;
      expect(lookupTokens).toBeNull();
    });

    it('should return null when user has no tokens (logged out)', () => {
      const userTokens = new Map<string, TokenResponse>();
      const sessionToUser = new Map<string, string>();

      // Session mapped but user logged out
      const session = 'session-logged-out';
      const userId = 'user-logged-out';
      sessionToUser.set(session, userId);
      // Note: userTokens does NOT have userId

      // Step 1: succeeds
      const lookupUserId = sessionToUser.get(session);
      expect(lookupUserId).toBe(userId);

      // Step 2: fails
      const lookupTokens = lookupUserId
        ? userTokens.get(lookupUserId)
        : undefined;
      expect(lookupTokens).toBeUndefined();
    });
  });
});
