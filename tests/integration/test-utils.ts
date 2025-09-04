/**
 * Integration Test Utilities
 * 
 * Shared utilities, helpers, and mock implementations for integration tests.
 * Provides consistent test infrastructure across all integration test suites.
 */

import { EventEmitter } from 'events';
import type { Tool, ExtendedTool, CallToolResult, ToolInvocationContext } from '@/protocol/types';

/**
 * Mock EventSource implementation for testing SSE connections
 */
export class MockEventSource extends EventEmitter {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  
  readyState = MockEventSource.CONNECTING;
  url: string;
  private connectionId: string;
  private simulateDelay: number;
  
  constructor(url: string, options: { simulateDelay?: number } = {}) {
    super();
    this.url = url;
    this.simulateDelay = options.simulateDelay ?? 50;
    this.connectionId = `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    // Simulate async connection
    setTimeout(() => {
      if (this.url.includes('9999') || this.url.includes('nonexistent')) {
        this.readyState = MockEventSource.CLOSED;
        this.emit('error', new Error('Connection failed'));
        return;
      }
      
      this.readyState = MockEventSource.OPEN;
      this.emit('open');
      
      // Send initial connection message
      setTimeout(() => {
        this.emit('message', {
          type: 'connected',
          data: JSON.stringify({
            connectionId: this.connectionId,
            timestamp: new Date().toISOString(),
            server: 'drupalize-mcp-server',
            version: '1.0.0'
          })
        });
      }, 10);
      
    }, this.simulateDelay);
  }
  
  close(): void {
    this.readyState = MockEventSource.CLOSED;
    this.emit('close');
    this.removeAllListeners();
  }

  simulateError(error: Error): void {
    this.emit('error', error);
    this.readyState = MockEventSource.CLOSED;
  }

  simulateMessage(event: string, data: any): void {
    if (this.readyState === MockEventSource.OPEN) {
      this.emit('message', {
        type: event,
        data: JSON.stringify(data)
      });
    }
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

/**
 * Performance measurement utility
 */
export class PerformanceMeasurer {
  private measurements = new Map<string, number[]>();

  start(label: string): () => number {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      if (!this.measurements.has(label)) {
        this.measurements.set(label, []);
      }
      this.measurements.get(label)!.push(duration);
      return duration;
    };
  }

  getStats(label: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    p95: number;
  } | null {
    const measurements = this.measurements.get(label);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const sorted = [...measurements].sort((a, b) => a - b);
    const sum = measurements.reduce((acc, val) => acc + val, 0);

    return {
      count: measurements.length,
      average: sum / measurements.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p95: sorted[Math.floor(sorted.length * 0.95)]
    };
  }

  clear(label?: string): void {
    if (label) {
      this.measurements.delete(label);
    } else {
      this.measurements.clear();
    }
  }

  getAllStats(): Record<string, ReturnType<PerformanceMeasurer['getStats']>> {
    const allStats: Record<string, ReturnType<PerformanceMeasurer['getStats']>> = {};
    for (const [label] of this.measurements) {
      allStats[label] = this.getStats(label);
    }
    return allStats;
  }
}

/**
 * Test tool factory for creating various types of test tools
 */
export class TestToolFactory {
  static createBasicTool(name: string, description?: string): Tool {
    return {
      name,
      description: description ?? `Test tool: ${name}`,
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        },
        required: ['message']
      }
    };
  }

  static createExtendedTool(name: string, options: {
    description?: string;
    category?: string;
    tags?: string[];
    requiresAuth?: boolean;
    timeout?: number;
    handler?: (params: Record<string, any>, context: ToolInvocationContext) => Promise<CallToolResult>;
  } = {}): ExtendedTool {
    return {
      name,
      description: options.description ?? `Extended test tool: ${name}`,
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          value: { type: 'string' }
        },
        required: ['action']
      },
      category: options.category,
      tags: options.tags,
      requiresAuth: options.requiresAuth ?? false,
      timeout: options.timeout,
      handler: options.handler ?? this.defaultHandler
    };
  }

  static createErrorTool(name: string, errorType: 'runtime' | 'timeout' | 'validation' = 'runtime'): ExtendedTool {
    return {
      name,
      description: `Tool that generates ${errorType} errors`,
      inputSchema: {
        type: 'object',
        properties: {
          trigger: { type: 'string' }
        }
      },
      timeout: errorType === 'timeout' ? 100 : undefined,
      handler: async (params, context): Promise<CallToolResult> => {
        switch (errorType) {
          case 'runtime':
            throw new Error(`Runtime error from ${name}`);
          case 'timeout':
            await new Promise(resolve => setTimeout(resolve, 200)); // Longer than timeout
            return { content: [{ type: 'text', text: 'Should not reach here' }] };
          case 'validation':
            throw new Error(`Validation error from ${name}`);
          default:
            throw new Error(`Unknown error type: ${errorType}`);
        }
      }
    };
  }

  static createPerformanceTool(name: string, processingTime: number = 0): ExtendedTool {
    return {
      name,
      description: `Performance test tool with ${processingTime}ms processing time`,
      inputSchema: {
        type: 'object',
        properties: {
          iterations: { type: 'number', minimum: 1, maximum: 1000 },
          data: { type: 'string' }
        }
      },
      handler: async (params): Promise<CallToolResult> => {
        if (processingTime > 0) {
          await new Promise(resolve => setTimeout(resolve, processingTime));
        }
        
        const iterations = params.iterations || 1;
        const data = params.data || 'default';
        
        return {
          content: [{
            type: 'text',
            text: `Processed ${iterations} iterations with data: ${data}`
          }]
        };
      }
    };
  }

  private static async defaultHandler(params: Record<string, any>, context: ToolInvocationContext): Promise<CallToolResult> {
    return {
      content: [{
        type: 'text',
        text: `Default handler executed for action: ${params.action || 'none'} by ${context.connectionId}`
      }]
    };
  }
}

/**
 * Connection state tracker for testing connection lifecycle
 */
export class ConnectionTracker extends EventEmitter {
  private connections = new Map<string, {
    id: string;
    connectedAt: Date;
    lastActivity: Date;
    messageCount: number;
    status: 'connecting' | 'connected' | 'disconnected';
  }>();

  trackConnection(connectionId: string): void {
    const connection = {
      id: connectionId,
      connectedAt: new Date(),
      lastActivity: new Date(),
      messageCount: 0,
      status: 'connected' as const
    };

    this.connections.set(connectionId, connection);
    this.emit('connection:established', connectionId, connection);
  }

  trackMessage(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
      connection.messageCount++;
      this.emit('connection:activity', connectionId, connection);
    }
  }

  trackDisconnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.status = 'disconnected';
      this.emit('connection:closed', connectionId, connection);
    }
  }

  getConnection(connectionId: string) {
    return this.connections.get(connectionId);
  }

  getAllConnections() {
    return Array.from(this.connections.values());
  }

  getActiveConnections() {
    return Array.from(this.connections.values()).filter(conn => conn.status === 'connected');
  }

  clear(): void {
    this.connections.clear();
    this.removeAllListeners();
  }
}

/**
 * Utility for creating mock JSON-RPC responses
 */
export class MockJsonRpcResponses {
  static createSuccessResponse(id: string | number, result: any) {
    return {
      jsonrpc: '2.0' as const,
      result,
      id
    };
  }

  static createErrorResponse(id: string | number, code: number, message: string, data?: any) {
    return {
      jsonrpc: '2.0' as const,
      error: {
        code,
        message,
        ...(data && { data })
      },
      id
    };
  }

  static createBatchResponse(responses: Array<{ id: string | number; result?: any; error?: any }>) {
    return responses.map(resp => {
      if (resp.error) {
        return this.createErrorResponse(resp.id, resp.error.code || -32603, resp.error.message || 'Error', resp.error.data);
      }
      return this.createSuccessResponse(resp.id, resp.result || { success: true });
    });
  }
}

/**
 * Load testing utility
 */
export class LoadTester {
  private results: Array<{
    duration: number;
    success: boolean;
    error?: string;
    timestamp: number;
  }> = [];

  async runLoad<T>(
    testFunction: () => Promise<T>,
    options: {
      duration: number; // Test duration in milliseconds
      concurrency: number; // Number of concurrent operations
      delay?: number; // Delay between batches in milliseconds
    }
  ): Promise<{
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    requestsPerSecond: number;
    errors: string[];
  }> {
    const { duration, concurrency, delay = 10 } = options;
    const endTime = Date.now() + duration;
    let requestCount = 0;

    while (Date.now() < endTime) {
      const batchPromises: Promise<void>[] = [];

      // Create batch of concurrent requests
      for (let i = 0; i < concurrency; i++) {
        batchPromises.push(
          (async () => {
            const startTime = performance.now();
            try {
              await testFunction();
              this.results.push({
                duration: performance.now() - startTime,
                success: true,
                timestamp: Date.now()
              });
            } catch (error) {
              this.results.push({
                duration: performance.now() - startTime,
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now()
              });
            }
            requestCount++;
          })()
        );
      }

      await Promise.all(batchPromises);

      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return this.getResults();
  }

  getResults() {
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const totalDuration = this.results.length > 0 
      ? (Math.max(...this.results.map(r => r.timestamp)) - Math.min(...this.results.map(r => r.timestamp))) / 1000
      : 0;

    return {
      totalRequests: this.results.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      averageResponseTime: successful.length > 0 
        ? successful.reduce((sum, r) => sum + r.duration, 0) / successful.length 
        : 0,
      requestsPerSecond: totalDuration > 0 ? this.results.length / totalDuration : 0,
      errors: Array.from(new Set(failed.map(r => r.error).filter(Boolean))) as string[]
    };
  }

  clear(): void {
    this.results = [];
  }
}

/**
 * Test data generators
 */
export class TestDataGenerator {
  static generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  static generateTestTool(index: number): Tool {
    return {
      name: `test_tool_${index}`,
      description: `Generated test tool ${index} for testing purposes`,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number', const: index },
          name: { type: 'string' },
          options: {
            type: 'object',
            properties: {
              flag: { type: 'boolean' },
              value: { type: 'number', minimum: 0, maximum: 100 }
            }
          }
        },
        required: ['id', 'name']
      },
      category: `category_${index % 3}`,
      tags: [`tag_${index % 5}`, `type_${index % 2}`]
    };
  }

  static generateToolInvocationParams(toolName: string, index: number = 0): {
    name: string;
    arguments: Record<string, any>;
  } {
    return {
      name: toolName,
      arguments: {
        id: index,
        name: `invocation_${index}`,
        options: {
          flag: index % 2 === 0,
          value: Math.floor(Math.random() * 100)
        }
      }
    };
  }
}

/**
 * Async test helpers
 */
export class AsyncTestHelpers {
  static async waitFor(condition: () => boolean | Promise<boolean>, timeout: number = 5000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const result = await Promise.resolve(condition());
      if (result) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }

  static async waitForEvent<T = any>(
    emitter: EventEmitter, 
    event: string, 
    timeout: number = 5000
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        emitter.removeListener(event, handler);
        reject(new Error(`Event '${event}' not emitted within ${timeout}ms`));
      }, timeout);

      const handler = (data: T) => {
        clearTimeout(timer);
        resolve(data);
      };

      emitter.once(event, handler);
    });
  }

  static async retry<T>(
    operation: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 100
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt === maxAttempts) {
          throw lastError;
        }
        
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
      }
    }
    
    throw lastError!;
  }
}

/**
 * Test assertions for common patterns
 */
export class TestAssertions {
  static assertPerformanceThreshold(actual: number, threshold: number, label: string): void {
    if (actual >= threshold) {
      throw new Error(`Performance threshold exceeded for ${label}: ${actual}ms >= ${threshold}ms`);
    }
  }

  static assertWithinRange(actual: number, min: number, max: number, label: string): void {
    if (actual < min || actual > max) {
      throw new Error(`Value out of range for ${label}: ${actual} not between ${min} and ${max}`);
    }
  }

  static assertResponseStructure(response: any, expectedStructure: any): void {
    const checkStructure = (actual: any, expected: any, path: string = ''): void => {
      if (expected === null || expected === undefined) return;
      
      if (typeof expected === 'object' && !Array.isArray(expected)) {
        if (typeof actual !== 'object' || actual === null) {
          throw new Error(`Expected object at path '${path}', got ${typeof actual}`);
        }
        
        for (const [key, value] of Object.entries(expected)) {
          if (!(key in actual)) {
            throw new Error(`Missing property '${key}' at path '${path}'`);
          }
          checkStructure(actual[key], value, path ? `${path}.${key}` : key);
        }
      } else if (Array.isArray(expected)) {
        if (!Array.isArray(actual)) {
          throw new Error(`Expected array at path '${path}', got ${typeof actual}`);
        }
        if (expected.length > 0) {
          checkStructure(actual[0], expected[0], `${path}[0]`);
        }
      } else if (typeof expected === 'string' && expected.startsWith('typeof:')) {
        const expectedType = expected.substring(7);
        if (typeof actual !== expectedType) {
          throw new Error(`Expected type '${expectedType}' at path '${path}', got '${typeof actual}'`);
        }
      }
    };

    checkStructure(response, expectedStructure);
  }
}

// Global setup for integration tests
export function setupIntegrationTestEnvironment(): void {
  // Extend Jest timeout for integration tests
  jest.setTimeout(30000);

  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error'; // Reduce log noise

  // Clean up global state after each test
  afterEach(() => {
    jest.clearAllMocks();
  });
}

export {
  MockEventSource as default,
  PerformanceMeasurer,
  TestToolFactory,
  ConnectionTracker,
  MockJsonRpcResponses,
  LoadTester,
  TestDataGenerator,
  AsyncTestHelpers,
  TestAssertions
};