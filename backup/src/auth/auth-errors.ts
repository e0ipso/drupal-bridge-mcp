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



// Error class aliases for compatibility
export class AuthenticationRequiredError extends AuthError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_REQUIRED', 401);
    this.name = 'AuthenticationRequiredError';
  }
}


/**
 * Simplified utility function to create MCP error response
 */
export function createMcpErrorResponse(
  id: string | number | null,
  error: Error
): {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
  };
} {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: -32000,
      message: error.message,
    },
  };
}


