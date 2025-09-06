/**
 * Main entry point for the Drupal MCP Server executable
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from '@/config/index.js';
import { DrupalMcpServer } from '@/mcp/server.js';

/**
 * Main function to start the MCP server
 */
async function main(): Promise<void> {
  try {
    // Load configuration
    const config = await loadConfig();

    // Create MCP server instance
    const mcpServer = new DrupalMcpServer(config);

    // Create transport (stdio for MCP compatibility)
    const transport = new StdioServerTransport();

    // Connect server to transport
    await mcpServer.getServer().connect(transport);

    console.error('Drupal MCP Server started successfully');
    console.error(`Server: ${config.mcp.name} v${config.mcp.version}`);
    console.error(
      `Drupal endpoint: ${config.drupal.baseUrl}${config.drupal.endpoint}`
    );
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

/**
 * Handle graceful shutdown
 */
process.on('SIGINT', () => {
  console.error('Shutting down MCP server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Shutting down MCP server...');
  process.exit(0);
});

// Start the server
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
