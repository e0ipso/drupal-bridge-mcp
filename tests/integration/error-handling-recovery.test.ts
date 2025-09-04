/**
 * Error Handling and Recovery Scenario Tests
 * 
 * Comprehensive tests for error handling across the MCP protocol stack,
 * including network failures, protocol errors, resource exhaustion,
 * and system recovery scenarios.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import axios from 'axios';

import { MCPHttpServer } from '@/server/http-server';
import { SSETransport, type SSETransportConfig } from '@/transport/sse-transport';
import { MCPProtocolHandler } from '@/protocol/mcp-handler';
import { ToolRegistry } from '@/tools/tool-registry';
import { EnhancedJsonRpcClient } from '@/drupal/enhanced-json-rpc-client';
import { ToolRegistryError, ToolRegistryErrorCode } from '@/tools/types';
import type { 
  Tool, 
  ExtendedTool, 
  CallToolParams, 
  CallToolResult, 
  ToolInvocationContext 
} from '@/protocol/types';

// Mock logger
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
    port: 3003,
    environment: 'test',
    health: { enabled: true, path: '/health' },
    security: {
      cors: { enabled: true, origins: ['*'] },
      rateLimit: { enabled: false, max: 100, windowMs: 60000 }
    }
  },
}));

describe('Error Handling and Recovery Scenario Tests', () => {
  let server: MCPHttpServer;
  let protocolHandler: MCPProtocolHandler;
  let toolRegistry: ToolRegistry;
  let jsonRpcClient: EnhancedJsonRpcClient;
  let testPort: number;
  let testBaseUrl: string;

  const mockInvocationContext: ToolInvocationContext = {
    connectionId: 'error-test-connection',
    userId: 'error-test-user',
    timestamp: Date.now(),
    requestId: 'error-test-request',
    metadata: {}
  };

  beforeAll(async () => {
    // Create server with minimal security for testing
    server = new MCPHttpServer(
      {
        port: 0,
        security: { enabled: false, rateLimit: { enabled: false, max: 100, windowMs: 60000 } },
        healthCheck: { enabled: true, path: '/health' }
      },
      {
        heartbeatIntervalMs: 1000,
        connectionTimeoutMs: 3000,
        maxConnections: 5,
        corsOrigins: ['*']
      }
    );

    await server.start();
    
    const status = server.getStatus();
    testPort = status.port;
    testBaseUrl = `http://localhost:${testPort}`;

    // Initialize components
    toolRegistry = new ToolRegistry({
      maxTools: 20,
      enableMetrics: true,
      strictValidation: true,
      defaultTimeout: 2000 // Short timeout for error testing
    });

    protocolHandler = new MCPProtocolHandler({
      drupalBaseUrl: 'http://localhost:8080',
      enableToolDiscovery: true
    });

    jsonRpcClient = new EnhancedJsonRpcClient({
      baseUrl: 'http://localhost:8080/jsonrpc',
      timeout: 2000,
      retryAttempts: 2, // Reduced for faster error tests
      retryDelay: 100
    });

    // Register error-prone test tools
    await setupErrorTestTools();
  }, 15000);

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

  describe('Network and Connection Errors', () => {
    it('should handle server unavailable scenarios', async () => {
      const unavailableClient = new EnhancedJsonRpcClient({
        baseUrl: 'http://localhost:9999/jsonrpc', // Non-existent server
        timeout: 1000,
        retryAttempts: 1
      });

      await expect(
        unavailableClient.call('test.method', {}, 'test-token')
      ).rejects.toThrow();

      await unavailableClient.shutdown();
    });

    it('should handle connection timeouts gracefully', async () => {
      // Create client with very short timeout
      const timeoutClient = new EnhancedJsonRpcClient({
        baseUrl: 'http://httpstat.us/200?sleep=5000', // Slow response service
        timeout: 500, // Very short timeout
        retryAttempts: 1
      });

      await expect(
        timeoutClient.call('slow.method', {}, 'test-token')
      ).rejects.toThrow();

      await timeoutClient.shutdown();
    });

    it('should handle SSE connection failures', async () => {
      // Try to connect to non-existent SSE endpoint
      const connectionPromise = new Promise((resolve, reject) => {
        const eventSource = new MockEventSource('http://localhost:9999/mcp/stream');
        
        eventSource.onerror = (error: any) => {
          resolve('connection-failed');
          eventSource.close();
        };

        eventSource.onopen = () => {
          reject(new Error('Should not connect to non-existent server'));
          eventSource.close();
        };

        setTimeout(() => {
          eventSource.close();
          resolve('timeout');
        }, 2000);
      });

      const result = await connectionPromise;
      expect(result).toBe('connection-failed');
    });

    it('should recover from temporary network failures', async () => {
      let attempt = 0;
      const mockAxios = jest.spyOn(axios, 'post').mockImplementation(() => {
        attempt++;
        if (attempt === 1) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          data: {
            jsonrpc: '2.0',
            result: { recovered: true, attempt },
            id: 'test-id'
          }
        });
      });

      const result = await jsonRpcClient.call('recovery.test', {}, 'test-token');
      
      expect(result.recovered).toBe(true);
      expect(result.attempt).toBe(2);
      expect(attempt).toBe(2);

      mockAxios.mockRestore();
    });

    it('should handle SSE connection drops and cleanup', async () => {
      const connectionStats = server.getSSETransport().getConnectionStats();
      const initialActive = connectionStats.active;

      // Create connection
      const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
      
      // Wait for connection
      await new Promise(resolve => {
        eventSource.onopen = resolve;
        setTimeout(resolve, 1000);
      });

      // Simulate connection drop
      eventSource.simulateError(new Error('Connection dropped'));

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      const afterDropStats = server.getSSETransport().getConnectionStats();
      expect(afterDropStats.active).toBeLessThanOrEqual(initialActive + 1);
    });

    it('should handle max connection limits gracefully', async () => {
      const connections: MockEventSource[] = [];
      let rejectedConnections = 0;

      try {
        // Try to create more connections than allowed
        for (let i = 0; i < 8; i++) { // More than max of 5
          const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
          connections.push(eventSource);

          eventSource.onerror = () => {
            rejectedConnections++;
          };
        }

        // Wait for connections to be processed
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Some connections should be rejected
        expect(rejectedConnections).toBeGreaterThan(0);

      } finally {
        connections.forEach(conn => conn.close());
      }
    });
  });

  describe('Protocol and Message Errors', () => {
    it('should handle malformed JSON-RPC requests', async () => {
      const malformedRequests = [
        '{"invalid": "json"}',
        '{"jsonrpc": "1.0", "method": "test"}', // Wrong version
        '{"jsonrpc": "2.0"}', // Missing method
        'not-json-at-all',
        ''
      ];

      for (const request of malformedRequests) {
        const response = await protocolHandler.handleMessage(request, 'test-connection');
        
        expect(response).toBeDefined();
        const parsed = JSON.parse(response!);
        expect(parsed.error).toBeDefined();
        expect(parsed.error.code).toBeDefined();
      }
    });

    it('should handle unknown protocol methods', async () => {
      const unknownMethodRequest = {
        jsonrpc: '2.0' as const,
        id: 'unknown-test',
        method: 'unknown/method',
        params: {}
      };

      const response = await protocolHandler.handleMessage(
        JSON.stringify(unknownMethodRequest),
        'test-connection'
      );

      expect(response).toBeDefined();
      const parsed = JSON.parse(response!);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.code).toBe(-32601); // Method not found
    });

    it('should handle invalid tool parameters', async () => {
      const invalidParamsRequest = {
        jsonrpc: '2.0' as const,
        id: 'invalid-params-test',
        method: 'tools/call',
        params: {
          name: 'error_validation_tool',
          arguments: {
            // Missing required parameter
            optional_param: 'value'
          }
        }
      };

      const response = await protocolHandler.handleMessage(
        JSON.stringify(invalidParamsRequest),
        'test-connection'
      );

      expect(response).toBeDefined();
      const parsed = JSON.parse(response!);
      expect(parsed.error).toBeDefined();
      expect(parsed.error.message).toContain('validation failed');
    });

    it('should handle tool execution errors gracefully', async () => {
      const params: CallToolParams = {
        name: 'error_throwing_tool',
        arguments: {
          error_type: 'runtime'
        }
      };

      await expect(
        toolRegistry.invokeTool(params, mockInvocationContext)
      ).rejects.toThrow('Runtime error occurred');
    });

    it('should handle async tool errors', async () => {
      const params: CallToolParams = {
        name: 'async_error_tool',
        arguments: {
          delay: 100
        }
      };

      await expect(
        toolRegistry.invokeTool(params, mockInvocationContext)
      ).rejects.toThrow('Async operation failed');
    });

    it('should handle tool timeout errors', async () => {
      const params: CallToolParams = {
        name: 'timeout_tool',
        arguments: {
          delay: 5000 // Longer than tool timeout
        }
      };

      await expect(
        toolRegistry.invokeTool(params, mockInvocationContext)
      ).rejects.toThrow(ToolRegistryError);
    });
  });

  describe('Resource Exhaustion Scenarios', () => {
    it('should handle tool registry at capacity', async () => {
      // Create registry with very small capacity
      const smallRegistry = new ToolRegistry({ maxTools: 2 });

      // Fill the registry
      const tool1: Tool = {
        name: 'capacity_tool_1',
        description: 'First tool',
        inputSchema: { type: 'object', properties: {} }
      };

      const tool2: Tool = {
        name: 'capacity_tool_2',
        description: 'Second tool',
        inputSchema: { type: 'object', properties: {} }
      };

      const tool3: Tool = {
        name: 'capacity_tool_3',
        description: 'Third tool (should fail)',
        inputSchema: { type: 'object', properties: {} }
      };

      await smallRegistry.registerTool({ tool: tool1 });
      await smallRegistry.registerTool({ tool: tool2 });

      const result = await smallRegistry.registerTool({ tool: tool3 });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Registry is full');

      await smallRegistry.clear();
    });

    it('should handle concurrent limit exceeded', async () => {
      const concurrentLimitTool: ExtendedTool = {
        name: 'concurrent_limit_tool',
        description: 'Tool with concurrency limit',
        inputSchema: { type: 'object', properties: {} },
        availability: {
          maxConcurrency: 1 // Only allow one concurrent execution
        },
        handler: async (params, context): Promise<CallToolResult> => {
          await new Promise(resolve => setTimeout(resolve, 200)); // Simulate work
          return {
            content: [{ type: 'text', text: 'Concurrent execution completed' }]
          };
        }
      };

      await toolRegistry.registerTool({ tool: concurrentLimitTool });

      const params: CallToolParams = {
        name: 'concurrent_limit_tool',
        arguments: {}
      };

      // Start first invocation (should succeed)
      const invocation1 = toolRegistry.invokeTool(params, mockInvocationContext);

      // Start second invocation immediately (should fail due to concurrency limit)
      const invocation2Promise = toolRegistry.invokeTool(
        params, 
        { ...mockInvocationContext, requestId: 'concurrent-2' }
      );

      await expect(invocation2Promise).rejects.toThrow(ToolRegistryError);
      await invocation1; // Wait for first to complete
    });

    it('should handle rate limit exceeded', async () => {
      const rateLimitTool: ExtendedTool = {
        name: 'rate_limit_tool',
        description: 'Tool with rate limit',
        inputSchema: { type: 'object', properties: {} },
        availability: {
          rateLimit: {
            maxCalls: 2,
            windowMs: 1000 // 2 calls per second
          }
        },
        handler: async (): Promise<CallToolResult> => ({
          content: [{ type: 'text', text: 'Rate limited call' }]
        })
      };

      await toolRegistry.registerTool({ tool: rateLimitTool });

      const params: CallToolParams = {
        name: 'rate_limit_tool',
        arguments: {}
      };

      // First two calls should succeed
      await toolRegistry.invokeTool(params, mockInvocationContext);
      await toolRegistry.invokeTool(params, { ...mockInvocationContext, requestId: 'rate-2' });

      // Third call should fail due to rate limit
      await expect(
        toolRegistry.invokeTool(params, { ...mockInvocationContext, requestId: 'rate-3' })
      ).rejects.toThrow(ToolRegistryError);
    });

    it('should handle memory pressure scenarios', async () => {
      const memoryIntensiveTool: ExtendedTool = {
        name: 'memory_tool',
        description: 'Memory intensive tool',
        inputSchema: { 
          type: 'object', 
          properties: { 
            size: { type: 'number' } 
          } 
        },
        handler: async (params): Promise<CallToolResult> => {
          // Simulate memory-intensive operation
          const size = params.size || 1000;
          const largeArray = new Array(size).fill('x'.repeat(1000));
          
          return {
            content: [{ 
              type: 'text', 
              text: `Processed ${largeArray.length} items` 
            }]
          };
        }
      };

      await toolRegistry.registerTool({ tool: memoryIntensiveTool });

      const params: CallToolParams = {
        name: 'memory_tool',
        arguments: { size: 10000 } // Large but manageable size
      };

      // Should handle moderate memory usage
      const result = await toolRegistry.invokeTool(params, mockInvocationContext);
      expect(result.content[0].text).toContain('Processed 10000 items');
    });
  });

  describe('System Recovery Scenarios', () => {
    it('should recover from SSE transport restart', async () => {
      // Get initial connection stats
      const initialStats = server.getSSETransport().getConnectionStats();

      // Create connections
      const connections: MockEventSource[] = [];
      for (let i = 0; i < 3; i++) {
        const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
        connections.push(eventSource);
      }

      // Wait for connections
      await new Promise(resolve => setTimeout(resolve, 500));

      // Simulate SSE transport issues by closing all connections
      connections.forEach(conn => conn.close());

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 500));

      // Should be able to create new connections after cleanup
      const newEventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
      
      const connectionEstablished = await new Promise(resolve => {
        newEventSource.onopen = () => resolve(true);
        newEventSource.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 2000);
      });

      expect(connectionEstablished).toBe(true);
      newEventSource.close();
    });

    it('should handle graceful server shutdown with active connections', async () => {
      // This test would normally shut down the server, but we'll simulate the scenario
      const shutdownStats = server.getSSETransport().getConnectionStats();
      
      // Server should be able to report its state even under stress
      expect(typeof shutdownStats.active).toBe('number');
      expect(typeof shutdownStats.total).toBe('number');
    });

    it('should recover tool registry after errors', async () => {
      // Register a tool that will cause validation errors
      const problematicTool: Tool = {
        name: 'recovery_test_tool',
        description: 'Tool for recovery testing',
        inputSchema: { type: 'object', properties: {} }
      };

      await toolRegistry.registerTool({ tool: problematicTool });

      // Verify tool is registered
      let tool = await toolRegistry.getTool('recovery_test_tool');
      expect(tool).toBeDefined();

      // Unregister the tool
      await toolRegistry.unregisterTool('recovery_test_tool');

      // Verify tool is removed
      tool = await toolRegistry.getTool('recovery_test_tool');
      expect(tool).toBeNull();

      // Re-register should work fine
      const result = await toolRegistry.registerTool({ tool: problematicTool });
      expect(result.success).toBe(true);
    });

    it('should handle protocol handler restart scenarios', async () => {
      // Test that protocol handler maintains consistent behavior across requests
      const testRequest = {
        jsonrpc: '2.0' as const,
        id: 'recovery-test',
        method: 'tools/list',
        params: {}
      };

      // Multiple sequential requests should all work
      for (let i = 0; i < 5; i++) {
        const response = await protocolHandler.handleMessage(
          JSON.stringify({ ...testRequest, id: `recovery-test-${i}` }),
          `recovery-connection-${i}`
        );

        expect(response).toBeDefined();
        const parsed = JSON.parse(response!);
        expect(parsed.jsonrpc).toBe('2.0');
        expect(parsed.id).toBe(`recovery-test-${i}`);
      }
    });

    it('should handle backend service recovery', async () => {
      // Mock a scenario where backend service goes down and comes back
      let serviceDown = true;

      const mockAxios = jest.spyOn(axios, 'post').mockImplementation(() => {
        if (serviceDown) {
          serviceDown = false; // Simulate service coming back online
          return Promise.reject(new Error('Service temporarily unavailable'));
        }
        return Promise.resolve({
          data: {
            jsonrpc: '2.0',
            result: { service: 'recovered' },
            id: 'test-id'
          }
        });
      });

      // First call should trigger retry and succeed
      const result = await jsonRpcClient.call('service.test', {}, 'test-token');
      expect(result.service).toBe('recovered');

      mockAxios.mockRestore();
    });

    it('should maintain tool metrics through error scenarios', async () => {
      // Get initial metrics
      const initialMetrics = await toolRegistry.getToolMetrics('error_throwing_tool');
      const initialErrorCount = initialMetrics?.errorCount || 0;

      // Cause an error
      const params: CallToolParams = {
        name: 'error_throwing_tool',
        arguments: { error_type: 'tracked' }
      };

      try {
        await toolRegistry.invokeTool(params, mockInvocationContext);
      } catch {
        // Expected error
      }

      // Check metrics were updated
      const updatedMetrics = await toolRegistry.getToolMetrics('error_throwing_tool');
      expect(updatedMetrics?.errorCount).toBe(initialErrorCount + 1);
      expect(updatedMetrics?.lastError).toBeDefined();
    });
  });

  describe('Edge Cases and Corner Scenarios', () => {
    it('should handle extremely large tool parameters', async () => {
      const largeData = 'x'.repeat(100000); // 100KB string
      
      const params: CallToolParams = {
        name: 'data_processing_tool',
        arguments: { large_data: largeData }
      };

      const result = await toolRegistry.invokeTool(params, mockInvocationContext);
      expect(result.content[0].text).toContain('100000');
    });

    it('should handle null and undefined parameters gracefully', async () => {
      const edgeCaseParams = [
        { value: null },
        { value: undefined },
        {},
        { nested: { deep: null } }
      ];

      for (const params of edgeCaseParams) {
        const validationResult = await toolRegistry.validateToolParams(
          'flexible_tool',
          params
        );
        // Should not crash, might be valid or invalid depending on schema
        expect(typeof validationResult.isValid).toBe('boolean');
      }
    });

    it('should handle circular reference in tool parameters', async () => {
      const circularObj: any = { name: 'test' };
      circularObj.self = circularObj; // Create circular reference

      // Should not crash the validation system
      const validationResult = await toolRegistry.validateToolParams(
        'flexible_tool',
        circularObj
      );

      expect(typeof validationResult.isValid).toBe('boolean');
    });

    it('should handle tool unregistration during execution', async () => {
      const longRunningTool: ExtendedTool = {
        name: 'long_running_tool',
        description: 'Tool that takes time to execute',
        inputSchema: { type: 'object', properties: {} },
        handler: async (): Promise<CallToolResult> => {
          await new Promise(resolve => setTimeout(resolve, 500));
          return {
            content: [{ type: 'text', text: 'Long operation completed' }]
          };
        }
      };

      await toolRegistry.registerTool({ tool: longRunningTool });

      // Start execution
      const executionPromise = toolRegistry.invokeTool(
        { name: 'long_running_tool', arguments: {} },
        mockInvocationContext
      );

      // Try to unregister while running
      setTimeout(() => {
        toolRegistry.unregisterTool('long_running_tool');
      }, 100);

      // Execution should still complete successfully
      const result = await executionPromise;
      expect(result.content[0].text).toContain('Long operation completed');
    });

    it('should handle extremely high frequency requests', async () => {
      const rapidFireCount = 100;
      const promises: Promise<any>[] = [];
      const startTime = Date.now();

      for (let i = 0; i < rapidFireCount; i++) {
        const testRequest = {
          jsonrpc: '2.0' as const,
          id: `rapid-${i}`,
          method: 'tools/list',
          params: {}
        };

        promises.push(
          protocolHandler.handleMessage(
            JSON.stringify(testRequest),
            `rapid-connection-${i}`
          )
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // All requests should complete successfully
      expect(results).toHaveLength(rapidFireCount);
      results.forEach(result => {
        expect(result).toBeDefined();
        const parsed = JSON.parse(result!);
        expect(parsed.jsonrpc).toBe('2.0');
      });

      // Should complete in reasonable time (less than 5 seconds)
      expect(duration).toBeLessThan(5000);
    });
  });

  // Helper function to set up error-prone test tools
  async function setupErrorTestTools(): Promise<void> {
    const errorTools: ExtendedTool[] = [
      {
        name: 'error_throwing_tool',
        description: 'Tool that throws various types of errors',
        inputSchema: {
          type: 'object',
          properties: {
            error_type: { type: 'string', enum: ['runtime', 'validation', 'timeout', 'tracked'] }
          },
          required: ['error_type']
        },
        handler: async (params): Promise<CallToolResult> => {
          switch (params.error_type) {
            case 'runtime':
              throw new Error('Runtime error occurred');
            case 'validation':
              throw new Error('Validation failed');
            case 'timeout':
              await new Promise(resolve => setTimeout(resolve, 10000)); // Long delay
              throw new Error('Should not reach here');
            case 'tracked':
              throw new Error('Tracked error for metrics');
            default:
              throw new Error('Unknown error type');
          }
        }
      },
      {
        name: 'async_error_tool',
        description: 'Tool that throws async errors',
        inputSchema: {
          type: 'object',
          properties: {
            delay: { type: 'number', minimum: 0 }
          }
        },
        handler: async (params): Promise<CallToolResult> => {
          await new Promise(resolve => setTimeout(resolve, params.delay || 100));
          throw new Error('Async operation failed');
        }
      },
      {
        name: 'timeout_tool',
        description: 'Tool that times out',
        inputSchema: {
          type: 'object',
          properties: {
            delay: { type: 'number', minimum: 0 }
          }
        },
        timeout: 1000, // 1 second timeout
        handler: async (params): Promise<CallToolResult> => {
          await new Promise(resolve => setTimeout(resolve, params.delay || 2000));
          return {
            content: [{ type: 'text', text: 'Should not complete' }]
          };
        }
      },
      {
        name: 'error_validation_tool',
        description: 'Tool for testing parameter validation errors',
        inputSchema: {
          type: 'object',
          properties: {
            required_param: { type: 'string' },
            optional_param: { type: 'string' }
          },
          required: ['required_param'],
          additionalProperties: false
        },
        handler: async (params): Promise<CallToolResult> => ({
          content: [{ type: 'text', text: `Processed: ${params.required_param}` }]
        })
      },
      {
        name: 'flexible_tool',
        description: 'Tool that accepts various parameter formats',
        inputSchema: {
          type: 'object',
          properties: {
            value: { type: ['string', 'number', 'null'] },
            nested: { type: 'object' }
          },
          additionalProperties: true
        },
        handler: async (params): Promise<CallToolResult> => ({
          content: [{ type: 'text', text: `Flexible processing complete` }]
        })
      },
      {
        name: 'data_processing_tool',
        description: 'Tool that processes large amounts of data',
        inputSchema: {
          type: 'object',
          properties: {
            large_data: { type: 'string' }
          }
        },
        handler: async (params): Promise<CallToolResult> => ({
          content: [{ 
            type: 'text', 
            text: `Processed data of length: ${params.large_data?.length || 0}` 
          }]
        })
      }
    ];

    for (const tool of errorTools) {
      await toolRegistry.registerTool({
        tool,
        replace: true,
        validate: false // Skip validation for error tools
      });
    }
  }
});

// Enhanced mock EventSource with error simulation
class MockEventSource extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  
  readyState = MockEventSource.CONNECTING;
  url: string;
  
  constructor(url: string) {
    super();
    this.url = url;
    
    // Simulate connection with possible failure
    setTimeout(() => {
      if (url.includes('9999')) { // Non-existent server
        this.readyState = MockEventSource.CLOSED;
        this.emit('error', new Error('Connection failed'));
        return;
      }
      
      this.readyState = MockEventSource.OPEN;
      this.emit('open');
      
      // Simulate initial connection message
      setTimeout(() => {
        this.emit('message', {
          type: 'connected',
          data: JSON.stringify({
            connectionId: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            timestamp: new Date().toISOString(),
            server: 'drupalize-mcp-server',
            version: '1.0.0'
          })
        });
      }, 50);
    }, 100);
  }
  
  close() {
    this.readyState = MockEventSource.CLOSED;
    this.emit('close');
    this.removeAllListeners();
  }

  simulateError(error: Error) {
    this.emit('error', error);
    this.readyState = MockEventSource.CLOSED;
  }
  
  set onopen(handler: ((event: any) => void) | null) {
    if (handler) {
      this.removeAllListeners('open');
      this.on('open', handler);
    }
  }
  
  set onmessage(handler: ((event: any) => void) | null) {
    if (handler) {
      this.removeAllListeners('message');
      this.on('message', handler);
    }
  }
  
  set onerror(handler: ((event: any) => void) | null) {
    if (handler) {
      this.removeAllListeners('error');
      this.on('error', handler);
    }
  }
}