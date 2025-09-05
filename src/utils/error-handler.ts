/**
 * Centralized error handling utilities for the JSON-RPC Drupal integration
 */

import { JsonRpcErrorCode, type JsonRpcError, type JsonRpcErrorResponse } from '@/types/index.js';
import { DrupalClientError } from '@/services/drupal-client.js';
import { ValidationError } from '@/utils/validation.js';

/**
 * Standard error types for the integration
 */
export enum IntegrationErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  JSONRPC_ERROR = 'JSONRPC_ERROR',
  DRUPAL_ERROR = 'DRUPAL_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  PARSE_ERROR = 'PARSE_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  SERVER_UNAVAILABLE = 'SERVER_UNAVAILABLE',
  MALFORMED_RESPONSE = 'MALFORMED_RESPONSE',
}

/**
 * Structured error response format
 */
export interface StructuredError {
  type: IntegrationErrorType;
  message: string;
  code?: number | string;
  field?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
  retryable: boolean;
  userMessage: string; // User-friendly message
}

/**
 * Enhanced error class with structured data
 */
export class IntegrationError extends Error {
  constructor(
    public readonly errorType: IntegrationErrorType,
    message: string,
    public readonly code?: number | string,
    public readonly field?: string,
    public readonly details?: Record<string, unknown>,
    public readonly originalError?: unknown,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'IntegrationError';
  }

  /**
   * Convert to structured error format
   */
  toStructured(requestId?: string): StructuredError {
    return {
      type: this.errorType,
      message: this.message,
      code: this.code,
      field: this.field,
      details: this.details,
      timestamp: new Date().toISOString(),
      requestId,
      retryable: this.retryable,
      userMessage: this.getUserFriendlyMessage(),
    };
  }

  /**
   * Get user-friendly error message
   */
  getUserFriendlyMessage(): string {
    switch (this.errorType) {
      case IntegrationErrorType.VALIDATION_ERROR:
        return this.field 
          ? `Please check the ${this.field} parameter: ${this.message}`
          : `Invalid request parameters: ${this.message}`;
      
      case IntegrationErrorType.NETWORK_ERROR:
        return 'Unable to connect to the Drupal server. Please check your internet connection and try again.';
      
      case IntegrationErrorType.TIMEOUT_ERROR:
        return 'The request took too long to complete. Please try again later.';
      
      case IntegrationErrorType.SERVER_UNAVAILABLE:
        return 'The Drupal server is currently unavailable. Please try again later.';
      
      case IntegrationErrorType.RATE_LIMIT_ERROR:
        return 'Too many requests. Please wait a moment before trying again.';
      
      case IntegrationErrorType.AUTHENTICATION_ERROR:
        return 'Authentication failed. Please check your credentials and try again.';
      
      case IntegrationErrorType.JSONRPC_ERROR:
      case IntegrationErrorType.DRUPAL_ERROR:
        return `Server error: ${this.message}`;
      
      case IntegrationErrorType.PARSE_ERROR:
      case IntegrationErrorType.MALFORMED_RESPONSE:
        return 'Received invalid data from server. Please try again.';
      
      default:
        return `An error occurred: ${this.message}`;
    }
  }
}

/**
 * Parse JSON-RPC error response and convert to IntegrationError
 */
export function parseJsonRpcError(response: JsonRpcErrorResponse, requestId?: string): IntegrationError {
  const { error } = response;
  const errorType = mapJsonRpcCodeToErrorType(error.code);
  
  // Extract additional details from error data
  const details: Record<string, unknown> = {
    jsonrpc_code: error.code,
    jsonrpc_data: error.data,
  };

  // Handle specific error data formats
  if (error.data && typeof error.data === 'object') {
    const errorData = error.data as Record<string, unknown>;
    
    if (errorData.type === 'VALIDATION_ERROR') {
      return new IntegrationError(
        IntegrationErrorType.VALIDATION_ERROR,
        error.message,
        error.code,
        errorData.field as string,
        details,
        response,
        false // Validation errors are not retryable
      );
    }
    
    // Add any additional context from error data
    if (errorData.details) {
      details.server_details = errorData.details;
    }
  }

  // Determine if error is retryable based on code
  const retryable = isRetryableJsonRpcError(error.code);

  return new IntegrationError(
    errorType,
    error.message,
    error.code,
    undefined,
    details,
    response,
    retryable
  );
}

/**
 * Map JSON-RPC error codes to integration error types
 */
function mapJsonRpcCodeToErrorType(code: number): IntegrationErrorType {
  switch (code) {
    case JsonRpcErrorCode.PARSE_ERROR:
      return IntegrationErrorType.PARSE_ERROR;
    
    case JsonRpcErrorCode.INVALID_REQUEST:
    case JsonRpcErrorCode.INVALID_PARAMS:
      return IntegrationErrorType.VALIDATION_ERROR;
    
    case JsonRpcErrorCode.METHOD_NOT_FOUND:
      return IntegrationErrorType.DRUPAL_ERROR;
    
    case JsonRpcErrorCode.INTERNAL_ERROR:
      return IntegrationErrorType.SERVER_UNAVAILABLE;
    
    default:
      // Server-defined errors (-32099 to -32000)
      if (code >= -32099 && code <= -32000) {
        return IntegrationErrorType.DRUPAL_ERROR;
      }
      
      return IntegrationErrorType.JSONRPC_ERROR;
  }
}

