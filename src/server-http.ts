#!/usr/bin/env node

/**
 * OAuth-Enabled Drupal MCP Server with HTTP Transport
 *
 * This module provides an HTTP-based MCP server with OAuth 2.1 authentication
 * using StreamableHTTP transport and Drupal OAuth integration.
 */

import express, { type Application } from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { mcpAuthMetadataRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import {
  OAuthConfigManager,
  createOAuthConfigFromEnv,
} from './oauth/config.js';
import { createDrupalOAuthProvider } from './oauth/provider.js';

/**
 * HTTP server configuration interface
 */
interface HttpServerConfig {
  name: string;
  version: string;
  port: number;
  host: string;
  enableAuth: boolean;
}

/**
 * Default HTTP server configuration
 */
const DEFAULT_HTTP_CONFIG: HttpServerConfig = {
  name: process.env.MCP_SERVER_NAME || 'drupal-mcp-server',
  version: process.env.MCP_SERVER_VERSION || '1.0.0',
  port: parseInt(process.env.HTTP_PORT || '6200', 10),
  host: process.env.HTTP_HOST || 'localhost',
  enableAuth: process.env.AUTH_ENABLED?.toLowerCase() === 'true',
};

/**
 * OAuth-enabled HTTP MCP server class
 */
export class DrupalMCPHttpServer {
  private server: Server;
  private app: Application;
  private config: HttpServerConfig;
  private oauthConfigManager?: OAuthConfigManager;
  private sessionTransports: Map<string, StreamableHTTPServerTransport> =
    new Map();

  constructor(config: HttpServerConfig = DEFAULT_HTTP_CONFIG) {
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

    this.app = express();
    this.setupMiddleware();
    this.setupHandlers();
  }

  /**
   * Sets up Express middleware
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // CORS headers
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;
      const allowedOrigins = process.env.HTTP_CORS_ORIGINS?.split(',') || [
        'http://localhost:6200',
      ];

      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, DELETE, OPTIONS'
        );
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization, Last-Event-ID'
        );
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }

      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }

      next();
    });

    // Request logging
    this.app.use((req, _res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Initializes OAuth if enabled
   */
  private async initializeOAuth(): Promise<void> {
    if (!this.config.enableAuth) {
      console.log('OAuth authentication is disabled');
      return;
    }

    try {
      // Create OAuth configuration from environment
      const oauthConfig = createOAuthConfigFromEnv();
      this.oauthConfigManager = new OAuthConfigManager(oauthConfig);

      // Fetch metadata to validate configuration
      const metadata = await this.oauthConfigManager.fetchMetadata();
      console.log('OAuth metadata discovered successfully');
      console.log(`  Issuer: ${metadata.issuer}`);
      console.log(
        `  Authorization endpoint: ${metadata.authorization_endpoint}`
      );
      console.log(`  Token endpoint: ${metadata.token_endpoint}`);

      // Create OAuth provider (available for future use in authenticated requests)
      const _oauthProvider = createDrupalOAuthProvider(this.oauthConfigManager);

      // Set up OAuth metadata router
      const resourceServerUrl = new URL(
        oauthConfig.resourceServerUrl || oauthConfig.drupalUrl
      );

      this.app.use(
        mcpAuthMetadataRouter({
          oauthMetadata: metadata,
          resourceServerUrl,
          scopesSupported: oauthConfig.scopes,
          resourceName: this.config.name,
        })
      );

      console.log('OAuth authentication initialized');
      console.log(`  Resource server: ${resourceServerUrl}`);
      console.log(`  Scopes: ${oauthConfig.scopes.join(', ')}`);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to initialize OAuth: ${error.message}`);
      }
      throw new Error('Failed to initialize OAuth: Unknown error');
    }
  }

  /**
   * Sets up MCP request handlers
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
          {
            name: 'auth_status',
            description: 'Check OAuth authentication status',
            inputSchema: {
              type: 'object',
              properties: {},
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request, _extra) => {
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
                    authEnabled: this.config.enableAuth,
                    timestamp: new Date().toISOString(),
                  }),
                },
              ],
            };

          case 'auth_status': {
            // Note: AuthInfo would be available in extra._meta.authInfo when using OAuth middleware
            // For now, return basic status based on auth configuration
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    authEnabled: this.config.enableAuth,
                    message: this.config.enableAuth
                      ? 'OAuth authentication is enabled'
                      : 'OAuth authentication is disabled',
                  }),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      }
    );
  }

  /**
   * Sets up MCP HTTP endpoint
   */
  private setupMcpEndpoint(): void {
    this.app.all('/mcp', async (req, res) => {
      try {
        // Get or create session ID
        let sessionId = req.headers['x-session-id'] as string | undefined;

        if (!sessionId) {
          sessionId = randomUUID();
          res.setHeader('X-Session-ID', sessionId);
        }

        // Get or create transport for this session
        let transport = this.sessionTransports.get(sessionId);

        if (!transport) {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => sessionId!,
            enableDnsRebindingProtection: true,
            allowedHosts: [this.config.host, 'localhost'],
            onsessionclosed: async (closedSessionId: string) => {
              console.log(`Session closed: ${closedSessionId}`);
              this.sessionTransports.delete(closedSessionId);
            },
          });

          await this.server.connect(transport);
          this.sessionTransports.set(sessionId, transport);
          console.log(`New session created: ${sessionId}`);
        }

        // Handle the request
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    });
  }

  /**
   * Starts the HTTP server
   */
  async start(): Promise<void> {
    try {
      // Initialize OAuth if enabled
      await this.initializeOAuth();

      // Set up MCP endpoint
      this.setupMcpEndpoint();

      // Health check endpoint
      this.app.get('/health', (_req, res) => {
        res.json({
          status: 'healthy',
          server: this.config.name,
          version: this.config.version,
          authEnabled: this.config.enableAuth,
          timestamp: new Date().toISOString(),
        });
      });

      // Start listening
      return new Promise((resolve, reject) => {
        try {
          this.app.listen(this.config.port, this.config.host, () => {
            console.log('='.repeat(60));
            console.log(`${this.config.name} v${this.config.version}`);
            console.log('='.repeat(60));
            console.log(
              `HTTP Server: http://${this.config.host}:${this.config.port}`
            );
            console.log(
              `MCP Endpoint: http://${this.config.host}:${this.config.port}/mcp`
            );
            console.log(
              `Health Check: http://${this.config.host}:${this.config.port}/health`
            );
            console.log(
              `Auth Enabled: ${this.config.enableAuth ? 'Yes' : 'No'}`
            );
            if (this.config.enableAuth && this.oauthConfigManager) {
              const config = this.oauthConfigManager.getConfig();
              console.log(`OAuth Server: ${config.drupalUrl}`);
              console.log(`OAuth Client: ${config.clientId}`);
            }
            console.log('='.repeat(60));
            resolve();
          });
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      if (error instanceof Error) {
        console.error('Failed to start HTTP server:', error.message);
      } else {
        console.error('Failed to start HTTP server:', error);
      }
      throw error;
    }
  }

  /**
   * Stops the HTTP server
   */
  async stop(): Promise<void> {
    console.log('Shutting down HTTP server...');

    // Close all session transports
    for (const [sessionId, transport] of this.sessionTransports) {
      try {
        await transport.close();
        console.log(`Closed session: ${sessionId}`);
      } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
      }
    }

    this.sessionTransports.clear();
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
async function handleShutdown(server: DrupalMCPHttpServer): Promise<void> {
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const server = new DrupalMCPHttpServer();

    // Set up error handlers
    process.on('uncaughtException', handleError);
    process.on('unhandledRejection', reason => {
      handleError(new Error(`Unhandled rejection: ${reason}`));
    });

    // Set up shutdown handlers
    process.on('SIGINT', () => handleShutdown(server));
    process.on('SIGTERM', () => handleShutdown(server));

    // Start the server
    await server.start();
  } catch (error) {
    handleError(error instanceof Error ? error : new Error(String(error)));
  }
}

// Start the server if this module is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(handleError);
}

// Export for programmatic use
export { type HttpServerConfig };
export default main;
