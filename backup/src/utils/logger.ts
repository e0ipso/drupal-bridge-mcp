/**
 * Centralized logger utility using Pino for structured logging
 */

import pino from 'pino';
import type { AppConfig } from '@/config/index.js';

export interface LoggerConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  logToFile: boolean;
  logDir: string;
  prettyPrint: boolean;
}

/**
 * Global logger instance
 */
let globalLogger: pino.Logger | null = null;

/**
 * Create a configured Pino logger instance
 */
export function createLogger(config: AppConfig): pino.Logger {
  const loggerConfig: LoggerConfig = {
    level: config.logging.level,
    logToFile:
      config.environment === 'production' || process.env.LOG_TO_FILE === 'true',
    logDir: process.env.LOG_DIR || './logs',
    prettyPrint:
      config.environment === 'development' && !process.env.DISABLE_PRETTY_LOGS,
  };

  // Base Pino configuration
  const pinoConfig: pino.LoggerOptions = {
    level: loggerConfig.level,
    // Redact sensitive fields for security
    redact: {
      paths: [
        'password',
        'token',
        'access_token',
        'refresh_token',
        'authorization',
        'auth',
        'secret',
        'key',
        'client_secret',
        'bearer',
        // Common header fields
        'headers.authorization',
        'headers.cookie',
        'headers["set-cookie"]',
        // OAuth specific fields
        'oauth.client_secret',
        'oauth.access_token',
        'oauth.refresh_token',
        // Request/response body sensitive data
        'body.password',
        'body.token',
        'body.secret',
      ],
      censor: '***REDACTED***',
    },
    // Use Pino's built-in error serialization
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
  };

  // Configure transports based on environment
  if (loggerConfig.logToFile) {
    // Production: structured JSON logs to files
    pinoConfig.transport = {
      targets: [
        {
          target: 'pino/file',
          level: 'info',
          options: {
            destination: `${loggerConfig.logDir}/app.log`,
            mkdir: true,
          },
        },
        {
          target: 'pino/file',
          level: 'error',
          options: {
            destination: `${loggerConfig.logDir}/error.log`,
            mkdir: true,
          },
        },
      ],
    };
  } else if (loggerConfig.prettyPrint) {
    // Development: pretty-printed console output
    pinoConfig.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false,
        levelFirst: false,
        messageFormat: '{component} {msg}',
      },
    };
  }
  // If neither logToFile nor prettyPrint, use default Pino behavior (structured JSON to console)

  return pino(pinoConfig);
}

/**
 * Initialize the global logger instance
 */
export function initializeLogger(config: AppConfig): void {
  globalLogger = createLogger(config);
}

/**
 * Get the global logger instance
 */
export function getLogger(): pino.Logger {
  if (!globalLogger) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }
  return globalLogger;
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(
  context: Record<string, unknown>
): pino.Logger {
  return getLogger().child(context);
}

/**
 * Check if logger is initialized
 */
export function isLoggerInitialized(): boolean {
  return globalLogger !== null;
}
