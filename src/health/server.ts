/**
 * Health check server for Docker and deployment monitoring
 *
 * Runs a minimal HTTP server alongside the MCP server to provide
 * health endpoints for container orchestration and monitoring systems.
 */

import express from 'express';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import {
  checkDatabaseConnection,
  getDatabasePoolHealth,
} from '@/database/session-store.js';
import { OAuthClient } from '@/auth/oauth-client.js';
import { metricsCollector } from '@/monitoring/metrics.js';
import {
  performanceMiddleware,
  requestLoggingMiddleware,
} from '@/monitoring/middleware.js';

/**
 * Creates and configures the health check HTTP server
 */
export function createHealthServer(): express.Application {
  const app = express();
  const oauthClient = new OAuthClient();

  // Basic middleware
  app.use(express.json({ limit: '1mb' }));
  app.disable('x-powered-by');

  // Add monitoring middleware
  app.use(performanceMiddleware);
  app.use(requestLoggingMiddleware);

  // Health check endpoint with comprehensive monitoring
  app.get('/health', async (req, res) => {
    try {
      const startTime = Date.now();

      // Check all service health
      const [dbHealthy, oauthHealthy] = await Promise.all([
        checkDatabaseConnection(),
        oauthClient.checkHealth(),
      ]);

      const dbPoolHealth = getDatabasePoolHealth();
      const systemMetrics = metricsCollector.getSystemMetrics();
      const performanceMetrics = metricsCollector.getPerformanceMetrics();
      const oauthMetrics = metricsCollector.getOAuthMetrics();
      const databaseMetrics = metricsCollector.getDatabaseMetrics();

      const responseTime = Date.now() - startTime;
      const overallHealthy = dbHealthy && oauthHealthy;

      const healthStatus = {
        status: overallHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          database: {
            status: dbHealthy ? 'up' : 'down',
            pool: dbPoolHealth,
            metrics: {
              totalOperations: databaseMetrics.totalOperations,
              successRate: databaseMetrics.successRate,
              averageResponseTime: `${Math.round(databaseMetrics.averageResponseTime)}ms`,
            },
          },
          oauth: {
            status: oauthHealthy ? 'up' : 'down',
            configured: oauthClient.getStatus().isConfigured,
            hasValidCredentials: oauthClient.getStatus().hasValidCredentials,
            consecutiveFailures: oauthClient.getStatus().consecutiveFailures,
            metrics: {
              totalOperations: oauthMetrics.totalOperations,
              successRate: `${Math.round(oauthMetrics.successRate * 100)}%`,
              refreshSuccessRate: `${Math.round(oauthMetrics.refreshSuccessRate * 100)}%`,
            },
          },
          mcp_server: 'up', // If this endpoint responds, MCP server process is running
        },
        performance: {
          responseTime: `${responseTime}ms`,
          totalRequests: performanceMetrics.totalRequests,
          averageResponseTime: `${Math.round(performanceMetrics.averageResponseTime)}ms`,
          errorRate: `${Math.round(performanceMetrics.errorRate * 100)}%`,
          activeConnections: systemMetrics.activeConnections,
        },
        system: {
          uptime: `${Math.round(systemMetrics.uptime)}s`,
          memoryUsage: {
            rss: `${Math.round(systemMetrics.memoryUsage.rss / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(systemMetrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(systemMetrics.memoryUsage.heapTotal / 1024 / 1024)}MB`,
            external: `${Math.round(systemMetrics.memoryUsage.external / 1024 / 1024)}MB`,
          },
          pid: process.pid,
        },
        environment: config.environment,
        version: process.env.npm_package_version ?? '1.0.0',
      };

      if (overallHealthy) {
        res.status(200).json(healthStatus);
        logger.debug('Health check passed', {
          dbHealthy,
          oauthHealthy,
          responseTime: `${responseTime}ms`,
        });
      } else {
        res.status(503).json(healthStatus);
        logger.warn('Health check failed', {
          dbHealthy,
          oauthHealthy,
          responseTime: `${responseTime}ms`,
        });
      }
    } catch (error) {
      const errorStatus = {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        environment: config.environment,
        version: process.env.npm_package_version ?? '1.0.0',
      };

      res.status(503).json(errorStatus);
      logger.error('Health check error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Readiness probe endpoint
  app.get('/ready', async (req, res) => {
    try {
      // More comprehensive checks for readiness
      const dbHealthy = await checkDatabaseConnection();

      if (dbHealthy) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          reason: 'database_unavailable',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // Liveness probe endpoint (simple check that process is responsive)
  app.get('/live', (req, res) => {
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      pid: process.pid,
      uptime: process.uptime(),
    });
  });

  // Metrics endpoint for detailed performance analytics
  app.get('/metrics', (req, res) => {
    try {
      const since = req.query.since
        ? parseInt(req.query.since as string, 10)
        : undefined;
      const summary = metricsCollector.getMetricsSummary(since);

      res.status(200).json({
        timestamp: new Date().toISOString(),
        period: since ? `Since ${new Date(since).toISOString()}` : 'Last hour',
        metrics: summary,
      });

      logger.debug('Metrics requested', {
        since: since ? new Date(since).toISOString() : 'last_hour',
        requestSource: req.ip ?? req.connection.remoteAddress,
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to retrieve metrics',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });

      logger.error('Metrics endpoint error', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Health summary endpoint (lightweight version for frequent polling)
  app.get('/health/summary', async (req, res) => {
    try {
      const dbHealthy = await checkDatabaseConnection();
      const oauthHealthy = await oauthClient.checkHealth();
      const systemMetrics = metricsCollector.getSystemMetrics();

      const summary = {
        status: dbHealthy && oauthHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealthy ? 'up' : 'down',
          oauth: oauthHealthy ? 'up' : 'down',
          mcp_server: 'up',
        },
        uptime: systemMetrics.uptime,
        activeConnections: systemMetrics.activeConnections,
      };

      res.status(dbHealthy && oauthHealthy ? 200 : 503).json(summary);
    } catch (error) {
      res.status(503).json({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.originalUrl,
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

/**
 * Starts the health check server
 */
export async function startHealthServer(): Promise<void> {
  const app = createHealthServer();
  const { port } = config;

  return new Promise((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      logger.info(`Health check server listening on port ${port}`, {
        port,
        environment: config.environment,
      });
      resolve();
    });

    server.on('error', error => {
      logger.error('Health check server failed to start', {
        error: error instanceof Error ? error.message : String(error),
      });
      reject(error);
    });

    // Graceful shutdown handling
    const shutdown = (): void => {
      logger.info('Health check server shutting down...');
      server.close(() => {
        logger.info('Health check server stopped');
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
}
