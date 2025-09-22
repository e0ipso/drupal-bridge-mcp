/**
 * Jest setup file for unit tests
 * This file is executed once before all unit tests run
 */

// Set test environment variables for unit tests
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Unit tests should not require these, but set defaults to prevent errors
process.env.DRUPAL_BASE_URL =
  process.env.DRUPAL_BASE_URL || 'http://localhost/drupal';
process.env.DRUPAL_JSON_RPC_ENDPOINT =
  process.env.DRUPAL_JSON_RPC_ENDPOINT || '/jsonrpc';
process.env.MCP_SERVER_NAME =
  process.env.MCP_SERVER_NAME || 'drupal-bridge-mcp';
process.env.MCP_SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.0.0';

// Shorter timeout for unit tests (fast feedback)
jest.setTimeout(5000);

// Mock console methods to keep output clean during unit tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging failing tests
  error: console.error,
};

// Global test utilities for unit tests
declare global {
  namespace NodeJS {
    interface Global {
      createMockConfig: () => any;
    }
  }
}

// Common mock factories for unit tests
global.createMockConfig = () => ({
  drupalBaseUrl: 'http://localhost/drupal',
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/callback',
  scopes: ['read:content', 'write:content'],
});
