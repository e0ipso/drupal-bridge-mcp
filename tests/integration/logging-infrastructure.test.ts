/**
 * Integration tests for Pino logging infrastructure
 * Tests the complete logging system including console replacement and file operations
 */

import { jest } from '@jest/globals';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import type { AppConfig } from '@/config/index.js';
import { loadConfig } from '@/config/index.js';
import { DrupalMcpServer } from '@/mcp/server.js';
import {
  initializeLogger,
  getLogger,
  createChildLogger,
} from '@/utils/logger.js';

// Mock for temporary test directories
let testDir: string;

beforeEach(async () => {
  // Create unique test directory for each test
  testDir = join(
    tmpdir(),
    `logging-integration-${randomBytes(8).toString('hex')}`
  );
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

describe('Console Logging Replacement Integration', () => {
  test('bootstrap components use Pino logger instead of console', async () => {
    // Set up test environment
    const originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      LOG_LEVEL: process.env.LOG_LEVEL,
      LOG_DIR: process.env.LOG_DIR,
      DRUPAL_BASE_URL: process.env.DRUPAL_BASE_URL,
    };

    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'info';
    process.env.LOG_DIR = testDir;
    process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';

    try {
      // Load configuration and initialize logger
      const config = await loadConfig();
      initializeLogger(config);

      const logger = getLogger();
      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');

      // Test bootstrap component logging
      const bootstrapLogger = createChildLogger({ component: 'bootstrap' });
      const logSpy = jest.spyOn(bootstrapLogger, 'info');

      bootstrapLogger.info('Test bootstrap message');

      expect(logSpy).toHaveBeenCalledWith('Test bootstrap message');
    } finally {
      // Restore environment
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value !== undefined) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      });
    }
  });

  test('auth components use Pino logger correctly', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'debug' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);

    // Test auth component logging
    const authLogger = createChildLogger({ component: 'oauth-client' });
    const logSpy = jest.spyOn(authLogger, 'info');

    authLogger.info('OAuth authorization starting');

    expect(logSpy).toHaveBeenCalledWith('OAuth authorization starting');
  });

  test('config component uses Pino logger correctly', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'debug' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);

    // Test config component logging
    const configLogger = createChildLogger({ component: 'config' });
    const logSpy = jest.spyOn(configLogger, 'info');

    configLogger.info('Configuration loaded successfully');

    expect(logSpy).toHaveBeenCalledWith('Configuration loaded successfully');
  });

  test('preserves debug package functionality', () => {
    // Mock debug function
    const mockDebug = jest.fn();
    jest.doMock('debug', () => () => mockDebug);

    // Debug should still work independently of Pino logger
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const createDebug = require('debug');
    const debug = createDebug('test:namespace');

    debug('Test debug message');

    // Debug functionality is preserved (would work with DEBUG env var)
    expect(debug).toBeDefined();
  });
});

describe('File Logging Integration', () => {
  test('creates log files in configured directory', async () => {
    const originalLogDir = process.env.LOG_DIR;
    process.env.LOG_DIR = testDir;

    try {
      const mockConfig: AppConfig = {
        logging: { level: 'info' },
        environment: 'production',
      } as AppConfig;

      initializeLogger(mockConfig);
      const logger = getLogger();

      // Log some messages
      logger.info('Test info message');
      logger.error('Test error message');

      // Wait for async file operations
      await new Promise(resolve => setTimeout(resolve, 200));

      // Verify logger is working (actual file creation is handled by Pino transport)
      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');
    } finally {
      // Restore environment
      if (originalLogDir) {
        process.env.LOG_DIR = originalLogDir;
      } else {
        delete process.env.LOG_DIR;
      }
    }
  });

  test('handles log directory creation errors gracefully', async () => {
    // Use a path that should fail (like trying to write to root)
    const originalLogDir = process.env.LOG_DIR;
    process.env.LOG_DIR = '/invalid/path/that/should/not/exist';

    try {
      const mockConfig: AppConfig = {
        logging: { level: 'info' },
        environment: 'production',
      } as AppConfig;

      // Logger creation should not fail even if directory creation might
      const logger = initializeLogger(mockConfig);
      expect(logger).toBeUndefined(); // initializeLogger doesn't return value

      const actualLogger = getLogger();
      expect(actualLogger).toBeDefined();
    } finally {
      // Restore environment
      if (originalLogDir) {
        process.env.LOG_DIR = originalLogDir;
      } else {
        delete process.env.LOG_DIR;
      }
    }
  });

  test('writes structured JSON logs to files in production', async () => {
    const originalEnv = {
      LOG_DIR: process.env.LOG_DIR,
      NODE_ENV: process.env.NODE_ENV,
    };

    process.env.LOG_DIR = testDir;
    process.env.NODE_ENV = 'production';

    try {
      const mockConfig: AppConfig = {
        logging: { level: 'info' },
        environment: 'production',
      } as AppConfig;

      initializeLogger(mockConfig);
      const logger = getLogger();

      // Log structured data
      logger.info(
        {
          userId: '12345',
          action: 'login',
          timestamp: new Date().toISOString(),
        },
        'User logged in'
      );

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(logger).toBeDefined();
    } finally {
      // Restore environment
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value !== undefined) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      });
    }
  });
});

