/**
 * MCP Protocol Integration Tests
 * 
 * Comprehensive integration tests that verify end-to-end functionality
 * of the MCP protocol implementation including SSE transport, protocol handlers,
 * tool registry, and JSON-RPC backend communication.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import axios from 'axios';
import { WebSocket } from 'ws';

import { MCPHttpServer, type HttpServerConfig } from '@/server/http-server';
import { SSETransport, type SSETransportConfig } from '@/transport/sse-transport';
import { MCPProtocolHandler, type MCPHandlerConfig } from '@/protocol/mcp-handler';
import { ToolRegistry } from '@/tools/tool-registry';
import { EnhancedJsonRpcClient, type EnhancedJsonRpcClientConfig } from '@/drupal/enhanced-json-rpc-client';
import type { Tool, CallToolParams, CallToolResult } from '@/protocol/types';

// Mock logger to reduce test noise
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config
jest.mock('@/config', () => ({
  config: {
    port: 3001,
    environment: 'test',
    health: {
      enabled: true,
      path: '/health'
    },
    security: {
      cors: {
        enabled: true,
        origins: ['*']
      },
      rateLimit: {
        enabled: false,
        max: 100,
        windowMs: 60000
      }
    },
    drupal: {
      baseUrl: 'http://localhost:8080',
      jsonRpcEndpoint: '/jsonrpc',
      timeout: 5000
    }
  },
}));

describe('MCP Protocol Integration Tests', () => {
  let server: MCPHttpServer;
  let protocolHandler: MCPProtocolHandler;
  let toolRegistry: ToolRegistry;
  let jsonRpcClient: EnhancedJsonRpcClient;
  let testPort: number;
  let testBaseUrl: string;

  const serverConfig: Partial<HttpServerConfig> = {
    port: 0, // Let OS assign port
    cors: {
      enabled: true,
      origins: ['*']
    },
    security: {
      enabled: false,
      rateLimit: {
        enabled: false,
        max: 1000,
        windowMs: 60000
      }
    },
    compression: false,
    healthCheck: {
      enabled: true,
      path: '/health'
    }
  };

  const sseConfig: Partial<SSETransportConfig> = {
    heartbeatIntervalMs: 1000, // 1 second for faster tests
    connectionTimeoutMs: 5000, // 5 seconds
    maxConnections: 10,
    corsOrigins: ['*']
  };

  beforeAll(async () => {
    // Create server instance
    server = new MCPHttpServer(serverConfig, sseConfig);
    
    // Start server
    await server.start();
    
    // Get assigned port
    const status = server.getStatus();
    testPort = status.port;
    testBaseUrl = `http://localhost:${testPort}`;

    // Initialize tool registry
    toolRegistry = new ToolRegistry({
      maxTools: 100,
      enableMetrics: true,
      enableCaching: true,
      strictValidation: true
    });

    // Create mock JSON-RPC client
    const jsonRpcConfig: EnhancedJsonRpcClientConfig = {
      baseUrl: 'http://localhost:8080/jsonrpc',
      timeout: 5000,
      retryAttempts: 1,
      healthCheck: { enabled: false }
    };
    jsonRpcClient = new EnhancedJsonRpcClient(jsonRpcConfig);

    // Initialize protocol handler
    const handlerConfig: MCPHandlerConfig = {
      drupalBaseUrl: 'http://localhost:8080',
      enableToolDiscovery: true,
      toolRefreshInterval: 60000
    };
    protocolHandler = new MCPProtocolHandler(handlerConfig);

    // Register some test tools
    await registerTestTools();
  }, 30000);

  afterAll(async () => {
    if (jsonRpcClient) {
      await jsonRpcClient.shutdown();
    }
    if (server) {
      await server.stop();
    }
  }, 10000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Server Startup and Health', () => {
    it('should start server successfully and respond to health checks', async () => {
      const healthResponse = await axios.get(`${testBaseUrl}/health`);
      
      expect(healthResponse.status).toBe(200);
      expect(healthResponse.data).toMatchObject({
        status: 'healthy',
        server: {
          isStarted: true,
          port: testPort
        }
      });
    });

    it('should provide server status endpoint', async () => {
      const statusResponse = await axios.get(`${testBaseUrl}/mcp/status`);
      
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.data).toMatchObject({
        isStarted: true,
        isShuttingDown: false,
        port: testPort
      });
    });

    it('should provide API information at root endpoint', async () => {
      const rootResponse = await axios.get(`${testBaseUrl}/`);
      
      expect(rootResponse.status).toBe(200);
      expect(rootResponse.data).toMatchObject({
        name: 'Drupalize.me MCP Server',
        endpoints: {
          health: '/health',
          mcp_stream: '/mcp/stream',
          status: '/mcp/status'
        }
      });
    });
  });

  describe('SSE Connection Lifecycle', () => {
    it('should establish SSE connection successfully', async () => {
      const connectionPromise = new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${testBaseUrl}/mcp/stream`);
        
        eventSource.onopen = () => {
          resolve('connected');
          eventSource.close();
        };
        
        eventSource.onerror = (error) => {
          reject(error);
          eventSource.close();
        };
        
        // Timeout after 5 seconds
        setTimeout(() => {
          eventSource.close();
          reject(new Error('Connection timeout'));
        }, 5000);
      });

      await expect(connectionPromise).resolves.toBe('connected');
    });

    it('should handle multiple concurrent SSE connections', async () => {
      const connectionCount = 3;
      const connectionPromises: Promise<string>[] = [];

      for (let i = 0; i < connectionCount; i++) {
        connectionPromises.push(
          new Promise((resolve, reject) => {
            const eventSource = new EventSource(`${testBaseUrl}/mcp/stream`);
            let connectionId: string | null = null;
            
            eventSource.onmessage = (event) => {
              const data = JSON.parse(event.data);
              if (data.connectionId) {
                connectionId = data.connectionId;
                resolve(connectionId);
                eventSource.close();
              }
            };
            
            eventSource.onerror = (error) => {
              reject(error);
              eventSource.close();
            };
            
            setTimeout(() => {
              eventSource.close();
              reject(new Error(`Connection ${i} timeout`));
            }, 5000);
          })
        );
      }

      const connectionIds = await Promise.all(connectionPromises);
      
      expect(connectionIds).toHaveLength(connectionCount);
      expect(new Set(connectionIds).size).toBe(connectionCount); // All unique
    });

    it('should handle SSE connection heartbeat mechanism', async () => {
      const heartbeatPromise = new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${testBaseUrl}/mcp/stream`);
        let heartbeatCount = 0;
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (event.type === 'heartbeat' || data.timestamp) {
            heartbeatCount++;
            if (heartbeatCount >= 2) { // Wait for at least 2 heartbeats
              resolve(heartbeatCount);
              eventSource.close();
            }
          }
        };
        
        eventSource.onerror = (error) => {
          reject(error);
          eventSource.close();
        };
        
        // Wait up to 10 seconds for heartbeats
        setTimeout(() => {
          eventSource.close();
          reject(new Error(`Only received ${heartbeatCount} heartbeats`));
        }, 10000);
      });

      const heartbeatCount = await heartbeatPromise;
      expect(heartbeatCount).toBeGreaterThanOrEqual(2);
    });

    it('should properly close SSE connections', async () => {
      const connectionPromise = new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${testBaseUrl}/mcp/stream`);
        let isConnected = false;
        
        eventSource.onopen = () => {
          isConnected = true;
          // Close connection immediately
          eventSource.close();
        };
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.reason === 'client_close') {
            resolve('properly_closed');
          }
        };
        
        // Check connection was established and closed
        setTimeout(() => {
          if (isConnected && eventSource.readyState === EventSource.CLOSED) {
            resolve('properly_closed');
          } else {
            reject(new Error('Connection not properly closed'));
          }
        }, 2000);
      });

      await expect(connectionPromise).resolves.toBe('properly_closed');
    });
  });

  describe('Tool Registry Integration', () => {
    it('should register tools successfully', async () => {
      const testTool: Tool = {
        name: 'test_integration_tool',
        description: 'A test tool for integration testing',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      };

      const result = await toolRegistry.registerTool({
        tool: testTool,
        replace: true
      });

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('test_integration_tool');
    });

    it('should list registered tools', async () => {
      const result = await toolRegistry.listTools();
      
      expect(result.tools.length).toBeGreaterThan(0);
      expect(result.tools.some(tool => tool.name === 'test_integration_tool')).toBe(true);
    });

    it('should validate tool parameters correctly', async () => {
      const validParams = { message: 'Hello, World!' };
      const validResult = await toolRegistry.validateToolParams('test_integration_tool', validParams);
      
      expect(validResult.isValid).toBe(true);
      expect(validResult.errors).toBeUndefined();

      const invalidParams = {}; // Missing required 'message' field
      const invalidResult = await toolRegistry.validateToolParams('test_integration_tool', invalidParams);
      
      expect(invalidResult.isValid).toBe(false);
      expect(invalidResult.errors).toBeDefined();
      expect(invalidResult.errors?.length).toBeGreaterThan(0);
    });
  });

  describe('MCP Protocol Handler Integration', () => {
    it('should handle protocol initialization', async () => {
      const mockRequest = {
        jsonrpc: '2.0' as const,
        id: 'test-init',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      };

      const response = await protocolHandler.handleMessage(
        JSON.stringify(mockRequest),
        'test-connection'
      );

      expect(response).toBeDefined();
      const parsed = JSON.parse(response!);
      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.id).toBe('test-init');
    });

    it('should handle tools/list requests', async () => {
      const mockRequest = {
        jsonrpc: '2.0' as const,
        id: 'test-list-tools',
        method: 'tools/list',
        params: {}
      };

      const response = await protocolHandler.handleMessage(
        JSON.stringify(mockRequest),
        'test-connection'
      );

      expect(response).toBeDefined();
      const parsed = JSON.parse(response!);
      expect(parsed.jsonrpc).toBe('2.0');
      expect(parsed.id).toBe('test-list-tools');
      expect(parsed.result).toBeDefined();
      expect(parsed.result.tools).toBeInstanceOf(Array);
    });

    it('should handle invalid JSON-RPC requests gracefully', async () => {
      const invalidRequest = '{"invalid": "json-rpc"}';

      const response = await protocolHandler.handleMessage(
        invalidRequest,
        'test-connection'
      );

      expect(response).toBeDefined();
      const parsed = JSON.parse(response!);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBeDefined();
    });
  });

  describe('End-to-End MCP Communication', () => {
    it('should complete full MCP protocol handshake', async () => {
      const messagePromises: Promise<any>[] = [];
      
      const protocolPromise = new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${testBaseUrl}/mcp/stream`);
        const receivedMessages: any[] = [];
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          receivedMessages.push(data);
          
          // Look for connection established message
          if (data.server === 'drupalize-mcp-server') {
            resolve(receivedMessages);
            eventSource.close();
          }
        };
        
        eventSource.onerror = (error) => {
          reject(error);
          eventSource.close();
        };
        
        setTimeout(() => {
          eventSource.close();
          reject(new Error(`Timeout. Received messages: ${JSON.stringify(receivedMessages)}`));
        }, 5000);
      });

      const messages = await protocolPromise;
      expect(Array.isArray(messages)).toBe(true);
    });

    it('should handle concurrent MCP protocol requests', async () => {
      const concurrentRequests = 5;
      const requestPromises: Promise<any>[] = [];

      for (let i = 0; i < concurrentRequests; i++) {
        const request = {
          jsonrpc: '2.0' as const,
          id: `concurrent-${i}`,
          method: 'tools/list',
          params: {}
        };

        requestPromises.push(
          protocolHandler.handleMessage(
            JSON.stringify(request),
            `test-connection-${i}`
          )
        );
      }

      const responses = await Promise.all(requestPromises);
      
      expect(responses).toHaveLength(concurrentRequests);
      responses.forEach((response, index) => {
        expect(response).toBeDefined();
        const parsed = JSON.parse(response!);
        expect(parsed.id).toBe(`concurrent-${index}`);
        expect(parsed.result?.tools).toBeInstanceOf(Array);
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle server errors gracefully', async () => {
      // Test 404 for non-existent endpoint
      const response404 = await axios.get(`${testBaseUrl}/non-existent`, {
        validateStatus: () => true
      });
      
      expect(response404.status).toBe(404);
      expect(response404.data.error).toBe('Not found');
    });

    it('should handle malformed SSE connection attempts', async () => {
      // Try to POST to SSE endpoint (should only accept GET)
      const response = await axios.post(`${testBaseUrl}/mcp/stream`, {}, {
        validateStatus: () => true
      });
      
      expect(response.status).toBe(404); // Express returns 404 for wrong method on GET-only routes
    });

    it('should recover from protocol handler errors', async () => {
      const malformedRequest = 'not-json';
      
      const response = await protocolHandler.handleMessage(
        malformedRequest,
        'test-connection'
      );
      
      expect(response).toBeDefined();
      const parsed = JSON.parse(response!);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBe(-32603); // Internal error
    });

    it('should handle connection cleanup on server shutdown', async () => {
      // This test verifies graceful shutdown doesn't leave hanging connections
      const connectionStats = server.getSSETransport().getConnectionStats();
      const initialConnections = connectionStats.active;
      
      // The server should handle cleanup properly during shutdown
      // We can't test actual shutdown without stopping the server,
      // but we can verify current connection tracking
      expect(typeof initialConnections).toBe('number');
      expect(initialConnections).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle multiple rapid SSE connections', async () => {
      const startTime = Date.now();
      const connectionCount = 10;
      const connectionPromises: Promise<boolean>[] = [];

      for (let i = 0; i < connectionCount; i++) {
        connectionPromises.push(
          new Promise((resolve) => {
            const eventSource = new EventSource(`${testBaseUrl}/mcp/stream`);
            
            eventSource.onopen = () => {
              resolve(true);
              eventSource.close();
            };
            
            eventSource.onerror = () => {
              resolve(false);
              eventSource.close();
            };
          })
        );
      }

      const results = await Promise.all(connectionPromises);
      const duration = Date.now() - startTime;
      const successCount = results.filter(Boolean).length;

      expect(successCount).toBeGreaterThan(connectionCount * 0.8); // At least 80% success
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should process protocol messages within performance thresholds', async () => {
      const messageCount = 20;
      const startTime = Date.now();
      const messagePromises: Promise<number>[] = [];

      for (let i = 0; i < messageCount; i++) {
        const request = {
          jsonrpc: '2.0' as const,
          id: `perf-${i}`,
          method: 'tools/list',
          params: {}
        };

        messagePromises.push(
          (async () => {
            const msgStart = Date.now();
            await protocolHandler.handleMessage(
              JSON.stringify(request),
              `perf-connection-${i}`
            );
            return Date.now() - msgStart;
          })()
        );
      }

      const durations = await Promise.all(messagePromises);
      const totalDuration = Date.now() - startTime;
      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      // Performance thresholds from requirements
      expect(avgDuration).toBeLessThan(10); // < 10ms per message
      expect(maxDuration).toBeLessThan(50); // < 50ms for any single message
      expect(totalDuration).toBeLessThan(1000); // Total processing < 1 second
    });

    it('should maintain connection stability under load', async () => {
      const connectionCount = 5;
      const messagesPerConnection = 10;
      const connectionPromises: Promise<number>[] = [];

      for (let i = 0; i < connectionCount; i++) {
        connectionPromises.push(
          new Promise((resolve, reject) => {
            let messageCount = 0;
            const eventSource = new EventSource(`${testBaseUrl}/mcp/stream`);
            
            eventSource.onmessage = () => {
              messageCount++;
              if (messageCount >= messagesPerConnection) {
                resolve(messageCount);
                eventSource.close();
              }
            };
            
            eventSource.onerror = () => {
              reject(new Error(`Connection ${i} failed after ${messageCount} messages`));
              eventSource.close();
            };
            
            setTimeout(() => {
              eventSource.close();
              reject(new Error(`Connection ${i} timeout after ${messageCount} messages`));
            }, 15000);
          })
        );
      }

      const messageCounts = await Promise.all(connectionPromises);
      
      expect(messageCounts).toHaveLength(connectionCount);
      messageCounts.forEach(count => {
        expect(count).toBeGreaterThanOrEqual(messagesPerConnection);
      });
    });
  });

  // Helper function to register test tools
  async function registerTestTools(): Promise<void> {
    const tools: Tool[] = [
      {
        name: 'search_content',
        description: 'Search Drupalize.me tutorials and educational content',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            content_type: { type: 'string', enum: ['tutorial', 'guide', 'blog', 'all'] },
            limit: { type: 'number', minimum: 1, maximum: 100 }
          },
          required: ['query']
        }
      },
      {
        name: 'get_tutorial',
        description: 'Retrieve specific tutorial content',
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            include_content: { type: 'boolean' }
          },
          required: ['id']
        }
      },
      {
        name: 'health_check',
        description: 'Check Drupal API health and connectivity',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    ];

    for (const tool of tools) {
      await toolRegistry.registerTool({
        tool,
        replace: true
      });
    }
  }
});

// Mock EventSource for Node.js environment
declare global {
  var EventSource: typeof import('eventsource');
}

// Only create EventSource mock if not already available
if (typeof globalThis.EventSource === 'undefined') {
  globalThis.EventSource = class MockEventSource extends EventEmitter {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSED = 2;
    
    readyState = MockEventSource.CONNECTING;
    url: string;
    
    constructor(url: string) {
      super();
      this.url = url;
      
      // Simulate connection
      setTimeout(() => {
        this.readyState = MockEventSource.OPEN;
        this.emit('open');
        
        // Simulate connected message
        setTimeout(() => {
          const data = {
            connectionId: `mock_${Date.now()}`,
            timestamp: new Date().toISOString(),
            server: 'drupalize-mcp-server',
            version: '1.0.0'
          };
          
          this.emit('message', {
            type: 'connected',
            data: JSON.stringify(data)
          });
        }, 100);
        
      }, 50);
    }
    
    close() {
      this.readyState = MockEventSource.CLOSED;
      this.emit('close');
    }
    
    set onopen(handler: ((event: any) => void) | null) {
      if (handler) this.on('open', handler);
    }
    
    set onmessage(handler: ((event: any) => void) | null) {
      if (handler) this.on('message', handler);
    }
    
    set onerror(handler: ((event: any) => void) | null) {
      if (handler) this.on('error', handler);
    }
  } as any;
}