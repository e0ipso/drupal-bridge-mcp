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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import debug from 'debug';

// Debug loggers
const debugRequestIn = debug('mcp:request:in');
const debugOAuth = debug('mcp:oauth');

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);
const PKG_VERSION = packageJson.version;
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

// Console utilities
import {
  printSection,
  printSuccess,
  printInfo,
  printWarning,
  printStartupBanner,
} from './utils/console.js';

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
  // Note: This is called before utilities are imported, so we use plain console
  console.log(
    `📦 Stored ${tools.length} tool definitions for ListToolsRequest handler`
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
  name: process.env.MCP_SERVER_NAME || 'dme-mcp',
  version: process.env.MCP_SERVER_VERSION || PKG_VERSION,
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

    printInfo(
      '🔄 Transport map initialized for per-session Server+Transport instances'
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
        'http://localhost:6274', // Default MCP Inspector port
        'http://localhost:5173', // Common Vite dev server port
        'http://127.0.0.1:6200',
        'http://127.0.0.1:6201',
        'http://127.0.0.1:6202',
        'http://127.0.0.1:6274',
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
          'Content-Type, Authorization, Last-Event-ID, mcp-session-id, mcp-protocol-version'
        );
        res.setHeader(
          'Access-Control-Expose-Headers',
          'mcp-session-id, mcp-protocol-version'
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
      printSuccess('OAuth metadata discovered successfully');
      printInfo(`Issuer: ${metadata.issuer}`, 2);
      printInfo(`Authorization: ${metadata.authorization_endpoint}`, 2);
      printInfo(`Token: ${metadata.token_endpoint}`, 2);

      // Create OAuth provider and Drupal connector as shared instances
      this.oauthProvider = createDrupalOAuthProvider(this.oauthConfigManager);
      this.drupalConnector = new DrupalConnector();

      // Set up OAuth metadata router
      // Use the MCP server's URL as the resource server URL, not Drupal's URL
      const resourceServerUrl = new URL(
        `http://${this.config.host}:${this.config.port}`
      );

      printInfo('🔧 Setting up OAuth metadata router...');
      printInfo(`Resource server: ${resourceServerUrl.href}`, 2);
      printInfo(`Expected well-known endpoints:`, 2);
      const rsPath = resourceServerUrl.pathname;
      const wellKnownPath = `/.well-known/oauth-protected-resource${rsPath === '/' ? '' : rsPath}`;
      printInfo(`- ${resourceServerUrl.origin}${wellKnownPath}`, 4);
      printInfo(
        `- ${resourceServerUrl.origin}/.well-known/oauth-authorization-server`,
        4
      );

      this.app.use(
        mcpAuthMetadataRouter({
          oauthMetadata: metadata,
          resourceServerUrl,
          scopesSupported: oauthConfig.scopes,
          resourceName: this.config.name,
        })
      );

      printSuccess('OAuth authentication initialized');
      printInfo(`Resource server: ${resourceServerUrl}`, 2);
      printInfo(`Scopes: ${oauthConfig.scopes.join(', ')}`, 2);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      printWarning(`OAuth initialization failed: ${errorMessage}`);
      printInfo(
        'Server will start without OAuth. Check DRUPAL_BASE_URL and network.',
        2
      );
      printInfo('To disable this warning, set AUTH_ENABLED=false', 2);
      // Don't throw - allow server to start without OAuth
      this.config.enableAuth = false;
    }
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
    debugOAuth(`Token lookup for session ${sessionId}`);
    debugOAuth(
      `Sessions tracked: ${this.sessionToUser.size}, Users with tokens: ${this.userTokens.size}`
    );

    // Step 1: Get user ID from session mapping
    const userId = this.sessionToUser.get(sessionId);
    if (!userId) {
      debugOAuth(
        `Token lookup FAILED: session ${sessionId} not mapped to user`
      );
      debugOAuth(
        `Available sessions: ${JSON.stringify(Array.from(this.sessionToUser.keys()))}`
      );
      return null; // Session not authenticated
    }

    debugOAuth(`Session ${sessionId} → User ${userId}`);

    // Step 2: Get user tokens from user storage
    const tokens = this.userTokens.get(userId);
    if (!tokens) {
      debugOAuth(`Token lookup FAILED: user ${userId} has no tokens`);
      debugOAuth(
        `Available users: ${JSON.stringify(Array.from(this.userTokens.keys()))}`
      );
      return null; // User tokens expired/logged out
    }

    const redactedToken = this.redactToken(tokens.access_token);
    debugOAuth(`Token lookup SUCCESS: session ${sessionId} → user ${userId}`);
    debugOAuth(`Token found (redacted): ${redactedToken}`);
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
   * Redacts a token for safe logging, showing only last 6 characters
   * @param token - Full token string
   * @returns Redacted token string
   */
  private redactToken(token: string): string {
    if (token.length <= 6) {
      return '***';
    }
    return '***' + token.slice(-6);
  }

  /**
   * Extracts OAuth token from Authorization header and stores session/user mappings
   * @param sessionId - MCP session identifier
   * @param req - Express Request object
   */
  private extractAndStoreTokenFromRequest(
    sessionId: string,
    req: express.Request
  ): void {
    debugOAuth(`Token extraction attempt for session ${sessionId}`);

    // Step 1: Extract Authorization Header
    const authHeader = req.headers['authorization'] as string | undefined;

    debugOAuth(`Authorization header present: ${!!authHeader}`);

    if (!authHeader) {
      debugOAuth(`No Authorization header - skipping token extraction`);
      return; // No token present - not an error, exit gracefully
    }

    debugOAuth(
      `Authorization header format: ${authHeader.startsWith('Bearer ') ? 'Bearer token' : 'Unknown format'}`
    );

    // Step 2: Validate Bearer Token Format
    if (!authHeader.startsWith('Bearer ')) {
      debugOAuth(
        `Invalid Authorization header format for session ${sessionId} - expected "Bearer <token>"`
      );
      return;
    }

    // Step 3: Parse Token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const redactedToken = this.redactToken(token);

    debugOAuth(`Token extracted (redacted): ${redactedToken}`);
    debugOAuth(`Token length: ${token.length} characters`);

    // Step 4: Decode JWT with Error Handling
    let userId: string;
    try {
      userId = extractUserId(token); // Existing utility from jwt-decoder.ts
      debugOAuth(`JWT decoded successfully - User ID: ${userId}`);
    } catch (error) {
      debugOAuth(
        `Token decode failed for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
      debugOAuth(`Failed token (redacted): ${redactedToken}`);
      return; // Invalid token - log warning, exit gracefully
    }

    // Step 5: Check for Reconnection (same user, new session)
    const existingTokens = this.userTokens.get(userId);
    if (existingTokens) {
      // User reconnecting - just update session mapping, reuse tokens
      this.sessionToUser.set(sessionId, userId);
      debugOAuth(
        `User ${userId} reconnecting - mapped session ${sessionId} to existing tokens`
      );
      debugOAuth(
        `Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`
      );
      return;
    }

    // Step 6: Create TokenResponse Structure
    const tokenData: TokenResponse = {
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600, // Default expiry (actual expiry in JWT exp claim)
      refresh_token: undefined, // Not available from Authorization header
      scope: '', // Not available from Authorization header
    };

    // Step 7: Store in Maps
    // Persistent user token storage
    this.userTokens.set(userId, tokenData);

    // Ephemeral session-to-user mapping
    this.sessionToUser.set(sessionId, userId);

    // Step 8: Log Success
    debugOAuth(
      `Token extracted and stored for session ${sessionId} → user ${userId}`
    );
    debugOAuth(`Token stored (redacted): ${redactedToken}`);
    debugOAuth(
      `Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`
    );
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
    printInfo(
      'Setting up MCP endpoint with per-session Server+Transport architecture...',
      2
    );

    // Handle all MCP requests with session routing
    this.app.all('/mcp', async (req, res) => {
      try {
        // Step 0: Log incoming request details
        const authHeader = req.headers['authorization'];
        const redactedAuth = authHeader
          ? `Bearer ${this.redactToken(authHeader.substring(7))}`
          : '(none)';

        debugRequestIn(`${req.method} ${req.path}`);
        debugRequestIn(
          `Headers: ${JSON.stringify(
            {
              'mcp-session-id': req.headers['mcp-session-id'] || '(none)',
              authorization: redactedAuth,
              'content-type': req.headers['content-type'] || '(none)',
              'content-length': req.headers['content-length'] || '(none)',
              'user-agent': req.headers['user-agent'] || '(none)',
            },
            null,
            2
          )}`
        );

        // Log request body if present (for debugging)
        if (req.body) {
          debugRequestIn(`Body: ${JSON.stringify(req.body)}`);
        }

        // Step 1: Extract session ID from header
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        // Step 2: Session routing logic
        if (!sessionId) {
          // Scenario 1: New session request
          const newSessionId = randomUUID();
          debugRequestIn(`Creating new session: ${newSessionId}`);

          const { server, transport } =
            await this.createSessionInstance(newSessionId);
          this.transports.set(newSessionId, { server, transport });

          debugRequestIn(
            `Session ${newSessionId} created. Active sessions: ${this.transports.size}`
          );

          // Extract OAuth token if auth is enabled
          if (this.config.enableAuth) {
            debugOAuth(`Auth enabled - extracting token for new session`);
            this.extractAndStoreTokenFromRequest(newSessionId, req);
          } else {
            debugOAuth(`Auth disabled - skipping token extraction`);
          }

          await transport.handleRequest(req, res);
        } else if (sessionId && this.transports.has(sessionId)) {
          // Scenario 2: Existing session
          debugRequestIn(`Using existing session: ${sessionId}`);
          const { transport } = this.transports.get(sessionId)!;

          // Extract OAuth token if auth is enabled
          if (this.config.enableAuth) {
            debugOAuth(`Auth enabled - extracting token for existing session`);
            this.extractAndStoreTokenFromRequest(sessionId, req);
          } else {
            debugOAuth(`Auth disabled - skipping token extraction`);
          }

          await transport.handleRequest(req, res);
        } else {
          // Scenario 3: Invalid session ID
          debugRequestIn(`Invalid session ID: ${sessionId}`);
          res.status(404).json({
            error: 'Session not found',
            sessionId,
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

    printSuccess('MCP endpoint configured with per-session routing');
  }

  /**
   * Starts the HTTP server
   */
  async start(): Promise<void> {
    try {
      // Initialize OAuth if enabled
      await this.initializeOAuth();

      // ========== NEW: Tool Discovery ==========
      printSection('Discovering Tools', '🔍');

      const DRUPAL_BASE_URL = process.env.DRUPAL_BASE_URL;
      if (!DRUPAL_BASE_URL) {
        printWarning('DRUPAL_BASE_URL environment variable is required');
        printInfo('Set it in your .env file or environment:', 2);
        printInfo('DRUPAL_BASE_URL=https://your-drupal-site.com', 2);
        process.exit(1);
      }

      let tools: ToolDefinition[];
      try {
        tools = await getDiscoveredTools(DRUPAL_BASE_URL);
      } catch (error) {
        printWarning('FATAL: Tool discovery failed');
        printInfo(
          `Error: ${error instanceof Error ? error.message : String(error)}`,
          2
        );
        printInfo('Troubleshooting:', 2);
        printInfo('1. Verify DRUPAL_BASE_URL is correct', 4);
        printInfo('2. Ensure /mcp/tools/list endpoint exists on Drupal', 4);
        printInfo('3. Check network connectivity to Drupal server', 4);
        printInfo('4. Review Drupal logs for errors', 4);
        process.exit(1);
      }

      // Validate we have tools
      if (tools.length === 0) {
        printWarning('FATAL: No tools discovered from /mcp/tools/list');
        printInfo('The MCP server cannot start without any tools.', 2);
        printInfo(
          'Ensure Drupal backend has configured tools at /mcp/tools/list endpoint.',
          2
        );
        process.exit(1);
      }

      printSuccess(`Discovered ${tools.length} tools from Drupal`);
      tools.forEach(tool => {
        printInfo(
          `${tool.name}: ${tool.description.substring(0, 60)}${tool.description.length > 60 ? '...' : ''}`,
          2
        );
      });

      // Store tools for ListToolsRequest handler
      setDiscoveredTools(tools);

      // Note: Dynamic handlers are registered per-session in createSessionInstance()
      printSuccess('Tool definitions stored for per-session registration');

      // ========== END: Tool Discovery ==========

      // Set up MCP endpoint
      printInfo('🚀 Setting up MCP endpoint...');
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
            printStartupBanner({
              name: this.config.name,
              version: this.config.version,
              host: this.config.host,
              port: this.config.port,
              authEnabled: this.config.enableAuth,
              oauthServer: this.oauthConfigManager?.getConfig().drupalUrl,
              oauthClient: this.oauthConfigManager?.getConfig().clientId,
              toolsCount: discoveredToolDefinitions.length,
            });
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
