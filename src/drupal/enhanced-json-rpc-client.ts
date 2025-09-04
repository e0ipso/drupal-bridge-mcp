/**
 * Enhanced Drupal JSON-RPC Client with Connection Management
 *
 * This client provides robust communication with Drupal's JSON-RPC API endpoints
 * featuring connection pooling, batch requests, health monitoring, and comprehensive
 * error handling with request correlation tracking.
 */

import type { AxiosInstance } from 'axios';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

/**
 * JSON-RPC request structure
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any>;
  id: string | number;
}

/**
 * Batch JSON-RPC request structure
 */
export interface JsonRpcBatchRequest {
  requests: JsonRpcRequest[];
  timeout?: number;
}

/**
 * JSON-RPC response structure
 */
export interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  result?: T;
  error?: JsonRpcError;
  id: string | number;
}

/**
 * Batch JSON-RPC response structure
 */
export interface JsonRpcBatchResponse<T = any> {
  responses: JsonRpcResponse<T>[];
  requestCount: number;
  successCount: number;
  errorCount: number;
  duration: number;
}

/**
 * JSON-RPC error structure
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

/**
 * Connection pool statistics
 */
export interface ConnectionPoolStats {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  requestsInQueue: number;
  maxConnections: number;
  connectionTimeouts: number;
  connectionErrors: number;
}

/**
 * Request correlation tracking
 */
export interface RequestCorrelation {
  requestId: string;
  method: string;
  timestamp: number;
  duration?: number;
  status: 'pending' | 'success' | 'error' | 'timeout';
  retryCount: number;
  error?: Error;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency: number;
  timestamp: number;
  version?: string;
  details?: Record<string, any>;
}

/**
 * Configuration for the enhanced JSON-RPC client
 */
export interface EnhancedJsonRpcClientConfig {
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  userAgent?: string;
  connectionPool?: {
    maxConnections?: number;
    keepAlive?: boolean;
    keepAliveMsecs?: number;
    maxSockets?: number;
    maxFreeSockets?: number;
    timeout?: number;
    freeSocketTimeout?: number;
  };
  healthCheck?: {
    enabled?: boolean;
    interval?: number;
    timeout?: number;
    endpoint?: string;
  };
  requestTracking?: {
    enabled?: boolean;
    maxTrackedRequests?: number;
    cleanupInterval?: number;
  };
}

/**
 * Drupal API error categories
 */
export enum DrupalErrorCode {
  // Authentication errors
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  INVALID_TOKEN = 40001,
  EXPIRED_TOKEN = 40002,
  INSUFFICIENT_SCOPE = 40003,

  // Request errors
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  INVALID_PARAMS = 40401,

  // Server errors
  INTERNAL_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
  JSONRPC_ERROR = 50001,
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  userAgent: 'DrupalizeME-MCP-Server/1.0.0',
  connectionPool: {
    maxConnections: 100,
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000, // 1 minute
    freeSocketTimeout: 30000, // 30 seconds
  },
  healthCheck: {
    enabled: true,
    interval: 30000, // 30 seconds
    timeout: 5000, // 5 seconds
    endpoint: '/health',
  },
  requestTracking: {
    enabled: true,
    maxTrackedRequests: 1000,
    cleanupInterval: 300000, // 5 minutes
  },
} as const;

/**
 * Enhanced JSON-RPC client for Drupal communication with connection management
 */
