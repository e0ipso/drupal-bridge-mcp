/**
 * Jest integration test setup
 *
 * Global configuration and utilities for integration tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Disable debug logging in tests to reduce noise
process.env.DEBUG = '';

// Set longer timeout for integration tests
jest.setTimeout(15000);

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging test failures
};
