/**
 * Jest Test Setup
 *
 * Global test configuration and setup for all test files
 */

import { jest } from '@jest/globals';

// Set longer timeout for async operations
jest.setTimeout(30000);

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://test:test@localhost:5432/drupalize_mcp_test';
process.env.DRUPAL_JSONRPC_ENDPOINT = 'http://localhost:8080/jsonrpc';
process.env.LOG_LEVEL = 'error'; // Reduce log noise in tests

// Logger mocking is handled per-test file to avoid module resolution issues

// Global test helpers
declare global {
  var testHelpers: {
    createMockToken: (prefix?: string) => string;
    createMockDrupalResponse: (data?: any) => any;
    sleep: (ms: number) => Promise<void>;
  };
}

globalThis.testHelpers = {
  /**
   * Create a mock token for testing
   */
  createMockToken: (prefix = 'test'): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).slice(2);
    return `${prefix}_token_${timestamp}_${random}`;
  },

  /**
   * Create a mock Drupal API response
   */
  createMockDrupalResponse: (data: any = {}) => ({
    jsonrpc: '2.0',
    result: data,
    id: 'test_request_id',
  }),

  /**
   * Simple sleep utility for tests
   */
  sleep: (ms: number): Promise<void> => {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
};

// Clean up after each test
afterEach(() => {
  // Clear all timers
  jest.clearAllTimers();

  // Reset all mocks
  jest.clearAllMocks();
});

// Global error handler for unhandled rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

export {};
