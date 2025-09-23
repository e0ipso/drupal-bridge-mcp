/**
 * End-to-end integration tests for HTTP transport
 * Verifies complete MCP functionality over HTTP transport
 */

import { HttpTransport } from './http-transport.js';
import { DrupalMcpServer } from '@/mcp/server.js';
import type { AppConfig } from '@/config/index.js';
import { setTimeout } from 'timers/promises';

// Mock the logger module before any imports
const mockLogger = {
  child: jest.fn(() => mockLogger),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  level: 'info',
  silent: false,
} as any;

jest.mock('@/utils/logger.js', () => ({
  initializeLogger: jest.fn(),
  getLogger: jest.fn(() => mockLogger),
  createChildLogger: jest.fn(() => mockLogger),
  isLoggerInitialized: jest.fn(() => true),
}));

describe('HTTP Transport End-to-End Integration', () => {
  let transport: HttpTransport;
  let mcpServer: DrupalMcpServer;
  let config: AppConfig;
  let baseUrl: string;

  beforeEach(async () => {
    config = {
      http: {
        port: 3003, // Use different port to avoid conflicts
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        timeout: 5000,
        enableSSE: true,
      },
      mcp: {
        name: 'test-e2e-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: {
            subscribe: true,
            listChanged: true,
          },
          tools: {
            listChanged: true,
          },
          prompts: {
            listChanged: true,
          },
        },
      },
      drupal: {
        baseUrl: 'http://localhost:8080',
        endpoint: '/jsonrpc',
        timeout: 10000,
        retries: 3,
        headers: {},
      },
      oauth: {
        clientId: 'test-client',
        redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
        scopes: ['test'],
        serverUrl: 'http://localhost:8080',
      },
      auth: {
        enabled: false,
        requiredScopes: [],
        skipAuth: true,
      },
      server: {
        port: 3003,
        host: 'localhost',
      },
      logging: {
        level: 'info',
      },
      environment: 'test',
      discovery: {
        baseUrl: 'http://localhost:8080',
        timeout: 5000,
        retries: 2,
        cacheTtl: 3600000,
        validateHttps: false,
        debug: false,
      },
    } as AppConfig;

    // Reset the mock functions before each test
    jest.clearAllMocks();
    mockLogger.child = jest.fn(() => mockLogger);

    // Create MCP server
    mcpServer = new DrupalMcpServer(config);

    // Create transport with MCP server
    transport = new HttpTransport(config, mcpServer, mockLogger);
    baseUrl = `http://${config.http.host}:${config.http.port}`;
  });

  afterEach(async () => {
    if (transport.getStatus().running) {
      await transport.stop();
    }
  });

  describe('HTTP Transport Basic Functionality', () => {
    it('should start HTTP server and accept connections', async () => {
      await transport.start();

      // Give the server a moment to fully initialize
      await setTimeout(50);

      const status = transport.getStatus();
      expect(status.running).toBe(true);
      expect(status.port).toBe(3003);
      expect(status.host).toBe('localhost');
    });

    it('should handle health check requests', async () => {
      await transport.start();

      // Give the server a moment to fully initialize
      await setTimeout(50);

      const response = await fetch(`${baseUrl}/health`);
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'healthy');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('server');
    });
  });

  describe('JSON-RPC Protocol Compliance', () => {
    it('should handle valid JSON-RPC 2.0 requests', async () => {
      await transport.start();

      const jsonRpcRequest = {
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          capabilities: {},
          protocolVersion: '2024-11-05',
          clientInfo: {
            name: 'test-client',
            version: '1.0.0',
          },
        },
        id: 1,
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(jsonRpcRequest),
      });

      expect(response.ok).toBe(true);
      const data = await response.json();

      expect(data).toHaveProperty('jsonrpc', '2.0');
      expect(data).toHaveProperty('id', 1);
      expect(data.result).toHaveProperty('capabilities');
      expect(data.result).toHaveProperty('protocolVersion');
    });

    it('should return JSON-RPC error for invalid requests', async () => {
      await transport.start();

      const invalidRequest = {
        method: 'invalid_method',
        // Missing jsonrpc and id fields
      };

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invalidRequest),
      });

      expect(response.ok).toBe(true); // HTTP 200 but JSON-RPC error
      const data = await response.json();

      expect(data).toHaveProperty('jsonrpc', '2.0');
      expect(data).toHaveProperty('error');
      expect(data.error).toHaveProperty('code');
      expect(data.error).toHaveProperty('message');
    });

    it('should handle malformed JSON gracefully', async () => {
      await transport.start();

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'invalid json{',
      });

      expect(response.status).toBe(400);
      const data = await response.json();

      expect(data).toHaveProperty('jsonrpc', '2.0');
      expect(data).toHaveProperty('error');
      expect(data.error.code).toBe(-32700); // Parse error
    });
  });

  describe('CORS Functionality', () => {
    it('should handle CORS preflight requests', async () => {
      await transport.start();

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:3000',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'http://localhost:3000'
      );
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
        'POST'
      );
      expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
        'Content-Type'
      );
    });

    it('should reject requests from invalid origins', async () => {
      await transport.start();

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://evil-site.com',
          'Access-Control-Request-Method': 'POST',
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should return 404 for unknown routes', async () => {
      await transport.start();

      const response = await fetch(`${baseUrl}/unknown-route`);
      expect(response.status).toBe(404);
    });

    it('should return 405 for unsupported HTTP methods on MCP endpoint', async () => {
      await transport.start();

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'DELETE',
      });
      expect(response.status).toBe(405);
    });

    it('should handle empty request body gracefully', async () => {
      await transport.start();

      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: '',
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Server-Sent Events (SSE)', () => {
    it('should establish SSE connection when requested', async () => {
      await transport.start();

      // Note: In a real test environment, you'd use a proper SSE client
      // For this test, we'll just verify the endpoint responds with correct headers
      const response = await fetch(`${baseUrl}/mcp`, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });

      expect(response.ok).toBe(true);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });

    it('should return 400 when SSE is disabled', async () => {
      // Create transport with SSE disabled
      const configWithoutSSE = { ...config };
      configWithoutSSE.http = { ...config.http, enableSSE: false };

      const transportNoSSE = new HttpTransport(
        configWithoutSSE,
        mcpServer,
        mockLogger
      );

      try {
        await transportNoSSE.start();

        const response = await fetch(
          `http://${configWithoutSSE.http.host}:${configWithoutSSE.http.port}/mcp`,
          {
            method: 'GET',
            headers: {
              Accept: 'text/event-stream',
            },
          }
        );

        expect(response.status).toBe(400);
      } finally {
        await transportNoSSE.stop();
      }
    });
  });

  describe('Concurrent Connections', () => {
    it('should handle multiple concurrent requests', async () => {
      await transport.start();

      const requests = Array.from({ length: 5 }, (_, i) =>
        fetch(`${baseUrl}/health`).then(r => r.json())
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response).toHaveProperty('status', 'healthy');
      });
    });

    it('should handle graceful shutdown with active connections', async () => {
      await transport.start();

      // Start a request but don't wait for it
      const slowRequest = fetch(`${baseUrl}/health`);

      // Give it a moment to start
      await setTimeout(10);

      // Stop the server
      await transport.stop();

      // The request should still complete or fail gracefully
      await expect(slowRequest).resolves.toBeTruthy();

      expect(transport.getStatus().running).toBe(false);
    });
  });

  describe('Performance and Resource Management', () => {
    it('should clean up resources properly on shutdown', async () => {
      await transport.start();

      const initialStatus = transport.getStatus();
      expect(initialStatus.running).toBe(true);

      await transport.stop();

      const finalStatus = transport.getStatus();
      expect(finalStatus.running).toBe(false);

      // Should be able to start again after clean shutdown
      await transport.start();
      expect(transport.getStatus().running).toBe(true);
    });

    it('should prevent duplicate server starts', async () => {
      await transport.start();

      await expect(transport.start()).rejects.toThrow(
        'HTTP server is already running'
      );
    });
  });
});
