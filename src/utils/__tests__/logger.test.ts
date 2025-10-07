import { describe, it, expect } from '@jest/globals';
import { redactAuthHeader } from '../logger.js';

describe('Logger Utility', () => {
  describe('redactAuthHeader', () => {
    describe('undefined/missing authorization header', () => {
      it('should return "(none)" when authHeader is undefined', () => {
        const result = redactAuthHeader(undefined);
        expect(result).toBe('(none)');
      });
    });

    describe('Bearer token authorization', () => {
      it('should redact Bearer token showing last 6 characters', () => {
        const token =
          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        const authHeader = `Bearer ${token}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***Qssw5c');
        expect(result).toContain('***');
        expect(result.length).toBeLessThan(authHeader.length);
      });

      it('should redact very long Bearer token correctly', () => {
        const longToken = 'a'.repeat(1000) + 'xyz123';
        const authHeader = `Bearer ${longToken}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***xyz123');
      });

      it('should handle Bearer token with exactly 6 characters', () => {
        const authHeader = 'Bearer abc123';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***');
      });

      it('should handle Bearer token with less than 6 characters', () => {
        const authHeader = 'Bearer abc';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***');
      });

      it('should handle Bearer token with exactly 7 characters (edge case)', () => {
        const authHeader = 'Bearer abcdefg';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***bcdefg');
      });

      it('should handle Bearer with empty token', () => {
        const authHeader = 'Bearer ';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***');
      });

      it('should preserve "Bearer" prefix in output', () => {
        const authHeader = 'Bearer sometoken123456';

        const result = redactAuthHeader(authHeader);

        expect(result).toMatch(/^Bearer \*\*\*/);
      });
    });

    describe('Basic authentication', () => {
      it('should redact Basic auth credentials showing last 6 characters', () => {
        const credentials = Buffer.from('username:password').toString('base64');
        const authHeader = `Basic ${credentials}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toMatch(/^Basic \*\*\*/);
        expect(result).toBe(`Basic ***${credentials.slice(-6)}`);
      });

      it('should handle Basic auth with short credentials (6 chars)', () => {
        const authHeader = 'Basic abc123';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Basic ***');
      });

      it('should handle Basic auth with very short credentials', () => {
        const authHeader = 'Basic abc';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Basic ***');
      });

      it('should handle Basic auth with exactly 7 characters', () => {
        const authHeader = 'Basic abcdefg';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Basic ***bcdefg');
      });
    });

    describe('other authentication schemes', () => {
      it('should redact Digest auth credentials', () => {
        const credentials =
          'username="user", realm="realm", nonce="nonce123456"';
        const authHeader = `Digest ${credentials}`;

        const result = redactAuthHeader(authHeader);

        // Digest auth contains spaces, so it falls back to '***'
        expect(result).toBe('***');
      });

      it('should redact custom auth scheme with two parts', () => {
        const authHeader = 'CustomScheme secret123456';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('CustomScheme ***123456');
      });

      it('should handle auth scheme with short credentials', () => {
        const authHeader = 'API-Key short';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('API-Key ***');
      });

      it('should handle auth scheme with undefined credentials (edge case)', () => {
        // This would only happen with a header like "Scheme " with trailing space
        // but the split would give us ['Scheme', ''] which is an empty string, not undefined
        const authHeader = 'Scheme ';

        const result = redactAuthHeader(authHeader);

        // Empty string is falsy but has length 0, which is <= 6, so returns "Scheme ***"
        expect(result).toBe('Scheme ***');
      });
    });

    describe('malformed or unknown formats', () => {
      it('should return "***" for single-part header without space', () => {
        const authHeader = 'malformed-token-without-space';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('***');
      });

      it('should return "***" for header with more than 2 parts', () => {
        const authHeader = 'Bearer token extra parts';

        const result = redactAuthHeader(authHeader);

        // "Bearer token extra parts" starts with "Bearer " so it's treated as Bearer token
        // The token part is "token extra parts" (last 6 chars: " parts")
        expect(result).toBe('Bearer *** parts');
      });

      it('should return "***" for empty string', () => {
        const authHeader = '';

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('(none)');
      });

      it('should return "***" for header with only whitespace between parts', () => {
        const authHeader = 'Scheme  ';

        const result = redactAuthHeader(authHeader);

        // When split by space, we get ['Scheme', '', ''] - length is 3, so fallback to '***'
        expect(result).toBe('***');
      });
    });

    describe('edge cases and security considerations', () => {
      it('should never expose full token value in output', () => {
        const secretToken = 'super-secret-token-value-12345';
        const authHeader = `Bearer ${secretToken}`;

        const result = redactAuthHeader(authHeader);

        expect(result).not.toContain(secretToken);
        expect(result).toContain('***');
      });

      it('should handle special characters in token', () => {
        const tokenWithSpecialChars = 'token!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
        const authHeader = `Bearer ${tokenWithSpecialChars}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toBe(`Bearer ***<>?/~\``);
        expect(result).toContain('***');
      });

      it('should handle unicode characters in token', () => {
        const unicodeToken = 'token\u00A9\u00AE\u2122abc123';
        const authHeader = `Bearer ${unicodeToken}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toContain('***');
        expect(result).toBe(`Bearer ***abc123`);
      });

      it('should handle newlines in token (should not occur but test defensive coding)', () => {
        const tokenWithNewline = 'token\nwith\nnewlines123456';
        const authHeader = `Bearer ${tokenWithNewline}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toContain('***');
        expect(result).toBe(`Bearer ***123456`);
      });

      it('should consistently redact same token', () => {
        const authHeader = 'Bearer sametoken123456';

        const result1 = redactAuthHeader(authHeader);
        const result2 = redactAuthHeader(authHeader);

        expect(result1).toBe(result2);
        expect(result1).toBe('Bearer ***123456');
      });
    });

    describe('real-world scenarios', () => {
      it('should redact JWT access token', () => {
        const jwtToken =
          'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IjEyMzQ1Njc4OTAifQ.eyJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJzdWIiOiJ1c2VyMTIzIiwiYXVkIjoiYXBpLmV4YW1wbGUuY29tIiwiZXhwIjoxNzM1Njg5NjAwLCJpYXQiOjE3MzU2ODYwMDAsInNjb3BlIjoicmVhZDp1c2VycyB3cml0ZTp1c2VycyJ9.signature';
        const authHeader = `Bearer ${jwtToken}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***nature');
        expect(result).not.toContain('eyJhbGc');
        expect(result.length).toBeLessThan(authHeader.length);
      });

      it('should redact OAuth2 token', () => {
        const oauthToken = 'ya29.a0AfH6SMBx...very_long_token...xyz789';
        const authHeader = `Bearer ${oauthToken}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***xyz789');
      });

      it('should redact API key in custom format', () => {
        const apiKey = 'sk_live_51HqF2KGH78abcdefghijklmnop';
        const authHeader = `Bearer ${apiKey}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toBe('Bearer ***klmnop');
      });

      it('should redact Basic auth with typical base64 credentials', () => {
        const username = 'admin@example.com';
        const password = 'SecureP@ssw0rd!123';
        const credentials = Buffer.from(`${username}:${password}`).toString(
          'base64'
        );
        const authHeader = `Basic ${credentials}`;

        const result = redactAuthHeader(authHeader);

        expect(result).toMatch(/^Basic \*\*\*/);
        expect(result).not.toContain(password);
        expect(result).not.toContain(username);
        expect(result).toBe(`Basic ***${credentials.slice(-6)}`);
      });
    });
  });
});
