/**
 * Unit tests for Enhanced JSON-RPC Client
 */

import {
  EnhancedJsonRpcClient,
  ConnectionPoolUtils,
  RequestCorrelationUtils,
  HealthMonitoringUtils,
} from '../../../src/drupal/enhanced-json-rpc-client.js';
import type {
  EnhancedJsonRpcClientConfig,
  JsonRpcBatchRequest,
} from '../../../src/drupal/enhanced-json-rpc-client.js';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock logger
jest.mock('../../../src/utils/logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock config
jest.mock('../../../src/config/index.js', () => ({
  config: {
    drupal: {
      baseUrl: 'https://test.drupal.com',
      jsonRpcEndpoint: '/jsonrpc',
      timeout: 30000,
    },
  },
}));

describe('EnhancedJsonRpcClient', () => {
  let client: EnhancedJsonRpcClient;
  let mockAxiosInstance: jest.Mocked<any>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup axios mock
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    };

    mockedAxios.create.mockReturnValue(mockAxiosInstance);
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { version: '1.0.0' },
    });

    const config: EnhancedJsonRpcClientConfig = {
      baseUrl: 'https://test.drupal.com/jsonrpc',
      healthCheck: {
        enabled: false, // Disable for tests
      },
      requestTracking: {
        enabled: false, // Disable for tests
      },
    };

    client = new EnhancedJsonRpcClient(config);
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(mockedAxios.create).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });

    it('should create HTTP agents with connection pooling', () => {
      const config: EnhancedJsonRpcClientConfig = {
        baseUrl: 'https://test.drupal.com/jsonrpc',
        connectionPool: {
          maxConnections: 200,
          keepAlive: true,
          maxSockets: 100,
        },
      };

      const clientWithPool = new EnhancedJsonRpcClient(config);

      // Connection stats should be available
      const stats = clientWithPool.getConnectionStats();
      expect(stats).toHaveProperty('maxConnections', 200);

      clientWithPool.shutdown();
    });
  });

  describe('call', () => {
    it('should make a successful JSON-RPC call', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          result: { success: true },
          id: expect.any(String),
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.call(
        'test.method',
        { param: 'value' },
        'test-token'
      );

      expect(result).toEqual({ success: true });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith(
        '',
        expect.objectContaining({
          jsonrpc: '2.0',
          method: 'test.method',
          params: { param: 'value' },
          id: expect.any(String),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'X-Request-ID': expect.any(String),
          }),
        })
      );
    });

    it('should handle JSON-RPC error responses', async () => {
      const mockResponse = {
        data: {
          jsonrpc: '2.0',
          error: {
            code: -1,
            message: 'Test error',
            data: { details: 'Error details' },
          },
          id: 'test-id',
        },
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      await expect(
        client.call('test.method', {}, 'test-token')
      ).rejects.toThrow('JSON-RPC Error: Test error');
    });

    it('should retry on retryable errors', async () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNRESET' as any;

      mockAxiosInstance.post
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue({
          data: {
            jsonrpc: '2.0',
            result: { success: true },
            id: expect.any(String),
          },
        });

      const result = await client.call('test.method', {}, 'test-token');

      expect(result).toEqual({ success: true });
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(3);
    });

    it('should not retry on client errors', async () => {
      const clientError = {
        response: { status: 401 },
        message: 'Unauthorized',
      };

      mockAxiosInstance.post.mockRejectedValue(clientError);

      await expect(
        client.call('test.method', {}, 'test-token')
      ).rejects.toThrow();
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('batchCall', () => {
    it('should execute batch requests successfully', async () => {
      const batchRequest: JsonRpcBatchRequest = {
        requests: [
          { jsonrpc: '2.0', method: 'test.method1', id: 1 },
          { jsonrpc: '2.0', method: 'test.method2', id: 2 },
        ],
      };

      const mockResponse = {
        data: [
          { jsonrpc: '2.0', result: { data: 'result1' }, id: 1 },
          { jsonrpc: '2.0', result: { data: 'result2' }, id: 2 },
        ],
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.batchCall(batchRequest, 'test-token');

      expect(result.requestCount).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.responses).toHaveLength(2);
      expect(typeof result.duration).toBe('number');
    });

    it('should handle mixed success/error batch responses', async () => {
      const batchRequest: JsonRpcBatchRequest = {
        requests: [
          { jsonrpc: '2.0', method: 'test.method1', id: 1 },
          { jsonrpc: '2.0', method: 'test.method2', id: 2 },
        ],
      };

      const mockResponse = {
        data: [
          { jsonrpc: '2.0', result: { data: 'result1' }, id: 1 },
          { jsonrpc: '2.0', error: { code: -1, message: 'Test error' }, id: 2 },
        ],
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const result = await client.batchCall(batchRequest, 'test-token');

      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(1);
    });
  });

  describe('getConnectionStats', () => {
    it('should return connection pool statistics', () => {
      const stats = client.getConnectionStats();

      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('idleConnections');
      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('requestsInQueue');
      expect(stats).toHaveProperty('maxConnections');
      expect(stats).toHaveProperty('connectionTimeouts');
      expect(stats).toHaveProperty('connectionErrors');

      expect(typeof stats.activeConnections).toBe('number');
      expect(typeof stats.maxConnections).toBe('number');
    });
  });

  describe('performHealthCheck', () => {
    it('should perform health check successfully', async () => {
      mockedAxios.get.mockResolvedValue({
        status: 200,
        data: { version: '1.0.0', status: 'healthy' },
      });

      const result = await client.performHealthCheck();

      expect(result.status).toBe('healthy');
      expect(typeof result.latency).toBe('number');
      expect(typeof result.timestamp).toBe('number');
      expect(result.version).toBe('1.0.0');
    });

    it('should handle health check failures', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Health check failed'));

      const result = await client.performHealthCheck();

      expect(result.status).toBe('unhealthy');
      expect(typeof result.latency).toBe('number');
      expect(result.details?.error).toBe('Health check failed');
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully with no active requests', async () => {
      await expect(client.shutdown()).resolves.not.toThrow();
    });
  });
});

