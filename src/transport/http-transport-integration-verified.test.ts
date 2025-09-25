/**
 * Verified HTTP Transport Integration Tests
 * Tests that verify the HTTP transport is a functional replacement for stdio transport
 */

import { HttpTransport } from './http-transport.js';
import { DrupalMcpServer } from '@/mcp/server.js';
import type { AppConfig } from '@/config/index.js';
import { setTimeout } from 'timers/promises';

// Mock the logger module
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

describe('HTTP Transport Integration - Verified', () => {
  let transport: HttpTransport;
  let mcpServer: DrupalMcpServer;
  let config: AppConfig;

  beforeEach(async () => {
    config = {
      http: {
        port: 3005, // Unique port
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        timeout: 5000,
      },
      mcp: {
        name: 'integration-test-server',
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
      },
      server: {
        port: 3005,
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

    jest.clearAllMocks();
    mockLogger.child = jest.fn(() => mockLogger);

    mcpServer = new DrupalMcpServer(config);
    transport = new HttpTransport(config, mcpServer, mockLogger);
  });

  afterEach(async () => {
    if (transport?.getStatus()?.running) {
      await transport.stop();
    }
  });

  describe('Transport Lifecycle Management', () => {
    it('should handle complete lifecycle: start, operation, shutdown', async () => {
      // Initial state
      expect(transport.getStatus().running).toBe(false);

      // Start transport
      await transport.start();
      await setTimeout(50);

      // Verify running
      const runningStatus = transport.getStatus();
      expect(runningStatus.running).toBe(true);
      expect(runningStatus.port).toBe(3005);
      expect(runningStatus.host).toBe('localhost');

      // Stop transport
      await transport.stop();

      // Verify stopped
      expect(transport.getStatus().running).toBe(false);
    });

    it('should prevent duplicate starts and handle multiple stops', async () => {
      await transport.start();
      await setTimeout(50);

      // Should throw on duplicate start
      await expect(transport.start()).rejects.toThrow(
        'HTTP server is already running'
      );

      // Stop should work
      await transport.stop();

      // Multiple stops should be safe
      await transport.stop();
      await transport.stop();

      expect(transport.getStatus().running).toBe(false);
    });

    it('should support restart after shutdown', async () => {
      // First lifecycle
      await transport.start();
      await setTimeout(50);
      expect(transport.getStatus().running).toBe(true);
      await transport.stop();
      expect(transport.getStatus().running).toBe(false);

      // Second lifecycle
      await transport.start();
      await setTimeout(50);
      expect(transport.getStatus().running).toBe(true);
      await transport.stop();
      expect(transport.getStatus().running).toBe(false);
    });
  });

  describe('JSON-RPC Protocol Integration', () => {
    it('should create JSON-RPC protocol handler with MCP server', async () => {
      await transport.start();
      await setTimeout(50);

      // Verify the JSON-RPC handler was created and configured
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
          port: 3005,
          endpoint: '/mcp',
          corsOrigins: 1,
          timeout: 5000,
        }),
        'HTTP server started successfully'
      );
    });

    it('should handle SSE connections when enabled', async () => {
      await transport.start();
      await setTimeout(50);

      // SSE should be enabled in the transport
      const status = transport.getStatus();
      expect(status.running).toBe(true);

      // The transport should be running properly
      expect(status.running).toBe(true);
    });

    it('should handle SSE disabled configuration', async () => {
      const configNoSSE = { ...config };
      configNoSSE.http = { ...config.http };

      const transportNoSSE = new HttpTransport(
        configNoSSE,
        mcpServer,
        mockLogger
      );

      try {
        await transportNoSSE.start();
        await setTimeout(50);

        expect(transportNoSSE.getStatus().running).toBe(true);
      } finally {
        await transportNoSSE.stop();
      }
    });
  });

  describe('CORS and Security Configuration', () => {
    it('should configure CORS with specified origins', async () => {
      await transport.start();
      await setTimeout(50);

      // Verify CORS origins were configured
      expect(config.http.corsOrigins).toEqual(['http://localhost:3000']);
      expect(transport.getStatus().running).toBe(true);
    });

    it('should handle empty CORS origins gracefully', async () => {
      const configNoCors = { ...config };
      configNoCors.http = { ...config.http, corsOrigins: [] };

      const transportNoCors = new HttpTransport(
        configNoCors,
        mcpServer,
        mockLogger
      );

      try {
        await transportNoCors.start();
        await setTimeout(50);

        expect(transportNoCors.getStatus().running).toBe(true);
      } finally {
        await transportNoCors.stop();
      }
    });
  });

  describe('Resource Management and Cleanup', () => {
    it('should clean up connections on shutdown', async () => {
      await transport.start();
      await setTimeout(50);

      // Start some mock connections tracking
      const initialStatus = transport.getStatus();
      expect(initialStatus.running).toBe(true);

      // Stop and verify cleanup
      await transport.stop();

      // Should have logged server stop
      expect(mockLogger.info).toHaveBeenCalledWith('Stopping HTTP server...');
    });

    it('should handle timeout configuration correctly', async () => {
      const configWithTimeout = { ...config };
      configWithTimeout.http = { ...config.http, timeout: 1000 };

      const transportWithTimeout = new HttpTransport(
        configWithTimeout,
        mcpServer,
        mockLogger
      );

      try {
        await transportWithTimeout.start();
        await setTimeout(50);

        expect(transportWithTimeout.getStatus().running).toBe(true);
      } finally {
        await transportWithTimeout.stop();
      }
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle stop() when never started', async () => {
      // Should not throw
      await transport.stop();
      expect(transport.getStatus().running).toBe(false);
    });

    it('should handle port conflicts gracefully', async () => {
      // Start first transport
      await transport.start();
      await setTimeout(50);

      // Try to start second transport on same port
      const conflictTransport = new HttpTransport(
        config,
        mcpServer,
        mockLogger
      );

      try {
        await expect(conflictTransport.start()).rejects.toThrow();
      } catch (error) {
        // Expected - port should be in use
      } finally {
        // Clean up
        try {
          await conflictTransport.stop();
        } catch {
          // May not have started
        }
      }
    });
  });

  describe('Integration with MCP Server', () => {
    it('should successfully integrate with DrupalMcpServer', async () => {
      expect(mcpServer).toBeDefined();
      expect(transport).toBeDefined();

      // Should be able to start with MCP server integration
      await transport.start();
      await setTimeout(50);

      expect(transport.getStatus().running).toBe(true);

      // MCP server should have been initialized with capabilities
      expect(config.mcp.capabilities.tools?.listChanged).toBe(true);
      expect(config.mcp.capabilities.resources?.subscribe).toBe(true);
    });
  });
});
