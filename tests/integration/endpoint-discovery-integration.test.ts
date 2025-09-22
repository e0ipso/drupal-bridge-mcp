/**
 * Endpoint Discovery Integration Tests
 *
 * Tests real-world endpoint discovery scenarios including:
 * - Successful discovery from .well-known endpoints
 * - Fallback to standard endpoints when discovery fails
 * - Network timeout and error handling
 * - Cache behavior and TTL validation
 * - Different server configurations and responses
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  jest,
  beforeAll,
  afterAll,
} from '@jest/globals';
import {
  discoverOAuthEndpoints,
  clearDiscoveryCache,
} from '@/auth/endpoint-discovery.js';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

describe('Endpoint Discovery Integration Tests', () => {
  let mockServer: Server;
  let serverPort: number;

  beforeAll(async () => {
    mockServer = await createDiscoveryTestServer();
    const address = mockServer.address() as AddressInfo;
    serverPort = address.port;
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise<void>(resolve => {
        mockServer.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    clearDiscoveryCache();
    jest.clearAllMocks();
  });

  describe('Real Server Discovery Integration', () => {
    test('should discover endpoints from real HTTP server with complete metadata', async () => {
      setMockResponse('complete');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
        debug: true,
      });

      expect(endpoints.isFallback).toBe(false);
      expect(endpoints.authorizationEndpoint).toBe(
        `http://localhost:${serverPort}/oauth/authorize`
      );
      expect(endpoints.tokenEndpoint).toBe(
        `http://localhost:${serverPort}/oauth/token`
      );
      expect(endpoints.issuer).toBe(`http://localhost:${serverPort}`);
      expect(endpoints.discoveredAt).toBeInstanceOf(Date);
      expect(endpoints.metadata).toBeDefined();
      expect(endpoints.metadata!.code_challenge_methods_supported).toContain(
        'S256'
      );
    });

    test('should discover endpoints from real HTTP server with minimal metadata', async () => {
      setMockResponse('minimal');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
      });

      expect(endpoints.isFallback).toBe(false);
      expect(endpoints.authorizationEndpoint).toBe(
        `http://localhost:${serverPort}/oauth/authorize`
      );
      expect(endpoints.tokenEndpoint).toBe(
        `http://localhost:${serverPort}/oauth/token`
      );
      expect(endpoints.issuer).toBe(`http://localhost:${serverPort}`);
    });

    test('should handle Drupal-specific endpoint paths', async () => {
      setMockResponse('drupal');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 5000,
      });

      expect(endpoints.isFallback).toBe(false);
      expect(endpoints.authorizationEndpoint).toBe(
        `http://localhost:${serverPort}/oauth/authorize`
      );
      expect(endpoints.tokenEndpoint).toBe(
        `http://localhost:${serverPort}/oauth/token`
      );
    });
  });

  describe('Real Network Error Scenarios', () => {
    test('should handle real server errors and fallback appropriately', async () => {
      // Test 404 response from real server
      setMockResponse('not_found');
      const notFoundResult = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 2000,
        retries: 1,
      });
      expect(notFoundResult.isFallback).toBe(true);
      expect(notFoundResult.metadata).toBeUndefined();

      // Test invalid JSON from real server
      setMockResponse('invalid_json');
      const invalidJsonResult = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 2000,
        retries: 1,
      });
      expect(invalidJsonResult.isFallback).toBe(true);

      // Test server error from real server
      setMockResponse('server_error');
      const serverErrorResult = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 2000,
        retries: 1,
      });
      expect(serverErrorResult.isFallback).toBe(true);
    });

    test('should handle real network timeout scenarios', async () => {
      setMockResponse('timeout');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 100, // Very short timeout
        retries: 0,
      });

      expect(endpoints.isFallback).toBe(true);
    });
  });

  describe('Real-world Server Compatibility', () => {
    test('should handle content-type variations', async () => {
      setMockResponse('content_type_charset');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
      });

      expect(endpoints.isFallback).toBe(false);
    });

    test('should handle extra metadata fields gracefully', async () => {
      setMockResponse('extra_fields');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
      });

      expect(endpoints.isFallback).toBe(false);
      expect(endpoints.metadata).toBeDefined();
    });

    test('should work with different endpoint path conventions', async () => {
      setMockResponse('different_paths');

      const endpoints = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
      });

      expect(endpoints.isFallback).toBe(false);
      expect(endpoints.authorizationEndpoint).toBe(
        `http://localhost:${serverPort}/auth/oauth2/authorize`
      );
      expect(endpoints.tokenEndpoint).toBe(
        `http://localhost:${serverPort}/auth/oauth2/token`
      );
    });
  });

  describe('Configuration Options', () => {
    test('should respect custom timeout settings', async () => {
      setMockResponse('slow_response');

      // Short timeout should cause fallback
      const endpointsShortTimeout = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 100,
        retries: 0,
      });
      expect(endpointsShortTimeout.isFallback).toBe(true);

      clearDiscoveryCache();

      // Longer timeout should succeed
      const endpointsLongTimeout = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        timeout: 2000,
        retries: 0,
      });
      expect(endpointsLongTimeout.isFallback).toBe(false);
    });

    test('should respect retry configuration', async () => {
      setMockResponse('intermittent_failure');

      // No retries should fail quickly
      const endpointsNoRetry = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        retries: 0,
      });
      expect(endpointsNoRetry.isFallback).toBe(true);

      clearDiscoveryCache();

      // Multiple retries should eventually succeed
      const endpointsWithRetry = await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        retries: 3,
      });
      expect(endpointsWithRetry.isFallback).toBe(false);
    });

    test('should support debug mode', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      setMockResponse('complete');

      await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        debug: true,
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Discovery] Discovering OAuth endpoints')
      );

      consoleSpy.mockRestore();
    });
  });
});

// Mock server implementation with various response scenarios
let mockResponseType: string = 'complete';
let requestCount = 0;

function setMockResponse(type: string): void {
  mockResponseType = type;
  requestCount = 0;
}

async function createDiscoveryTestServer(): Promise<Server> {
  return new Promise<Server>(resolve => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost`);

      if (url.pathname === '/.well-known/oauth-authorization-server') {
        handleDiscoveryRequest(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function handleDiscoveryRequest(req: any, res: any): void {
  requestCount++;
  const address = req.socket.address();
  const baseUrl = `http://localhost:${address.port}`;

  switch (mockResponseType) {
    case 'complete':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          jwks_uri: `${baseUrl}/.well-known/jwks.json`,
          scopes_supported: ['read', 'write', 'tutorial:read'],
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none'],
        })
      );
      break;

    case 'minimal':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
        })
      );
      break;

    case 'drupal':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          scopes_supported: ['tutorial:read', 'user:profile'],
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
        })
      );
      break;

    case 'not_found':
      res.writeHead(404);
      res.end('Not Found');
      break;

    case 'invalid_json':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{ invalid json');
      break;

    case 'missing_fields':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          // Missing required authorization_endpoint and token_endpoint
        })
      );
      break;

    case 'server_error':
      res.writeHead(500);
      res.end('Internal Server Error');
      break;

    case 'timeout':
      // Don't respond (simulate timeout)
      break;

    case 'content_type_charset':
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
        })
      );
      break;

    case 'extra_fields':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          custom_field: 'custom_value',
          another_extension: { nested: 'data' },
        })
      );
      break;

    case 'different_paths':
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/auth/oauth2/authorize`,
          token_endpoint: `${baseUrl}/auth/oauth2/token`,
        })
      );
      break;

    case 'slow_response':
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/oauth/authorize`,
            token_endpoint: `${baseUrl}/oauth/token`,
          })
        );
      }, 500); // 500ms delay
      break;

    case 'intermittent_failure':
      if (requestCount <= 2) {
        res.writeHead(500);
        res.end('Temporary server error');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            issuer: baseUrl,
            authorization_endpoint: `${baseUrl}/oauth/authorize`,
            token_endpoint: `${baseUrl}/oauth/token`,
          })
        );
      }
      break;

    default:
      res.writeHead(500);
      res.end('Unknown mock response type');
  }
}
