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
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import {
  OAuthConfigManager,
  createOAuthConfigFromEnv,
} from './oauth/config.js';
import {
  DrupalOAuthProvider,
  createDrupalOAuthProvider,
} from './oauth/provider.js';
import { DrupalConnector } from './drupal/connector.js';
import { DeviceFlow } from './oauth/device-flow.js';
import type { TokenResponse } from './oauth/device-flow-types.js';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';

// Discovery imports
import {
  getDiscoveredTools,
  registerDynamicTools,
  type ToolDefinition,
} from './discovery/index.js';

/**
 * Discovered tool definitions from /mcp/tools/list endpoint
 * Set during server initialization via setDiscoveredTools()
 */
let discoveredToolDefinitions: ToolDefinition[] = [];

/**
 * Store discovered tools for ListToolsRequest handler
 */
function setDiscoveredTools(tools: ToolDefinition[]): void {
  discoveredToolDefinitions = tools;
  console.log(
    `Stored ${tools.length} tool definitions for ListToolsRequest handler`
  );
}

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
  private oauthProvider?: DrupalOAuthProvider;
  private drupalConnector?: DrupalConnector;
  private transport?: StreamableHTTPServerTransport;
  private sessionTokens: Map<string, TokenResponse> = new Map();
  private sessionCapabilities: Map<string, ClientCapabilities> = new Map();

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
    // CORS headers
    this.app.use((req, res, next) => {
      const origin = req.headers.origin;

      // Default allowed origins include common MCP Inspector ports and localhost variations
      const defaultOrigins = [
        'http://localhost:6200',
        'http://localhost:6201',
        'http://localhost:6202',
        'http://localhost:5173', // Common Vite dev server port
        'http://127.0.0.1:6200',
        'http://127.0.0.1:6201',
        'http://127.0.0.1:6202',
        'http://127.0.0.1:5173',
      ];

      const allowedOrigins = process.env.HTTP_CORS_ORIGINS
        ? process.env.HTTP_CORS_ORIGINS.split(',').map(o => o.trim())
        : defaultOrigins;

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

      // Create OAuth provider and Drupal connector as shared instances
      this.oauthProvider = createDrupalOAuthProvider(this.oauthConfigManager);
      this.drupalConnector = new DrupalConnector();

      // Set up OAuth metadata router
      // Use the MCP server's URL as the resource server URL, not Drupal's URL
      const resourceServerUrl = new URL(
        `http://${this.config.host}:${this.config.port}`
      );

      console.log('Setting up OAuth metadata router...');
      console.log(`  Resource server URL: ${resourceServerUrl.href}`);
      console.log(`  Expected well-known endpoints:`);
      const rsPath = resourceServerUrl.pathname;
      const wellKnownPath = `/.well-known/oauth-protected-resource${rsPath === '/' ? '' : rsPath}`;
      console.log(`    - ${resourceServerUrl.origin}${wellKnownPath}`);
      console.log(
        `    - ${resourceServerUrl.origin}/.well-known/oauth-authorization-server`
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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.warn('⚠️  OAuth initialization failed:', errorMessage);
      console.warn(
        '   Server will start without OAuth. Check your DRUPAL_BASE_URL and network connectivity.'
      );
      console.warn('   To disable this warning, set AUTH_ENABLED=false');
      // Don't throw - allow server to start without OAuth
      this.config.enableAuth = false;
    }
  }

  /**
   * Sets up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools - returns dynamically discovered tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: discoveredToolDefinitions.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema, // Already JSON Schema from discovery
        })),
      };
    });

    // CallToolRequestSchema handler is now registered dynamically
    // via registerDynamicTools() during server startup
  }

  /**
   * Make a JSON-RPC request to Drupal
   * Used by dynamic tool handlers
   */
  private async makeRequest(
    method: string,
    params: unknown,
    token?: string
  ): Promise<unknown> {
    if (!this.drupalConnector) {
      throw new Error('Drupal connector not initialized');
    }

    if (!token) {
      throw new Error('OAuth token required for JSON-RPC requests');
    }

    // Create a JSON-RPC client for this request
    const response = await fetch(
      `${process.env.DRUPAL_BASE_URL}${process.env.DRUPAL_JSONRPC_ENDPOINT || '/jsonrpc'}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params,
          id: randomUUID(),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(
        `JSON-RPC request failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    const jsonRpcResponse = await response.json();

    if (jsonRpcResponse.error) {
      throw new Error(
        `JSON-RPC error: ${jsonRpcResponse.error.message || 'Unknown error'}`
      );
    }

    return jsonRpcResponse.result;
  }

  /**
   * Get session by ID
   * Used by dynamic tool handlers for OAuth
   */
  private async getSession(sessionId: string): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
  } | null> {
    const tokens = this.sessionTokens.get(sessionId);
    if (!tokens) {
      return null;
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    };
  }

  /**
   * Handles device flow authentication for a session
   * @param {string} sessionId Session identifier
   * @returns {Promise<TokenResponse>} OAuth tokens
   * @throws {Error} If device flow is not appropriate or authentication fails
   */
  async handleDeviceFlow(sessionId: string): Promise<TokenResponse> {
    if (!DeviceFlow.shouldUseDeviceFlow()) {
      throw new Error(
        'Device flow not appropriate for this environment. ' +
          'Set OAUTH_FORCE_DEVICE_FLOW=true to force device flow usage.'
      );
    }

    if (!this.oauthConfigManager) {
      throw new Error(
        'OAuth is not configured. Set AUTH_ENABLED=true to enable OAuth.'
      );
    }

    try {
      const config = this.oauthConfigManager.getConfig();
      const metadata = await this.oauthConfigManager.fetchMetadata();

      // Create device flow handler
      const deviceFlow = new DeviceFlow(config, metadata);

      // Execute authentication flow
      const tokens = await deviceFlow.authenticate();

      // Store tokens for this session
      this.sessionTokens.set(sessionId, tokens);

      return tokens;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Device flow authentication failed: ${error.message}`);
      }
      throw new Error('Device flow authentication failed: Unknown error');
    }
  }

  /**
   * Handles browser-based OAuth flow for a session
   * @param {string} sessionId Session identifier
   * @returns {Promise<void>}
   * @throws {Error} If browser flow is not implemented
   */
  async handleBrowserFlow(_sessionId: string): Promise<void> {
    throw new Error(
      'Browser-based OAuth flow not yet implemented. ' +
        'Use device flow for headless environments by setting OAUTH_FORCE_DEVICE_FLOW=true.'
    );
  }

  /**
   * Initializes authentication for a session
   * @param {string} sessionId Session identifier
   * @returns {Promise<void>}
   */
  async initializeAuthentication(sessionId: string): Promise<void> {
    if (!this.config.enableAuth) {
      console.log('OAuth authentication is disabled');
      return;
    }

    if (DeviceFlow.shouldUseDeviceFlow()) {
      console.log('Using device flow for authentication');
      await this.handleDeviceFlow(sessionId);
    } else {
      console.log('Using browser-based flow for authentication');
      await this.handleBrowserFlow(sessionId);
    }
  }

  /**
   * Sets up MCP HTTP endpoint
   */
  private async setupMcpEndpoint(): Promise<void> {
    // Create a single transport instance that handles all sessions
    this.transport = new StreamableHTTPServerTransport({
      // Let the transport generate session IDs automatically
      sessionIdGenerator: () => randomUUID(),
      enableDnsRebindingProtection: true,
      allowedHosts: [
        this.config.host,
        'localhost',
        `localhost:${this.config.port}`,
        `${this.config.host}:${this.config.port}`,
      ],
      onsessionclosed: async (sessionId: string) => {
        console.log(`Session closed: ${sessionId}`);
        // Clean up session tokens when session closes
        this.sessionTokens.delete(sessionId);
        // Clean up session capabilities when session closes
        this.sessionCapabilities.delete(sessionId);
      },
    });

    // Connect the transport to the MCP server
    await this.server.connect(this.transport);

    // Log client capabilities when available
    const capabilities = this.server.getClientCapabilities();
    if (capabilities) {
      console.log('Client capabilities detected:', {
        sampling: capabilities.sampling !== undefined,
        experimental: capabilities.experimental !== undefined,
      });
    }

    // Handle all MCP requests through the single transport
    this.app.all('/mcp', async (req, res) => {
      try {
        await this.transport!.handleRequest(req, res);
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

      // ========== NEW: Tool Discovery ==========
      console.log('\n=== Discovering Tools ===');

      const DRUPAL_BASE_URL = process.env.DRUPAL_BASE_URL;
      if (!DRUPAL_BASE_URL) {
        console.error(
          'ERROR: DRUPAL_BASE_URL environment variable is required'
        );
        console.error('Set it in your .env file or environment:');
        console.error('  DRUPAL_BASE_URL=https://your-drupal-site.com');
        process.exit(1);
      }

      let tools: ToolDefinition[];
      try {
        tools = await getDiscoveredTools(DRUPAL_BASE_URL);
      } catch (error) {
        console.error('\n❌ FATAL: Tool discovery failed');
        console.error(
          'Error:',
          error instanceof Error ? error.message : String(error)
        );
        console.error('\nTroubleshooting:');
        console.error('  1. Verify DRUPAL_BASE_URL is correct');
        console.error('  2. Ensure /mcp/tools/list endpoint exists on Drupal');
        console.error('  3. Check network connectivity to Drupal server');
        console.error('  4. Review Drupal logs for errors');
        process.exit(1);
      }

      // Validate we have tools
      if (tools.length === 0) {
        console.error('\n❌ FATAL: No tools discovered from /mcp/tools/list');
        console.error('The MCP server cannot start without any tools.');
        console.error(
          '\nEnsure Drupal backend has configured tools at /mcp/tools/list endpoint.'
        );
        process.exit(1);
      }

      console.log(`✓ Discovered ${tools.length} tools from Drupal`);
      tools.forEach(tool => {
        console.log(
          `  - ${tool.name}: ${tool.description.substring(0, 60)}${tool.description.length > 60 ? '...' : ''}`
        );
      });

      // Store tools for ListToolsRequest handler
      setDiscoveredTools(tools);

      // Register dynamic handlers
      console.log('\n=== Registering Dynamic Handlers ===');
      try {
        registerDynamicTools(
          this.server,
          tools,
          this.makeRequest.bind(this),
          this.getSession.bind(this)
        );
      } catch (error) {
        console.error('\n❌ FATAL: Dynamic handler registration failed');
        console.error(
          'Error:',
          error instanceof Error ? error.message : String(error)
        );
        process.exit(1);
      }

      // ========== END: Tool Discovery ==========

      // Set up MCP endpoint
      await this.setupMcpEndpoint();

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
            console.log('\n=== MCP Server Started ===');
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
            console.log(
              `Tools Registered: ${discoveredToolDefinitions.length}`
            );
            console.log('='.repeat(60));
            console.log(
              `\n✅ MCP Server started successfully with ${discoveredToolDefinitions.length} tools`
            );
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

    // Close the transport if it exists
    if (this.transport) {
      try {
        await this.transport.close();
        console.log('Transport closed');
      } catch (error) {
        console.error('Error closing transport:', error);
      }
    }

    // Clear session tokens
    this.sessionTokens.clear();
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
