/**
 * Simplified error handling utilities for MVP
 */

import {
  JsonRpcErrorCode,
  type JsonRpcError,
  type JsonRpcErrorResponse,
} from '@/types/index.js';
import { DrupalClientError } from '@/services/drupal-client.js';
import { ValidationError } from '@/utils/validation.js';

/**
 * Simplified error types for MVP
 */
export enum IntegrationErrorType {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  JSONRPC_ERROR = 'JSONRPC_ERROR',
  DRUPAL_ERROR = 'DRUPAL_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  // Legacy compatibility (mapped to other types)
  PARSE_ERROR = 'JSONRPC_ERROR',
  RATE_LIMIT_ERROR = 'NETWORK_ERROR', 
  SERVER_UNAVAILABLE = 'DRUPAL_ERROR',
  MALFORMED_RESPONSE = 'JSONRPC_ERROR',
}

/**
 * Simplified error class for MVP
 */
export class IntegrationError extends Error {
  public readonly retryable: boolean = false; // Simplified: most errors are not retryable in MVP
  
  constructor(
    public readonly errorType: IntegrationErrorType,
    message: string,
    public readonly code?: number | string,
    public readonly field?: string,
    public readonly details?: Record<string, unknown>,
    public readonly originalError?: unknown,
    retryable?: boolean
  ) {
    super(message);
    this.name = 'IntegrationError';
    this.retryable = retryable ?? false;
  }

  /**
   * Get user-friendly error message (simplified for MVP)
   */
  getUserFriendlyMessage(): string {
    switch (this.errorType) {
      case IntegrationErrorType.VALIDATION_ERROR:
        return `Invalid input: ${this.message}`;
      case IntegrationErrorType.NETWORK_ERROR:
        return 'Network connection failed. Please try again.';
      case IntegrationErrorType.TIMEOUT_ERROR:
        return 'Request timeout. Please try again.';
      case IntegrationErrorType.AUTHENTICATION_ERROR:
        return 'Authentication failed. Please check your credentials.';
      case IntegrationErrorType.JSONRPC_ERROR:
      case IntegrationErrorType.DRUPAL_ERROR:
        return `Server error: ${this.message}`;
      default:
        return `An error occurred: ${this.message}`;
    }
  }
}

/**
 * Simplified JSON-RPC error parsing for MVP (supports legacy signature)
 */
export function parseJsonRpcError(
  response: JsonRpcErrorResponse,
  requestId?: string
): IntegrationError {
  const { error } = response;
  const errorType = mapJsonRpcCodeToErrorType(error.code);
  
  return new IntegrationError(
    errorType,
    error.message,
    error.code,
    undefined,
    { jsonrpc_code: error.code, jsonrpc_data: error.data },
    response,
    false
  );
}

/**
 * Simplified error type mapping
 */
function mapJsonRpcCodeToErrorType(code: number): IntegrationErrorType {
  switch (code) {
    case JsonRpcErrorCode.INVALID_PARAMS:
      return IntegrationErrorType.VALIDATION_ERROR;
    case JsonRpcErrorCode.INTERNAL_ERROR:
      return IntegrationErrorType.JSONRPC_ERROR;
    default:
      return IntegrationErrorType.JSONRPC_ERROR;
  }
}

/**
 * Simplified error normalization (supports legacy signatures)
 */
export function normalizeError(
  error: unknown, 
  context?: string, 
  requestId?: string
): IntegrationError {
  if (error instanceof IntegrationError) {
    return error;
  }

  if (error instanceof ValidationError) {
    return new IntegrationError(
      IntegrationErrorType.VALIDATION_ERROR,
      error.message,
      400,
      error.field,
      undefined,
      error,
      false
    );
  }

  if (error instanceof DrupalClientError) {
    return new IntegrationError(
      IntegrationErrorType.DRUPAL_ERROR,
      error.message,
      (error as any).code || (error as any).statusCode,
      undefined,
      { context },
      error,
      false
    );
  }

  // Generic error handling
  const message = error instanceof Error ? error.message : 'Unknown error';
  return new IntegrationError(
    IntegrationErrorType.JSONRPC_ERROR,
    message,
    undefined,
    undefined,
    { context },
    error,
    false
  );
}

/**
 * Simplified MCP error response formatting (supports legacy signature)
 */
export function formatMcpErrorResponse(
  error: IntegrationError, 
  requestId?: string
): {
  content: Array<{ type: string; text: string }>;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            error: {
              type: error.errorType,
              message: error.getUserFriendlyMessage(),
              details: {
                technical_message: error.message,
                code: error.code,
                field: error.field,
                timestamp: new Date().toISOString(),
                request_id: requestId,
              },
            },
          },
          null,
          2
        ),
      },
    ],
  };
}

/**
 * Simplified error logging for MVP
 */
export function formatErrorForLogging(
  error: IntegrationError,
  context?: Record<string, unknown>
): {
  level: 'error' | 'warn' | 'info';
  message: string;
  meta: Record<string, unknown>;
} {
  const level = error.errorType === IntegrationErrorType.VALIDATION_ERROR ? 'warn' : 'error';

  return {
    level,
    message: `[${error.errorType}] ${error.message}`,
    meta: {
      type: error.errorType,
      message: error.message,
      code: error.code,
      field: error.field,
      context,
      timestamp: new Date().toISOString(),
      stack: error.stack,
    },
  };
}
