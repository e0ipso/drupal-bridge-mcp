/**
 * Integration tests for error handling across the JSON-RPC Drupal integration
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import {
  IntegrationError,
  IntegrationErrorType,
  parseJsonRpcError,
  normalizeError,
  formatMcpErrorResponse,
} from '@/utils/error-handler.js';
import { DrupalClient } from '@/services/drupal-client.js';
import { DrupalMcpServer } from '@/mcp/server.js';
import { loadConfig } from '@/config/index.js';
import type { JsonRpcErrorResponse } from '@/types/index.js';

// Mock fetch to simulate various error scenarios
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('Error Handling Integration', () => {
  let config: any;
  let drupalClient: DrupalClient;
  let mcpServer: DrupalMcpServer;

  beforeEach(async () => {
    config = {
      drupal: {
        baseUrl: 'http://localhost/drupal',
        endpoint: '/jsonrpc',
        timeout: 10000,
        retries: 3,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
      oauth: {
        clientId: 'test-client-id',
        authorizationEndpoint: 'http://localhost/drupal/oauth/authorize',
        tokenEndpoint: 'http://localhost/drupal/oauth/token',
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['tutorial:read', 'user:profile'],
      },
      auth: {
        enabled: false, // Disable auth for error handling tests
        requiredScopes: ['tutorial:read'],
        skipAuth: true,
      },
      mcp: {
        name: 'test-drupalizeme-mcp-server',
        version: '1.0.0-test',
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: { subscribe: true, listChanged: true },
          tools: { listChanged: true },
          prompts: { listChanged: true },
        },
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      logging: {
        level: 'error' as const,
      },
      environment: 'test' as const,
    };
    drupalClient = new DrupalClient(config.drupal);
    mcpServer = new DrupalMcpServer(config);

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('JSON-RPC Error Response Parsing', () => {
    test('should parse standard JSON-RPC validation error', () => {
      const errorResponse: JsonRpcErrorResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Invalid search parameters',
          data: {
            type: 'VALIDATION_ERROR',
            details: 'Search query must be at least 2 characters',
            field: 'query',
          },
        },
        id: 'search-request-001',
      };

      const error = parseJsonRpcError(errorResponse, 'test-request-123');

      expect(error).toBeInstanceOf(IntegrationError);
      expect(error.errorType).toBe(IntegrationErrorType.VALIDATION_ERROR);
      expect(error.message).toBe('Invalid search parameters');
      expect(error.field).toBe('query');
      expect(error.retryable).toBe(false);
      expect(error.details?.jsonrpc_code).toBe(-32602);
    });

    test('should parse JSON-RPC server error as retryable', () => {
      const errorResponse: JsonRpcErrorResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: 'search-request-002',
      };

      const error = parseJsonRpcError(errorResponse);

      expect(error.errorType).toBe(IntegrationErrorType.SERVER_UNAVAILABLE);
      expect(error.retryable).toBe(true);
    });

    test('should parse custom Drupal server errors', () => {
      const errorResponse: JsonRpcErrorResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32050,
          message: 'Database connection failed',
          data: {
            details: 'Connection timeout after 30 seconds',
          },
        },
        id: 'search-request-003',
      };

      const error = parseJsonRpcError(errorResponse);

      expect(error.errorType).toBe(IntegrationErrorType.DRUPAL_ERROR);
      expect(error.retryable).toBe(true);
      expect(error.details?.server_details).toBe(
        'Connection timeout after 30 seconds'
      );
    });
  });

  describe('Network Error Handling', () => {
    test('should handle network timeout errors', async () => {
      // Mock a timeout error (AbortError)
      const abortError = new Error('The user aborted a request');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValue(abortError);

      try {
        await drupalClient.searchTutorials({
          query: 'test search',
        });
        // If we reach here, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(IntegrationError);
        if (error instanceof IntegrationError) {
          expect(error.errorType).toBe(IntegrationErrorType.TIMEOUT_ERROR);
          expect(error.retryable).toBe(false); // Timeouts shouldn't be retried immediately
        }
      }
    });

    test('should handle network connection errors', async () => {
      // Mock a network connection error
      mockFetch.mockRejectedValue(new TypeError('fetch failed'));

      try {
        await drupalClient.testConnection();
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(IntegrationError);
        if (error instanceof IntegrationError) {
          expect(error.errorType).toBe(IntegrationErrorType.NETWORK_ERROR);
          expect(error.retryable).toBe(true);
          expect(error.getUserFriendlyMessage()).toContain('Unable to connect');
        }
      }
    });

    test('should handle malformed JSON responses', async () => {
      // Mock a response with invalid JSON
      mockFetch.mockResolvedValue({
        status: 200,
        headers: {
          get: jest.fn((name: string) => {
            if (name === 'content-type') return 'application/json';
            return null;
          }),
        },
        json: jest.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
      } as any);

      try {
        await drupalClient.loadNode(123);
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(IntegrationError);
        if (error instanceof IntegrationError) {
          expect(error.errorType).toBe(IntegrationErrorType.PARSE_ERROR);
          expect(error.retryable).toBe(false);
        }
      }
    });
  });

  describe('HTTP Status Code Handling', () => {
    test('should handle 401 authentication errors', async () => {
      mockFetch.mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized',
        text: jest.fn().mockResolvedValue('Authentication required'),
      } as any);

      try {
        await drupalClient.getNodes({ limit: 5 });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(IntegrationError);
        if (error instanceof IntegrationError) {
          expect(error.errorType).toBe(
            IntegrationErrorType.AUTHENTICATION_ERROR
          );
          expect(error.code).toBe(401);
          expect(error.retryable).toBe(false);
          expect(error.getUserFriendlyMessage()).toContain(
            'Authentication failed'
          );
        }
      }
    });

    test('should handle 429 rate limiting errors', async () => {
      mockFetch.mockResolvedValue({
        status: 429,
        statusText: 'Too Many Requests',
        text: jest.fn().mockResolvedValue('Rate limit exceeded'),
      } as any);

      try {
        await drupalClient.searchTutorials({ query: 'test' });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(IntegrationError);
        if (error instanceof IntegrationError) {
          expect(error.errorType).toBe(IntegrationErrorType.RATE_LIMIT_ERROR);
          expect(error.retryable).toBe(true);
          expect(error.getUserFriendlyMessage()).toContain('Too many requests');
        }
      }
    });

    test('should handle 500 server errors', async () => {
      mockFetch.mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
        text: jest.fn().mockResolvedValue('Database connection failed'),
      } as any);

      try {
        await drupalClient.createNode({
          type: 'article',
          title: 'Test Article',
        });
        expect(true).toBe(false); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(IntegrationError);
        if (error instanceof IntegrationError) {
          expect(error.errorType).toBe(IntegrationErrorType.SERVER_UNAVAILABLE);
          expect(error.retryable).toBe(true);
        }
      }
    });
  });

  describe('MCP Tool Error Formatting', () => {
    test('should format validation errors for MCP response', () => {
      const validationError = new IntegrationError(
        IntegrationErrorType.VALIDATION_ERROR,
        'Search query must be at least 2 characters',
        undefined,
        'query',
        { minLength: 2, provided: 'a' },
        undefined,
        false
      );

      const mcpResponse = formatMcpErrorResponse(
        validationError,
        'test-req-123'
      );

      expect(mcpResponse.content).toHaveLength(1);
      expect(mcpResponse.content[0].type).toBe('text');

      const errorData = JSON.parse(mcpResponse.content[0].text);
      expect(errorData.error.type).toBe(IntegrationErrorType.VALIDATION_ERROR);
      expect(errorData.error.message).toContain(
        'Please check the query parameter'
      );
      expect(errorData.error.details.field).toBe('query');
      expect(errorData.error.details.retryable).toBe(false);
      expect(errorData.error.details.request_id).toBe('test-req-123');
    });

    test('should format network errors for MCP response', () => {
      const networkError = new IntegrationError(
        IntegrationErrorType.NETWORK_ERROR,
        'Connection refused',
        undefined,
        undefined,
        { context: 'Searching tutorials' },
        new Error('ECONNREFUSED'),
        true
      );

      const mcpResponse = formatMcpErrorResponse(networkError);

      const errorData = JSON.parse(mcpResponse.content[0].text);
      expect(errorData.error.type).toBe(IntegrationErrorType.NETWORK_ERROR);
      expect(errorData.error.message).toContain('Unable to connect');
      expect(errorData.error.details.retryable).toBe(true);
    });
  });

  describe('Error Normalization', () => {
    test('should normalize generic Error to IntegrationError', () => {
      const genericError = new Error('Something went wrong');
      const normalized = normalizeError(genericError, 'Test operation');

      expect(normalized).toBeInstanceOf(IntegrationError);
      expect(normalized.errorType).toBe(IntegrationErrorType.NETWORK_ERROR);
      expect(normalized.message).toContain('Something went wrong');
      expect(normalized.details?.context).toBe('Test operation');
    });

    test('should preserve IntegrationError when normalizing', () => {
      const originalError = new IntegrationError(
        IntegrationErrorType.VALIDATION_ERROR,
        'Invalid parameter',
        400,
        'test_field'
      );

      const normalized = normalizeError(originalError, 'Test operation');

      expect(normalized).toBe(originalError); // Should be the same instance
    });

    test('should handle unknown error types', () => {
      const unknownError = { message: 'Unknown error', code: 'UNKNOWN' };
      const normalized = normalizeError(unknownError, 'Test operation');

      expect(normalized.errorType).toBe(IntegrationErrorType.NETWORK_ERROR);
      expect(normalized.message).toContain('Test operation: [object Object]'); // Since we're passing an object, it gets stringified
    });
  });
});