describe('ConnectionPoolUtils', () => {
  let client: EnhancedJsonRpcClient;

  beforeEach(() => {
    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    });

    client = new EnhancedJsonRpcClient({
      baseUrl: 'https://test.drupal.com/jsonrpc',
      healthCheck: { enabled: false },
      requestTracking: { enabled: false },
    });
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('isHealthy', () => {
    it('should return true for healthy connection pool', () => {
      const healthyStats = {
        activeConnections: 10,
        idleConnections: 5,
        totalConnections: 15,
        requestsInQueue: 2,
        maxConnections: 100,
        connectionTimeouts: 0,
        connectionErrors: 0,
      };

      expect(ConnectionPoolUtils.isHealthy(healthyStats)).toBe(true);
    });

    it('should return false for unhealthy connection pool', () => {
      const unhealthyStats = {
        activeConnections: 95,
        idleConnections: 5,
        totalConnections: 100,
        requestsInQueue: 50,
        maxConnections: 100,
        connectionTimeouts: 10,
        connectionErrors: 20,
      };

      expect(ConnectionPoolUtils.isHealthy(unhealthyStats)).toBe(false);
    });
  });

  describe('getHealthStatus', () => {
    it('should return correct health status', () => {
      const healthyStats = {
        activeConnections: 10,
        idleConnections: 5,
        totalConnections: 15,
        requestsInQueue: 2,
        maxConnections: 100,
        connectionTimeouts: 0,
        connectionErrors: 0,
      };

      expect(ConnectionPoolUtils.getHealthStatus(healthyStats)).toBe('healthy');

      const degradedStats = { ...healthyStats, activeConnections: 85 };
      expect(ConnectionPoolUtils.getHealthStatus(degradedStats)).toBe(
        'degraded'
      );

      const unhealthyStats = { ...healthyStats, activeConnections: 98 };
      expect(ConnectionPoolUtils.getHealthStatus(unhealthyStats)).toBe(
        'unhealthy'
      );
    });
  });
});

describe('RequestCorrelationUtils', () => {
  let client: EnhancedJsonRpcClient;

  beforeEach(() => {
    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    });

    client = new EnhancedJsonRpcClient({
      baseUrl: 'https://test.drupal.com/jsonrpc',
      healthCheck: { enabled: false },
      requestTracking: { enabled: true },
    });
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('getStats', () => {
    it('should return request statistics', () => {
      const stats = RequestCorrelationUtils.getStats(client);

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('pending');
      expect(stats).toHaveProperty('success');
      expect(stats).toHaveProperty('error');
      expect(stats).toHaveProperty('timeout');
      expect(stats).toHaveProperty('averageDuration');
      expect(stats).toHaveProperty('maxRetries');

      expect(typeof stats.total).toBe('number');
      expect(typeof stats.averageDuration).toBe('number');
    });
  });
});

describe('HealthMonitoringUtils', () => {
  let client: EnhancedJsonRpcClient;

  beforeEach(() => {
    mockedAxios.create.mockReturnValue({
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: { use: jest.fn() },
        response: { use: jest.fn() },
      },
    });

    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { version: '1.0.0' },
    });

    client = new EnhancedJsonRpcClient({
      baseUrl: 'https://test.drupal.com/jsonrpc',
      healthCheck: { enabled: false },
      requestTracking: { enabled: false },
    });
  });

  afterEach(async () => {
    await client.shutdown();
  });

  describe('getHealthReport', () => {
    it('should return comprehensive health report', async () => {
      // Set up a healthy client state
      await client.performHealthCheck();

      const report = HealthMonitoringUtils.getHealthReport(client);

      expect(report).toHaveProperty('overall');
      expect(report).toHaveProperty('endpoint');
      expect(report).toHaveProperty('connections');
      expect(report).toHaveProperty('requests');
      expect(report).toHaveProperty('recommendations');

      expect(['healthy', 'degraded', 'unhealthy']).toContain(report.overall);
      expect(Array.isArray(report.recommendations)).toBe(true);
    });
  });

  describe('isClientHealthy', () => {
    it('should assess overall client health', async () => {
      // Set up a healthy client state
      await client.performHealthCheck();

      const isHealthy = HealthMonitoringUtils.isClientHealthy(client);
      expect(typeof isHealthy).toBe('boolean');
    });
  });
});