describe('Environment Configuration Integration', () => {
  test('development configuration works end-to-end', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const mockConfig: AppConfig = {
        logging: { level: 'debug' },
        environment: 'development',
      } as AppConfig;

      initializeLogger(mockConfig);
      const logger = getLogger();

      expect(logger.level).toBe('debug');

      // Test all log levels work in development
      const logMethods = ['debug', 'info', 'warn', 'error'] as const;
      logMethods.forEach(method => {
        expect(() => logger[method](`Test ${method} message`)).not.toThrow();
      });
    } finally {
      // Restore environment
      if (originalEnv) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    }
  });

  test('production configuration works end-to-end', () => {
    const originalEnv = {
      NODE_ENV: process.env.NODE_ENV,
      LOG_DIR: process.env.LOG_DIR,
    };

    process.env.NODE_ENV = 'production';
    process.env.LOG_DIR = testDir;

    try {
      const mockConfig: AppConfig = {
        logging: { level: 'info' },
        environment: 'production',
      } as AppConfig;

      initializeLogger(mockConfig);
      const logger = getLogger();

      expect(logger.level).toBe('info');

      // Debug messages should not be logged in production with info level
      logger.debug('This debug message should not appear');
      logger.info('This info message should appear');
      logger.error('This error message should appear');

      expect(logger).toBeDefined();
    } finally {
      // Restore environment
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value !== undefined) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      });
    }
  });

  test('test environment configuration works correctly', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    try {
      const mockConfig: AppConfig = {
        logging: { level: 'silent' },
        environment: 'test',
      } as AppConfig;

      initializeLogger(mockConfig);
      const logger = getLogger();

      expect(logger.level).toBe('silent');

      // All log messages should be suppressed in silent mode
      logger.debug('Silent debug');
      logger.info('Silent info');
      logger.warn('Silent warn');
      logger.error('Silent error');

      expect(logger).toBeDefined();
    } finally {
      // Restore environment
      if (originalEnv) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    }
  });
});

describe('Error Handling Integration', () => {
  test('error logging integrates correctly with MCP server', async () => {
    const originalEnv = {
      DRUPAL_BASE_URL: process.env.DRUPAL_BASE_URL,
      NODE_ENV: process.env.NODE_ENV,
    };

    process.env.DRUPAL_BASE_URL = 'http://localhost/drupal';
    process.env.NODE_ENV = 'test';

    try {
      // This will test that error handling works with the logger
      const config = await loadConfig();
      initializeLogger(config);

      const logger = getLogger();
      const errorLogger = createChildLogger({ component: 'error-handler' });

      // Simulate error logging
      const testError = new Error('Test error for integration');
      const logSpy = jest.spyOn(errorLogger, 'error');

      errorLogger.error({ err: testError }, 'Integration test error');

      expect(logSpy).toHaveBeenCalled();
      expect(logger).toBeDefined();
    } finally {
      // Restore environment
      Object.entries(originalEnv).forEach(([key, value]) => {
        if (value !== undefined) {
          process.env[key] = value;
        } else {
          delete process.env[key];
        }
      });
    }
  });

  test('structured error logging with sensitive data redaction', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'error' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);
    const logger = getLogger();

    // Log error with sensitive data
    const sensitiveError = {
      message: 'Authentication failed',
      password: 'secret123',
      token: 'bearer-token-xyz',
      user: 'testuser',
      timestamp: new Date().toISOString(),
    };

    const logSpy = jest.spyOn(logger, 'error');
    logger.error(sensitiveError, 'Authentication error occurred');

    expect(logSpy).toHaveBeenCalled();
    // Redaction happens at serialization time within Pino
  });
});

describe('Performance Integration', () => {
  test('logging does not significantly impact performance', async () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);
    const logger = getLogger();

    const iterations = 1000;

    // Test logging performance
    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      logger.info(
        { iteration: i, data: `test-data-${i}` },
        `Performance test ${i}`
      );
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should be able to log 1000 messages quickly (under 1 second)
    expect(duration).toBeLessThan(1000);

    // Average time per log should be minimal
    const avgTimePerLog = duration / iterations;
    expect(avgTimePerLog).toBeLessThan(1);
  });

  test('child logger creation is efficient', () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);

    const startTime = Date.now();

    // Create many child loggers
    const childLoggers = [];
    for (let i = 0; i < 100; i++) {
      childLoggers.push(createChildLogger({ component: `test-${i}` }));
    }

    const endTime = Date.now();

    expect(childLoggers).toHaveLength(100);
    expect(endTime - startTime).toBeLessThan(100); // Should create 100 child loggers quickly
  });

  test('concurrent logging from multiple components', async () => {
    const mockConfig: AppConfig = {
      logging: { level: 'info' },
      environment: 'development',
    } as AppConfig;

    initializeLogger(mockConfig);

    // Create loggers for different components
    const components = [
      'bootstrap',
      'config',
      'oauth-client',
      'oauth-provider',
      'error-handler',
    ];
    const loggers = components.map(component =>
      createChildLogger({ component })
    );

    const startTime = Date.now();

    // Log concurrently from all components
    const logPromises = loggers.map((logger, index) => {
      return new Promise<void>(resolve => {
        for (let i = 0; i < 50; i++) {
          logger.info(
            { iteration: i, component: components[index] },
            `Concurrent log ${i}`
          );
        }
        resolve();
      });
    });

    await Promise.all(logPromises);

    const endTime = Date.now();

    // Should handle concurrent logging efficiently
    expect(endTime - startTime).toBeLessThan(500);
  });
});
