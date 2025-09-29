#!/usr/bin/env node

/**
 * Minimal Drupal MCP Server Entry Point
 *
 * This module provides a minimal Model Context Protocol (MCP) server
 * for interfacing with Drupal via JSON-RPC and OAuth2.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Server configuration interface
 */
interface ServerConfig {
  name: string;
  version: string;
}

/**
 * Default server configuration
 */
const DEFAULT_CONFIG: ServerConfig = {
  name: process.env.MCP_SERVER_NAME || 'dme-mcp',
  version: process.env.MCP_SERVER_VERSION || '1.0.0',
};

/**
 * Main MCP server class
 */
class DrupalMCPServer {
  private server: Server;
  private config: ServerConfig;

  constructor(config: ServerConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.server = new Server(
      {
        name: this.config.name,
        version: this.config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Set up request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'health_check',
            description: 'Check server health status',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name } = request.params;

      switch (name) {
        case 'health_check':
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  status: 'healthy',
                  server: this.config.name,
                  version: this.config.version,
                  timestamp: new Date().toISOString(),
                }),
              },
            ],
          };

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

/**
 * Error handler for uncaught exceptions
 */
function handleError(error: Error): void {
  console.error('Server error:', error);
  process.exit(1);
}

/**
 * Graceful shutdown handler
 */
function handleShutdown(): void {
  console.log('Server shutting down...');
  process.exit(0);
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Set up error handlers
    process.on('uncaughtException', handleError);
    process.on('unhandledRejection', reason => {
      handleError(new Error(`Unhandled rejection: ${reason}`));
    });

    // Set up shutdown handlers
    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);

    // Create and start server
    const server = new DrupalMCPServer();
    await server.start();

    console.log('Drupal MCP Server started successfully');
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)));
  }
}

// Start the server if this module is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(handleError);
}

// Export for programmatic use
export { DrupalMCPServer, type ServerConfig };
export default main;
