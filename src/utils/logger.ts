/**
 * Logger Configuration Module
 *
 * Provides a production-grade pino logger instance with custom serializers
 * for HTTP request/response logging and sensitive data redaction.
 *
 * @module utils/logger
 */

import pino from 'pino';
import type { Logger, LoggerOptions } from 'pino';
import type { Request, Response, NextFunction } from 'express';

/**
 * Custom serializer options for HTTP requests
 */
export interface RequestSerializerOptions {
  /** Whether to include request headers */
  includeHeaders?: boolean;
  /** Whether to include request body */
  includeBody?: boolean;
  /** Maximum body size to log (in characters) */
  maxBodyLength?: number;
}

/**
 * Serialized request structure for logging
 */
export interface SerializedRequest {
  id?: string;
  method: string;
  url: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
  remoteAddress?: string;
  remotePort?: number;
}

/**
 * Redacts Authorization header value for safe logging
 *
 * @param authHeader - Full Authorization header value (e.g., "Bearer eyJhbGc...")
 * @returns Redacted header showing only last 6 characters (e.g., "Bearer ***abc123")
 *
 * @example
 * ```typescript
 * const header = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
 * const redacted = redactAuthHeader(header);
 * // Returns: "Bearer ***IkpXVCJ9"
 * ```
 */
export function redactAuthHeader(authHeader: string | undefined): string {
  if (!authHeader) {
    return '(none)';
  }

  // Handle Bearer tokens
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    if (token.length <= 6) {
      return 'Bearer ***';
    }
    return `Bearer ***${token.slice(-6)}`;
  }

  // Handle Basic auth or other schemes
  const parts = authHeader.split(' ');
  if (parts.length === 2) {
    const [scheme, credentials] = parts;
    if (credentials && credentials.length <= 6) {
      return `${scheme} ***`;
    }
    return `${scheme} ***${credentials?.slice(-6) || ''}`;
  }

  // Fallback: redact entire value if format is unknown
  return '***';
}

/**
 * Serializes HTTP request for structured logging
 *
 * @param req - Express Request object
 * @param options - Serialization options
 * @returns Serialized request object with sensitive data redacted
 *
 * @example
 * ```typescript
 * const serialized = requestSerializer(req, {
 *   includeHeaders: true,
 *   includeBody: true,
 *   maxBodyLength: 1000
 * });
 * logger.info({ req: serialized }, 'Incoming request');
 * ```
 */
export function requestSerializer(
  req: Request,
  options: RequestSerializerOptions = {}
): SerializedRequest {
  const {
    includeHeaders = true,
    includeBody = false,
    maxBodyLength = 1000,
  } = options;

  const serialized: SerializedRequest = {
    method: req.method,
    url: req.url,
    remoteAddress: req.socket?.remoteAddress,
    remotePort: req.socket?.remotePort,
  };

  // Add request ID if available (from express-request-id or similar middleware)
  if ('id' in req && typeof req.id === 'string') {
    serialized.id = req.id;
  }

  // Include headers with sensitive data redacted
  if (includeHeaders && req.headers) {
    const headers: Record<string, string | string[] | undefined> = {};

    for (const [key, value] of Object.entries(req.headers)) {
      // Redact authorization header
      if (key.toLowerCase() === 'authorization') {
        headers[key] = redactAuthHeader(value as string);
      }
      // Redact cookie header
      else if (key.toLowerCase() === 'cookie') {
        headers[key] = '***REDACTED***';
      }
      // Include other headers as-is
      else {
        headers[key] = value;
      }
    }

    serialized.headers = headers;
  }

  // Include request body (truncate if too large)
  if (includeBody && req.body) {
    const bodyString = JSON.stringify(req.body);
    if (bodyString.length > maxBodyLength) {
      serialized.body = `${bodyString.substring(0, maxBodyLength)}... (truncated)`;
    } else {
      serialized.body = req.body;
    }
  }

  return serialized;
}

/**
 * Creates base logger options for pino
 *
 * @returns Pino logger options with environment-aware configuration
 */
function createLoggerOptions(): LoggerOptions {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const logLevel = isDevelopment ? 'debug' : 'info';

  const baseOptions: LoggerOptions = {
    level: logLevel,
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  };

  // Development: use pino-pretty for human-readable output
  if (isDevelopment) {
    return {
      ...baseOptions,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          messageFormat: '{levelLabel} - {msg}',
        },
      },
    };
  }

  // Production: structured JSON output
  return {
    ...baseOptions,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      ...baseOptions.formatters,
      bindings: (bindings: Record<string, unknown>) => ({
        pid: bindings.pid,
        hostname: bindings.hostname,
        // Add custom bindings here (e.g., service name, version)
        service: process.env.MCP_SERVER_NAME || 'dme-mcp',
        version: process.env.MCP_SERVER_VERSION || 'unknown',
      }),
    },
  };
}

/**
 * Default pino logger instance
 *
 * Configured based on NODE_ENV:
 * - Development: Pretty-printed output with colors
 * - Production: Structured JSON logs with timestamps
 *
 * @example
 * ```typescript
 * import { logger } from './utils/logger.js';
 *
 * logger.info('Server started');
 * logger.error({ err: error }, 'Request failed');
 * logger.debug({ userId: '123' }, 'User authenticated');
 * ```
 */
export const logger: Logger = pino(createLoggerOptions());

/**
 * Creates a child logger with additional context
 *
 * @param context - Additional context to include in all log messages
 * @returns Child logger instance
 *
 * @example
 * ```typescript
 * const oauthLogger = createChildLogger({ module: 'oauth' });
 * oauthLogger.info('Token refreshed'); // Includes module: 'oauth'
 * ```
 */
export function createChildLogger(context: Record<string, unknown>): Logger {
  return logger.child(context);
}

/**
 * HTTP request logger middleware factory
 *
 * @param options - Request serialization options
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { createRequestLogger } from './utils/logger.js';
 *
 * app.use(createRequestLogger({
 *   includeHeaders: true,
 *   includeBody: true
 * }));
 * ```
 */
export function createRequestLogger(
  options: RequestSerializerOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: any, next: any) => {
    const serialized = requestSerializer(req, options);
    logger.info({ req: serialized }, 'Incoming request');
    next();
  };
}

/**
 * Export types for external use
 */
export type { Logger, LoggerOptions };
