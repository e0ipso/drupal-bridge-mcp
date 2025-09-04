/**
 * Logger type definitions
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly service: string;
  readonly environment: string;
  readonly pid: number;
  readonly context?: Record<string, unknown> | undefined;
  readonly error?:
    | {
        readonly name: string;
        readonly message: string;
        readonly stack?: string | undefined;
      }
    | undefined;
}

export interface Logger {
  error(message: string, context?: Record<string, unknown> | Error): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  trace(message: string, context?: Record<string, unknown>): void;
}