export class EnhancedJsonRpcClient {
  private readonly axios: AxiosInstance;
  private readonly clientConfig: EnhancedJsonRpcClientConfig & {
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    userAgent: string;
    connectionPool: {
      maxConnections: number;
      keepAlive: boolean;
      keepAliveMsecs: number;
      maxSockets: number;
      maxFreeSockets: number;
      timeout: number;
      freeSocketTimeout: number;
    };
    healthCheck: {
      enabled: boolean;
      interval: number;
      timeout: number;
      endpoint: string;
    };
    requestTracking: {
      enabled: boolean;
      maxTrackedRequests: number;
      cleanupInterval: number;
    };
  };
  private readonly httpAgent: HttpAgent;
  private readonly httpsAgent: HttpsAgent;
  private requestCounter = 0;
  private readonly activeRequests = new Map<string, RequestCorrelation>();
  private healthStatus: HealthCheckResult | null = null;
  private healthCheckInterval?: NodeJS.Timeout;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(clientConfig: EnhancedJsonRpcClientConfig) {
    this.clientConfig = { ...DEFAULT_CONFIG, ...clientConfig };

    // Create HTTP agents with connection pooling
    this.httpAgent = new HttpAgent({
      keepAlive: this.clientConfig.connectionPool.keepAlive,
      keepAliveMsecs: this.clientConfig.connectionPool.keepAliveMsecs,
      maxSockets: this.clientConfig.connectionPool.maxSockets,
      maxFreeSockets: this.clientConfig.connectionPool.maxFreeSockets,
      timeout: this.clientConfig.connectionPool.timeout,
    });

    this.httpsAgent = new HttpsAgent({
      keepAlive: this.clientConfig.connectionPool.keepAlive,
      keepAliveMsecs: this.clientConfig.connectionPool.keepAliveMsecs,
      maxSockets: this.clientConfig.connectionPool.maxSockets,
      maxFreeSockets: this.clientConfig.connectionPool.maxFreeSockets,
      timeout: this.clientConfig.connectionPool.timeout,
    });

    // Create axios instance with base configuration and agents
    this.axios = axios.create({
      baseURL: this.clientConfig.baseUrl,
      timeout: this.clientConfig.timeout,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.clientConfig.userAgent,
        Accept: 'application/json',
      },
    });

