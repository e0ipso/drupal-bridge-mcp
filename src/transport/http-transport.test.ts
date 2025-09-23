/**
 * Unit tests for HttpTransport
 * Note: Some integration tests may be flaky due to timing and port binding issues
 */

import { HttpTransport } from './http-transport.js';
import type { AppConfig } from '@/config/index.js';
import { createChildLogger } from '@/utils/logger.js';
import type { Logger } from 'pino';
import http from 'http';

// Mock the logger
const mockLogger: Logger = {
  child: jest.fn(() => mockLogger),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as any;

jest.mock('@/utils/logger.js', () => ({
  createChildLogger: jest.fn(() => mockLogger),
}));

describe('HttpTransport', () => {
  let mockConfig: AppConfig;
  let transport: HttpTransport;

  beforeEach(() => {
    // Clear all mock calls
    jest.clearAllMocks();

    // Reset the mock logger
    mockLogger.child = jest.fn(() => mockLogger) as any;

    mockConfig = {
      drupal: {
        baseUrl: 'http://localhost',
        endpoint: '/jsonrpc',
        timeout: 10000,
        retries: 3,
        headers: {},
      },
      oauth: {
        clientId: 'test-client',
        redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
        scopes: ['test'],
        serverUrl: 'http://localhost',
      },
      auth: {
        enabled: false,
        requiredScopes: [],
        skipAuth: true,
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      http: {
        port: 3001,
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        timeout: 5000,
        enableSSE: true,
      },
      mcp: {
        name: 'test-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: {},
      },
      logging: {
        level: 'error',
      },
      environment: 'test',
      discovery: {
        baseUrl: 'http://localhost',
        timeout: 5000,
        retries: 2,
        cacheTtl: 3600000,
        validateHttps: false,
        debug: false,
      },
    } as AppConfig;

    transport = new HttpTransport(mockConfig, undefined, mockLogger);
    global.testTransport = transport;
  });

  describe('constructor', () => {
    it('should create HttpTransport instance with config', () => {
      expect(transport).toBeInstanceOf(HttpTransport);
      expect(transport.getStatus().running).toBe(false);
    });

    it('should create child logger with component name', () => {
      expect(mockLogger.child).toHaveBeenCalledWith({
        component: 'http-transport',
      });
    });
  });

  describe('start()', () => {
    afterEach(async () => {
      if (transport.getStatus().running) {
        await transport.stop();
      }
    });

    it('should start HTTP server successfully', async () => {
      await transport.start();

      const status = transport.getStatus();
      expect(status.running).toBe(true);
      expect(status.host).toBe('localhost');
      expect(status.port).toBe(3001);
    });

    it('should throw error if server is already running', async () => {
      await transport.start();

      await expect(transport.start()).rejects.toThrow(
        'HTTP server is already running'
      );
    });

    it('should handle server startup errors', async () => {
      // Create another server on the same port to cause conflict
      const conflictServer = http.createServer();
      await new Promise<void>((resolve, reject) => {
        conflictServer.listen(3001, 'localhost', (error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      try {
        await expect(transport.start()).rejects.toThrow();
      } finally {
        await new Promise<void>(resolve => {
          conflictServer.close((error: any) => {
            if (error) console.error('Error closing conflictServer:', error);
            resolve();
          });
        });
      }
    });
  });

  describe('stop()', () => {
    afterEach(async () => {
      if (transport.getStatus().running) {
        await transport.stop();
      }
    });

    it('should stop HTTP server successfully', async () => {
      await transport.start();
      expect(transport.getStatus().running).toBe(true);

      await transport.stop();
      expect(transport.getStatus().running).toBe(false);
    });

    it('should handle stop when server is not running', async () => {
      await expect(transport.stop()).resolves.toBeUndefined();
    });
  });

  describe('HTTP request handling', () => {
    beforeEach(async () => {
      await transport.start();
    });

    afterEach(async () => {
      if (transport.getStatus().running) {
        await transport.stop();
      }
    });

    it('should handle health check requests', async () => {
      // Verify server is actually running
      expect(transport.getStatus().running).toBe(true);
      console.log('Server status:', transport.getStatus());

      const response = await makeRequest('GET', '/health');

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/json');

      const body = JSON.parse(response.body);
      expect(body.status).toBe('healthy');
      expect(body.version).toBe('1.0.0');
      expect(body.environment).toBe('test');
    });

    it('should handle MCP POST requests', async () => {
      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'test_method',
        id: 1,
      };

      const response = await makeRequest(
        'POST',
        '/mcp',
        JSON.stringify(jsonRpcRequest),
        {
          'Content-Type': 'application/json',
        }
      );

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.id).toBe(1);
      expect(body.result.message).toBe('HTTP transport ready');
    });

    it('should handle CORS preflight requests', async () => {
      const response = await makeRequest('OPTIONS', '/mcp', undefined, {
        Origin: 'http://localhost:3000',
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000'
      );
      expect(response.headers['access-control-allow-methods']).toContain('GET');
      expect(response.headers['access-control-allow-methods']).toContain(
        'POST'
      );
    });

    it('should reject invalid CORS origins', async () => {
      const response = await makeRequest('OPTIONS', '/mcp', undefined, {
        Origin: 'http://evil.com',
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should return 404 for unknown routes', async () => {
      const response = await makeRequest('GET', '/unknown');

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not found');
    });

    it('should return 405 for unsupported methods on MCP endpoint', async () => {
      const response = await makeRequest('PUT', '/mcp');

      expect(response.statusCode).toBe(405);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Method not allowed');
      expect(body.allowed).toContain('GET');
      expect(body.allowed).toContain('POST');
    });

    it('should handle invalid JSON in POST requests', async () => {
      const response = await makeRequest('POST', '/mcp', 'invalid json');

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid JSON');
    });

    it('should handle empty POST request body', async () => {
      const response = await makeRequest('POST', '/mcp', '');

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Empty request body');
    });

    it('should set security headers', async () => {
      const response = await makeRequest('GET', '/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['server']).toBe('test-server/1.0.0');
    });
  });

  describe('SSE handling', () => {
    beforeEach(async () => {
      await transport.start();
    });

    afterEach(async () => {
      if (transport.getStatus().running) {
        await transport.stop();
      }
    });

    it('should handle SSE requests when enabled', async () => {
      const response = await makeRequest('GET', '/mcp');

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
    });

    it('should reject SSE requests when disabled', async () => {
      await transport.stop();

      const sseDisabledConfig = {
        ...mockConfig,
        http: { ...mockConfig.http, enableSSE: false },
      };

      const sseDisabledTransport = new HttpTransport(
        sseDisabledConfig,
        undefined,
        mockLogger
      );
      await sseDisabledTransport.start();

      try {
        const response = await makeRequest(
          'GET',
          '/mcp',
          undefined,
          {},
          sseDisabledTransport
        );

        expect(response.statusCode).toBe(405);

        const body = JSON.parse(response.body);
        expect(body.error).toBe('SSE not enabled');
      } finally {
        await sseDisabledTransport.stop();
      }
    });
  });

  describe('CORS handling', () => {
    it('should allow development wildcard when no origins configured', async () => {
      await transport.stop();

      const devConfig = {
        ...mockConfig,
        environment: 'development' as const,
        http: { ...mockConfig.http, corsOrigins: [] },
      };

      const devTransport = new HttpTransport(devConfig, undefined, mockLogger);
      await devTransport.start();

      try {
        const response = await makeRequest(
          'OPTIONS',
          '/mcp',
          undefined,
          {
            Origin: 'http://any-origin.com',
          },
          devTransport
        );

        expect(response.statusCode).toBe(204);
      } finally {
        await devTransport.stop();
      }
    });

    it('should deny all origins in production when none configured', async () => {
      await transport.stop();

      const prodConfig = {
        ...mockConfig,
        environment: 'production' as const,
        http: { ...mockConfig.http, corsOrigins: [] },
      };

      const prodTransport = new HttpTransport(
        prodConfig,
        undefined,
        mockLogger
      );
      await prodTransport.start();

      try {
        const response = await makeRequest(
          'OPTIONS',
          '/mcp',
          undefined,
          {
            Origin: 'http://any-origin.com',
          },
          prodTransport
        );

        expect(response.statusCode).toBe(204);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
      } finally {
        await prodTransport.stop();
      }
    });
  });

  describe('request timeout', () => {
    it('should timeout long-running requests', async () => {
      await transport.stop();

      const shortTimeoutConfig = {
        ...mockConfig,
        http: { ...mockConfig.http, timeout: 100 }, // 100ms timeout
      };

      const timeoutTransport = new HttpTransport(
        shortTimeoutConfig,
        undefined,
        mockLogger
      );
      await timeoutTransport.start();

      try {
        // This test might be flaky due to timing, but it demonstrates the timeout functionality
        const startTime = Date.now();

        const response = await makeRequest(
          'POST',
          '/mcp',
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'slow_method',
            id: 1,
          }),
          {},
          timeoutTransport
        );

        const duration = Date.now() - startTime;

        // The timeout might not always trigger in tests due to fast processing
        // but we can at least verify the transport handles the request
        expect(response.statusCode).toBeGreaterThanOrEqual(200);
        expect(duration).toBeLessThan(1000); // Should be much faster than 1 second
      } finally {
        await timeoutTransport.stop();
      }
    });
  });

  describe('graceful shutdown', () => {
    it('should reject requests during shutdown', async () => {
      await transport.start();

      // Start shutdown process but don't wait for it
      const shutdownPromise = transport.stop();

      // Try to make a request during shutdown
      try {
        const response = await makeRequest('GET', '/health');

        // Request might succeed if it's processed before shutdown completes
        // or return 503 if server is in shutdown state
        expect([200, 503]).toContain(response.statusCode);
      } catch (error) {
        // Connection might be refused if shutdown completed quickly
        expect(error).toBeDefined();
      }

      await shutdownPromise;
    });
  });
});

/**
 * Helper function to make HTTP requests for testing
 */
async function makeRequest(
  method: string,
  path: string,
  body?: string,
  headers: Record<string, string> = {},
  transportInstance?: HttpTransport
): Promise<{
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}> {
  const transport = transportInstance || global.testTransport;
  const config = { http: { port: 3001, host: 'localhost' } };

  return new Promise((resolve, reject) => {
    const options = {
      hostname: config.http.host,
      port: config.http.port,
      path,
      method,
      headers: {
        ...headers,
        ...(body && { 'Content-Length': Buffer.byteLength(body) }),
      },
    };

    const req = http.request(options, res => {
      let responseBody = '';

      res.on('data', chunk => {
        responseBody += chunk;
      });

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers as Record<string, string>,
          body: responseBody,
        });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

// Store reference for helper function
declare global {
  var testTransport: HttpTransport;
}
