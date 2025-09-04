/**
 * Error Handling Middleware for Simplified MCP Architecture
 *
 * Provides centralized error handling with clean authentication failure responses
 * and user-friendly error messages for different error scenarios.
 */

import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@/utils/logger.js';
import { DrupalErrorUtils } from '@/drupal/json-rpc-client.js';
import { TokenValidationError } from './token-extractor.js';

/**
 * Error categories for systematic handling
 */
export enum ErrorCategory {
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  RATE_LIMIT = 'rate_limit',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  INTERNAL_ERROR = 'internal_error',
  NETWORK_ERROR = 'network_error',
}

/**
 * Structured error information
 */
export interface ErrorInfo {
  category: ErrorCategory;
  code: ErrorCode;
  message: string;
  details?: string;
  retryable: boolean;
  userMessage: string;
  logData?: Record<string, any>;
}

/**
 * Error mapping configuration
 */
interface ErrorMapping {
  category: ErrorCategory;
  mcpCode: ErrorCode;
  retryable: boolean;
  getUserMessage: (error: any) => string;
  getDetails?: (error: any) => string;
}

/**
 * Main error handler class for MCP server
 */
export class MCPErrorHandler {
  private static readonly ERROR_MAPPINGS = new Map<
    string | number,
    ErrorMapping
  >();

  static {
    // Initialize error mappings
    this.setupErrorMappings();
  }

  /**
   * Handle any error and convert to appropriate MCP error
   */
  static handle(
    error: any,
    context?: { tool?: string; user?: string }
  ): McpError {
    const errorInfo = this.analyzeError(error, context);

    // Log the error with appropriate level
    this.logError(errorInfo, context);

    // Return MCP-compatible error
    return new McpError(errorInfo.code, errorInfo.userMessage);
  }

  /**
   * Handle authentication-specific errors
   */
  static handleAuthError(
    error: any,
    tokenValidationError?: TokenValidationError
  ): McpError {
    let message = 'Authentication required';
    let details = 'Please provide a valid OAuth access token';

    if (tokenValidationError) {
      switch (tokenValidationError) {
        case TokenValidationError.MISSING_TOKEN:
          message = 'Missing authentication token';
          details =
            'Please provide an OAuth access token in the Authorization header or as a parameter';
          break;
        case TokenValidationError.INVALID_FORMAT:
          message = 'Invalid token format';
          details =
            "The provided token is not in the expected format. Please ensure it's a valid OAuth access token";
          break;
        case TokenValidationError.EMPTY_TOKEN:
          message = 'Empty authentication token';
          details = 'The authentication token cannot be empty';
          break;
        case TokenValidationError.INVALID_BEARER_FORMAT:
          message = 'Invalid Authorization header format';
          details = 'Expected format: "Authorization: Bearer <your-token>"';
          break;
      }
    }

    logger.warn('Authentication error', {
      error: message,
      details,
      tokenValidationError,
      originalError: error?.message,
    });

    return new McpError(ErrorCode.InvalidRequest, `${message}. ${details}`);
  }

  /**
   * Handle Drupal API errors
   */
  static handleDrupalError(error: any, context?: { tool?: string }): McpError {
    if (!DrupalErrorUtils.isDrupalError(error)) {
      return this.handle(error, context);
    }

    const category = this.categorizeDrupalError(error);
    const userMessage = DrupalErrorUtils.getUserMessage(error);

    let mcpCode = ErrorCode.InternalError;
    let retryable = false;

    switch (category) {
      case ErrorCategory.AUTHENTICATION:
        mcpCode = ErrorCode.InvalidRequest;
        retryable = false;
        break;
      case ErrorCategory.AUTHORIZATION:
        mcpCode = ErrorCode.InvalidRequest;
        retryable = false;
        break;
      case ErrorCategory.NOT_FOUND:
        mcpCode = ErrorCode.InvalidParams;
        retryable = false;
        break;
      case ErrorCategory.SERVICE_UNAVAILABLE:
        mcpCode = ErrorCode.InternalError;
        retryable = true;
        break;
      case ErrorCategory.RATE_LIMIT:
        mcpCode = ErrorCode.InternalError;
        retryable = true;
        break;
      default:
        mcpCode = ErrorCode.InternalError;
        retryable = false;
    }

    logger.error('Drupal API error', {
      category,
      code: error.code,
      message: error.message,
      retryable,
      tool: context?.tool,
      data: error.data,
    });

    return new McpError(mcpCode, userMessage);
  }

