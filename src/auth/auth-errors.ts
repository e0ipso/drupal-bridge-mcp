/**
 * Simplified authentication error definitions for OAuth 2.1 stateless design
 */

/**
 * Simplified authentication context for OAuth 2.1 stateless design
 */
export interface AuthContext {
  isAuthenticated: boolean;
  userId?: string;
  accessToken?: string;
  scopes?: string[];
  expiresAt?: number;
}

/**
 * Basic authentication error class for OAuth 2.1 stateless authentication
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Basic validation error class for input validation issues
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Base MCP error class - simplified for MVP compatibility
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

// Error class aliases for compatibility
export class AuthenticationRequiredError extends AuthError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_REQUIRED', 401);
    this.name = 'AuthenticationRequiredError';
  }
}

export class InvalidTokenError extends AuthError {
  constructor(message: string) {
    super(message, 'INVALID_TOKEN', 401);
    this.name = 'InvalidTokenError';
  }
}

export class InsufficientScopesError extends AuthError {
  constructor(message: string) {
    super(message, 'INSUFFICIENT_SCOPES', 403);
    this.name = 'InsufficientScopesError';
  }
}

export class OAuthFlowError extends AuthError {
  constructor(message: string) {
    super(message, 'OAUTH_FLOW_ERROR', 400);
    this.name = 'OAuthFlowError';
  }
}

export class TokenRefreshError extends AuthError {
  constructor(message: string) {
    super(message, 'TOKEN_REFRESH_ERROR', 401);
    this.name = 'TokenRefreshError';
  }
}

export class SessionError extends AuthError {
  constructor(message: string) {
    super(message, 'SESSION_ERROR', 401);
    this.name = 'SessionError';
  }
}

export class AuthConfigError extends AuthError {
  constructor(message: string) {
    super(message, 'AUTH_CONFIG_ERROR', 500);
    this.name = 'AuthConfigError';
  }
}

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
