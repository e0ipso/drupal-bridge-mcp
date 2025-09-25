/**
 * Main entry point for the Drupal MCP Server executable
 */

import { loadConfig } from '@/config/index.js';
import { DrupalMcpServer } from '@/mcp/server.js';
import { HttpTransport } from '@/transport/http-transport.js';
import {
  initializeLogger,
  createChildLogger,
  isLoggerInitialized,
} from '@/utils/logger.js';
import createDebug from 'debug';

const debug = createDebug('mcp:bootstrap');

// Global reference for graceful shutdown
let globalTransport: HttpTransport | null = null;

/**
 * Safe logging function that uses Pino logger when available
 */
function safeLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  ...args: unknown[]
): void {
  if (isLoggerInitialized()) {
    const logger = createChildLogger({ component: 'bootstrap' });
    const logData = args.length > 0 ? { args } : undefined;
    switch (level) {
      case 'info':
        logger.info(logData, message);
        break;
      case 'warn':
        logger.warn(logData, message);
        break;
      case 'error':
        logger.error(logData, message);
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

    // Create transport (HTTP for streamable MCP compatibility)
    debug('Step 3/4: Setting up HTTP transport...');
    logger.info('Step 3/4: Setting up HTTP transport...');
    const transport = new HttpTransport(config, mcpServer, logger);
    globalTransport = transport; // Store for graceful shutdown
    debug('✓ HttpTransport initialized');

    // Start HTTP server
    debug('Step 4/4: Starting HTTP server...');
    logger.info('Step 4/4: Starting HTTP server...');
    const connectStartTime = Date.now();
    await transport.start();
    const connectTime = Date.now() - connectStartTime;
    const status = transport.getStatus();
    debug(
      `✓ HTTP server started on ${status.host}:${status.port} (${connectTime}ms)`
    );
    logger.info(
      `✓ HTTP server started on ${status.host}:${status.port} (${connectTime}ms)`
    );

    const totalTime = Date.now() - startTime;

    // Important startup info - use logger instead of console.error
    logger.info('Drupal HTTP MCP Server started successfully');
    logger.info(`Server: ${config.mcp.name} v${config.mcp.version}`);
    logger.info(
      `Drupal endpoint: ${config.drupal.baseUrl}${config.drupal.endpoint}`
    );
    logger.info(`HTTP server: http://${status.host}:${status.port}/mcp`);

    // Debug-level detailed information
    debug(
      `🚀 Drupal HTTP MCP Server started successfully (${totalTime}ms total)`
    );
    logger.info(
      `🚀 Drupal HTTP MCP Server started successfully (${totalTime}ms total)`
    );
    debug(`Protocol: ${config.mcp.protocolVersion}`);
    debug(`Server listening on http://${status.host}:${status.port}`);
    if (config.auth.enabled) {
      debug(
        `OAuth client ID: ${config.oauth.clientId ? '***configured***' : 'NOT SET'}`
      );
      debug(`Required scopes: ${config.auth.requiredScopes.join(', ')}`);
    }

    // Next steps guidance
    logger.info('');
    logger.info('🎉 HTTP MCP Server is ready! Next steps:');
    logger.info('');
    logger.info('📋 To use this server with Claude Desktop:');
    logger.info(
      '   1. Add this server configuration to claude_desktop_config.json:'
    );
    logger.info('   {');
    logger.info('     "mcpServers": {');
    logger.info(`       "drupal-bridge": {`);
    logger.info(`         "command": "node",`);
    logger.info(`         "args": ["${process.cwd()}/dist/main.js"],`);
    logger.info('         "env": {');
    logger.info(`           "DRUPAL_BASE_URL": "${config.drupal.baseUrl}",`);
    logger.info(`           "HTTP_PORT": "${status.port}",`);
    logger.info(`           "HTTP_HOST": "${status.host}",`);
    if (config.auth.enabled && config.oauth.clientId) {
      logger.info(`           "OAUTH_CLIENT_ID": "${config.oauth.clientId}",`);
    }
    logger.info('         }');
    logger.info('       }');
    logger.info('     }');
    logger.info('   }');
    logger.info('');
    logger.info('🔗 Available HTTP endpoints:');
    logger.info(
      `   • GET  http://${status.host}:${status.port}/health - Health check`
    );
    logger.info(
      `   • GET  http://${status.host}:${status.port}/mcp - Server-Sent Events`
    );
    logger.info(
      `   • POST http://${status.host}:${status.port}/mcp - JSON-RPC requests`
    );
    logger.info('');
    logger.info('🛠️ Available MCP tools:');
    logger.info('   • drupal_get_content - Retrieve Drupal content');
    logger.info('   • drupal_search_content - Search through content');
    logger.info('   • drupal_get_schema - Get content type schemas');
    if (config.auth.enabled) {
      logger.info('   • drupal_authenticate - Authenticate with OAuth');
    }
    logger.info('');
    logger.info(
      '📖 Documentation: https://github.com/e0ipso/drupal-bridge-mcp'
    );
    logger.info('');
    debug(
      'HTTP server initialization complete. Waiting for MCP client connections...'
    );
    debug('💻 For development with Claude Code: Create .mcp.json with:');
    debug('  {');
    debug('    "mcpServers": {');
    debug(`      "drupal-bridge": {`);
    debug(`        "command": "npm",`);
    debug(`        "args": ["run", "dev"],`);
    debug(`        "cwd": "${process.cwd()}",`);
    debug('        "env": {');
    debug(`          "DRUPAL_BASE_URL": "${config.drupal.baseUrl}",`);
    debug(`          "HTTP_PORT": "${status.port}",`);
    debug(`          "HTTP_HOST": "${status.host}"`);
    if (config.auth.enabled && config.oauth.clientId) {
      debug(`          "OAUTH_CLIENT_ID": "${config.oauth.clientId}"`);
    }
    debug('        }');
    debug('      }');
    debug('    }');
    debug('  }');
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
async function gracefulShutdown(signal: string): Promise<void> {
  safeShutdownLog(`Received ${signal}, shutting down HTTP MCP server...`);

  if (globalTransport) {
    try {
      await globalTransport.stop();
      safeShutdownLog('HTTP transport stopped successfully');
    } catch (error) {
      safeShutdownLog(
        `Error stopping HTTP transport: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  safeShutdownLog('HTTP MCP server shutdown complete');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Start the server
main().catch(error => {
  safeLog('error', 'Unhandled error:', error);
  process.exit(1);
});
