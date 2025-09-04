/**
 * Jest setup file for global test configuration
 */

// Set up Node.js environment variables for testing
process.env.NODE_ENV = 'test';

// Global test configuration
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks();
});

afterEach(() => {
  // Clean up after each test
  jest.restoreAllMocks();
});

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      // Custom Jest matchers can be added here if needed
    }
  }
}

export {};
