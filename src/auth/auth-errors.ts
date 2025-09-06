/**
 * Authentication error definitions for MCP protocol
 */

/**
 * Base authentication error class
 */
export class AuthError extends Error {
  public readonly code: string;
  public readonly mcpErrorCode: number;

  constructor(message: string, code: string, mcpErrorCode: number = -32000) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.mcpErrorCode = mcpErrorCode;
  }

  /**
   * Convert to MCP error format
   */
  toMcpError(): {
    code: number;
    message: string;
    data?: {
      errorCode: string;
      details?: string;
    };
  } {
    return {
      code: this.mcpErrorCode,
      message: this.message,
      data: {
        errorCode: this.code,
        details: this.stack,
      },
    };
  }
}

/**
 * Authentication required error
 */
export class AuthenticationRequiredError extends AuthError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_REQUIRED', -32001);
  }
}

/**
 * Invalid token error
 */
export class InvalidTokenError extends AuthError {
  constructor(message: string = 'Invalid or expired token') {
    super(message, 'INVALID_TOKEN', -32002);
  }
}

/**
 * Insufficient scopes error
 */
export class InsufficientScopesError extends AuthError {
  public readonly requiredScopes: string[];
  public readonly userScopes: string[];

  constructor(requiredScopes: string[], userScopes: string[] = []) {
    const message = `Insufficient scopes. Required: ${requiredScopes.join(', ')}, Have: ${userScopes.join(', ')}`;
    super(message, 'INSUFFICIENT_SCOPES', -32003);
    this.requiredScopes = requiredScopes;
    this.userScopes = userScopes;
  }

  override toMcpError(): {
    code: number;
    message: string;
    data?: {
      errorCode: string;
      requiredScopes: string[];
      userScopes: string[];
      details?: string;
    };
  } {
    return {
      code: this.mcpErrorCode,
      message: this.message,
      data: {
        errorCode: this.code,
        requiredScopes: this.requiredScopes,
        userScopes: this.userScopes,
        details: this.stack,
      },
    };
  }
}

/**
 * OAuth flow error
 */
export class OAuthFlowError extends AuthError {
  public readonly oauthError?: string;
  public readonly oauthErrorDescription?: string;

  constructor(
    message: string,
    oauthError?: string,
    oauthErrorDescription?: string
  ) {
    super(message, 'OAUTH_FLOW_ERROR', -32004);
    this.oauthError = oauthError;
    this.oauthErrorDescription = oauthErrorDescription;
  }

  override toMcpError(): {
    code: number;
    message: string;
    data?: {
      errorCode: string;
      oauthError?: string;
      oauthErrorDescription?: string;
      details?: string;
    };
  } {
    return {
      code: this.mcpErrorCode,
      message: this.message,
      data: {
        errorCode: this.code,
        oauthError: this.oauthError,
        oauthErrorDescription: this.oauthErrorDescription,
        details: this.stack,
      },
    };
  }
}

/**
 * Token refresh error
 */
export class TokenRefreshError extends AuthError {
  constructor(message: string = 'Failed to refresh token') {
    super(message, 'TOKEN_REFRESH_ERROR', -32005);
  }
}

/**
 * Session error
 */
export class SessionError extends AuthError {
  constructor(message: string) {
    super(message, 'SESSION_ERROR', -32006);
  }
}

/**
 * Configuration error
 */
export class AuthConfigError extends AuthError {
  constructor(message: string) {
    super(message, 'AUTH_CONFIG_ERROR', -32007);
  }
}

/**
 * Utility function to create MCP error response
 */
export function createMcpErrorResponse(
  id: string | number | null,
  error: AuthError | Error,
  code?: number
): {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: any;
  };
} {
  if (error instanceof AuthError) {
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
      code: code || -32000,
      message: error.message,
      data: {
        errorCode: 'UNKNOWN_ERROR',
        details: error.stack,
      },
    },
  };
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: any): error is AuthError {
  return error instanceof AuthError;
}

/**
 * Extract MCP error details from any error
 */
export function extractMcpErrorDetails(error: any): {
  code: number;
  message: string;
  data?: any;
} {
  if (error instanceof AuthError) {
    return error.toMcpError();
  }

  return {
    code: -32000,
    message: error?.message || 'Unknown error',
    data: {
      errorCode: 'UNKNOWN_ERROR',
      details: error?.stack,
    },
  };
}