  /**
   * Handle network errors
   */
  static handleNetworkError(
    error: any,
    context?: { tool?: string; endpoint?: string }
  ): McpError {
    const isTimeout =
      error.code === 'ETIMEDOUT' || error.message?.includes('timeout');
    const isConnectionRefused = error.code === 'ECONNREFUSED';
    const isDNSError = error.code === 'ENOTFOUND';

    let message = 'Network error occurred';
    let details = 'Please check your network connection and try again';

    if (isTimeout) {
      message = 'Request timed out';
      details =
        'The Drupalize.me service took too long to respond. Please try again later';
    } else if (isConnectionRefused) {
      message = 'Connection refused';
      details =
        'Unable to connect to the Drupalize.me service. The service may be temporarily unavailable';
    } else if (isDNSError) {
      message = 'Service not found';
      details =
        'Unable to resolve the Drupalize.me service address. Please check your network connection';
    }

    logger.error('Network error', {
      error: error.message,
      code: error.code,
      endpoint: context?.endpoint,
      tool: context?.tool,
      isTimeout,
      isConnectionRefused,
      isDNSError,
    });

    return new McpError(ErrorCode.InternalError, `${message}. ${details}`);
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(
    field: string,
    value: any,
    expected: string
  ): McpError {
    const message = `Invalid parameter '${field}': expected ${expected}, got ${typeof value}`;

    logger.warn('Parameter validation error', {
      field,
      value: typeof value === 'object' ? JSON.stringify(value) : value,
      expected,
    });

    return new McpError(ErrorCode.InvalidParams, message);
  }

  /**
   * Handle rate limiting errors
   */
  static handleRateLimitError(error: any, retryAfter?: number): McpError {
    const baseMessage = 'Too many requests';
    const retryMessage = retryAfter
      ? ` Please try again in ${retryAfter} seconds`
      : ' Please try again later';

    logger.warn('Rate limit exceeded', {
      error: error.message,
      retryAfter,
    });

    return new McpError(ErrorCode.InternalError, baseMessage + retryMessage);
  }

  /**
   * Create a generic internal error with safe message
   */
  static createInternalError(
    originalError: any,
    context?: { tool?: string; operation?: string }
  ): McpError {
    const errorId = this.generateErrorId();
    const safeMessage = `An internal error occurred (${errorId}). Please try again later`;

    logger.error('Internal error', {
      errorId,
      error: originalError.message,
      stack: originalError.stack,
      tool: context?.tool,
      operation: context?.operation,
    });

    return new McpError(ErrorCode.InternalError, safeMessage);
  }

  /**
   * Check if an error should be retried
   */
  static isRetryable(error: any): boolean {
    if (error instanceof McpError) {
      return false; // MCP errors are generally not retryable
    }

    if (DrupalErrorUtils.isDrupalError(error)) {
      const category = this.categorizeDrupalError(error);
      return (
        category === ErrorCategory.SERVICE_UNAVAILABLE ||
        category === ErrorCategory.RATE_LIMIT ||
        category === ErrorCategory.NETWORK_ERROR
      );
    }

    // Network errors are generally retryable
    if (
      error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNREFUSED'
    ) {
      return true;
    }

    // 5xx HTTP errors are retryable
    if (error.response?.status >= 500) {
      return true;
    }

    return false;
  }

  /**
   * Get retry delay for retryable errors
   */
  static getRetryDelay(attempt: number, error?: any): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 30000; // 30 seconds

    // Exponential backoff with jitter
    const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    const jitter = Math.random() * 0.1 * delay;

    return delay + jitter;
  }

  /**
   * Analyze error and extract structured information
   */
  private static analyzeError(
    error: any,
    context?: { tool?: string; user?: string }
  ): ErrorInfo {
    // Handle MCP errors (pass through)
    if (error instanceof McpError) {
      return {
        category: ErrorCategory.INTERNAL_ERROR,
        code: error.code as ErrorCode,
        message: error.message,
        retryable: false,
        userMessage: error.message,
      };
    }

    // Handle Drupal errors
    if (DrupalErrorUtils.isDrupalError(error)) {
      const category = this.categorizeDrupalError(error);
      return {
        category,
        code: this.mapCategoryToMcpCode(category),
        message: error.message,
        retryable: this.isCategoryRetryable(category),
        userMessage: DrupalErrorUtils.getUserMessage(error),
        logData: { drupalCode: error.code, data: error.data },
      };
    }

    // Handle network errors
    if (error.code || error.request) {
      return {
        category: ErrorCategory.NETWORK_ERROR,
        code: ErrorCode.InternalError,
        message: error.message,
        retryable: true,
        userMessage:
          'Network error - please check your connection and try again',
        logData: { networkCode: error.code },
      };
    }

    // Generic error
    return {
      category: ErrorCategory.INTERNAL_ERROR,
      code: ErrorCode.InternalError,
      message: error.message || 'Unknown error',
      retryable: false,
      userMessage: 'An unexpected error occurred. Please try again later',
      logData: { originalError: error },
    };
  }

