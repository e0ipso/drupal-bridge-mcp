import { describe, it, expect } from '@jest/globals';
import { decodeJwt, extractUserId } from '../jwt-decoder.js';

describe('JWT Decoder Utility', () => {
  describe('decodeJwt', () => {
    it('should decode a valid JWT token', () => {
      // Example JWT: { "sub": "user-123", "iat": 1516239022 }
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const decoded = decodeJwt(token);

      expect(decoded).toBeDefined();
      expect(decoded.sub).toBe('user-123');
      expect(decoded.iat).toBe(1516239022);
    });

    it('should throw error for malformed token (missing parts)', () => {
      const malformedToken = 'invalid.token';

      expect(() => decodeJwt(malformedToken)).toThrow(
        'Invalid JWT format: expected 3 parts'
      );
    });

    it('should throw error for invalid base64 payload', () => {
      const invalidToken = 'header.!!!invalid_base64!!!.signature';

      expect(() => decodeJwt(invalidToken)).toThrow('JWT decoding failed');
    });

    it('should decode token with multiple claims', () => {
      // Token with claims: { "sub": "user-456", "user_id": "456", "uid": "U456", "exp": 1735689600 }
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTQ1NiIsInVzZXJfaWQiOiI0NTYiLCJ1aWQiOiJVNDU2IiwiZXhwIjoxNzM1Njg5NjAwfQ.fake_signature';

      const decoded = decodeJwt(token);

      expect(decoded.sub).toBe('user-456');
      expect(decoded.user_id).toBe('456');
      expect(decoded.uid).toBe('U456');
      expect(decoded.exp).toBe(1735689600);
    });
  });

  describe('extractUserId', () => {
    it('should extract user ID from "sub" claim', () => {
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEyMyIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const userId = extractUserId(token);

      expect(userId).toBe('user-123');
    });

    it('should extract user ID from "user_id" claim when "sub" is missing', () => {
      // Token: { "user_id": "drupal-789", "iat": 1516239022 }
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZHJ1cGFsLTc4OSIsImlhdCI6MTUxNjIzOTAyMn0.fake_signature';

      const userId = extractUserId(token);

      expect(userId).toBe('drupal-789');
    });

    it('should extract user ID from "uid" claim when "sub" and "user_id" are missing', () => {
      // Token: { "uid": "U999", "iat": 1516239022 }
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJVOTk5IiwiaWF0IjoxNTE2MjM5MDIyfQ.fake_signature';

      const userId = extractUserId(token);

      expect(userId).toBe('U999');
    });

    it('should prioritize "sub" over other claims', () => {
      // Token: { "sub": "primary-user", "user_id": "secondary", "uid": "tertiary" }
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJwcmltYXJ5LXVzZXIiLCJ1c2VyX2lkIjoic2Vjb25kYXJ5IiwidWlkIjoidGVydGlhcnkifQ.fake_signature';

      const userId = extractUserId(token);

      expect(userId).toBe('primary-user');
    });

    it('should throw error when no user ID claims are present', () => {
      // Token: { "iat": 1516239022, "exp": 1735689600 }
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE1MTYyMzkwMjIsImV4cCI6MTczNTY4OTYwMH0.fake_signature';

      expect(() => extractUserId(token)).toThrow(
        'No user ID found in token claims (checked sub, user_id, uid)'
      );
    });

    it('should convert numeric user ID to string', () => {
      // Token: { "sub": 12345, "iat": 1516239022 }
      const token =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOjEyMzQ1LCJpYXQiOjE1MTYyMzkwMjJ9.fake_signature';

      const userId = extractUserId(token);

      expect(userId).toBe('12345');
      expect(typeof userId).toBe('string');
    });

    it('should throw error for malformed token', () => {
      const malformedToken = 'invalid.token';

      expect(() => extractUserId(malformedToken)).toThrow(
        'User ID extraction failed'
      );
    });
  });
});
