/**
 * Comprehensive Session Error Handling System
 *
 * Provides specialized error classes, error codes, and recovery strategies
 * for various session management and authentication failure scenarios.
 */

import { SessionErrorCode } from '@/types/session.js';

/**
 * Base session error class with comprehensive context
 */
export abstract class SessionError extends Error {
  public readonly code: SessionErrorCode;
  public readonly userId?: string;
  public readonly sessionId?: number;
  public readonly connectionId?: string;
  public readonly timestamp: Date;
  public readonly recoverable: boolean;
  public readonly retryAfter?: number; // Milliseconds

  constructor(
    message: string,
    code: SessionErrorCode,
    options: {
      userId?: string;
      sessionId?: number;
      connectionId?: string;
      recoverable?: boolean;
      retryAfter?: number;
    } = {}
  ) {
    super(message);

    this.name = this.constructor.name;
    this.code = code;
    this.userId = options.userId;
    this.sessionId = options.sessionId;
    this.connectionId = options.connectionId;
    this.timestamp = new Date();
    this.recoverable = options.recoverable ?? false;
    this.retryAfter = options.retryAfter;

    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging and API responses
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      userId: this.userId,
      sessionId: this.sessionId,
      connectionId: this.connectionId,
      timestamp: this.timestamp.toISOString(),
      recoverable: this.recoverable,
      retryAfter: this.retryAfter,
      stack: this.stack,
    };
  }

  /**
   * Create error response for API endpoints
   */
  toApiResponse(): {
    error: string;
    code: SessionErrorCode;
    message: string;
    recoverable: boolean;
    retryAfter?: number;
  } {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Authentication required error - user needs to re-authenticate
 */
export class AuthenticationRequiredError extends SessionError {
  constructor(
    message: string = 'Authentication required',
    userId?: string,
    sessionId?: number
  ) {
    super(message, SessionErrorCode.AUTHENTICATION_REQUIRED, {
      userId,
      sessionId,
      recoverable: true,
    });
  }
}

/**
 * Session not found error - session doesn't exist or was removed
 */
export class SessionNotFoundError extends SessionError {
  constructor(userId: string, message: string = 'Session not found') {
    super(message, SessionErrorCode.SESSION_NOT_FOUND, {
      userId,
      recoverable: true,
    });
  }
}

/**
 * Session expired error - session has expired and needs refresh
 */
export class SessionExpiredError extends SessionError {
  constructor(
    userId: string,
    sessionId: number,
    expiresAt: Date,
    message: string = 'Session expired'
  ) {
    super(
      `${message}. Expired at ${expiresAt.toISOString()}`,
      SessionErrorCode.SESSION_EXPIRED,
      {
        userId,
        sessionId,
        recoverable: true,
      }
    );
  }
}

/**
 * Token invalid error - access token is malformed or invalid
 */
export class TokenInvalidError extends SessionError {
  public readonly tokenType: 'access' | 'refresh';

  constructor(
    tokenType: 'access' | 'refresh',
    userId?: string,
    message: string = 'Token invalid'
  ) {
    super(`${message}: ${tokenType} token`, SessionErrorCode.TOKEN_INVALID, {
      userId,
      recoverable: tokenType === 'access', // Access token issues can be recovered with refresh
    });

    this.tokenType = tokenType;
  }
}

/**
 * Token refresh failed error - unable to refresh expired token
 */
export class TokenRefreshFailedError extends SessionError {
  public readonly originalError?: Error;
  public readonly refreshAttempts: number;

  constructor(
    userId: string,
    originalError?: Error,
    refreshAttempts: number = 1,
    message: string = 'Token refresh failed'
  ) {
    super(
      originalError ? `${message}: ${originalError.message}` : message,
      SessionErrorCode.REFRESH_FAILED,
      {
        userId,
        recoverable: false, // Refresh failure usually requires re-auth
      }
    );

    this.originalError = originalError;
    this.refreshAttempts = refreshAttempts;
  }
}

/**
 * Insufficient scopes error - user lacks required permissions
 */
export class InsufficientScopesError extends SessionError {
  public readonly requiredScopes: string[];
  public readonly availableScopes: string[];

  constructor(
    requiredScopes: string[],
    availableScopes: string[],
    userId?: string,
    message: string = 'Insufficient scopes'
  ) {
    const missingScopes = requiredScopes.filter(
      scope => !availableScopes.includes(scope)
    );

    super(
      `${message}. Required: [${requiredScopes.join(', ')}]. ` +
        `Available: [${availableScopes.join(', ')}]. ` +
        `Missing: [${missingScopes.join(', ')}]`,
      SessionErrorCode.INSUFFICIENT_SCOPES,
      {
        userId,
        recoverable: false, // Scope issues require admin intervention
      }
    );

    this.requiredScopes = requiredScopes;
    this.availableScopes = availableScopes;
  }
}

/**
 * Subscription required error - operation requires higher subscription level
 */
export class SubscriptionRequiredError extends SessionError {
  public readonly requiredLevel: string;
  public readonly currentLevel: string;

  constructor(
    requiredLevel: string,
    currentLevel: string,
    userId?: string,
    message: string = 'Subscription upgrade required'
  ) {
    super(
      `${message}. Required: ${requiredLevel}. Current: ${currentLevel}`,
      SessionErrorCode.SUBSCRIPTION_REQUIRED,
      {
        userId,
        recoverable: false, // Subscription changes require user action
      }
    );

    this.requiredLevel = requiredLevel;
    this.currentLevel = currentLevel;
  }
}

/**
 * Rate limited error - too many requests from user
 */
export class RateLimitedError extends SessionError {
  public readonly limitType: string;
  public readonly resetTime?: Date;

  constructor(
    limitType: string,
    retryAfterMs: number,
    resetTime?: Date,
    userId?: string,
    message: string = 'Rate limit exceeded'
  ) {
    super(
      `${message}. Limit type: ${limitType}. Retry after: ${retryAfterMs}ms`,
      SessionErrorCode.RATE_LIMITED,
      {
        userId,
        recoverable: true,
        retryAfter: retryAfterMs,
      }
    );

    this.limitType = limitType;
    this.resetTime = resetTime;
  }
}

/**
 * Database error - session storage operations failed
 */
export class SessionDatabaseError extends SessionError {
  public readonly operation: string;
  public readonly originalError?: Error;

  constructor(
    operation: string,
    originalError?: Error,
    userId?: string,
    message: string = 'Database operation failed'
  ) {
    super(
      originalError
        ? `${message}: ${operation} - ${originalError.message}`
        : `${message}: ${operation}`,
      SessionErrorCode.DATABASE_ERROR,
      {
        userId,
        recoverable: true, // Database errors might be temporary
        retryAfter: 5000, // 5 second retry delay
      }
    );

    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Network error - communication with OAuth provider failed
 */
export class SessionNetworkError extends SessionError {
  public readonly endpoint?: string;
  public readonly statusCode?: number;
  public readonly originalError?: Error;

  constructor(
    endpoint?: string,
    statusCode?: number,
    originalError?: Error,
    userId?: string,
    message: string = 'Network operation failed'
  ) {
    let fullMessage = message;
    if (endpoint) fullMessage += `: ${endpoint}`;
    if (statusCode) fullMessage += ` (${statusCode})`;
    if (originalError) fullMessage += ` - ${originalError.message}`;

    super(fullMessage, SessionErrorCode.NETWORK_ERROR, {
      userId,
      recoverable: true,
      retryAfter: statusCode && statusCode >= 500 ? 10000 : 5000, // Longer retry for server errors
    });

    this.endpoint = endpoint;
    this.statusCode = statusCode;
    this.originalError = originalError;
  }
}

/**
 * Configuration error - session manager not properly configured
 */
export class SessionConfigurationError extends SessionError {
  public readonly configKey?: string;

  constructor(
    configKey?: string,
    message: string = 'Session configuration error'
  ) {
    super(
      configKey ? `${message}: ${configKey}` : message,
      SessionErrorCode.CONFIGURATION_ERROR,
      {
        recoverable: false, // Configuration errors require admin intervention
      }
    );

    this.configKey = configKey;
  }
}

/**
 * Error factory for creating appropriate error instances
 */
export class SessionErrorFactory {
  /**
   * Create authentication required error
   */
  static authenticationRequired(
    message?: string,
    userId?: string,
    sessionId?: number
  ): AuthenticationRequiredError {
    return new AuthenticationRequiredError(message, userId, sessionId);
  }

  /**
   * Create session not found error
   */
  static sessionNotFound(
    userId: string,
    message?: string
  ): SessionNotFoundError {
    return new SessionNotFoundError(userId, message);
  }

  /**
   * Create session expired error
   */
  static sessionExpired(
    userId: string,
    sessionId: number,
    expiresAt: Date,
    message?: string
  ): SessionExpiredError {
    return new SessionExpiredError(userId, sessionId, expiresAt, message);
  }

  /**
   * Create token invalid error
   */
  static tokenInvalid(
    tokenType: 'access' | 'refresh',
    userId?: string,
    message?: string
  ): TokenInvalidError {
    return new TokenInvalidError(tokenType, userId, message);
  }

  /**
   * Create token refresh failed error
   */
  static tokenRefreshFailed(
    userId: string,
    originalError?: Error,
    refreshAttempts?: number,
    message?: string
  ): TokenRefreshFailedError {
    return new TokenRefreshFailedError(
      userId,
      originalError,
      refreshAttempts,
      message
    );
  }

  /**
   * Create insufficient scopes error
   */
  static insufficientScopes(
    requiredScopes: string[],
    availableScopes: string[],
    userId?: string,
    message?: string
  ): InsufficientScopesError {
    return new InsufficientScopesError(
      requiredScopes,
      availableScopes,
      userId,
      message
    );
  }

  /**
   * Create subscription required error
   */
  static subscriptionRequired(
    requiredLevel: string,
    currentLevel: string,
    userId?: string,
    message?: string
  ): SubscriptionRequiredError {
    return new SubscriptionRequiredError(
      requiredLevel,
      currentLevel,
      userId,
      message
    );
  }

  /**
   * Create rate limited error
   */
  static rateLimited(
    limitType: string,
    retryAfterMs: number,
    resetTime?: Date,
    userId?: string,
    message?: string
  ): RateLimitedError {
    return new RateLimitedError(
      limitType,
      retryAfterMs,
      resetTime,
      userId,
      message
    );
  }

  /**
   * Create database error
   */
  static databaseError(
    operation: string,
    originalError?: Error,
    userId?: string,
    message?: string
  ): SessionDatabaseError {
    return new SessionDatabaseError(operation, originalError, userId, message);
  }

  /**
   * Create network error
   */
  static networkError(
    endpoint?: string,
    statusCode?: number,
    originalError?: Error,
    userId?: string,
    message?: string
  ): SessionNetworkError {
    return new SessionNetworkError(
      endpoint,
      statusCode,
      originalError,
      userId,
      message
    );
  }

  /**
   * Create configuration error
   */
  static configurationError(
    configKey?: string,
    message?: string
  ): SessionConfigurationError {
    return new SessionConfigurationError(configKey, message);
  }

  /**
   * Convert generic error to appropriate session error
   */
  static fromGenericError(
    error: Error,
    context: {
      userId?: string;
      sessionId?: number;
      connectionId?: string;
      operation?: string;
    } = {}
  ): SessionError {
    // Check if it's already a session error
    if (error instanceof SessionError) {
      return error;
    }

    // Check for common error patterns
    const message = error.message.toLowerCase();

    if (
      message.includes('session not found') ||
      message.includes('not found')
    ) {
      return new SessionNotFoundError(
        context.userId || 'unknown',
        error.message
      );
    }

    if (message.includes('expired') || message.includes('expir')) {
      return new SessionExpiredError(
        context.userId || 'unknown',
        context.sessionId || 0,
        new Date(),
        error.message
      );
    }

    if (
      message.includes('token') &&
      (message.includes('invalid') || message.includes('malformed'))
    ) {
      return new TokenInvalidError('access', context.userId, error.message);
    }

    if (message.includes('refresh') && message.includes('fail')) {
      return new TokenRefreshFailedError(
        context.userId || 'unknown',
        error,
        1,
        error.message
      );
    }

    if (message.includes('scope') || message.includes('permission')) {
      return new InsufficientScopesError([], [], context.userId, error.message);
    }

    if (message.includes('subscription') || message.includes('upgrade')) {
      return new SubscriptionRequiredError(
        'unknown',
        'unknown',
        context.userId,
        error.message
      );
    }

    if (message.includes('rate') || message.includes('limit')) {
      return new RateLimitedError(
        'unknown',
        60000,
        undefined,
        context.userId,
        error.message
      );
    }

    if (
      message.includes('database') ||
      message.includes('sql') ||
      message.includes('connection')
    ) {
      return new SessionDatabaseError(
        context.operation || 'unknown',
        error,
        context.userId,
        error.message
      );
    }

    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout')
    ) {
      return new SessionNetworkError(
        undefined,
        undefined,
        error,
        context.userId,
        error.message
      );
    }

    if (message.includes('config') || message.includes('setup')) {
      return new SessionConfigurationError(undefined, error.message);
    }

    // Default to authentication required for unknown errors
    return new AuthenticationRequiredError(
      error.message,
      context.userId,
      context.sessionId
    );
  }
}

/**
 * Error recovery strategies
 */
export class SessionErrorRecovery {
  /**
   * Determine if error is recoverable
   */
  static isRecoverable(error: Error): boolean {
    if (error instanceof SessionError) {
      return error.recoverable;
    }

    // Generic errors are assumed recoverable with re-authentication
    return true;
  }

  /**
   * Get retry delay for recoverable errors
   */
  static getRetryDelay(error: Error): number | null {
    if (error instanceof SessionError && error.recoverable) {
      return error.retryAfter || 5000; // Default 5 second delay
    }

    return null;
  }

  /**
   * Get recovery strategy for error
   */
  static getRecoveryStrategy(
    error: Error
  ): 'reauth' | 'retry' | 'manual' | 'none' {
    if (!(error instanceof SessionError)) {
      return 'reauth'; // Unknown errors require re-authentication
    }

    switch (error.code) {
      case SessionErrorCode.SESSION_NOT_FOUND:
      case SessionErrorCode.SESSION_EXPIRED:
      case SessionErrorCode.TOKEN_EXPIRED:
      case SessionErrorCode.TOKEN_INVALID:
      case SessionErrorCode.AUTHENTICATION_REQUIRED:
        return 'reauth';

      case SessionErrorCode.REFRESH_FAILED:
        return 'reauth';

      case SessionErrorCode.DATABASE_ERROR:
      case SessionErrorCode.NETWORK_ERROR:
      case SessionErrorCode.RATE_LIMITED:
        return 'retry';

      case SessionErrorCode.INSUFFICIENT_SCOPES:
      case SessionErrorCode.SUBSCRIPTION_REQUIRED:
      case SessionErrorCode.ACCESS_DENIED:
      case SessionErrorCode.CONFIGURATION_ERROR:
        return 'manual';

      default:
        return 'none';
    }
  }

  /**
   * Create user-friendly error message
   */
  static getUserFriendlyMessage(error: Error): string {
    if (!(error instanceof SessionError)) {
      return 'An unexpected error occurred. Please try again or contact support.';
    }

    switch (error.code) {
      case SessionErrorCode.SESSION_NOT_FOUND:
      case SessionErrorCode.SESSION_EXPIRED:
      case SessionErrorCode.AUTHENTICATION_REQUIRED:
        return 'Your session has expired. Please sign in again to continue.';

      case SessionErrorCode.TOKEN_EXPIRED:
      case SessionErrorCode.TOKEN_INVALID:
        return 'Your authentication token is no longer valid. Please sign in again.';

      case SessionErrorCode.REFRESH_FAILED:
        return 'Unable to refresh your session. Please sign in again to continue.';

      case SessionErrorCode.INSUFFICIENT_SCOPES:
        return 'You do not have sufficient permissions for this operation. Please contact an administrator.';

      case SessionErrorCode.SUBSCRIPTION_REQUIRED:
        return 'This feature requires a subscription upgrade. Please check your account settings.';

      case SessionErrorCode.ACCESS_DENIED:
        return 'Access denied. You do not have permission to perform this operation.';

      case SessionErrorCode.RATE_LIMITED:
        return 'Too many requests. Please wait a moment before trying again.';

      case SessionErrorCode.DATABASE_ERROR:
        return 'A temporary service issue occurred. Please try again in a few moments.';

      case SessionErrorCode.NETWORK_ERROR:
        return 'Network connection issue. Please check your connection and try again.';

      case SessionErrorCode.CONFIGURATION_ERROR:
        return 'Service configuration issue. Please contact support.';

      default:
        return (
          error.message ||
          'An unexpected error occurred. Please try again or contact support.'
        );
    }
  }
}
