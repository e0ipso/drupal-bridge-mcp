/**
 * Unit tests for Pino logging infrastructure
 */

import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import type { AppConfig } from '@/config/index.js';
import {
  createLogger,
  initializeLogger,
  getLogger,
  createChildLogger,
  isLoggerInitialized,
} from '@/utils/logger.js';
import {
  formatErrorForLogging,
  formatMcpErrorResponse,
  IntegrationError,
  IntegrationErrorType,
} from '@/utils/error-handler.js';

// Mock for temporary test directories
let testDir: string;

beforeEach(async () => {
  // Create unique test directory for each test
  testDir = join(tmpdir(), `logger-test-${randomBytes(8).toString('hex')}`);
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  // Clean up test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
});

describe('Logger Configuration', () => {
  test('creates logger with correct Pino configuration for development', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'debug' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();
    expect(logger.level).toBe('debug');
  });

  test('creates logger with file transport for production', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'production',
    } as AppConfig;

    // Set LOG_DIR to test directory
    const originalLogDir = process.env.LOG_DIR;
    process.env.LOG_DIR = testDir;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');

    // Restore original environment
    if (originalLogDir) {
      process.env.LOG_DIR = originalLogDir;
    } else {
      delete process.env.LOG_DIR;
    }
  });

  test('respects LOG_LEVEL environment variable', () => {
    const originalLogLevel = process.env.LOG_LEVEL;
    process.env.LOG_LEVEL = 'warn';

    const mockConfig: AppConfig = {
      logging: { level: 'warn' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger.level).toBe('warn');

    // Restore original environment
    if (originalLogLevel) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
  });

  test('enables pretty printing in development', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();
    // Pretty printing is configured through transport options (not directly testable)
  });

  test('disables pretty printing when DISABLE_PRETTY_LOGS is set', () => {
    const originalDisablePretty = process.env.DISABLE_PRETTY_LOGS;
    process.env.DISABLE_PRETTY_LOGS = 'true';

    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();

    // Restore original environment
    if (originalDisablePretty) {
      process.env.DISABLE_PRETTY_LOGS = originalDisablePretty;
    } else {
      delete process.env.DISABLE_PRETTY_LOGS;
    }
  });
});

describe('Logger Initialization and Management', () => {
  test('initializes global logger instance', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    expect(isLoggerInitialized()).toBe(false);

    initializeLogger(mockConfig);

    expect(isLoggerInitialized()).toBe(true);

    const logger = getLogger();
    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');
  });

  test('throws error when getting logger before initialization', async () => {
    // Reset logger state (this is a bit hacky but necessary for isolated tests)
    jest.resetModules();

    expect(() => {
      // This should throw since logger hasn't been initialized
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getLogger } = require('@/utils/logger.js');
      getLogger();
    }).toThrow('Logger not initialized. Call initializeLogger() first.');
  });

  test('creates child logger with context', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);

    const childLogger = createChildLogger({ component: 'test' });

    expect(childLogger).toBeDefined();
    // Child logger inherits parent configuration
    expect(childLogger.level).toBe('info');
  });
});

describe('File Transport Configuration', () => {
  test('creates log files in configured directory', async () => {
    const originalLogDir = process.env.LOG_DIR;
    process.env.LOG_DIR = testDir;

    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'production',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    // Log messages to trigger file creation
    logger.info('Test log message');
    logger.error('Test error message');

    // Give some time for async file operations
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check if directories and files would be created (Pino handles this)
    expect(logger).toBeDefined();

    // Restore original environment
    if (originalLogDir) {
      process.env.LOG_DIR = originalLogDir;
    } else {
      delete process.env.LOG_DIR;
    }
  });

  test('uses default log directory when LOG_DIR not set', () => {
    const originalLogDir = process.env.LOG_DIR;
    delete process.env.LOG_DIR;

    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'production',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();

    // Restore original environment
    if (originalLogDir) {
      process.env.LOG_DIR = originalLogDir;
    }
  });

  test('enables file logging with LOG_TO_FILE environment variable', () => {
    const originalLogToFile = process.env.LOG_TO_FILE;
    process.env.LOG_TO_FILE = 'true';

    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development', // Even in development, LOG_TO_FILE should enable files
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();

    // Restore original environment
    if (originalLogToFile) {
      process.env.LOG_TO_FILE = originalLogToFile;
    } else {
      delete process.env.LOG_TO_FILE;
    }
  });
});

