/**
 * Main entry point for the Drupal MCP Server executable
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '@/config/index.js';
import { DrupalMcpServer } from '@/mcp/server.js';
import { initializeLogger, createChildLogger } from '@/utils/logger.js';
import createDebug from 'debug';

const debug = createDebug('mcp:bootstrap');

/**
 * Main function to start the MCP server
 */
async function main(): Promise<void> {
  const startTime = Date.now();
  debug('Starting Drupal MCP Server initialization...');

  try {
    // Load configuration
    debug('Step 1/4: Loading configuration...');
    const configStartTime = Date.now();
    const config = await loadConfig();
    const configLoadTime = Date.now() - configStartTime;
    debug(`✓ Configuration loaded (${configLoadTime}ms)`);
    debug(`Environment: ${config.environment}`);
    debug(`Log level: ${config.logging.level}`);
    debug(`Auth enabled: ${config.auth.enabled}`);
    debug(`Auth skip: ${config.auth.skipAuth}`);

    // Initialize logger after configuration is loaded
    initializeLogger(config);
    const logger = createChildLogger({ component: 'bootstrap' });

    logger.info('Starting Drupal MCP Server initialization...');
    logger.info('Step 1/4: Loading configuration...');
    logger.info(`✓ Configuration loaded (${configLoadTime}ms)`);

    // Create MCP server instance
    debug('Step 2/4: Creating MCP server instance...');
    logger.info('Step 2/4: Creating MCP server instance...');
    const serverStartTime = Date.now();
    const mcpServer = new DrupalMcpServer(config);
    const serverCreateTime = Date.now() - serverStartTime;
    debug(`✓ MCP server instance created (${serverCreateTime}ms)`);
    logger.info(`✓ MCP server instance created (${serverCreateTime}ms)`);

    // Create transport (stdio for MCP compatibility)
    debug('Step 3/4: Setting up transport...');
    logger.info('Step 3/4: Setting up transport...');
    const transport = new StdioServerTransport();
    debug('✓ StdioServerTransport initialized');

    // Connect server to transport
    debug('Step 4/4: Connecting server to transport...');
    logger.info('Step 4/4: Connecting server to transport...');
    const connectStartTime = Date.now();
    await mcpServer.getServer().connect(transport);
    const connectTime = Date.now() - connectStartTime;
    debug(`✓ Server connected to transport (${connectTime}ms)`);
    logger.info(`✓ Server connected to transport (${connectTime}ms)`);

    const totalTime = Date.now() - startTime;

    // Important startup info - use logger instead of console.error
    logger.info('Drupal MCP Server started successfully');
    logger.info(`Server: ${config.mcp.name} v${config.mcp.version}`);
    logger.info(
      `Drupal endpoint: ${config.drupal.baseUrl}${config.drupal.endpoint}`
    );

    // Debug-level detailed information
    debug(`🚀 Drupal MCP Server started successfully (${totalTime}ms total)`);
    logger.info(
      `🚀 Drupal MCP Server started successfully (${totalTime}ms total)`
    );
    debug(`Protocol: ${config.mcp.protocolVersion}`);
    debug(`Server listening on stdio transport`);
    if (config.auth.enabled) {
      debug(
        `OAuth client ID: ${config.oauth.clientId ? '***configured***' : 'NOT SET'}`
      );
      debug(`Required scopes: ${config.auth.requiredScopes.join(', ')}`);
    }
  } catch (error) {
    const totalTime = Date.now() - startTime;

    // Use logger if available, fallback to console.error if not initialized
    const logError = (message: string, ...args: any[]) => {
      try {
        const logger = createChildLogger({ component: 'bootstrap' });
        logger.error({ err: error }, message, ...args);
      } catch {
        // Logger not initialized, use console.error as fallback
        console.error(message, ...args);
      }
    };

    logError(`Failed to start MCP server (${totalTime}ms):`, error);

    if (error instanceof Error) {
      debug(`Error type: ${error.constructor.name}`);
      debug(`Error message: ${error.message}`);
      logError(`Error type: ${error.constructor.name}`);
      logError(`Error message: ${error.message}`);
      if (error.stack) {
        debug(`Stack trace:\n${error.stack}`);
      }
    }

    debug('Troubleshooting hints:');
    debug('- Check environment variables (DRUPAL_BASE_URL, OAUTH_CLIENT_ID)');
    debug('- Verify Drupal server is accessible');
    debug('- Check network connectivity');
    debug('- Review OAuth configuration');

    try {
      const logger = createChildLogger({ component: 'bootstrap' });
      logger.warn('Troubleshooting hints:');
      logger.warn(
        '- Check environment variables (DRUPAL_BASE_URL, OAUTH_CLIENT_ID)'
      );
      logger.warn('- Verify Drupal server is accessible');
      logger.warn('- Check network connectivity');
      logger.warn('- Review OAuth configuration');
    } catch {
      // Logger not initialized, use console.warn as fallback
      console.warn('Troubleshooting hints:');
      console.warn(
        '- Check environment variables (DRUPAL_BASE_URL, OAUTH_CLIENT_ID)'
      );
      console.warn('- Verify Drupal server is accessible');
      console.warn('- Check network connectivity');
      console.warn('- Review OAuth configuration');
    }

    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', () => {
  try {
    const logger = createChildLogger({ component: 'shutdown' });
    logger.info('Shutting down MCP server...');
  } catch {
    // Logger not initialized, use console.error as fallback
    console.error('Shutting down MCP server...');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  try {
    const logger = createChildLogger({ component: 'shutdown' });
    logger.info('Shutting down MCP server...');
  } catch {
    // Logger not initialized, use console.error as fallback
    console.error('Shutting down MCP server...');
  }
  process.exit(0);
});

// Start the server
main().catch(error => {
  try {
    const logger = createChildLogger({ component: 'bootstrap' });
    logger.error({ err: error }, 'Unhandled error:');
  } catch {
    // Logger not initialized, use console.error as fallback
    console.error('Unhandled error:', error);
  }
  process.exit(1);
});
