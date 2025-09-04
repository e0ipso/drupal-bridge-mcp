/**
 * Logging utility for the MCP server
 *
 * Provides structured logging with configurable levels and formats
 */

import type { Logger, LogLevel, LogEntry } from '@/types/logger.js';
import { config } from '@/config/index.js';

/**
 * Console-based logger implementation
 */
class ConsoleLogger implements Logger {
  private readonly level: LogLevel;
  private readonly format: 'json' | 'pretty';

  private readonly levels: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4,
  };

  constructor(level: LogLevel = 'info', format: 'json' | 'pretty' = 'pretty') {
    this.level = level;
    this.format = format;
  }

  error(message: string, context?: Record<string, unknown> | Error): void {
    this.log('error', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown> | Error
  ): void {
    if (this.levels[level] > this.levels[this.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context instanceof Error
        ? { error: context, context: undefined }
        : { context, error: undefined }),
    };

    if (this.format === 'json') {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(entry));
    } else {
      this.prettyLog(entry);
    }
  }

  private prettyLog(entry: LogEntry): void {
    const { timestamp } = entry;
    const level = entry.level.toUpperCase().padEnd(5);
    const { message } = entry;

    // eslint-disable-next-line no-console
    console.log(`${timestamp} ${level} ${message}`);

    if (entry.context && Object.keys(entry.context).length > 0) {
      // eslint-disable-next-line no-console
      console.log('  Context:', JSON.stringify(entry.context, null, 2));
    }

    if (entry.error) {
      // eslint-disable-next-line no-console
      console.log('  Error:', entry.error.stack ?? entry.error.message);
    }
  }
}

/**
 * Global logger instance
 */
export const logger: Logger = new ConsoleLogger(
  config.logging.level,
  config.logging.format
);
