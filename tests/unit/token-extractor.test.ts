/**
 * Unit Tests for Token Extractor
 *
 * Tests token extraction and validation functionality for the simplified MCP architecture.
 */

import { describe, it, expect } from '@jest/globals';
import {
  TokenExtractor,
  TokenValidationError,
  extractTokenFromAuth,
  isValidTokenFormat,
  createSafeTokenForLogging,
} from '../../src/mcp/token-extractor.js';

describe('TokenExtractor', () => {
  const VALID_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
  const SHORT_TOKEN = 'short';
  const EMPTY_TOKEN = '';
  const WHITESPACE_TOKEN = '   ';

  describe('extractFromHeaders', () => {
    it('should extract token from Authorization header', () => {
      const headers = { authorization: `Bearer ${VALID_TOKEN}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
      expect(result.error).toBeUndefined();
    });

    it('should handle case-insensitive Authorization header', () => {
      const headers = { Authorization: `Bearer ${VALID_TOKEN}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
    });

    it('should handle mixed case Authorization header', () => {
      const headers = { auTHorIZaTion: `Bearer ${VALID_TOKEN}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
    });

    it('should extract token without Bearer prefix when stripBearerPrefix is true', () => {
      const headers = { authorization: VALID_TOKEN };
      const result = TokenExtractor.extractFromHeaders(headers, {
        stripBearerPrefix: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
    });

    it('should handle token with Bearer prefix', () => {
      const headers = { authorization: `Bearer ${VALID_TOKEN}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
    });

    it('should require Bearer prefix when requireBearerPrefix is true', () => {
      const headers = { authorization: VALID_TOKEN };
      const result = TokenExtractor.extractFromHeaders(headers, {
        requireBearerPrefix: true,
      });

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.INVALID_BEARER_FORMAT);
    });

    it('should handle array values in headers', () => {
      const headers = { authorization: [`Bearer ${VALID_TOKEN}`, 'other'] };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
    });

    it('should return error for missing headers', () => {
      const result = TokenExtractor.extractFromHeaders(undefined);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.MISSING_TOKEN);
      expect(result.error).toContain('No headers provided');
    });

    it('should return error for missing Authorization header', () => {
      const headers = { 'content-type': 'application/json' };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.MISSING_TOKEN);
      expect(result.error).toContain('No Authorization header found');
    });

    it('should return error for short token', () => {
      const headers = { authorization: `Bearer ${SHORT_TOKEN}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.INVALID_FORMAT);
      expect(result.error).toContain('too short');
    });

    it('should return error for empty token', () => {
      const headers = { authorization: `Bearer ${EMPTY_TOKEN}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.EMPTY_TOKEN);
    });

    it('should return error for whitespace-only token', () => {
      const headers = { authorization: `Bearer ${WHITESPACE_TOKEN}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.EMPTY_TOKEN);
    });

    it('should allow empty token when allowEmpty is true', () => {
      const headers = { authorization: 'Bearer ' };
      const result = TokenExtractor.extractFromHeaders(headers, {
        allowEmpty: true,
      });

      expect(result.isValid).toBe(true);
      expect(result.token).toBe('');
    });
  });

  describe('extractFromParams', () => {
    it('should extract token from access_token parameter', () => {
      const params = { access_token: VALID_TOKEN };
      const result = TokenExtractor.extractFromParams(params);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
    });

    it('should extract token from custom field', () => {
      const params = { token: VALID_TOKEN };
      const result = TokenExtractor.extractFromParams(params, 'token');

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
    });

    it('should return error for missing parameters', () => {
      const result = TokenExtractor.extractFromParams(undefined);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.MISSING_TOKEN);
      expect(result.error).toContain('No parameters provided');
    });

    it('should return error for missing token field', () => {
      const params = { other_field: 'value' };
      const result = TokenExtractor.extractFromParams(params);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.MISSING_TOKEN);
      expect(result.error).toContain('No access_token parameter found');
    });

    it('should handle non-object parameters', () => {
      const result = TokenExtractor.extractFromParams('not an object' as any);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.MISSING_TOKEN);
    });
  });

  describe('extractFromRequest', () => {
    it('should prefer header over parameters', () => {
      const headerToken = `${VALID_TOKEN}_header`;
      const paramToken = `${VALID_TOKEN}_param`;

      const context = {
        headers: { authorization: `Bearer ${headerToken}` },
        params: { access_token: paramToken },
      };

      const result = TokenExtractor.extractFromRequest(context);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(headerToken);
    });

    it('should fallback to parameters if headers fail', () => {
      const context = {
        headers: { 'content-type': 'application/json' }, // No auth header
        params: { access_token: VALID_TOKEN },
      };

      const result = TokenExtractor.extractFromRequest(context);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(VALID_TOKEN);
    });

    it('should return header error if both fail', () => {
      const context = {
        headers: { 'content-type': 'application/json' },
        params: { other_field: 'value' },
      };

      const result = TokenExtractor.extractFromRequest(context);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Authorization header');
    });

    it('should handle missing context', () => {
      const result = TokenExtractor.extractFromRequest({});

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.MISSING_TOKEN);
    });
  });

  describe('validateTokens (batch validation)', () => {
    it('should validate multiple tokens', () => {
      const tokens = [VALID_TOKEN, `${VALID_TOKEN}_2`, SHORT_TOKEN];
      const result = TokenExtractor.validateTokens(tokens);

      expect(result.valid).toHaveLength(2);
      expect(result.invalid).toHaveLength(1);
      expect(result.valid).toContain(VALID_TOKEN);
      expect(result.valid).toContain(`${VALID_TOKEN}_2`);
      expect(result.invalid[0].token).toContain(SHORT_TOKEN);
    });

    it('should truncate long tokens in error messages', () => {
      const longInvalidToken = 'a'.repeat(50); // Invalid because too short for our validation
      const result = TokenExtractor.validateTokens([longInvalidToken]);

      expect(result.invalid[0].token).toHaveLength(23); // 20 chars + '...'
      expect(result.invalid[0].token).toEndWith('...');
    });

    it('should handle empty token array', () => {
      const result = TokenExtractor.validateTokens([]);

      expect(result.valid).toHaveLength(0);
      expect(result.invalid).toHaveLength(0);
    });
  });

  describe('createAuthorizationHeader', () => {
    it('should create Authorization header with Bearer prefix', () => {
      const result = TokenExtractor.createAuthorizationHeader(VALID_TOKEN);

      expect(result).toBe(`Bearer ${VALID_TOKEN}`);
    });

    it('should not double-prefix Bearer tokens', () => {
      const bearerToken = `Bearer ${VALID_TOKEN}`;
      const result = TokenExtractor.createAuthorizationHeader(bearerToken);

      expect(result).toBe(bearerToken);
    });

    it('should handle mixed case Bearer prefix', () => {
      const bearerToken = `bearer ${VALID_TOKEN}`;
      const result = TokenExtractor.createAuthorizationHeader(bearerToken);

      expect(result).toBe(bearerToken);
    });

    it('should trim whitespace', () => {
      const result = TokenExtractor.createAuthorizationHeader(
        `  ${VALID_TOKEN}  `
      );

      expect(result).toBe(`Bearer ${VALID_TOKEN}`);
    });
  });

  describe('Token validation edge cases', () => {
    it('should handle non-string tokens', () => {
      const headers = { authorization: 123 as any };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.INVALID_FORMAT);
    });

    it('should handle null/undefined tokens', () => {
      const headers = { authorization: null as any };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe(TokenValidationError.INVALID_FORMAT);
    });

    it('should warn about suspicious characters but still validate', () => {
      const suspiciousToken = 'valid-token-but-with-newline\n123456789';
      const headers = { authorization: `Bearer ${suspiciousToken}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      // Should still be valid (length check passes) but would log a warning
      expect(result.isValid).toBe(true);
      expect(result.token).toBe(suspiciousToken);
    });

    it('should validate tokens with allowed characters', () => {
      const validChars = 'abcABC123._-1234567890';
      const headers = { authorization: `Bearer ${validChars}` };
      const result = TokenExtractor.extractFromHeaders(headers);

      expect(result.isValid).toBe(true);
      expect(result.token).toBe(validChars);
    });
  });
});

