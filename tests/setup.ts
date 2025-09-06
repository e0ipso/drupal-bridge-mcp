/**
 * Jest setup file for global test configuration
 * This file is executed once before all tests run
 */

// Set default environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DRUPAL_BASE_URL =
  process.env.DRUPAL_BASE_URL || 'http://localhost/drupal';
process.env.DRUPAL_JSON_RPC_ENDPOINT =
  process.env.DRUPAL_JSON_RPC_ENDPOINT || '/jsonrpc';
process.env.MCP_SERVER_NAME =
  process.env.MCP_SERVER_NAME || 'drupalizeme-mcp-server';
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
