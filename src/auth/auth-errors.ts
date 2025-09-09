/**
 * Simplified authentication error definitions for MVP
 */

/**
 * Base MCP error class - simplified for MVP
 */
export class MCPError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.name = 'MCPError';
    this.statusCode = statusCode;
  }

  /**
   * Convert to MCP error format (simplified)
   */
  toMcpError(): {
    code: number;
    message: string;
  } {
    return {
      code: this.statusCode === 401 ? -32001 : -32000,
      message: this.message,
    };
  }
}

/**
 * Authentication error - covers all auth-related issues
 */
export class AuthError extends MCPError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'AuthError';
  }
}

/**
 * Validation error - for input validation issues
 */
export class ValidationError extends MCPError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'ValidationError';
  }
}

// Legacy error class aliases for backward compatibility (removed complexity)
export const AuthenticationRequiredError = AuthError;
export const InvalidTokenError = AuthError;
export const InsufficientScopesError = AuthError;
export const OAuthFlowError = AuthError;
export const TokenRefreshError = AuthError;
export const SessionError = AuthError;
export const AuthConfigError = AuthError;

/**
 * Simplified utility function to create MCP error response
 */
export function createMcpErrorResponse(
  id: string | number | null,
  error: MCPError | Error
): {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
  };
} {
  if (error instanceof MCPError) {
    return {
      jsonrpc: '2.0',
      id,
      error: error.toMcpError(),
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message: error.message,
    },
  };
}

/**
 * Check if error is an authentication error (simplified)
 */
export function isAuthError(error: unknown): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Extract MCP error details from any error (simplified)
 */
export function extractMcpErrorDetails(error: unknown): {
  code: number;
  message: string;
} {
  if (error instanceof MCPError) {
    return error.toMcpError();
  }

  return {
    code: -32000,
    message: (error as Error)?.message ?? 'Unknown error',
  };
}
