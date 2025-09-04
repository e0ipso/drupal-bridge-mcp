/**
 * Token Extraction and Validation Utility for Simplified MCP Architecture
 *
 * This module provides utilities to extract and validate OAuth tokens from MCP requests
 * without complex session management. It focuses on token format validation while
 * leaving content validation to Drupal.
 */

import { logger } from '@/utils/logger.js';

/**
 * Token validation result interface
 */
export interface TokenValidationResult {
  isValid: boolean;
  token?: string;
  error?: string;
  errorCode?: TokenValidationError;
}

/**
 * Token validation error codes for specific error handling
 */
export enum TokenValidationError {
  MISSING_TOKEN = 'MISSING_TOKEN',
  INVALID_FORMAT = 'INVALID_FORMAT',
  EMPTY_TOKEN = 'EMPTY_TOKEN',
  INVALID_BEARER_FORMAT = 'INVALID_BEARER_FORMAT',
}

/**
 * Token extraction options
 */
export interface TokenExtractionOptions {
  allowEmpty?: boolean;
  requireBearerPrefix?: boolean;
  stripBearerPrefix?: boolean;
}

/**
 * Default options for token extraction
 */
const DEFAULT_EXTRACTION_OPTIONS: Required<TokenExtractionOptions> = {
  allowEmpty: false,
  requireBearerPrefix: false,
  stripBearerPrefix: true,
};

/**
 * Simple token extractor utility class
 */
export class TokenExtractor {
  /**
   * Extract token from MCP request headers
   */
  static extractFromHeaders(
    headers: Record<string, string | string[]> | undefined,
    options: TokenExtractionOptions = {}
  ): TokenValidationResult {
    const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };

    if (!headers) {
      return {
        isValid: false,
        error: 'No headers provided',
        errorCode: TokenValidationError.MISSING_TOKEN,
      };
    }

    // Look for Authorization header (case-insensitive)
    const authHeader = this.findAuthorizationHeader(headers);
    if (!authHeader) {
      return {
        isValid: false,
        error: 'No Authorization header found',
        errorCode: TokenValidationError.MISSING_TOKEN,
      };
    }

