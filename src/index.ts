/**
 * Main entry point for the Drupalize.me MCP Server
 *
 * This server provides Model Context Protocol (MCP) integration with Drupalize.me's
 * Drupal installation, enabling LLMs to access and search educational content with
 * proper OAuth authentication and subscription-level access control.
 */

import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '@/mcp/server.js';
import { startHealthServer } from '@/health/server.js';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

/**
 * Main function to initialize and start the MCP server
 */
async function main(): Promise<void> {
  try {
    logger.info('Starting Drupalize.me MCP Server...', {
      version: process.env.npm_package_version ?? '1.0.0',
      nodeVersion: process.version,
      environment: config.environment,
    });

    // Start health check server first (needed for container health checks)
    await startHealthServer();

    // Create MCP server instance
    const server: Server = createServer();

    // Set up transport (stdio for MCP communication)
    const transport = new StdioServerTransport();

    // Connect server to transport
    await server.connect(transport);

    logger.info(
      'MCP Server successfully started and listening for connections'
    );

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      void server.close().then(() => {
        process.exit(0);
      });
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      void server.close().then(() => {
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error(
      'Failed to start MCP Server:',
      error instanceof Error ? error : { error: String(error) }
    );
    process.exit(1);
  }
}

// Start the server
main().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('Unhandled error in main:', errorMessage);
  process.exit(1);
});
