/**
 * DEPRECATED: Legacy Jest setup file
 *
 * This file is being phased out in favor of:
 * - tests/unit/setup.ts (for unit tests)
 * - tests/integration/setup.ts (for integration tests)
 *
 * TODO: Remove this file once migration is complete
 */

// Set default environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DRUPAL_BASE_URL =
  process.env.DRUPAL_BASE_URL || 'http://localhost/drupal';
process.env.DRUPAL_JSON_RPC_ENDPOINT =
  process.env.DRUPAL_JSON_RPC_ENDPOINT || '/jsonrpc';
process.env.MCP_SERVER_NAME =
  process.env.MCP_SERVER_NAME || 'drupal-bridge-mcp';
process.env.MCP_SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.0.0';

// Increase timeout for async operations
jest.setTimeout(30000);

// Global test configuration and setup
global.console = {
  ...console,
  // Uncomment to ignore specific console methods during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