    // Add request interceptor for logging
    this.axios.interceptors.request.use(
      requestConfig => {
        logger.debug('Enhanced JSON-RPC Request', {
          url: requestConfig.url,
          method: requestConfig.method,
          headers: this.sanitizeHeaders(requestConfig.headers),
        });
        return requestConfig;
      },
      error => {
        logger.error('Enhanced JSON-RPC Request Error', { error });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.axios.interceptors.response.use(
      response => {
        logger.debug('Enhanced JSON-RPC Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      error => {
        logger.error('Enhanced JSON-RPC Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );

    // Start health checking if enabled
    if (this.clientConfig.healthCheck.enabled) {
      this.startHealthCheck();
    }

    // Start cleanup interval for request tracking
    if (this.clientConfig.requestTracking.enabled) {
      this.startCleanupInterval();
    }

    logger.info('Enhanced Drupal JSON-RPC Client initialized', {
      baseUrl: this.clientConfig.baseUrl,
      timeout: this.clientConfig.timeout,
      connectionPool: {
        maxConnections: this.clientConfig.connectionPool.maxConnections,
        keepAlive: this.clientConfig.connectionPool.keepAlive,
        maxSockets: this.clientConfig.connectionPool.maxSockets,
      },
      healthCheck: this.clientConfig.healthCheck.enabled,
      requestTracking: this.clientConfig.requestTracking.enabled,
    });
  }

  /**
   * Execute a JSON-RPC method call with token authentication and correlation tracking
   */
  async call<T = any>(
    method: string,
    params: Record<string, any> = {},
    userToken: string
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const correlation = this.trackRequest(requestId, method);

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: requestId,
    };

    const headers = {
      Authorization: `Bearer ${userToken}`,
      'X-Request-ID': requestId,
    };

    try {
      logger.debug('Executing Enhanced JSON-RPC call', {
        method,
        requestId,
        paramKeys: Object.keys(params),
        tokenPreview: this.maskToken(userToken),
        connectionStats: this.getConnectionStats(),
      });

      const response = await this.executeWithRetry(
        () => this.axios.post('', request, { headers }),
        method,
        correlation
      );

      const result = this.handleJsonRpcResponse<T>(response.data, requestId);
      this.completeRequest(correlation, 'success');
      return result;
    } catch (error) {
      this.completeRequest(correlation, 'error', error as Error);
      throw this.transformError(error, method, requestId);
    }
  }

  /**
   * Execute batch JSON-RPC requests
   */
  async batchCall<T = any>(
    batchRequest: JsonRpcBatchRequest,
    userToken: string
  ): Promise<JsonRpcBatchResponse<T>> {
    const startTime = Date.now();
    const batchId = this.generateRequestId('batch');

    logger.debug('Executing JSON-RPC batch call', {
      batchId,
      requestCount: batchRequest.requests.length,
      tokenPreview: this.maskToken(userToken),
    });

    // Track all requests in the batch
    const correlations = batchRequest.requests.map(req =>
      this.trackRequest(req.id.toString(), req.method)
    );

    const headers = {
      Authorization: `Bearer ${userToken}`,
      'X-Request-ID': batchId,
      'X-Batch-Size': batchRequest.requests.length.toString(),
    };

    try {
      const response = await this.executeWithRetry(
        () =>
          this.axios.post('', batchRequest.requests, {
            headers,
            timeout: batchRequest.timeout || this.clientConfig.timeout * 2, // Double timeout for batch
          }),
        `batch[${batchRequest.requests.length}]`,
        correlations[0] // Use first correlation for batch tracking
      );

      const responses = Array.isArray(response.data)
        ? response.data
        : [response.data];
      let successCount = 0;
      let errorCount = 0;

      // Process each response and update correlations
      responses.forEach((resp, index) => {
        const correlation = correlations[index];
        if (correlation) {
          if (resp.error) {
            errorCount++;
            this.completeRequest(
              correlation,
              'error',
              new Error(resp.error.message)
            );
          } else {
            successCount++;
            this.completeRequest(correlation, 'success');
          }
        }
      });

      const duration = Date.now() - startTime;
      logger.debug('Batch JSON-RPC call completed', {
        batchId,
        duration,
        successCount,
        errorCount,
      });

      return {
        responses,
        requestCount: batchRequest.requests.length,
        successCount,
        errorCount,
        duration,
      };
    } catch (error) {
      // Mark all correlations as failed
      correlations.forEach(correlation =>
        this.completeRequest(correlation, 'error', error as Error)
      );
      throw this.transformError(
        error,
        `batch[${batchRequest.requests.length}]`,
        batchId
      );
    }
  }

  /**
   * Get connection pool statistics
   */
  getConnectionStats(): ConnectionPoolStats {
    const httpStats = this.httpAgent as any;
    const httpsStats = this.httpsAgent as any;

    return {
      activeConnections:
        (httpStats.requests?.length || 0) + (httpsStats.requests?.length || 0),
      idleConnections:
        (httpStats.freeSockets
          ? Object.keys(httpStats.freeSockets).length
          : 0) +
        (httpsStats.freeSockets
          ? Object.keys(httpsStats.freeSockets).length
          : 0),
      totalConnections:
        (httpStats.sockets ? Object.keys(httpStats.sockets).length : 0) +
        (httpsStats.sockets ? Object.keys(httpsStats.sockets).length : 0),
      requestsInQueue: this.activeRequests.size,
      maxConnections: this.clientConfig.connectionPool.maxConnections,
      connectionTimeouts: 0, // Would need to be tracked separately
      connectionErrors: 0, // Would need to be tracked separately
    };
  }

  /**
   * Get current health status
   */
  getHealthStatus(): HealthCheckResult | null {
    return this.healthStatus;
  }

  /**
   * Get active request correlations
   */
  getActiveRequests(): RequestCorrelation[] {
    return Array.from(this.activeRequests.values());
  }

  /**
   * Force health check
   */
  async performHealthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      const response = await axios.get(
        this.clientConfig.baseUrl + this.clientConfig.healthCheck.endpoint,
        {
          timeout: this.clientConfig.healthCheck.timeout,
          headers: { 'User-Agent': this.clientConfig.userAgent },
        }
      );

      const latency = Date.now() - startTime;
      const result: HealthCheckResult = {
        status: response.status === 200 ? 'healthy' : 'degraded',
        latency,
        timestamp: Date.now(),
        version: response.data?.version,
        details: response.data,
      };

      this.healthStatus = result;
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      const result: HealthCheckResult = {
        status: 'unhealthy',
        latency,
        timestamp: Date.now(),
        details: {
          error: (error as Error).message,
          code: (error as any).code,
        },
      };

      this.healthStatus = result;
      return result;
    }
  }

  /**
   * Gracefully shutdown the client
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down Enhanced JSON-RPC client');

    // Stop health checking
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    // Wait for active requests to complete (with timeout)
    const activeCount = this.activeRequests.size;
    if (activeCount > 0) {
      logger.info(`Waiting for ${activeCount} active requests to complete`);

      const timeout = 30000; // 30 seconds
      const start = Date.now();

      while (this.activeRequests.size > 0 && Date.now() - start < timeout) {
        await this.delay(100);
      }

      if (this.activeRequests.size > 0) {
        logger.warn(
          `Shutdown timeout: ${this.activeRequests.size} requests still active`
        );
      }
    }

    // Destroy HTTP agents
    this.httpAgent.destroy();
    this.httpsAgent.destroy();

    logger.info('Enhanced JSON-RPC client shutdown complete');
  }

  /**
   * Execute request with retry logic and correlation tracking
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    context: string,
    correlation?: RequestCorrelation
  ): Promise<T> {
    let lastError: Error;

    for (
      let attempt = 1;
      attempt <= this.clientConfig.retryAttempts;
      attempt++
    ) {
      try {
        if (correlation) {
          correlation.retryCount = attempt - 1;
        }
        return await requestFn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors or client errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < this.clientConfig.retryAttempts) {
          const delay = this.clientConfig.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.warn(`JSON-RPC call failed, retrying in ${delay}ms`, {
            context,
            attempt,
            maxAttempts: this.clientConfig.retryAttempts,
            error: (error as Error).message,
            requestId: correlation?.requestId,
          });

          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: any): boolean {
    if (!error.response) return false;

    const { status } = error.response;
    return status >= 400 && status < 500; // Client errors
  }

  /**
   * Handle JSON-RPC response format
   */
  private handleJsonRpcResponse<T>(
    data: JsonRpcResponse<T>,
    requestId: string | number
  ): T {
    if (data.id !== requestId) {
      throw new Error(
        `JSON-RPC response ID mismatch: expected ${requestId}, got ${data.id}`
      );
    }

    if (data.error) {
      const error = new Error(`JSON-RPC Error: ${data.error.message}`);
      (error as any).code = data.error.code;
      (error as any).data = data.error.data;
      (error as any).jsonRpcError = data.error;
      throw error;
    }

    if (data.result === undefined) {
      throw new Error('JSON-RPC response missing result and error');
    }

    return data.result;
  }

  /**
   * Transform various errors into consistent format
   */
  private transformError(
    error: any,
    method: string,
    requestId: string | number
  ): Error {
    if (error.jsonRpcError) {
      // Already a JSON-RPC error, return as-is
      return error;
    }

    if (error.response) {
      // HTTP error
      const { status } = error.response;
      const { data } = error.response;

      switch (status) {
        case 401:
          return this.createDrupalError(
            DrupalErrorCode.UNAUTHORIZED,
            'Authentication required',
            { method, requestId, originalError: data }
          );
        case 403:
          return this.createDrupalError(
            DrupalErrorCode.FORBIDDEN,
            'Access denied - insufficient permissions',
            { method, requestId, originalError: data }
          );
        case 404:
          return this.createDrupalError(
            DrupalErrorCode.NOT_FOUND,
            `Endpoint not found: ${method}`,
            { method, requestId, originalError: data }
          );
        case 500:
          return this.createDrupalError(
            DrupalErrorCode.INTERNAL_ERROR,
            'Internal server error',
            { method, requestId, originalError: data }
          );
        default:
          return this.createDrupalError(
            status,
            `HTTP ${status}: ${error.message}`,
            { method, requestId, originalError: data }
          );
      }
    }

    if (error.request) {
      // Network error
      return this.createDrupalError(
        DrupalErrorCode.SERVICE_UNAVAILABLE,
        'Network error - unable to reach Drupal server',
        { method, requestId, originalError: error.message }
      );
    }

    // Unknown error
    return this.createDrupalError(
      DrupalErrorCode.INTERNAL_ERROR,
      `Unexpected error: ${error.message}`,
      { method, requestId, originalError: error }
    );
  }

  /**
   * Create consistent Drupal API error
   */
  private createDrupalError(code: number, message: string, data?: any): Error {
    const error = new Error(message);
    (error as any).code = code;
    (error as any).data = data;
    (error as any).isDrupalError = true;
    return error;
  }

  /**
   * Track a request for correlation
   */
  private trackRequest(requestId: string, method: string): RequestCorrelation {
    if (!this.clientConfig.requestTracking.enabled) {
      return {
        requestId,
        method,
        timestamp: Date.now(),
        status: 'pending',
        retryCount: 0,
      };
    }

    const correlation: RequestCorrelation = {
      requestId,
      method,
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0,
    };

    this.activeRequests.set(requestId, correlation);

    // Cleanup old requests if we're over the limit
    if (
      this.activeRequests.size >
      this.clientConfig.requestTracking.maxTrackedRequests
    ) {
      const entries = Array.from(this.activeRequests.entries());
      const oldestEntry = entries.sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0];
      if (oldestEntry) {
        this.activeRequests.delete(oldestEntry[0]);
      }
    }

    return correlation;
  }

  /**
   * Complete a tracked request
   */
  private completeRequest(
    correlation: RequestCorrelation,
    status: 'success' | 'error' | 'timeout',
    error?: Error | undefined
  ): void {
    correlation.status = status;
    correlation.duration = Date.now() - correlation.timestamp;
    if (error !== undefined) {
      correlation.error = error;
    }

    if (this.clientConfig.requestTracking.enabled) {
      // Keep completed requests for a short time for debugging
      setTimeout(() => {
        this.activeRequests.delete(correlation.requestId);
      }, 60000); // Remove after 1 minute
    }
  }

  /**
   * Start health checking interval
   */
  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
        logger.debug('Health check completed', {
          status: this.healthStatus?.status,
          latency: this.healthStatus?.latency,
        });
      } catch (error) {
        logger.error('Health check failed', { error });
      }
    }, this.clientConfig.healthCheck.interval);

    // Perform initial health check
    this.performHealthCheck().catch(error =>
      logger.error('Initial health check failed', { error })
    );
  }

  /**
   * Start cleanup interval for request tracking
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const maxAge = 300000; // 5 minutes

      for (const [requestId, correlation] of this.activeRequests.entries()) {
        if (now - correlation.timestamp > maxAge) {
          logger.debug('Cleaning up stale request tracking', {
            requestId,
            method: correlation.method,
            age: now - correlation.timestamp,
          });
          this.activeRequests.delete(requestId);
        }
      }
    }, this.clientConfig.requestTracking.cleanupInterval);
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(prefix = 'req'): string {
    return `${prefix}_${Date.now()}_${++this.requestCounter}`;
  }

  /**
   * Create masked token for logging (security)
   */
  private maskToken(token: string): string {
    if (!token || token.length < 16) return '[INVALID_TOKEN]';
    return `${token.slice(0, 8)}...${token.slice(-4)}`;
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: any): any {
    if (!headers) return headers;

    const sanitized = { ...headers };
    if (sanitized.Authorization) {
      sanitized.Authorization = `Bearer ${this.maskToken(sanitized.Authorization.replace('Bearer ', ''))}`;
    }
    return sanitized;
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create EnhancedJsonRpcClient with configuration
 */
export function createEnhancedJsonRpcClient(
  clientConfig?: Partial<EnhancedJsonRpcClientConfig>
): EnhancedJsonRpcClient {
  const finalConfig: EnhancedJsonRpcClientConfig = {
    baseUrl:
      clientConfig?.baseUrl ||
      config.drupal.baseUrl + config.drupal.jsonRpcEndpoint,
    timeout: clientConfig?.timeout || config.drupal.timeout,
    ...clientConfig,
  };

  return new EnhancedJsonRpcClient(finalConfig);
}

/**
 * Connection pool utilities
 */
export const ConnectionPoolUtils = {
  /**
   * Get connection pool statistics from client
   */
  getStats(client: EnhancedJsonRpcClient): ConnectionPoolStats {
    return client.getConnectionStats();
  },

  /**
   * Check if connection pool is healthy
   */
  isHealthy(stats: ConnectionPoolStats): boolean {
    const utilizationRate = stats.activeConnections / stats.maxConnections;
    const errorRate =
      stats.connectionErrors /
      (stats.connectionErrors + stats.totalConnections || 1);

    return utilizationRate < 0.9 && errorRate < 0.1;
  },

  /**
   * Get connection pool health status
   */
  getHealthStatus(
    stats: ConnectionPoolStats
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const utilizationRate = stats.activeConnections / stats.maxConnections;
    const errorRate =
      stats.connectionErrors /
      (stats.connectionErrors + stats.totalConnections || 1);

    if (errorRate > 0.3 || utilizationRate > 0.95) {
      return 'unhealthy';
    }

    if (errorRate > 0.1 || utilizationRate > 0.8) {
      return 'degraded';
    }

    return 'healthy';
  },
};

/**
 * Request correlation utilities
 */
export const RequestCorrelationUtils = {
  /**
   * Find request by ID
   */
  findRequest(
    client: EnhancedJsonRpcClient,
    requestId: string
  ): RequestCorrelation | undefined {
    return client.getActiveRequests().find(req => req.requestId === requestId);
  },

  /**
   * Get requests by status
   */
  getRequestsByStatus(
    client: EnhancedJsonRpcClient,
    status: RequestCorrelation['status']
  ): RequestCorrelation[] {
    return client.getActiveRequests().filter(req => req.status === status);
  },

  /**
   * Get request statistics
   */
  getStats(client: EnhancedJsonRpcClient): {
    total: number;
    pending: number;
    success: number;
    error: number;
    timeout: number;
    averageDuration: number;
    maxRetries: number;
  } {
    const requests = client.getActiveRequests();
    const completed = requests.filter(req => req.duration !== undefined);

    const stats = {
      total: requests.length,
      pending: requests.filter(req => req.status === 'pending').length,
      success: requests.filter(req => req.status === 'success').length,
      error: requests.filter(req => req.status === 'error').length,
      timeout: requests.filter(req => req.status === 'timeout').length,
      averageDuration:
        completed.length > 0
          ? completed.reduce((sum, req) => sum + (req.duration || 0), 0) /
            completed.length
          : 0,
      maxRetries: Math.max(...requests.map(req => req.retryCount), 0),
    };

    return stats;
  },
};

/**
 * Health monitoring utilities
 */
export const HealthMonitoringUtils = {
  /**
   * Check if client is healthy overall
   */
  isClientHealthy(client: EnhancedJsonRpcClient): boolean {
    const health = client.getHealthStatus();
    const connectionStats = client.getConnectionStats();

    const healthStatus = health?.status === 'healthy';
    const connectionHealth = ConnectionPoolUtils.isHealthy(connectionStats);
    const lowLatency = (health?.latency || 0) < 5000; // 5 seconds

    return healthStatus && connectionHealth && lowLatency;
  },

  /**
   * Get comprehensive health report
   */
  getHealthReport(client: EnhancedJsonRpcClient): {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    endpoint: HealthCheckResult | null;
    connections: ConnectionPoolStats;
    requests: ReturnType<typeof RequestCorrelationUtils.getStats>;
    recommendations: string[];
  } {
    const health = client.getHealthStatus();
    const connectionStats = client.getConnectionStats();
    const requestStats = RequestCorrelationUtils.getStats(client);
    const recommendations: string[] = [];

    const endpointHealthy = health?.status === 'healthy';
    const connectionsHealthy = ConnectionPoolUtils.isHealthy(connectionStats);
    const requestsHealthy =
      requestStats.error / (requestStats.total || 1) < 0.1;

    let overall: 'healthy' | 'degraded' | 'unhealthy';

    if (endpointHealthy && connectionsHealthy && requestsHealthy) {
      overall = 'healthy';
    } else if (
      !endpointHealthy ||
      requestStats.error / (requestStats.total || 1) > 0.3
    ) {
      overall = 'unhealthy';
    } else {
      overall = 'degraded';
    }

    // Generate recommendations
    if (!connectionsHealthy) {
      recommendations.push('Consider increasing connection pool size');
    }

    if ((health?.latency || 0) > 10000) {
      recommendations.push(
        'High latency detected - check network connectivity'
      );
    }

    if (requestStats.error / (requestStats.total || 1) > 0.1) {
      recommendations.push('High error rate - investigate server issues');
    }

    if (requestStats.maxRetries > 2) {
      recommendations.push(
        'Frequent retries detected - check server stability'
      );
    }

    return {
      overall,
      endpoint: health,
      connections: connectionStats,
      requests: requestStats,
      recommendations,
    };
  },
};