describe('Token utility functions', () => {
  const VALID_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';

  describe('extractTokenFromAuth', () => {
    it('should extract token from valid auth header', () => {
      const result = extractTokenFromAuth(`Bearer ${VALID_TOKEN}`);
      expect(result).toBe(VALID_TOKEN);
    });

    it('should return null for invalid auth header', () => {
      const result = extractTokenFromAuth('invalid');
      expect(result).toBeNull();
    });

    it('should return null for undefined', () => {
      const result = extractTokenFromAuth(undefined);
      expect(result).toBeNull();
    });
  });

  describe('isValidTokenFormat', () => {
    it('should return true for valid token', () => {
      expect(isValidTokenFormat(VALID_TOKEN)).toBe(true);
    });

    it('should return false for invalid token', () => {
      expect(isValidTokenFormat('short')).toBe(false);
      expect(isValidTokenFormat('')).toBe(false);
    });
  });

  describe('createSafeTokenForLogging', () => {
    it('should mask long tokens safely', () => {
      const longToken = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const result = createSafeTokenForLogging(longToken);

      expect(result).toMatch(/^abcdefgh\*+7890$/);
      expect(result).toContain('*');
      expect(result.length).toBeGreaterThan(10);
    });

    it('should handle short tokens', () => {
      const result = createSafeTokenForLogging('short');
      expect(result).toBe('[INVALID_TOKEN]');
    });

    it('should handle empty tokens', () => {
      const result = createSafeTokenForLogging('');
      expect(result).toBe('[INVALID_TOKEN]');
    });

    it('should show prefix and suffix with masking', () => {
      const token = '1234567890abcdefghijklmnopqrstuvwxyz';
      const result = createSafeTokenForLogging(token);

      expect(result).toStartWith('12345678');
      expect(result).toEndWith('wxyz');
      expect(result).toContain('*');
    });
  });
});
