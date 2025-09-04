/**
 * Jest test setup file
 * 
 * Global test configuration and mocks
 */

// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'mcp_server_test';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';