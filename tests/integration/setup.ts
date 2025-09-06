/**
 * Integration test setup and configuration
 */

import { beforeAll, afterAll, jest } from '@jest/globals';

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.AUTH_SKIP = 'false';
  process.env.AUTH_ENABLED = 'true';

  // Mock console methods to reduce noise in tests
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(async () => {
  // Clean up any global resources
  jest.restoreAllMocks();
});

// Add custom matchers or utilities if needed
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidToken(): R;
      toBeEncrypted(): R;
    }
  }
}

// Custom JWT token matcher
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
});
