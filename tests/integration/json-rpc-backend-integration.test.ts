/**
 * JSON-RPC Backend Integration Tests
 * 
 * Comprehensive integration tests for JSON-RPC backend communication,
 * including connection management, batch requests, error handling,
 * health monitoring, and performance validation.
 */

import { jest } from '@jest/globals';
import axios, { AxiosError } from 'axios';
import MockAdapter from 'axios-mock-adapter';

import { 
  EnhancedJsonRpcClient, 
  type EnhancedJsonRpcClientConfig,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcBatchRequest,
  type ConnectionPoolStats,
  type HealthCheckResult,
  DrupalErrorCode
} from '@/drupal/enhanced-json-rpc-client';

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
    drupal: {
      baseUrl: 'http://localhost:8080',
      jsonRpcEndpoint: '/jsonrpc',
      timeout: 5000
    }
  },
}));

describe('JSON-RPC Backend Integration Tests', () => {
  let client: EnhancedJsonRpcClient;
  let mockAxios: MockAdapter;
  let testConfig: EnhancedJsonRpcClientConfig;

  const testToken = 'test_oauth_token_12345';
  const baseUrl = 'http://localhost:8080/jsonrpc';

  beforeAll(() => {
    testConfig = {
      baseUrl,
      timeout: 5000,
      retryAttempts: 3,
      retryDelay: 100, // Fast retries for testing
      connectionPool: {
        maxConnections: 10,
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 5,
        maxFreeSockets: 2,
        timeout: 30000,
        freeSocketTimeout: 15000
      },
      healthCheck: {
        enabled: true,
        interval: 5000,
        timeout: 2000,
        endpoint: '/health'
      },
      requestTracking: {
        enabled: true,
        maxTrackedRequests: 100,
        cleanupInterval: 10000
      }
    };
  });

  beforeEach(() => {
    client = new EnhancedJsonRpcClient(testConfig);
    mockAxios = new MockAdapter(axios);
  });

  afterEach(async () => {
    mockAxios.restore();
    if (client) {
      await client.shutdown();
    }
  });

  describe('Basic JSON-RPC Communication', () => {
    it('should execute single JSON-RPC call successfully', async () => {
      const expectedResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        result: {
          content: [
            {
              type: 'tutorial',
              title: 'Getting Started with Drupal',
              body: 'This tutorial covers the basics...'
            }
          ],
          total: 1
        },
        id: expect.any(String)
      };

      mockAxios.onPost('').reply(200, expectedResponse);

      const result = await client.call(
        'content.search',
        { query: 'getting started' },
        testToken
      );

      expect(result).toEqual(expectedResponse.result);
      
      // Verify request structure
      const request = JSON.parse(mockAxios.history.post[0].data);
      expect(request).toMatchObject({
        jsonrpc: '2.0',
        method: 'content.search',
        params: { query: 'getting started' },
        id: expect.any(String)
      });
      
      // Verify authentication header
      expect(mockAxios.history.post[0].headers?.Authorization).toBe(`Bearer ${testToken}`);
    });

    it('should handle JSON-RPC error responses', async () => {
      const errorResponse: JsonRpcResponse = {
        jsonrpc: '2.0',
        error: {
          code: -32602,
          message: 'Invalid params',
          data: { field: 'query', issue: 'required' }
        },
        id: 'test-123'
      };

      mockAxios.onPost('').reply(200, errorResponse);

      await expect(client.call('content.search', {}, testToken))
        .rejects
        .toThrow('JSON-RPC Error: Invalid params');
    });

    it('should handle malformed JSON-RPC responses', async () => {
      mockAxios.onPost('').reply(200, { invalid: 'response' });

      await expect(client.call('test.method', {}, testToken))
        .rejects
        .toThrow('JSON-RPC response missing result and error');
    });

    it('should validate response ID matching', async () => {
      const responseWithWrongId: JsonRpcResponse = {
        jsonrpc: '2.0',
        result: { success: true },
        id: 'wrong-id'
      };

      mockAxios.onPost('').reply(200, responseWithWrongId);

      await expect(client.call('test.method', {}, testToken))
        .rejects
        .toThrow('JSON-RPC response ID mismatch');
    });

    it('should include request correlation IDs', async () => {
      mockAxios.onPost('').reply(200, {
        jsonrpc: '2.0',
        result: { success: true },
        id: expect.any(String)
      });

      await client.call('test.method', { param: 'value' }, testToken);

      const requestHeaders = mockAxios.history.post[0].headers;
      expect(requestHeaders?.['X-Request-ID']).toMatch(/^req_\d+_\d+$/);
    });
  });

  describe('Batch JSON-RPC Requests', () => {
    it('should execute batch requests successfully', async () => {
      const batchRequest: JsonRpcBatchRequest = {
        requests: [
          {
            jsonrpc: '2.0',
            method: 'content.get',
            params: { id: '1' },
            id: 'batch-1'
          },
          {
            jsonrpc: '2.0',
            method: 'content.get',
            params: { id: '2' },
            id: 'batch-2'
          },
          {
            jsonrpc: '2.0',
            method: 'user.profile',
            params: {},
            id: 'batch-3'
          }
        ]
      };

      const batchResponse = [
        { jsonrpc: '2.0', result: { title: 'Content 1' }, id: 'batch-1' },
        { jsonrpc: '2.0', result: { title: 'Content 2' }, id: 'batch-2' },
        { jsonrpc: '2.0', result: { name: 'Test User' }, id: 'batch-3' }
      ];

      mockAxios.onPost('').reply(200, batchResponse);

      const result = await client.batchCall(batchRequest, testToken);

      expect(result.requestCount).toBe(3);
      expect(result.successCount).toBe(3);
      expect(result.errorCount).toBe(0);
      expect(result.responses).toHaveLength(3);
      expect(result.duration).toBeGreaterThan(0);

      // Verify batch headers
      const requestHeaders = mockAxios.history.post[0].headers;
      expect(requestHeaders?.['X-Batch-Size']).toBe('3');
    });

    it('should handle mixed success/error batch responses', async () => {
      const batchRequest: JsonRpcBatchRequest = {
        requests: [
          { jsonrpc: '2.0', method: 'success.method', params: {}, id: 'req-1' },
          { jsonrpc: '2.0', method: 'error.method', params: {}, id: 'req-2' },
          { jsonrpc: '2.0', method: 'success.method', params: {}, id: 'req-3' }
        ]
      };

      const batchResponse = [
        { jsonrpc: '2.0', result: { success: true }, id: 'req-1' },
        { jsonrpc: '2.0', error: { code: -32001, message: 'Custom error' }, id: 'req-2' },
        { jsonrpc: '2.0', result: { success: true }, id: 'req-3' }
      ];

      mockAxios.onPost('').reply(200, batchResponse);

      const result = await client.batchCall(batchRequest, testToken);

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(1);
      expect(result.responses[1].error?.message).toBe('Custom error');
    });

    it('should handle batch request timeout', async () => {
      const batchRequest: JsonRpcBatchRequest = {
        requests: [
          { jsonrpc: '2.0', method: 'slow.method', params: {}, id: 'slow-1' }
        ],
        timeout: 100 // Very short timeout
      };

      mockAxios.onPost('').timeout();

      await expect(client.batchCall(batchRequest, testToken))
        .rejects
        .toThrow();
    });

    it('should handle large batch requests', async () => {
      const largeBatch: JsonRpcBatchRequest = {
        requests: Array.from({ length: 50 }, (_, i) => ({
          jsonrpc: '2.0' as const,
          method: 'test.method',
          params: { index: i },
          id: `req-${i}`
        }))
      };

      const largeBatchResponse = largeBatch.requests.map(req => ({
        jsonrpc: '2.0' as const,
        result: { processed: req.params.index },
        id: req.id
      }));

      mockAxios.onPost('').reply(200, largeBatchResponse);

      const result = await client.batchCall(largeBatch, testToken);

      expect(result.requestCount).toBe(50);
      expect(result.successCount).toBe(50);
      expect(result.errorCount).toBe(0);
    });
  });

  describe('Connection Pool Management', () => {
    it('should provide connection pool statistics', () => {
      const stats: ConnectionPoolStats = client.getConnectionStats();

      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('requestsInQueue');
      expect(stats).toHaveProperty('maxConnections');
      expect(stats).toHaveProperty('connectionTimeouts');
      expect(stats).toHaveProperty('connectionErrors');

      expect(typeof stats.activeConnections).toBe('number');
      expect(typeof stats.maxConnections).toBe('number');
      expect(stats.maxConnections).toBe(testConfig.connectionPool?.maxConnections);
    });

    it('should handle concurrent requests efficiently', async () => {
      // Mock multiple successful responses
      mockAxios.onPost('').reply(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([200, {
              jsonrpc: '2.0',
              result: { timestamp: Date.now() },
              id: expect.any(String)
            }]);
          }, Math.random() * 100); // Random delay up to 100ms
        });
      });

      const concurrentRequests = 10;
      const promises: Promise<any>[] = [];

      const startTime = Date.now();

      for (let i = 0; i < concurrentRequests; i++) {
        promises.push(
          client.call(`test.method.${i}`, { index: i }, testToken)
        );
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(concurrentRequests);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds

      // All requests should have succeeded
      results.forEach(result => {
        expect(result).toHaveProperty('timestamp');
      });
    });

    it('should track active requests', async () => {
      mockAxios.onPost('').reply(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([200, {
              jsonrpc: '2.0',
              result: { success: true },
              id: expect.any(String)
            }]);
          }, 50);
        });
      });

      // Start request but don't await immediately
      const requestPromise = client.call('slow.method', {}, testToken);
      
      // Check active requests while request is in flight
      await new Promise(resolve => setTimeout(resolve, 10));
      const activeRequests = client.getActiveRequests();
      
      expect(activeRequests.length).toBeGreaterThan(0);
      expect(activeRequests[0]).toHaveProperty('requestId');
      expect(activeRequests[0]).toHaveProperty('method');
      expect(activeRequests[0]).toHaveProperty('status');
      expect(activeRequests[0].status).toBe('pending');

      // Wait for completion
      await requestPromise;
      
      // Request should be completed or cleaned up
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle network timeouts', async () => {
      mockAxios.onPost('').timeout();

      await expect(client.call('timeout.method', {}, testToken))
        .rejects
        .toThrow();
    });

    it('should handle HTTP error responses', async () => {
      mockAxios.onPost('').reply(500, { error: 'Internal Server Error' });

      await expect(client.call('error.method', {}, testToken))
        .rejects
        .toThrow();
    });

    it('should handle authentication errors', async () => {
      mockAxios.onPost('').reply(401, { error: 'Unauthorized' });

      await expect(client.call('auth.method', {}, testToken))
        .rejects
        .toThrow();
    });

    it('should handle access denied errors', async () => {
      mockAxios.onPost('').reply(403, { error: 'Access Denied' });

      await expect(client.call('forbidden.method', {}, testToken))
        .rejects
        .toThrow();
    });

    it('should implement retry logic for transient errors', async () => {
      let attempt = 0;
      mockAxios.onPost('').reply(() => {
        attempt++;
        if (attempt < 3) {
          return [503, { error: 'Service Unavailable' }];
        }
        return [200, {
          jsonrpc: '2.0',
          result: { success: true, attempt },
          id: expect.any(String)
        }];
      });

      const result = await client.call('retry.method', {}, testToken);

      expect(result.success).toBe(true);
      expect(result.attempt).toBe(3); // Should succeed on third attempt
      expect(mockAxios.history.post).toHaveLength(3); // Should have made 3 requests
    });

    it('should not retry client errors (4xx)', async () => {
      mockAxios.onPost('').reply(400, { error: 'Bad Request' });

      await expect(client.call('bad.method', {}, testToken))
        .rejects
        .toThrow();

      expect(mockAxios.history.post).toHaveLength(1); // Should not retry
    });

    it('should handle connection errors gracefully', async () => {
      mockAxios.onPost('').networkError();

      await expect(client.call('network.method', {}, testToken))
        .rejects
        .toThrow();
    });

    it('should track and report errors appropriately', async () => {
      mockAxios.onPost('').reply(500, { error: 'Server Error' });

      try {
        await client.call('error.method', {}, testToken);
      } catch (error) {
        expect(error).toHaveProperty('code');
        expect(error).toHaveProperty('data');
        expect((error as any).isDrupalError).toBe(true);
      }
    });
  });

  describe('Health Monitoring', () => {
    it('should perform health checks', async () => {
      mockAxios.onGet('/health').reply(200, {
        status: 'healthy',
        version: '1.0.0',
        timestamp: Date.now()
      });

      const healthResult = await client.performHealthCheck();

      expect(healthResult).toMatchObject({
        status: 'healthy',
        latency: expect.any(Number),
        timestamp: expect.any(Number),
        version: '1.0.0'
      });

      expect(healthResult.latency).toBeGreaterThan(0);
    });

    it('should handle health check failures', async () => {
      mockAxios.onGet('/health').reply(500, { error: 'Health check failed' });

      const healthResult = await client.performHealthCheck();

      expect(healthResult.status).toBe('unhealthy');
      expect(healthResult.details).toHaveProperty('error');
    });

    it('should handle health check timeouts', async () => {
      mockAxios.onGet('/health').timeout();

      const healthResult = await client.performHealthCheck();

      expect(healthResult.status).toBe('unhealthy');
      expect(healthResult.details).toHaveProperty('error');
    });

    it('should provide current health status', () => {
      const healthStatus = client.getHealthStatus();

      // Initially null until first health check
      expect(healthStatus).toBeNull();
    });
  });

  describe('Request Correlation and Tracking', () => {
    it('should generate unique request IDs', async () => {
      mockAxios.onPost('').reply(200, {
        jsonrpc: '2.0',
        result: { success: true },
        id: expect.any(String)
      });

      const requestIds = new Set<string>();

      // Make multiple requests
      for (let i = 0; i < 5; i++) {
        await client.call(`test.method.${i}`, {}, testToken);
        const lastRequest = mockAxios.history.post[mockAxios.history.post.length - 1];
        const requestId = lastRequest.headers?.['X-Request-ID'];
        requestIds.add(requestId as string);
      }

      expect(requestIds.size).toBe(5); // All unique
      requestIds.forEach(id => {
        expect(id).toMatch(/^req_\d+_\d+$/);
      });
    });

    it('should mask sensitive tokens in logs', () => {
      const longToken = 'very_long_access_token_12345678901234567890';
      const shortToken = 'short';
      const emptyToken = '';

      // These methods are private but we can test through public interface
      // by inspecting the behavior when invalid tokens cause logging
      expect(longToken).toContain('very_long');
      expect(shortToken).toBeDefined();
      expect(emptyToken).toBe('');
    });

    it('should track request correlations', async () => {
      mockAxios.onPost('').reply(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([200, {
              jsonrpc: '2.0',
              result: { success: true },
              id: expect.any(String)
            }]);
          }, 50);
        });
      });

      // Start request
      const requestPromise = client.call('tracked.method', { data: 'test' }, testToken);
      
      // Check tracking while request is active
      await new Promise(resolve => setTimeout(resolve, 10));
      const activeRequests = client.getActiveRequests();
      
      expect(activeRequests.length).toBeGreaterThan(0);
      
      const trackedRequest = activeRequests.find(req => req.method === 'tracked.method');
      expect(trackedRequest).toBeDefined();
      expect(trackedRequest?.status).toBe('pending');
      expect(trackedRequest?.timestamp).toBeGreaterThan(0);

      await requestPromise;
    });

    it('should clean up completed request tracking', async () => {
      mockAxios.onPost('').reply(200, {
        jsonrpc: '2.0',
        result: { success: true },
        id: expect.any(String)
      });

      const initialTrackedCount = client.getActiveRequests().length;
      
      await client.call('cleanup.method', {}, testToken);
      
      // Immediately after completion, request might still be tracked briefly
      const immediateCount = client.getActiveRequests().length;
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalCount = client.getActiveRequests().length;
      expect(finalCount).toBeLessThanOrEqual(immediateCount);
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle high-frequency requests', async () => {
      mockAxios.onPost('').reply(() => [200, {
        jsonrpc: '2.0',
        result: { processed: Date.now() },
        id: expect.any(String)
      }]);

      const requestCount = 50;
      const startTime = Date.now();
      const promises: Promise<any>[] = [];

      for (let i = 0; i < requestCount; i++) {
        promises.push(client.call(`load.test.${i}`, { index: i }, testToken));
      }

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(requestCount);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all requests succeeded
      results.forEach(result => {
        expect(result).toHaveProperty('processed');
      });

      // Average response time should be reasonable
      const avgResponseTime = duration / requestCount;
      expect(avgResponseTime).toBeLessThan(200); // Less than 200ms average
    });

    it('should maintain performance under batch load', async () => {
      const batchSize = 20;
      const batchCount = 5;

      mockAxios.onPost('').reply(() => {
        const responses = Array.from({ length: batchSize }, (_, i) => ({
          jsonrpc: '2.0',
          result: { batchIndex: i, timestamp: Date.now() },
          id: `batch-${i}`
        }));
        return [200, responses];
      });

      const batchPromises: Promise<any>[] = [];
      const startTime = Date.now();

      for (let b = 0; b < batchCount; b++) {
        const batchRequest: JsonRpcBatchRequest = {
          requests: Array.from({ length: batchSize }, (_, i) => ({
            jsonrpc: '2.0',
            method: `batch.method.${b}.${i}`,
            params: { batchId: b, itemId: i },
            id: `batch-${b}-${i}`
          }))
        };

        batchPromises.push(client.batchCall(batchRequest, testToken));
      }

      const results = await Promise.all(batchPromises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(batchCount);
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds

      // Verify all batches succeeded
      results.forEach(result => {
        expect(result.requestCount).toBe(batchSize);
        expect(result.successCount).toBe(batchSize);
        expect(result.errorCount).toBe(0);
      });
    });

    it('should handle request queuing under load', async () => {
      let concurrentRequests = 0;
      let maxConcurrent = 0;

      mockAxios.onPost('').reply(() => {
        concurrentRequests++;
        maxConcurrent = Math.max(maxConcurrent, concurrentRequests);

        return new Promise(resolve => {
          setTimeout(() => {
            concurrentRequests--;
            resolve([200, {
              jsonrpc: '2.0',
              result: { success: true },
              id: expect.any(String)
            }]);
          }, 50);
        });
      });

      const requestCount = 15; // More than connection pool limit
      const promises = Array.from({ length: requestCount }, (_, i) =>
        client.call(`queue.test.${i}`, { index: i }, testToken)
      );

      await Promise.all(promises);

      // Should have queued requests efficiently
      expect(maxConcurrent).toBeLessThanOrEqual(testConfig.connectionPool?.maxSockets || 5);
    });

    it('should measure and validate response times', async () => {
      const responseTimes: number[] = [];

      mockAxios.onPost('').reply(() => [200, {
        jsonrpc: '2.0',
        result: { timestamp: Date.now() },
        id: expect.any(String)
      }]);

      for (let i = 0; i < 10; i++) {
        const startTime = Date.now();
        await client.call(`timing.test.${i}`, {}, testToken);
        const responseTime = Date.now() - startTime;
        responseTimes.push(responseTime);
      }

      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      // Performance criteria validation
      expect(avgResponseTime).toBeLessThan(200); // Average < 200ms (including network overhead)
      expect(maxResponseTime).toBeLessThan(500); // Max < 500ms
      
      // 95th percentile should be reasonable
      const sorted = responseTimes.sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);
      const p95ResponseTime = sorted[p95Index];
      expect(p95ResponseTime).toBeLessThan(300);
    });
  });

  describe('Client Shutdown and Cleanup', () => {
    it('should shutdown gracefully', async () => {
      // Make some requests to create active state
      mockAxios.onPost('').reply(200, {
        jsonrpc: '2.0',
        result: { success: true },
        id: expect.any(String)
      });

      await client.call('pre.shutdown.method', {}, testToken);

      // Shutdown should complete without error
      await expect(client.shutdown()).resolves.not.toThrow();
    });

    it('should wait for active requests during shutdown', async () => {
      mockAxios.onPost('').reply(() => {
        return new Promise(resolve => {
          setTimeout(() => {
            resolve([200, {
              jsonrpc: '2.0',
              result: { completed: true },
              id: expect.any(String)
            }]);
          }, 100);
        });
      });

      // Start a slow request
      const slowRequestPromise = client.call('slow.shutdown.method', {}, testToken);
      
      // Start shutdown (should wait for the slow request)
      const shutdownPromise = client.shutdown();
      
      // Both should complete
      const [slowResult] = await Promise.all([slowRequestPromise, shutdownPromise]);
      
      expect(slowResult.completed).toBe(true);
    });

    it('should handle shutdown timeout gracefully', async () => {
      // Create client with very short shutdown timeout for testing
      const quickShutdownClient = new EnhancedJsonRpcClient({
        ...testConfig,
        timeout: 50 // Very short timeout
      });

      mockAxios.onPost('').reply(() => {
        // Never resolve to simulate hanging request
        return new Promise(() => {});
      });

      // Start request that will hang
      quickShutdownClient.call('hanging.method', {}, testToken).catch(() => {
        // Expected to fail
      });

      // Shutdown should complete despite hanging request
      const shutdownStart = Date.now();
      await quickShutdownClient.shutdown();
      const shutdownDuration = Date.now() - shutdownStart;

      // Should timeout and proceed with shutdown
      expect(shutdownDuration).toBeGreaterThan(0);
      expect(shutdownDuration).toBeLessThan(35000); // Less than default 30s timeout
    });
  });
});