/**
 * Jest setup file for global test configuration
 * This file is executed once before all tests run
 */

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
