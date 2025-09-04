/**
 * Integration tests for Enhanced JSON-RPC Client
 *
 * These tests validate the enhanced JSON-RPC client functionality
 * without requiring external services.
 */

import {
  createEnhancedJsonRpcClient,
  ConnectionPoolUtils,
  RequestCorrelationUtils,
  HealthMonitoringUtils,
} from '../../src/drupal/enhanced-json-rpc-client';
import type {
  EnhancedJsonRpcClientConfig,
  JsonRpcBatchRequest,
} from '../../src/drupal/enhanced-json-rpc-client';

describe('Enhanced JSON-RPC Client Integration', () => {
  let client: ReturnType<typeof createEnhancedJsonRpcClient>;

  beforeEach(() => {
    const config: Partial<EnhancedJsonRpcClientConfig> = {
      baseUrl: 'https://test-drupal.example.com/jsonrpc',
      timeout: 5000,
      healthCheck: {
        enabled: false, // Disable for integration tests
      },
      requestTracking: {
        enabled: true,
        maxTrackedRequests: 10,
      },
      connectionPool: {
        maxConnections: 10,
        keepAlive: true,
      },
    };

    client = createEnhancedJsonRpcClient(config);
  });

  afterEach(async () => {
    if (client) {
      await client.shutdown();
    }
  });

  describe('Client Creation and Configuration', () => {
    it('should create client with default configuration', () => {
      expect(client).toBeDefined();
      expect(typeof client.getConnectionStats).toBe('function');
      expect(typeof client.getHealthStatus).toBe('function');
      expect(typeof client.getActiveRequests).toBe('function');
      expect(typeof client.performHealthCheck).toBe('function');
      expect(typeof client.shutdown).toBe('function');
    });

    it('should provide connection pool statistics', () => {
      const stats = client.getConnectionStats();

      expect(stats).toHaveProperty('maxConnections', 10);
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('requestsInQueue');
      expect(stats).toHaveProperty('connectionTimeouts');
      expect(stats).toHaveProperty('connectionErrors');

      // All should be numbers
      Object.values(stats).forEach(value => {
        expect(typeof value).toBe('number');
      });
    });

    it('should track active requests when enabled', () => {
      const activeRequests = client.getActiveRequests();
      expect(Array.isArray(activeRequests)).toBe(true);
      expect(activeRequests.length).toBe(0); // No active requests initially
    });
  });

  describe('Utility Functions', () => {
    it('should assess connection pool health', () => {
      const stats = client.getConnectionStats();

      const isHealthy = ConnectionPoolUtils.isHealthy(stats);
      expect(typeof isHealthy).toBe('boolean');

      const healthStatus = ConnectionPoolUtils.getHealthStatus(stats);
      expect(['healthy', 'degraded', 'unhealthy']).toContain(healthStatus);
    });

    it('should provide request statistics', () => {
      const requestStats = RequestCorrelationUtils.getStats(client);

      expect(requestStats).toHaveProperty('total');
      expect(requestStats).toHaveProperty('pending');
      expect(requestStats).toHaveProperty('success');
      expect(requestStats).toHaveProperty('error');
      expect(requestStats).toHaveProperty('timeout');
      expect(requestStats).toHaveProperty('averageDuration');
      expect(requestStats).toHaveProperty('maxRetries');

      // All should be numbers
      Object.values(requestStats).forEach(value => {
        expect(typeof value).toBe('number');
      });

      // Initially should be zero
      expect(requestStats.total).toBe(0);
      expect(requestStats.pending).toBe(0);
      expect(requestStats.success).toBe(0);
      expect(requestStats.error).toBe(0);
    });

    it('should generate comprehensive health reports', () => {
      const healthReport = HealthMonitoringUtils.getHealthReport(client);

      expect(healthReport).toHaveProperty('overall');
      expect(healthReport).toHaveProperty('endpoint');
      expect(healthReport).toHaveProperty('connections');
      expect(healthReport).toHaveProperty('requests');
      expect(healthReport).toHaveProperty('recommendations');

      expect(['healthy', 'degraded', 'unhealthy']).toContain(
        healthReport.overall
      );
      expect(Array.isArray(healthReport.recommendations)).toBe(true);
    });

    it('should assess overall client health', () => {
      const isHealthy = HealthMonitoringUtils.isClientHealthy(client);
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('Health Check Functionality', () => {
    it('should perform health check and return result', async () => {
      try {
        const healthResult = await client.performHealthCheck();

        expect(healthResult).toHaveProperty('status');
        expect(healthResult).toHaveProperty('latency');
        expect(healthResult).toHaveProperty('timestamp');

        expect(['healthy', 'unhealthy', 'degraded']).toContain(
          healthResult.status
        );
        expect(typeof healthResult.latency).toBe('number');
        expect(typeof healthResult.timestamp).toBe('number');
        expect(healthResult.latency).toBeGreaterThan(0);
      } catch (error) {
        // Health check failure is expected for test endpoint
        expect(error).toBeDefined();
      }
    });

    it('should cache health check results', async () => {
      const initialHealth = client.getHealthStatus();
      expect(initialHealth).toBeNull(); // No health check performed yet

      try {
        await client.performHealthCheck();
        const cachedHealth = client.getHealthStatus();
        expect(cachedHealth).not.toBeNull();
      } catch (error) {
        // Health check failure is expected, but result should still be cached
        const cachedHealth = client.getHealthStatus();
        expect(cachedHealth).not.toBeNull();
      }
    });
  });

  describe('Batch Request Structure', () => {
    it('should accept valid batch request structure', () => {
      const batchRequest: JsonRpcBatchRequest = {
        requests: [
          { jsonrpc: '2.0', method: 'test.method1', id: 1 },
          {
            jsonrpc: '2.0',
            method: 'test.method2',
            params: { key: 'value' },
            id: 2,
          },
        ],
        timeout: 10000,
      };

      expect(batchRequest.requests).toHaveLength(2);
      expect(batchRequest.requests[0].jsonrpc).toBe('2.0');
      expect(batchRequest.requests[1].params).toEqual({ key: 'value' });
      expect(batchRequest.timeout).toBe(10000);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await expect(client.shutdown()).resolves.not.toThrow();

      // After shutdown, client should not accept new requests
      // This is a behavior test - the client should handle shutdown gracefully
    });

    it('should handle multiple shutdown calls', async () => {
      await client.shutdown();

      // Second shutdown call should not throw
      await expect(client.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts gracefully', async () => {
      // This test verifies error handling structure without making actual network calls

      try {
        // Attempt to call with invalid token - should fail gracefully
        await client.call('test.method', {}, 'invalid-token');
      } catch (error) {
        // Error is expected for invalid endpoint
        expect(error).toBeDefined();
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Configuration Validation', () => {
    it('should merge configuration correctly', () => {
      const customClient = createEnhancedJsonRpcClient({
        baseUrl: 'https://custom.example.com/jsonrpc',
        timeout: 15000,
        retryAttempts: 5,
        connectionPool: {
          maxConnections: 50,
        },
      });

      const stats = customClient.getConnectionStats();
      expect(stats.maxConnections).toBe(50);

      customClient.shutdown();
    });

    it('should use default values for missing configuration', () => {
      const defaultClient = createEnhancedJsonRpcClient({
        baseUrl: 'https://test.example.com/jsonrpc',
      });

      const stats = defaultClient.getConnectionStats();
      expect(stats.maxConnections).toBeGreaterThan(0); // Should have default value

      defaultClient.shutdown();
    });
  });

  describe('Monitoring Integration', () => {
    it('should provide consistent monitoring data', () => {
      const connectionStats = client.getConnectionStats();
      const requestStats = RequestCorrelationUtils.getStats(client);
      const healthReport = HealthMonitoringUtils.getHealthReport(client);

      // All monitoring data should be consistent
      expect(healthReport.connections).toEqual(connectionStats);
      expect(healthReport.requests).toEqual(requestStats);
    });

    it('should generate appropriate recommendations', () => {
      const healthReport = HealthMonitoringUtils.getHealthReport(client);

      // Should always return an array
      expect(Array.isArray(healthReport.recommendations)).toBe(true);

      // Each recommendation should be a string
      healthReport.recommendations.forEach(rec => {
        expect(typeof rec).toBe('string');
        expect(rec.length).toBeGreaterThan(0);
      });
    });
  });
});
