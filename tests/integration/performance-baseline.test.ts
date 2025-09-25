/**
 * Performance baseline tests for the JSON-RPC Drupal integration
 * These tests establish performance metrics for future optimization reference
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { DrupalMcpServer } from '@/mcp/server.js';
import { DrupalClient } from '@/services/drupal-client.js';
import { loadConfig } from '@/config/index.js';

// Mock fetch for consistent performance testing
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

interface PerformanceMetrics {
  executionTime: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuTime?: number;
}

interface BenchmarkResult {
  operation: string;
  iterations: number;
  avgTime: number;
  minTime: number;
  maxTime: number;
  memoryDelta: number;
  throughput: number; // operations per second
}

describe('Performance Baseline Measurements', () => {
  let config: any;
  let mcpServer: DrupalMcpServer;
  let drupalClient: DrupalClient;

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
        enabled: false, // Disable auth for performance tests
        requiredScopes: ['tutorial:read'],
      },
      mcp: {
        name: 'test-drupal-bridge-mcp',
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

    mcpServer = new DrupalMcpServer(config);
    drupalClient = new DrupalClient(config.drupal);

    jest.clearAllMocks();

    // Force garbage collection if available for more accurate memory measurements
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Measure performance of a function
   */
  async function measurePerformance<T>(
    operation: () => Promise<T>,
    warmupRuns = 3,
    measureRuns = 10
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    // Warmup runs to stabilize JIT compilation
    for (let i = 0; i < warmupRuns; i++) {
      await operation();
    }

    // Force garbage collection before measurement
    if (global.gc) {
      global.gc();
    }

    const initialMemory = process.memoryUsage();
    const startTime = process.hrtime.bigint();

    let result: T;
    for (let i = 0; i < measureRuns; i++) {
      result = await operation();
    }

    const endTime = process.hrtime.bigint();
    const finalMemory = process.memoryUsage();

    const executionTime = Number(endTime - startTime) / 1_000_000; // Convert to milliseconds
    const memoryUsage = {
      heapUsed: finalMemory.heapUsed - initialMemory.heapUsed,
      heapTotal: finalMemory.heapTotal - initialMemory.heapTotal,
      external: finalMemory.external - initialMemory.external,
    };

    return {
      result: result!,
      metrics: {
        executionTime: executionTime / measureRuns, // Average execution time
        memoryUsage,
      },
    };
  }

  /**
   * Run benchmark with multiple iterations and collect statistics
   */
  async function runBenchmark<T>(
    name: string,
    operation: () => Promise<T>,
    iterations = 100
  ): Promise<BenchmarkResult> {
    const times: number[] = [];
    const initialMemory = process.memoryUsage().heapUsed;

    console.log(`Starting benchmark: ${name} (${iterations} iterations)`);

    const startTime = Date.now();

    for (let i = 0; i < iterations; i++) {
      const iterationStart = process.hrtime.bigint();
      await operation();
      const iterationEnd = process.hrtime.bigint();

      times.push(Number(iterationEnd - iterationStart) / 1_000_000);
    }

    const totalTime = Date.now() - startTime;
    const finalMemory = process.memoryUsage().heapUsed;

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const memoryDelta = finalMemory - initialMemory;
    const throughput = (iterations * 1000) / totalTime;

    const result: BenchmarkResult = {
      operation: name,
      iterations,
      avgTime,
      minTime,
      maxTime,
      memoryDelta,
      throughput,
    };

    console.log(`Benchmark ${name} completed:`);
    console.log(`  Average time: ${avgTime.toFixed(2)}ms`);
    console.log(`  Min time: ${minTime.toFixed(2)}ms`);
    console.log(`  Max time: ${maxTime.toFixed(2)}ms`);
    console.log(`  Memory delta: ${Math.round(memoryDelta / 1024)}KB`);
    console.log(`  Throughput: ${throughput.toFixed(2)} ops/sec`);
    console.log('');

    return result;
  }

  describe('Search Operation Performance', () => {
    test('should benchmark basic search tutorial operation', async () => {
      const benchmark = await runBenchmark(
        'Basic Search Tutorial',
        async () => {
          return await (mcpServer as any).executeSearchTutorials({
            keywords: 'forms',
          });
        },
        50
      );

      // Performance expectations (baseline measurements)
      expect(benchmark.avgTime).toBeLessThan(10); // Should average less than 10ms in test mode
      expect(benchmark.throughput).toBeGreaterThan(50); // Should handle at least 50 ops/sec
      expect(benchmark.memoryDelta).toBeLessThan(10 * 1024 * 1024); // Less than 10MB memory increase

      // Store baseline metrics for future comparisons
      expect(benchmark).toMatchObject({
        operation: 'Basic Search Tutorial',
        iterations: 50,
        avgTime: expect.any(Number),
        minTime: expect.any(Number),
        maxTime: expect.any(Number),
        memoryDelta: expect.any(Number),
        throughput: expect.any(Number),
      });
    });

    test('should benchmark search with filters', async () => {
      const benchmark = await runBenchmark(
        'Filtered Search Tutorial',
        async () => {
          return await (mcpServer as any).executeSearchTutorials({
            keywords: 'content management',
            drupal_version: ['10'],
            category: ['tutorial', 'cms'],
          });
        },
        30
      );

      // Filtered searches might be slightly slower due to additional processing
      expect(benchmark.avgTime).toBeLessThan(15);
      expect(benchmark.throughput).toBeGreaterThan(30);
    });

    test('should benchmark parameter validation performance', async () => {
      const { validateSearchContentParams } = await import(
        '@/utils/validation.js'
      );

      const benchmark = await runBenchmark(
        'Parameter Validation',
        async () => {
          return validateSearchContentParams({
            keywords: 'test validation performance',
            drupal_version: ['11'],
            category: ['performance', 'testing', 'validation'],
          });
        },
        1000
      );

      // Validation should be very fast
      expect(benchmark.avgTime).toBeLessThan(1);
      expect(benchmark.throughput).toBeGreaterThan(1000);
    });
  });

  describe('MCP Tool Integration Performance', () => {
    test('should benchmark MCP tool execution pipeline', async () => {
      const benchmark = await runBenchmark(
        'MCP Tool Execution',
        async () => {
          return await (mcpServer as any).executeTool('search_tutorials', {
            keywords: 'mcp performance test',
          });
        },
        30
      );

      // MCP tool execution includes additional overhead for formatting
      expect(benchmark.avgTime).toBeLessThan(20);
      expect(benchmark.throughput).toBeGreaterThan(25);
    });

    test('should benchmark error handling overhead', async () => {
      const benchmark = await runBenchmark(
        'Error Handling',
        async () => {
          try {
            return await (mcpServer as any).executeTool('search_tutorials', {
              keywords: 'x', // Will trigger validation error
            });
          } catch (error) {
            return error;
          }
        },
        100
      );

      // Error handling should add minimal overhead
      expect(benchmark.avgTime).toBeLessThan(5);
      expect(benchmark.throughput).toBeGreaterThan(100);
    });
  });

  describe('Memory Usage Patterns', () => {
    test('should measure memory usage for large response handling', async () => {
      const { result, metrics } = await measurePerformance(async () => {
        // Simulate processing large tutorial content
        const searchResult = await (mcpServer as any).executeSearchTutorials({
          keywords: 'large content test',
        });

        // Process and format multiple results
        return Array.from({ length: 100 }, (_, i) => ({
          ...searchResult.results[0],
          id: `${i}`,
          title: `Large Tutorial ${i}`,
          content: 'x'.repeat(10000), // 10KB of content per result
        }));
      });

      console.log('Large Response Memory Usage:');
      console.log(`  Execution time: ${metrics.executionTime.toFixed(2)}ms`);
      console.log(
        `  Heap used delta: ${Math.round(metrics.memoryUsage.heapUsed / 1024)}KB`
      );
      console.log(
        `  External memory delta: ${Math.round(metrics.memoryUsage.external / 1024)}KB`
      );

      expect(result).toHaveLength(100);
      expect(metrics.executionTime).toBeLessThan(50); // Should handle large content quickly
      expect(metrics.memoryUsage.heapUsed).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
    });

    test('should measure memory usage for concurrent operations', async () => {
      const concurrentOperations = 10;

      const { result, metrics } = await measurePerformance(async () => {
        const promises = Array.from({ length: concurrentOperations }, (_, i) =>
          (mcpServer as any).executeSearchTutorials({
            keywords: `concurrent test ${i}`,
          })
        );

        return await Promise.all(promises);
      });

      console.log(
        `Concurrent Operations Memory Usage (${concurrentOperations} operations):`
      );
      console.log(`  Execution time: ${metrics.executionTime.toFixed(2)}ms`);
      console.log(
        `  Memory delta: ${Math.round(metrics.memoryUsage.heapUsed / 1024)}KB`
      );

      expect(result).toHaveLength(concurrentOperations);
      expect(metrics.executionTime).toBeLessThan(100);
    });
  });

  describe('Error Scenario Performance', () => {
    test('should benchmark network timeout handling', async () => {
      // Mock network timeout
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('timeout')), 10);
          })
      );

      const benchmark = await runBenchmark(
        'Network Timeout Handling',
        async () => {
          try {
            // Create client with short timeout for testing
            const testClient = new DrupalClient({
              ...config.drupal,
              timeout: 50, // 50ms timeout
              retries: 1, // Only 1 retry for faster testing
            });

            return await testClient.testConnection();
          } catch (error) {
            return { error: true };
          }
        },
        10 // Fewer iterations due to timeouts
      );

      // Timeout handling should be reasonably fast
      expect(benchmark.avgTime).toBeLessThan(100); // Should timeout quickly
    });

    test('should benchmark JSON-RPC error response processing', async () => {
      // Mock JSON-RPC error response
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Map([['content-type', 'application/json']]),
        json: () =>
          Promise.resolve({
            jsonrpc: '2.0',
            error: {
              code: -32602,
              message: 'Invalid parameters for testing',
              data: { field: 'keywords', type: 'VALIDATION_ERROR' },
            },
            id: 'test-error',
          }),
      });

      const benchmark = await runBenchmark(
        'JSON-RPC Error Processing',
        async () => {
          try {
            return await drupalClient.searchTutorials({
              keywords: 'error test',
            });
          } catch (error) {
            return { error: true };
          }
        },
        50
      );

      // Error processing should be fast
      expect(benchmark.avgTime).toBeLessThan(20);
      expect(benchmark.throughput).toBeGreaterThan(25);
    });
  });

  describe('Performance Regression Detection', () => {
    test('should establish baseline metrics for future comparison', () => {
      // This test documents the expected performance characteristics
      // Future test runs can compare against these baselines

      const performanceBaselines = {
        basicSearch: {
          avgTime: 10, // ms
          throughput: 50, // ops/sec
          memoryPerOp: 1024, // bytes
        },
        filteredSearch: {
          avgTime: 15, // ms
          throughput: 30, // ops/sec
        },
        validation: {
          avgTime: 1, // ms
          throughput: 1000, // ops/sec
        },
        mcpToolExecution: {
          avgTime: 20, // ms
          throughput: 25, // ops/sec
        },
        errorHandling: {
          avgTime: 5, // ms
          throughput: 100, // ops/sec
        },
      };

      console.log('Performance Baselines Established:');
      console.log(JSON.stringify(performanceBaselines, null, 2));

      // Store baselines in test metadata
      expect(performanceBaselines).toMatchSnapshot({
        basicSearch: {
          avgTime: expect.any(Number),
          throughput: expect.any(Number),
          memoryPerOp: expect.any(Number),
        },
        filteredSearch: {
          avgTime: expect.any(Number),
          throughput: expect.any(Number),
        },
        validation: {
          avgTime: expect.any(Number),
          throughput: expect.any(Number),
        },
        mcpToolExecution: {
          avgTime: expect.any(Number),
          throughput: expect.any(Number),
        },
        errorHandling: {
          avgTime: expect.any(Number),
          throughput: expect.any(Number),
        },
      });
    });
  });
});
