/**
 * HTTP Server Entry Point for MCP Protocol with SSE Transport
 *
 * Alternative entry point that provides HTTP server with Server-Sent Events
 * transport instead of stdio transport for MCP protocol communication.
 */

import { createMCPHttpServer } from '@/server/http-server.js';
import { startHealthServer } from '@/health/server.js';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

/**
 * Main function to initialize and start the HTTP server with SSE transport
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting Drupalize.me MCP Server with HTTP/SSE transport...', {
      version: process.env.npm_package_version ?? '1.0.0',
      nodeVersion: process.version,
      environment: config.environment,
      port: config.port,
    });

    // Start health check server first (needed for container health checks)
    // Note: The health server will run on a different port to avoid conflicts
    await startHealthServer();

    // Create HTTP server with SSE transport
    const httpServer = createMCPHttpServer(
      {
        port: config.port,
        cors: {
          enabled: config.security.cors.enabled,
          origins: config.security.cors.origins,
        },
        security: {
          enabled: true,
          rateLimit: {
            enabled: config.security.rateLimit.enabled,
            max: config.security.rateLimit.max,
            windowMs: config.security.rateLimit.windowMs,
          },
        },
        healthCheck: {
          enabled: config.health.enabled,
          path: config.health.path,
        },
      },
      {
        // SSE-specific configuration
        heartbeatIntervalMs: parseInt(
          process.env.SSE_HEARTBEAT_INTERVAL ?? '30000',
          10
        ),
        connectionTimeoutMs: parseInt(
          process.env.SSE_CONNECTION_TIMEOUT ?? '60000',
          10
        ),
        maxConnections: parseInt(process.env.SSE_MAX_CONNECTIONS ?? '100', 10),
        corsOrigins: config.security.cors.origins,
      }
    );

    // Start the HTTP server
    await httpServer.start();

    logger.info(
      'MCP HTTP Server successfully started and listening for SSE connections',
      {
        port: config.port,
        endpoints: {
          root: '/',
          health: config.health.path,
          mcpStream: '/mcp/stream',
          status: '/mcp/status',
        },
      }
    );

    // Log initial server status
    const initialStatus = httpServer.getStatus();
    logger.info('Initial server status', initialStatus);

    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      try {
        await httpServer.stop();
        logger.info('HTTP server shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown', {
          error: error instanceof Error ? error.message : String(error),
        });
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Promise Rejection', {
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack,
      });

      // Attempt graceful shutdown
      gracefulShutdown('uncaughtException').catch(() => {
        process.exit(1);
      });
    });
  } catch (error) {
    logger.error(
      'Failed to start MCP HTTP Server:',
      error instanceof Error
        ? { error: error.message, stack: error.stack }
        : { error: String(error) }
    );
    process.exit(1);
  }
}

// Start the server
main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;

  console.error('Unhandled error in main:', errorMessage);
  if (errorStack) {
    console.error('Stack trace:', errorStack);
  }

  process.exit(1);
});