  /**
   * Categorize Drupal errors
   */
  private static categorizeDrupalError(error: any): ErrorCategory {
    if (DrupalErrorUtils.isAuthError(error)) {
      return ErrorCategory.AUTHENTICATION;
    }

    if (DrupalErrorUtils.isPermissionError(error)) {
      return ErrorCategory.AUTHORIZATION;
    }

    const { code } = error;

    if (code === 404) {
      return ErrorCategory.NOT_FOUND;
    }

    if (code === 429) {
      return ErrorCategory.RATE_LIMIT;
    }

    if (code === 503 || code === 502 || code === 504) {
      return ErrorCategory.SERVICE_UNAVAILABLE;
    }

    if (code >= 400 && code < 500) {
      return ErrorCategory.VALIDATION;
    }

    return ErrorCategory.INTERNAL_ERROR;
  }

  /**
   * Map error category to MCP error code
   */
  private static mapCategoryToMcpCode(category: ErrorCategory): ErrorCode {
    switch (category) {
      case ErrorCategory.AUTHENTICATION:
      case ErrorCategory.AUTHORIZATION:
        return ErrorCode.InvalidRequest;
      case ErrorCategory.VALIDATION:
      case ErrorCategory.NOT_FOUND:
        return ErrorCode.InvalidParams;
      default:
        return ErrorCode.InternalError;
    }
  }

  /**
   * Check if error category is retryable
   */
  private static isCategoryRetryable(category: ErrorCategory): boolean {
    return (
      category === ErrorCategory.SERVICE_UNAVAILABLE ||
      category === ErrorCategory.RATE_LIMIT ||
      category === ErrorCategory.NETWORK_ERROR
    );
  }

  /**
   * Log error with appropriate level
   */
  private static logError(
    errorInfo: ErrorInfo,
    context?: { tool?: string; user?: string }
  ): void {
    const logData = {
      category: errorInfo.category,
      code: errorInfo.code,
      retryable: errorInfo.retryable,
      tool: context?.tool,
      user: context?.user ? `user_${context.user.slice(0, 8)}` : undefined,
      ...errorInfo.logData,
    };

    if (errorInfo.category === ErrorCategory.INTERNAL_ERROR) {
      logger.error(errorInfo.message, logData);
    } else if (
      errorInfo.category === ErrorCategory.AUTHENTICATION ||
      errorInfo.category === ErrorCategory.AUTHORIZATION
    ) {
      logger.warn(errorInfo.message, logData);
    } else {
      logger.info(errorInfo.message, logData);
    }
  }

  /**
   * Generate unique error ID for tracking
   */
  private static generateErrorId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2, 8);
    return `err_${timestamp}_${random}`;
  }

  /**
   * Setup error mapping configurations
   */
  private static setupErrorMappings(): void {
    // This can be extended for more specific error handling
    // Currently, most logic is handled in the analyze methods
  }
}

/**
 * Error middleware decorator for MCP tool handlers
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  handler: T,
  context: { tool: string }
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      throw MCPErrorHandler.handle(error, context);
    }
  }) as T;
}

/**
 * Utility functions for error handling
 */
export const ErrorUtils = {
  /**
   * Check if error indicates missing authentication
   */
  isMissingAuth(error: any): boolean {
    return (
      error instanceof McpError &&
      error.code === ErrorCode.InvalidRequest &&
      error.message.toLowerCase().includes('authentication')
    );
  },

  /**
   * Check if error indicates insufficient permissions
   */
  isPermissionDenied(error: any): boolean {
    return (
      error instanceof McpError &&
      error.code === ErrorCode.InvalidRequest &&
      error.message.toLowerCase().includes('permission')
    );
  },

  /**
   * Check if error indicates invalid parameters
   */
  isInvalidParams(error: any): boolean {
    return error instanceof McpError && error.code === ErrorCode.InvalidParams;
  },

  /**
   * Extract user-safe message from any error
   */
  getSafeMessage(error: any): string {
    if (error instanceof McpError) {
      return error.message;
    }

    if (DrupalErrorUtils.isDrupalError(error)) {
      return DrupalErrorUtils.getUserMessage(error);
    }

    return 'An unexpected error occurred. Please try again later.';
  },

  /**
   * Check if error should trigger a retry
   */
  shouldRetry(error: any, attempt: number, maxAttempts: number = 3): boolean {
    return attempt < maxAttempts && MCPErrorHandler.isRetryable(error);
  },
};

/**
 * Error metrics for monitoring (could be extended)
 */
export class ErrorMetrics {
  private static readonly counters = new Map<string, number>();

  static increment(category: ErrorCategory, tool?: string): void {
    const key = tool ? `${category}_${tool}` : category;
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
  }

  static getCount(category: ErrorCategory, tool?: string): number {
    const key = tool ? `${category}_${tool}` : category;
    return this.counters.get(key) || 0;
  }

  static reset(): void {
    this.counters.clear();
  }

  static getAllCounts(): Map<string, number> {
    return new Map(this.counters);
  }
}
