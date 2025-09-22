/**
 * Main entry point for the Drupal MCP Server executable
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '@/config/index.js';
import { DrupalMcpServer } from '@/mcp/server.js';
import {
  initializeLogger,
  createChildLogger,
  isLoggerInitialized,
} from '@/utils/logger.js';
import createDebug from 'debug';

const debug = createDebug('mcp:bootstrap');

/**
 * Safe logging function that uses Pino logger when available
 */
function safeLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  ...args: any[]
): void {
  if (isLoggerInitialized()) {
    const logger = createChildLogger({ component: 'bootstrap' });
    switch (level) {
      case 'info':
        logger.info(message, ...args);
        break;
      case 'warn':
        logger.warn(message, ...args);
        break;
      case 'error':
        logger.error(message, ...args);
        break;
    }
  } else {
    // Logger not initialized, use debug as fallback to avoid console usage
    debug(`[${level.toUpperCase()}] ${message}`, ...args);
  }
}

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

    // Log error using safe logging function
    safeLog('error', `Failed to start MCP server (${totalTime}ms):`, error);

    if (error instanceof Error) {
      debug(`Error type: ${error.constructor.name}`);
      debug(`Error message: ${error.message}`);
      safeLog('error', `Error type: ${error.constructor.name}`);
      safeLog('error', `Error message: ${error.message}`);
      if (error.stack) {
        debug(`Stack trace:\n${error.stack}`);
      }
    }

    debug('Troubleshooting hints:');
    debug('- Check environment variables (DRUPAL_BASE_URL, OAUTH_CLIENT_ID)');
    debug('- Verify Drupal server is accessible');
    debug('- Check network connectivity');
    debug('- Review OAuth configuration');

    safeLog('warn', 'Troubleshooting hints:');
    safeLog(
      'warn',
      '- Check environment variables (DRUPAL_BASE_URL, OAUTH_CLIENT_ID)'
    );
    safeLog('warn', '- Verify Drupal server is accessible');
    safeLog('warn', '- Check network connectivity');
    safeLog('warn', '- Review OAuth configuration');

    process.exit(1);
  }
}

/**
 * Safe logging function for shutdown scenarios
 */
function safeShutdownLog(message: string): void {
  if (isLoggerInitialized()) {
    const logger = createChildLogger({ component: 'shutdown' });
    logger.info(message);
  } else {
    // Logger not initialized, use debug as fallback to avoid console usage
    debug(`[SHUTDOWN] ${message}`);
  }
}

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', () => {
  safeShutdownLog('Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  safeShutdownLog('Shutting down MCP server...');
  process.exit(0);
});

// Start the server
main().catch(error => {
  safeLog('error', 'Unhandled error:', error);
  process.exit(1);
});
