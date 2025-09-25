/**
 * Integration test setup and configuration
 * Focuses on real component interactions and workflows
 */

import { beforeAll, afterAll, jest } from '@jest/globals';

// Global test setup for integration tests
beforeAll(async () => {
  // Set test environment variables for integration testing
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.AUTH_ENABLED = 'true';

  // Integration test specific environment
  process.env.DRUPAL_BASE_URL =
    process.env.DRUPAL_BASE_URL || 'http://localhost/drupal';
  process.env.DRUPAL_JSON_RPC_ENDPOINT =
    process.env.DRUPAL_JSON_RPC_ENDPOINT || '/jsonrpc';
  process.env.MCP_SERVER_NAME =
    process.env.MCP_SERVER_NAME || 'drupal-bridge-mcp';
  process.env.MCP_SERVER_VERSION = process.env.MCP_SERVER_VERSION || '1.0.0';

  // Reduce noise but keep error messages for debugging
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(async () => {
  // Clean up any global resources and connections
  jest.restoreAllMocks();

  // Allow time for any pending async operations to complete
  await new Promise(resolve => setTimeout(resolve, 100));
});

// Integration test specific matchers and utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidToken(): R;
      toBeEncrypted(): R;
      toBeValidOAuthResponse(): R;
    }
  }

  namespace NodeJS {
    interface Global {
      createIntegrationTestServer: () => any;
      cleanupTestResources: () => Promise<void>;
    }
  }
}

// Custom matchers for integration testing
expect.extend({
  toBeValidToken(received: string) {
    const parts = received.split('.');
    const isValid = parts.length === 3 && parts.every(part => part.length > 0);

    if (isValid) {
      return {
        message: () => `Expected ${received} not to be a valid JWT token`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to be a valid JWT token`,
        pass: false,
      };
    }
  },

  toBeEncrypted(received: string) {
    const parts = received.split(':');
    const isEncrypted =
      parts.length === 3 && parts.every(part => part.length > 0);

    if (isEncrypted) {
      return {
        message: () => `Expected ${received} not to be encrypted`,
        pass: true,
      };
    } else {
      return {
        message: () => `Expected ${received} to be encrypted`,
        pass: false,
      };
    }
  },

  toBeValidOAuthResponse(received: any) {
    const hasRequiredFields =
      received &&
      typeof received.access_token === 'string' &&
      typeof received.token_type === 'string' &&
      typeof received.expires_in === 'number';

    if (hasRequiredFields) {
      return {
        message: () =>
          `Expected ${JSON.stringify(received)} not to be a valid OAuth response`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `Expected ${JSON.stringify(received)} to be a valid OAuth response`,
        pass: false,
      };
    }
  },
});

// Global utilities for integration tests
global.createIntegrationTestServer = () => {
  // Mock server setup for integration tests
  return {
    listen: jest.fn(),
    close: jest.fn(),
    address: () => ({ port: 3000 }),
  };
};

global.cleanupTestResources = async () => {
  // Cleanup any test resources, connections, etc.
  await Promise.resolve();
};
