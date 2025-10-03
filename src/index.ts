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
import { extractUserId } from './oauth/jwt-decoder.js';
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
  private transports: Map<
    string,
    {
      server: Server;
      transport: StreamableHTTPServerTransport;
    }
  >;
  private app: Application;
  private config: HttpServerConfig;
  private oauthConfigManager?: OAuthConfigManager;
  private oauthProvider?: DrupalOAuthProvider;
  private drupalConnector?: DrupalConnector;

  // User-level token storage (persistent across reconnections)
  private userTokens: Map<string, TokenResponse> = new Map();
  // userId → { access_token, refresh_token, expires_in }

  // Session-to-user mapping (ephemeral)
  private sessionToUser: Map<string, string> = new Map();
  // sessionId → userId

  // Session capabilities (ephemeral)
  private sessionCapabilities: Map<string, ClientCapabilities> = new Map();
  // sessionId → capabilities

  constructor(config: HttpServerConfig = DEFAULT_HTTP_CONFIG) {
    this.config = config;

    // Initialize transports map
    this.transports = new Map();

    this.app = express();
    this.setupMiddleware();

    console.log(
      'Transport map initialized for per-session Server+Transport instances'
    );
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
          'Content-Type, Authorization, Last-Event-ID, mcp-session-id'
        );
        res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
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
   * Check if request body contains an initialize method
   */
  private isInitializeRequest(body: any): boolean {
    return body && body.method === 'initialize';
  }

  /**
   * Create a new Server and Transport instance for a session
   */
  private async createSessionInstance(sessionId: string): Promise<{
    server: Server;
    transport: StreamableHTTPServerTransport;
  }> {
    // Create server with same configuration
    const server = new Server(
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

    // Set up tool handlers (same as original setupHandlers)
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: discoveredToolDefinitions.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Register dynamic tool handlers for this server instance
    registerDynamicTools(
      server,
      discoveredToolDefinitions,
      this.makeRequest.bind(this),
      this.getSession.bind(this)
    );

    // Create transport
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      enableDnsRebindingProtection: true,
      allowedHosts: [
        this.config.host,
        'localhost',
        `localhost:${this.config.port}`,
        `${this.config.host}:${this.config.port}`,
      ],
      onsessionclosed: async (closedSessionId: string) => {
        const userId = this.sessionToUser.get(closedSessionId);
        console.log(
          `Session closed: ${closedSessionId} (user: ${userId || 'unauthenticated'})`
        );

        // Step 1: Retrieve Server+Transport for cleanup
        const sessionInstance = this.transports.get(closedSessionId);

        if (sessionInstance) {
          const { server, transport } = sessionInstance;

          // Step 2: Close transport
          try {
            await transport.close();
            console.log(`Transport closed for session ${closedSessionId}`);
          } catch (error) {
            console.error(
              `Error closing transport for session ${closedSessionId}:`,
              error
            );
          }

          // Step 3: Close server (if method exists)
          try {
            if (typeof server.close === 'function') {
              await server.close();
              console.log(`Server closed for session ${closedSessionId}`);
            }
          } catch (error) {
            console.error(
              `Error closing server for session ${closedSessionId}:`,
              error
            );
          }

          // Step 4: Remove from transports map
          this.transports.delete(closedSessionId);
        }

        // Step 5: Clean session mappings (existing Plan 8 logic)
        this.sessionToUser.delete(closedSessionId);
        this.sessionCapabilities.delete(closedSessionId);

        // Step 6: DO NOT remove user tokens - they persist for reconnection

        console.log(
          `Active sessions: ${this.transports.size}, Active users: ${this.userTokens.size}`
        );
      },
    });

    // Connect server to transport
    await server.connect(transport);
    console.log(`Server+Transport created for session ${sessionId}`);

    return { server, transport };
  }

  /**
   * Invoke a tool via A2A /mcp/tools/invoke endpoint
   * Used by dynamic tool handlers
   */
  private async makeRequest(
    toolName: string,
    params: unknown,
    token?: string
  ): Promise<unknown> {
    if (!this.drupalConnector) {
      throw new Error('Drupal connector not initialized');
    }

    // Build headers - include auth if available
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Use A2A standard /mcp/tools/invoke endpoint
    const endpoint = process.env.DRUPAL_JSONRPC_ENDPOINT || '/mcp/tools/invoke';
    const response = await fetch(`${process.env.DRUPAL_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: toolName,
        arguments: params,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Tool invocation failed: HTTP ${response.status} ${response.statusText}`
      );
    }

    const result = await response.json();

    // A2A response is direct result (no JSON-RPC envelope)
    return result;
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
    // Step 1: Get user ID from session mapping
    const userId = this.sessionToUser.get(sessionId);
    if (!userId) {
      console.log(
        `Token lookup failed: session ${sessionId} not mapped to user`
      );
      return null; // Session not authenticated
    }

    // Step 2: Get user tokens from user storage
    const tokens = this.userTokens.get(userId);
    if (!tokens) {
      console.log(`Token lookup failed: user ${userId} has no tokens`);
      return null; // User tokens expired/logged out
    }

    console.log(`Token lookup success: session ${sessionId} → user ${userId}`);
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

      // Extract user ID from access token
      let userId: string;
      try {
        userId = extractUserId(tokens.access_token);
        console.log(`Extracted user ID from token: ${userId}`);
      } catch (error) {
        // Fallback: use session ID as user ID if JWT extraction fails
        console.warn(
          `Failed to extract user ID from token, using session ID as fallback:`,
          error
        );
        userId = sessionId;
      }

      // Check if user already has tokens (reconnection scenario)
      const existingTokens = this.userTokens.get(userId);
      if (existingTokens) {
        console.log(`User ${userId} reconnecting - reusing existing tokens`);
        // Update session-to-user mapping for new session
        this.sessionToUser.set(sessionId, userId);
        console.log(`Session ${sessionId} mapped to existing user ${userId}`);
        console.log(
          `Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`
        );
        return existingTokens; // Reuse existing tokens
      }

      // New user authentication: store tokens by user ID
      this.userTokens.set(userId, tokens);
      console.log(`Stored tokens for new user ${userId}`);

      // Map session to user (ephemeral)
      this.sessionToUser.set(sessionId, userId);
      console.log(`Session ${sessionId} authenticated as user ${userId}`);
      console.log(
        `Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`
      );

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
   * Handle explicit user logout
   * Removes user tokens and session mapping
   * @param {string} sessionId Session requesting logout
   * @returns {Promise<void>}
   */
  async handleLogout(sessionId: string): Promise<void> {
    const userId = this.sessionToUser.get(sessionId);

    if (!userId) {
      console.log(`Logout requested for unauthenticated session: ${sessionId}`);
      return;
    }

    // Remove user tokens (persistent storage)
    this.userTokens.delete(userId);
    console.log(`User ${userId} logged out - tokens removed`);

    // Remove session-to-user mapping (ephemeral)
    this.sessionToUser.delete(sessionId);

    // Remove session capabilities
    this.sessionCapabilities.delete(sessionId);

    console.log(
      `Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`
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
   * Sets up MCP HTTP endpoint with per-session Server+Transport instances
   *
   * ARCHITECTURE: Each client session gets its own Server and Transport pair.
   * When a client sends an initialize request without a session ID, we create
   * a new session with dedicated Server+Transport instances. Subsequent requests
   * from that client include the session ID and are routed to the correct transport.
   *
   * Session lifecycle:
   * 1. Client sends initialize request → New session ID generated
   * 2. Server+Transport pair created for that session ID
   * 3. Stored in transports map: sessionId → {server, transport}
   * 4. Client sends subsequent requests with session ID header
   * 5. Requests routed to correct transport based on session ID
   * 6. Client disconnects → onsessionclosed callback fires (cleanup in Task 3)
   */
  private async setupMcpEndpoint(): Promise<void> {
    console.log(
      'Setting up MCP endpoint with per-session Server+Transport architecture...'
    );

    // Handle all MCP requests with session routing
    this.app.all('/mcp', async (req, res) => {
      try {
        // Step 1: Extract session ID from header
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // Step 2: Session routing logic
        if (!sessionId && this.isInitializeRequest(req.body)) {
          // Scenario 1: New initialize request
          const newSessionId = randomUUID();
          console.log(`Creating new session: ${newSessionId}`);

          const { server, transport } =
            await this.createSessionInstance(newSessionId);
          this.transports.set(newSessionId, { server, transport });

          console.log(
            `Session ${newSessionId} created. Active sessions: ${this.transports.size}`
          );

          await transport.handleRequest(req, res);
        } else if (sessionId && this.transports.has(sessionId)) {
          // Scenario 2: Existing session
          const { transport } = this.transports.get(sessionId)!;
          await transport.handleRequest(req, res);
        } else if (sessionId) {
          // Scenario 3: Invalid session ID
          console.warn(`Invalid session ID: ${sessionId}`);
          res.status(404).json({
            error: 'Session not found',
            sessionId,
          });
        } else {
          // Scenario 4: No session ID and not initialize request
          console.warn('Request without session ID and not initialize request');
          res.status(400).json({
            error:
              'Bad Request: Session ID required or send initialize request',
          });
        }
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

    console.log('✓ MCP endpoint configured with per-session routing');
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

      // Note: Dynamic handlers are registered per-session in createSessionInstance()
      console.log('✓ Tool definitions stored for per-session registration');

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

          // Session and authentication state
          activeUsers: this.userTokens.size,
          activeSessions: this.sessionToUser.size,
          activeTransports: this.transports.size,
          sessionMappings: Object.fromEntries(this.sessionToUser.entries()),
        });
      });

      // Debug sessions endpoint
      this.app.get('/debug/sessions', (_req, res) => {
        res.json({
          sessions: Array.from(this.sessionToUser.entries()).map(
            ([sessionId, userId]) => ({
              sessionId,
              userId,
              hasTokens: this.userTokens.has(userId),
              hasCapabilities: this.sessionCapabilities.has(sessionId),
              hasTransport: this.transports.has(sessionId),
            })
          ),
          transports: Array.from(this.transports.keys()),
          users: Array.from(this.userTokens.keys()),
          summary: {
            totalSessions: this.sessionToUser.size,
            totalUsers: this.userTokens.size,
            totalTransports: this.transports.size,
            authenticatedSessions: Array.from(
              this.sessionToUser.values()
            ).filter(userId => this.userTokens.has(userId)).length,
          },
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

    // Close all transports in the map
    console.log(`Closing ${this.transports.size} active sessions...`);

    for (const [
      sessionId,
      { server, transport },
    ] of this.transports.entries()) {
      try {
        // Close transport
        await transport.close();
        console.log(`Transport closed for session ${sessionId}`);

        // Close server (if method exists)
        if (typeof server.close === 'function') {
          await server.close();
          console.log(`Server closed for session ${sessionId}`);
        }
      } catch (error) {
        console.error(`Error closing session ${sessionId}:`, error);
        // Continue with next session even if this one fails
      }
    }

    // Clear the map
    this.transports.clear();
    console.log('All transports closed');

    // Clear all session and user data
    this.userTokens.clear();
    this.sessionToUser.clear();
    this.sessionCapabilities.clear();
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
