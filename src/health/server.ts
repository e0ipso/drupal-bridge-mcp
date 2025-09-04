/**
 * Health check server for Docker and deployment monitoring
 *
 * Runs a minimal HTTP server alongside the MCP server to provide
 * health endpoints for container orchestration and monitoring systems.
 */

import express from 'express';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { checkDatabaseConnection } from '@/database/session-store.js';

/**
 * Creates and configures the health check HTTP server
 */
export function createHealthServer(): express.Application {
  const app = express();

  // Basic middleware
  app.use(express.json({ limit: '1mb' }));
  app.disable('x-powered-by');

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      const startTime = Date.now();

      // Check database connectivity
      const dbHealthy = await checkDatabaseConnection();

      const responseTime = Date.now() - startTime;

      const healthStatus = {
        status: dbHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        services: {
          database: dbHealthy ? 'up' : 'down',
          mcp_server: 'up', // If this endpoint responds, MCP server process is running
        },
        environment: config.environment,
        responseTime: `${responseTime}ms`,
        version: process.env.npm_package_version ?? '1.0.0',
      };

      if (dbHealthy) {
        res.status(200).json(healthStatus);
        logger.debug('Health check passed', healthStatus);
      } else {
        res.status(503).json(healthStatus);
        logger.warn('Health check failed - database unavailable', healthStatus);
      }
    } catch (error) {
      const errorStatus = {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        environment: config.environment,
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

  // 404 handler
  app.use('*', (req, res) => {
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
