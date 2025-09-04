/**
 * Application metrics collection system
 *
 * Collects and tracks performance metrics for monitoring and alerting
 */

export interface PerformanceMetric {
  readonly timestamp: number;
  readonly responseTime: number;
  readonly endpoint: string;
  readonly method: string;
  readonly statusCode: number;
}

export interface OAuthMetric {
  readonly timestamp: number;
  readonly operation: 'refresh' | 'auth' | 'validate';
  readonly success: boolean;
  readonly error?: string;
  readonly responseTime?: number;
}

export interface DatabaseMetric {
  readonly timestamp: number;
  readonly operation: 'query' | 'connect' | 'health_check';
  readonly success: boolean;
  readonly responseTime: number;
  readonly error?: string;
}

export interface SystemMetrics {
  readonly uptime: number;
  readonly memoryUsage: NodeJS.MemoryUsage;
  readonly cpuUsage: NodeJS.CpuUsage;
  readonly activeConnections: number;
  readonly timestamp: number;
}

/**
 * Metrics collector and storage
 */
class MetricsCollector {
  private performanceMetrics: PerformanceMetric[] = [];
  private oauthMetrics: OAuthMetric[] = [];
  private databaseMetrics: DatabaseMetric[] = [];
  private readonly maxMetricsAge = 24 * 60 * 60 * 1000; // 24 hours
  private readonly maxMetricsCount = 10000;
  private activeConnections = 0;

  /**
   * Record a performance metric
   */
  recordPerformance(metric: PerformanceMetric): void {
    this.performanceMetrics.push(metric);
    this.cleanupOldMetrics();
  }

  /**
   * Record an OAuth operation metric
   */
  recordOAuth(metric: OAuthMetric): void {
    this.oauthMetrics.push(metric);
    this.cleanupOldMetrics();
  }

  /**
   * Record a database operation metric
   */
  recordDatabase(metric: DatabaseMetric): void {
    this.databaseMetrics.push(metric);
    this.cleanupOldMetrics();
  }

  /**
   * Increment active connection count
   */
  incrementConnections(): void {
    this.activeConnections++;
  }

  /**
   * Decrement active connection count
   */
  decrementConnections(): void {
    this.activeConnections = Math.max(0, this.activeConnections - 1);
  }

  /**
   * Get performance metrics summary
   */
  getPerformanceMetrics(since?: number): {
    totalRequests: number;
    averageResponseTime: number;
    errorRate: number;
    requests: PerformanceMetric[];
  } {
    const cutoff = since ?? Date.now() - 60 * 60 * 1000; // Last hour by default
    const relevantMetrics = this.performanceMetrics.filter(
      m => m.timestamp >= cutoff
    );

    const totalRequests = relevantMetrics.length;
    const averageResponseTime =
      totalRequests > 0
        ? relevantMetrics.reduce((sum, m) => sum + m.responseTime, 0) /
          totalRequests
        : 0;

    const errorCount = relevantMetrics.filter(m => m.statusCode >= 400).length;
    const errorRate = totalRequests > 0 ? errorCount / totalRequests : 0;

    return {
      totalRequests,
      averageResponseTime,
      errorRate,
      requests: relevantMetrics,
    };
  }

  /**
   * Get OAuth metrics summary
   */
  getOAuthMetrics(since?: number): {
    totalOperations: number;
    successRate: number;
    refreshSuccessRate: number;
    operations: OAuthMetric[];
  } {
    const cutoff = since ?? Date.now() - 60 * 60 * 1000; // Last hour by default
    const relevantMetrics = this.oauthMetrics.filter(
      m => m.timestamp >= cutoff
    );

    const totalOperations = relevantMetrics.length;
    const successfulOperations = relevantMetrics.filter(m => m.success).length;
    const successRate =
      totalOperations > 0 ? successfulOperations / totalOperations : 1;

    const refreshOperations = relevantMetrics.filter(
      m => m.operation === 'refresh'
    );
    const successfulRefreshes = refreshOperations.filter(m => m.success).length;
    const refreshSuccessRate =
      refreshOperations.length > 0
        ? successfulRefreshes / refreshOperations.length
        : 1;

    return {
      totalOperations,
      successRate,
      refreshSuccessRate,
      operations: relevantMetrics,
    };
  }

  /**
   * Get database metrics summary
   */
  getDatabaseMetrics(since?: number): {
    totalOperations: number;
    successRate: number;
    averageResponseTime: number;
    operations: DatabaseMetric[];
  } {
    const cutoff = since ?? Date.now() - 60 * 60 * 1000; // Last hour by default
    const relevantMetrics = this.databaseMetrics.filter(
      m => m.timestamp >= cutoff
    );

    const totalOperations = relevantMetrics.length;
    const successfulOperations = relevantMetrics.filter(m => m.success).length;
    const successRate =
      totalOperations > 0 ? successfulOperations / totalOperations : 1;

    const averageResponseTime =
      totalOperations > 0
        ? relevantMetrics.reduce((sum, m) => sum + m.responseTime, 0) /
          totalOperations
        : 0;

    return {
      totalOperations,
      successRate,
      averageResponseTime,
      operations: relevantMetrics,
    };
  }

  /**
   * Get current system metrics
   */
  getSystemMetrics(): SystemMetrics {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      activeConnections: this.activeConnections,
      timestamp: Date.now(),
    };
  }

  /**
   * Remove old metrics to prevent memory bloat
   */
  private cleanupOldMetrics(): void {
    const cutoff = Date.now() - this.maxMetricsAge;

    // Keep only recent metrics, up to max count
    this.performanceMetrics = this.performanceMetrics
      .filter(m => m.timestamp >= cutoff)
      .slice(-this.maxMetricsCount);

    this.oauthMetrics = this.oauthMetrics
      .filter(m => m.timestamp >= cutoff)
      .slice(-this.maxMetricsCount);

    this.databaseMetrics = this.databaseMetrics
      .filter(m => m.timestamp >= cutoff)
      .slice(-this.maxMetricsCount);
  }

  /**
   * Get comprehensive metrics summary
   */
  getMetricsSummary(since?: number): {
    performance: ReturnType<MetricsCollector['getPerformanceMetrics']>;
    oauth: ReturnType<MetricsCollector['getOAuthMetrics']>;
    database: ReturnType<MetricsCollector['getDatabaseMetrics']>;
    system: SystemMetrics;
  } {
    return {
      performance: this.getPerformanceMetrics(since),
      oauth: this.getOAuthMetrics(since),
      database: this.getDatabaseMetrics(since),
      system: this.getSystemMetrics(),
    };
  }
}

/**
 * Global metrics collector instance
 */
export const metricsCollector = new MetricsCollector();
