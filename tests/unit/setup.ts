/**
 * Jest test setup
 *
 * Global configuration and utilities for unit tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DRUPAL_URL = 'https://test-drupal.example.com';
process.env.OAUTH_SCOPES = 'profile read:content';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Extend Jest matchers if needed
expect.extend({
  toBeValidUrl(received: string) {
    try {
      new URL(received);
      return {
        message: () => `expected ${received} not to be a valid URL`,
        pass: true,
      };
    } catch {
      return {
        message: () => `expected ${received} to be a valid URL`,
        pass: false,
      };
    }
  },
});

// Type augmentation for custom matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidUrl(): R;
    }
  }
}
