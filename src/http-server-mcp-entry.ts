/**
 * Enhanced HTTP Server Entry Point with MCP Protocol Support
 * 
 * Entry point for the enhanced MCP HTTP server that includes full MCP protocol
 * message handling over SSE transport with Drupal integration.
 */

import { logger } from '@/utils/logger';
import { config } from '@/config';
import { createEnhancedMCPHttpServer } from '@/server/mcp-http-server';

/**
 * Enhanced server configuration
 */
const serverConfig = {
  port: config.port,
  host: '0.0.0.0',
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
  compression: true,
  healthCheck: {
    enabled: config.health.enabled,
    path: config.health.path,
  },
  mcp: {
    enabled: true,
    drupalBaseUrl: config.drupal.baseUrl,
    enableToolDiscovery: true,
    enableDebugMessages: config.environment === 'development',
    messagePrefix: 'mcp',
  },
};

/**
 * SSE Transport configuration
 */
const sseConfig = {
  heartbeatIntervalMs: 30000, // 30 seconds
  connectionTimeoutMs: 60000, // 60 seconds
  maxConnections: 100,
  corsOrigins: config.security.cors.origins,
};

/**
 * Start the enhanced server
 */
async function startEnhancedServer(): Promise<void> {
  try {
    logger.info('Starting Enhanced MCP HTTP Server...', {
      environment: config.environment,
      port: config.port,
      drupalBaseUrl: config.drupal.baseUrl,
    });

    const server = createEnhancedMCPHttpServer(serverConfig, sseConfig);

    await server.start();

    logger.info('Enhanced MCP HTTP Server started successfully', {
      port: config.port,
      environment: config.environment,
      mcp: {
        enabled: true,
        drupalBaseUrl: config.drupal.baseUrl,
        toolDiscovery: true,
      },
    });

    // Log server statistics periodically
    setInterval(() => {
      const stats = server.getEnhancedStats();
      logger.debug('Server statistics', {
        uptime: stats.uptime,
        connections: stats.connections.active,
        mcpEnabled: stats.mcp.enabled,
        protocolStats: stats.mcp.protocol,
      });
    }, 60000); // Every minute

    // Graceful shutdown handling
    const handleShutdown = (signal: string): void => {
      logger.info(`Received ${signal}, shutting down Enhanced MCP HTTP Server...`);
      server
        .stop()
        .then(() => {
          logger.info('Enhanced MCP HTTP Server shutdown completed');
          process.exit(0);
        })
        .catch(error => {
          logger.error('Error during server shutdown', {
            error: error instanceof Error ? error.message : String(error),
          });
          process.exit(1);
        });
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start Enhanced MCP HTTP Server', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    process.exit(1);
  }
}

/**
 * Handle uncaught errors
 */
process.on('uncaughtException', error => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    promise: String(promise),
  });
  process.exit(1);
});

// Start the server
startEnhancedServer();