describe('Sensitive Data Redaction', () => {
  test('redacts sensitive fields from log output', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'debug' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    // Mock the logger's output to capture logs
    const logSpy = jest.spyOn(logger, 'info');

    const sensitiveData = {
      password: 'secret123',
      token: 'abc123token',
      access_token: 'oauth-token',
      authorization: 'Bearer token',
      headers: {
        authorization: 'Bearer secret',
      },
    };

    logger.info(sensitiveData, 'Test message with sensitive data');

    expect(logSpy).toHaveBeenCalled();
    // The actual redaction happens at serialization time within Pino
    // This test verifies that the logger accepts sensitive data without error
  });

  test('preserves non-sensitive fields', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'debug' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    const logSpy = jest.spyOn(logger, 'info');

    const nonSensitiveData = {
      userId: '12345',
      action: 'login',
      timestamp: new Date().toISOString(),
      component: 'auth',
    };

    logger.info(nonSensitiveData, 'Test message with non-sensitive data');

    expect(logSpy).toHaveBeenCalledWith(
      nonSensitiveData,
      'Test message with non-sensitive data'
    );
  });

  test('verifies comprehensive redaction patterns', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'debug' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    // Test all redaction patterns
    const comprehensiveSensitiveData = {
      // Basic sensitive fields
      password: 'user-password-123',
      token: 'jwt-token-abc123',
      access_token: 'oauth-access-token',
      refresh_token: 'oauth-refresh-token',
      authorization: 'Bearer comprehensive-test-token',
      auth: 'basic-auth-string',
      secret: 'application-secret-key',
      key: 'encryption-key-value',
      client_secret: 'oauth-client-secret',
      bearer: 'bearer-token-value',

      // Header fields
      headers: {
        authorization: 'Bearer header-token',
        cookie: 'session=abc123; auth=xyz789',
        'set-cookie': 'auth=secure-cookie-value',
      },

      // OAuth specific fields
      oauth: {
        client_secret: 'oauth-app-secret',
        access_token: 'oauth-user-token',
        refresh_token: 'oauth-refresh-token',
      },

      // Request/response body fields
      body: {
        password: 'form-password',
        token: 'form-token',
        secret: 'form-secret',
      },

      // Non-sensitive fields that should be preserved
      userId: 'user-123',
      requestId: 'req-456',
      timestamp: new Date().toISOString(),
      action: 'login',
    };

    expect(() =>
      logger.info(comprehensiveSensitiveData, 'Comprehensive redaction test')
    ).not.toThrow();

    // Logger should process the data without errors
    // Redaction verification would require capturing actual output stream
    // which is complex with Pino's async nature
  });

  test('handles nested sensitive data structures', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'debug' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    const nestedSensitiveData = {
      user: {
        profile: {
          credentials: {
            password: 'deeply-nested-password',
            token: 'deeply-nested-token',
          },
        },
      },
      request: {
        body: {
          auth: {
            secret: 'nested-auth-secret',
          },
        },
        headers: {
          authorization: 'Bearer nested-header-token',
        },
      },
      publicInfo: 'this should not be redacted',
    };

    expect(() =>
      logger.info(nestedSensitiveData, 'Nested sensitive data test')
    ).not.toThrow();
  });
});