    return this.validateToken(authHeader, opts);
  }

  /**
   * Extract token from MCP request parameters (fallback method)
   */
  static extractFromParams(
    params: Record<string, any> | undefined,
    tokenField: string = 'access_token',
    options: TokenExtractionOptions = {}
  ): TokenValidationResult {
    const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };

    if (!params || typeof params !== 'object') {
      return {
        isValid: false,
        error: 'No parameters provided',
        errorCode: TokenValidationError.MISSING_TOKEN,
      };
    }

    const token = params[tokenField];
    if (!token) {
      return {
        isValid: false,
        error: `No ${tokenField} parameter found`,
        errorCode: TokenValidationError.MISSING_TOKEN,
      };
    }

    return this.validateToken(token, opts);
  }

  /**
   * Extract token from any MCP request context (headers first, then params)
   */
  static extractFromRequest(
    context: {
      headers?: Record<string, string | string[]>;
      params?: Record<string, any>;
    },
    options: TokenExtractionOptions = {}
  ): TokenValidationResult {
    // Try headers first
    const headerResult = this.extractFromHeaders(context.headers, options);
    if (headerResult.isValid) {
      return headerResult;
    }

    // Fallback to parameters
    const paramResult = this.extractFromParams(
      context.params,
      'access_token',
      options
    );
    if (paramResult.isValid) {
      return paramResult;
    }

    // Return the header error as primary
    return headerResult;
  }

  /**
   * Validate token format and content
   */
  private static validateToken(
    token: string,
    options: Required<TokenExtractionOptions>
  ): TokenValidationResult {
    if (!token || typeof token !== 'string') {
      return {
        isValid: false,
        error: 'Token is not a valid string',
        errorCode: TokenValidationError.INVALID_FORMAT,
      };
    }

    // Handle empty token
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      if (options.allowEmpty) {
        return {
          isValid: true,
          token: '',
        };
      }
      return {
        isValid: false,
        error: 'Token is empty',
        errorCode: TokenValidationError.EMPTY_TOKEN,
      };
    }

    // Handle Bearer prefix requirement
    if (
      options.requireBearerPrefix &&
      !trimmedToken.toLowerCase().startsWith('bearer ')
    ) {
      return {
        isValid: false,
        error: 'Token must include "Bearer " prefix',
        errorCode: TokenValidationError.INVALID_BEARER_FORMAT,
      };
    }

    // Extract the actual token (remove Bearer prefix if present)
    let actualToken = trimmedToken;
    if (
      options.stripBearerPrefix &&
      trimmedToken.toLowerCase().startsWith('bearer ')
    ) {
      actualToken = trimmedToken.slice(7).trim(); // Remove "Bearer " (7 characters)

      if (!actualToken) {
        return {
          isValid: false,
          error: 'Token is empty after removing Bearer prefix',
          errorCode: TokenValidationError.EMPTY_TOKEN,
        };
      }
    }

    // Basic format validation (ensure it's not just whitespace and has reasonable length)
    if (actualToken.length < 10) {
      return {
        isValid: false,
        error: 'Token appears too short to be valid',
        errorCode: TokenValidationError.INVALID_FORMAT,
      };
    }

    // Check for obviously invalid characters (control characters, etc.)
    if (!/^[A-Za-z0-9._-]+$/.test(actualToken)) {
      logger.warn('Token contains potentially invalid characters', {
        tokenLength: actualToken.length,
        tokenStart: actualToken.slice(0, 10),
      });
    }

    return {
      isValid: true,
      token: actualToken,
    };
  }

  /**
   * Find Authorization header (case-insensitive search)
   */
  private static findAuthorizationHeader(
    headers: Record<string, string | string[]>
  ): string | undefined {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'authorization') {
        // Handle both string and array values
        if (Array.isArray(value)) {
          return value[0];
        }
        return value;
      }
    }
    return undefined;
  }

  /**
   * Create a properly formatted Authorization header value
   */
  static createAuthorizationHeader(token: string): string {
    const trimmedToken = token.trim();

    // If it already has Bearer prefix, return as-is
    if (trimmedToken.toLowerCase().startsWith('bearer ')) {
      return trimmedToken;
    }

    // Add Bearer prefix
    return `Bearer ${trimmedToken}`;
  }

  /**
   * Validate multiple tokens (useful for batch operations)
   */
  static validateTokens(
    tokens: string[],
    options: TokenExtractionOptions = {}
  ): { valid: string[]; invalid: Array<{ token: string; error: string }> } {
    const opts = { ...DEFAULT_EXTRACTION_OPTIONS, ...options };
    const valid: string[] = [];
    const invalid: Array<{ token: string; error: string }> = [];

    for (const token of tokens) {
      const result = TokenExtractor['validateToken'](token, opts);
      if (result.isValid && result.token) {
        valid.push(result.token);
      } else {
        invalid.push({
          token: token.slice(0, 20) + (token.length > 20 ? '...' : ''), // Truncate for logging
          error: result.error || 'Unknown validation error',
        });
      }
    }

    return { valid, invalid };
  }
}

/**
 * Convenience functions for common token operations
 */

/**
 * Quick token extraction from Authorization header
 */
export function extractTokenFromAuth(
  authHeader: string | undefined
): string | null {
  if (!authHeader) return null;

  const result = TokenExtractor['validateToken'](
    authHeader,
    DEFAULT_EXTRACTION_OPTIONS
  );
  return result.isValid ? result.token! : null;
}

/**
 * Quick validation of a token string
 */
export function isValidTokenFormat(token: string): boolean {
  const result = TokenExtractor['validateToken'](
    token,
    DEFAULT_EXTRACTION_OPTIONS
  );
  return result.isValid;
}

/**
 * Create safe token representation for logging (masks sensitive parts)
 */
export function createSafeTokenForLogging(token: string): string {
  if (!token || token.length < 20) {
    return '[INVALID_TOKEN]';
  }

  const prefix = token.slice(0, 8);
  const suffix = token.slice(-4);
  const middleLength = token.length - 12;

  return `${prefix}${'*'.repeat(Math.min(middleLength, 20))}${suffix}`;
}