/**
 * Determine if a JSON-RPC error is retryable
 */
function isRetryableJsonRpcError(code: number): boolean {
  switch (code) {
    case JsonRpcErrorCode.PARSE_ERROR:
    case JsonRpcErrorCode.INVALID_REQUEST:
    case JsonRpcErrorCode.INVALID_PARAMS:
    case JsonRpcErrorCode.METHOD_NOT_FOUND:
      return false; // Client errors are not retryable
    
    case JsonRpcErrorCode.INTERNAL_ERROR:
      return true; // Server errors may be temporary
    
    default:
      // Server-defined errors may be retryable depending on context
      return code >= -32099 && code <= -32000;
  }
}

/**
 * Convert various error types to IntegrationError
 */
export function normalizeError(error: unknown, context: string, requestId?: string): IntegrationError {
  if (error instanceof IntegrationError) {
    return error;
  }

  if (error instanceof ValidationError) {
    return new IntegrationError(
      IntegrationErrorType.VALIDATION_ERROR,
      error.message,
      undefined,
      error.field,
      undefined,
      error,
      false
    );
  }

  if (error instanceof DrupalClientError) {
    // Map HTTP status codes to appropriate error types
    const errorType = mapHttpStatusToErrorType(error.code);
    const retryable = isRetryableHttpError(error.code);
    
    return new IntegrationError(
      errorType,
      error.message,
      error.code,
      undefined,
      { context },
      error,
      retryable
    );
  }

  // Handle native JavaScript errors
  if (error instanceof Error) {
    let errorType = IntegrationErrorType.NETWORK_ERROR;
    let retryable = true;

    // Check for specific error patterns
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      errorType = IntegrationErrorType.TIMEOUT_ERROR;
    } else if (error.message.includes('fetch') || error.message.includes('network')) {
      errorType = IntegrationErrorType.NETWORK_ERROR;
    } else if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
      errorType = IntegrationErrorType.PARSE_ERROR;
      retryable = false;
    }

    return new IntegrationError(
      errorType,
      error.message,
      undefined,
      undefined,
      { context, originalName: error.name },
      error,
      retryable
    );
  }

  // Fallback for unknown error types
  return new IntegrationError(
    IntegrationErrorType.NETWORK_ERROR,
    `${context}: ${String(error)}`,
    undefined,
    undefined,
    { context },
    error,
    true
  );
}

/**
 * Map HTTP status codes to error types
 */
function mapHttpStatusToErrorType(statusCode?: number): IntegrationErrorType {
  if (!statusCode) return IntegrationErrorType.NETWORK_ERROR;

  if (statusCode >= 400 && statusCode < 500) {
    switch (statusCode) {
      case 401:
      case 403:
        return IntegrationErrorType.AUTHENTICATION_ERROR;
      case 429:
        return IntegrationErrorType.RATE_LIMIT_ERROR;
      default:
        return IntegrationErrorType.VALIDATION_ERROR;
    }
  }

  if (statusCode >= 500) {
    return IntegrationErrorType.SERVER_UNAVAILABLE;
  }

  return IntegrationErrorType.NETWORK_ERROR;
}

/**
 * Check if HTTP error is retryable
 */
function isRetryableHttpError(statusCode?: number): boolean {
  if (!statusCode) return true;

  // Client errors (4xx) are generally not retryable, except rate limiting
  if (statusCode >= 400 && statusCode < 500) {
    return statusCode === 429; // Rate limiting is retryable
  }

  // Server errors (5xx) are retryable
  return statusCode >= 500;
}

/**
 * Format error for MCP tool response
 */
export function formatMcpErrorResponse(error: IntegrationError, requestId?: string): {
  content: Array<{ type: string; text: string }>;
} {
  const structured = error.toStructured(requestId);
  
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error: {
            type: structured.type,
            message: structured.userMessage,
            details: {
              technical_message: structured.message,
              code: structured.code,
              field: structured.field,
              timestamp: structured.timestamp,
              request_id: structured.requestId,
              retryable: structured.retryable,
            },
          },
        }, null, 2),
      },
    ],
  };
}

/**
 * Format error for logging
 */
export function formatErrorForLogging(error: IntegrationError, context?: Record<string, unknown>): {
  level: 'error' | 'warn' | 'info';
  message: string;
  meta: Record<string, unknown>;
} {
  const structured = error.toStructured();
  
  // Determine log level based on error type
  let level: 'error' | 'warn' | 'info' = 'error';
  
  if (error.errorType === IntegrationErrorType.VALIDATION_ERROR) {
    level = 'warn'; // Client errors are warnings
  } else if (error.retryable) {
    level = 'warn'; // Retryable errors are temporary issues
  }

  return {
    level,
    message: `[${structured.type}] ${structured.message}`,
    meta: {
      ...structured,
      context,
      stack: error.stack,
    },
  };
}