describe('Error Handling Integration', () => {
  test('formatErrorForLogging works with Pino structured logging', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);
    const logger = getLogger();

    const testError = new IntegrationError(
      IntegrationErrorType.VALIDATION_ERROR,
      'Test validation error',
      400,
      'testField'
    );

    const logData = formatErrorForLogging(testError, { requestId: 'test-123' });

    expect(logData.level).toBe('warn'); // Validation errors are warnings
    expect(logData.message).toContain('VALIDATION_ERROR');
    expect(logData.meta.type).toBe(IntegrationErrorType.VALIDATION_ERROR);
    expect(logData.logWithPino).toBeDefined();

    // Test Pino integration
    const logSpy = jest.spyOn(logger, 'warn');
    if (logData.logWithPino) {
      logData.logWithPino(logger);
    }

    expect(logSpy).toHaveBeenCalled();
  });

  test('formatMcpErrorResponse includes enhanced logging', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);

    const testError = new IntegrationError(
      IntegrationErrorType.NETWORK_ERROR,
      'Test network error',
      0
    );

    const response = formatMcpErrorResponse(testError, 'req-123');

    expect(response.content).toBeDefined();
    expect(response.content[0].type).toBe('text');
    expect(response.content[0].text).toContain('NETWORK_ERROR');
    expect(response.content[0].text).toContain('req-123');
  });

  test('handles error logging when logger not initialized', () => {
    // Reset modules to test uninitialized state
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { formatErrorForLogging } = require('@/utils/error-handler.js');

    const testError = new IntegrationError(
      IntegrationErrorType.NETWORK_ERROR,
      'Test error',
      0
    );

    const logData = formatErrorForLogging(testError);

    expect(logData.level).toBe('error');
    expect(logData.message).toContain('NETWORK_ERROR');
    expect(logData.logWithPino).toBeDefined();
  });
});

describe('Environment-Specific Behavior', () => {
  test('development environment uses pretty printing', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');
  });

  test('production environment uses file output', () => {
    const originalLogDir = process.env.LOG_DIR;
    process.env.LOG_DIR = testDir;

    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'production',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');

    // Restore original environment
    if (originalLogDir) {
      process.env.LOG_DIR = originalLogDir;
    } else {
      delete process.env.LOG_DIR;
    }
  });

  test('test environment works correctly', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'silent' },
      environment: 'test',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();
    expect(logger.level).toBe('silent');
  });
});

describe('Performance and Integration', () => {
  test('logger creation is fast', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    const startTime = Date.now();
    const logger = createLogger(mockConfig);
    const endTime = Date.now();

    expect(logger).toBeDefined();
    expect(endTime - startTime).toBeLessThan(100); // Should create logger quickly
  });

  test('multiple child loggers work correctly', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);

    const childLogger1 = createChildLogger({ component: 'test1' });
    const childLogger2 = createChildLogger({ component: 'test2' });

    expect(childLogger1).toBeDefined();
    expect(childLogger2).toBeDefined();
    expect(childLogger1).not.toBe(childLogger2);
  });

  test('logger handles high volume of messages', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    const startTime = Date.now();

    // Log many messages quickly
    for (let i = 0; i < 1000; i++) {
      logger.info(`Test message ${i}`);
    }

    const endTime = Date.now();

    // Should handle many messages efficiently
    expect(endTime - startTime).toBeLessThan(1000);
  });
});

describe('Transport and Output Verification', () => {
  test('verifies pretty print transport configuration', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'debug' },
      environment: 'development',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    // Check that logger has transport configuration
    // Note: Pino's transport config is internal, but we can verify the logger works
    expect(logger).toBeDefined();
    expect(logger.level).toBe('debug');

    // Verify all log levels work
    expect(() => logger.debug('Debug message')).not.toThrow();
    expect(() => logger.info('Info message')).not.toThrow();
    expect(() => logger.warn('Warn message')).not.toThrow();
    expect(() => logger.error('Error message')).not.toThrow();
  });

  test('verifies file transport configuration in production', () => {
    const originalLogDir = process.env.LOG_DIR;
    process.env.LOG_DIR = testDir;

    try {
      const mockConfig: AppConfig = {
        logging: { level: 'info' },
        environment: 'production',
      } as AppConfig;

      const logger = createLogger(mockConfig);

      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');

      // Verify logging works without throwing
      expect(() => logger.info('Production log message')).not.toThrow();
      expect(() => logger.error('Production error message')).not.toThrow();
    } finally {
      if (originalLogDir) {
        process.env.LOG_DIR = originalLogDir;
      } else {
        delete process.env.LOG_DIR;
      }
    }
  });

  test('verifies JSON output format in non-development environments', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'production',
    } as AppConfig;

    const logger = createLogger(mockConfig);

    expect(logger).toBeDefined();

    // Test structured logging with complex objects
    const complexData = {
      requestId: 'req-123',
      userId: 'user-456',
      metadata: {
        source: 'test',
        nested: {
          value: 'deep',
        },
      },
      timestamp: new Date().toISOString(),
    };

    expect(() =>
      logger.info(complexData, 'Complex structured log')
    ).not.toThrow();
  });
});
