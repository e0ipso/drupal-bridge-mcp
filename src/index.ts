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
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import debug from 'debug';
import pinoHttp from 'pino-http';
import { logger, requestSerializer } from './utils/logger.js';
import {
  createDrupalOAuthProvider,
  createOAuthConfigFromEnv,
  DrupalOAuthProvider,
  OAuthConfigManager,
} from '@/oauth';

// Discovery imports
import {
  discoverTools,
  extractRequiredScopes,
  type LocalToolHandler,
  registerDynamicTools,
  type ToolDefinition,
} from '@/discovery';

// Console utilities
import {
  printInfo,
  printSection,
  printStartupBanner,
  printSuccess,
  printWarning,
} from './utils/console.js';

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

  // Session capabilities (ephemeral)
  private sessionCapabilities: Map<string, ClientCapabilities> = new Map();
  // sessionId → capabilities

  private localToolHandlers: Map<string, LocalToolHandler> = new Map();

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

    // Request logging with pino-http
    this.app.use(
      pinoHttp({
        logger,
        customLogLevel: (_req, res, err) => {
          if (res.statusCode >= 500 || err) {
            return 'error';
          }
          if (res.statusCode >= 400) {
            return 'warn';
          }
          return 'info';
        },
        customSuccessMessage: (req, res) => {
          return `${req.method} ${req.url} ${res.statusCode}`;
        },
        customErrorMessage: (req, res, err) => {
          return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
        },
        serializers: {
          req: req =>
            requestSerializer(req, {
              includeHeaders: true,
              includeBody: false,
            }),
        },
      })
    );
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
      this.getSession.bind(this),
      this.localToolHandlers,
      this.oauthProvider
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
        const userId = this.oauthProvider?.getUserIdForSession(closedSessionId);
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
        this.sessionCapabilities.delete(closedSessionId);
        this.oauthProvider?.detachSession(closedSessionId);

        const activeUsers = this.oauthProvider?.getActiveUserCount() ?? 0;
        const activeSessions = this.oauthProvider?.getActiveSessionCount() ?? 0;

        console.log(
          `Active transports: ${this.transports.size}, Active sessions: ${activeSessions}, Active users: ${activeUsers}`
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
    if (!this.oauthProvider) {
      return null;
    }

    try {
      const authorization =
        await this.oauthProvider.getSessionAuthorization(sessionId);

      if (!authorization) {
        debugOAuth(
          `Token lookup FAILED: session ${sessionId} not mapped to an authenticated user`
        );
        return null;
      }

      const redactedToken = this.redactToken(authorization.accessToken);
      debugOAuth(
        `Token lookup SUCCESS: session ${sessionId} (token: ${redactedToken})`
      );

      return authorization;
    } catch (error) {
      debugOAuth(
        `Token lookup error for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Handle explicit user logout
   * Removes user tokens and session mapping
   * @param {string} sessionId Session requesting logout
   * @returns {Promise<void>}
   */
  async handleLogout(sessionId: string): Promise<void> {
    if (!this.oauthProvider) {
      console.log(
        `Logout requested for session ${sessionId}, but OAuth provider is not initialized`
      );
      this.sessionCapabilities.delete(sessionId);
      return;
    }

    const userId = this.oauthProvider.getUserIdForSession(sessionId);

    if (!userId) {
      console.log(`Logout requested for unauthenticated session: ${sessionId}`);
      this.oauthProvider.detachSession(sessionId);
      this.sessionCapabilities.delete(sessionId);
      return;
    }

    await this.oauthProvider.logoutSession(sessionId);

    // Remove session capabilities
    this.sessionCapabilities.delete(sessionId);

    console.log(`User ${userId} logged out - tokens removed`);
    console.log(
      `Active users: ${this.oauthProvider.getActiveUserCount()}, Active sessions: ${this.oauthProvider.getActiveSessionCount()}`
    );
  }

  /**
   * Validates that requested scopes are supported by the OAuth server.
   */
  private validateScopes(
    requestedScopes: string[],
    supportedScopes: string[]
  ): void {
    const unsupportedScopes = requestedScopes.filter(
      scope => !supportedScopes.includes(scope)
    );

    if (unsupportedScopes.length > 0) {
      printWarning(
        'Some requested scopes are not supported by the OAuth server:'
      );
      printInfo(`Unsupported: ${unsupportedScopes.join(', ')}`, 2);
      printInfo(`Supported: ${supportedScopes.join(', ')}`, 2);
      printInfo('These scopes will be ignored during authentication.', 2);
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

    if (!this.oauthProvider) {
      debugOAuth('OAuth provider not initialized. Skipping token capture.');
      return;
    }

    try {
      const stored = this.oauthProvider.captureSessionToken(sessionId, token);
      const userId = this.oauthProvider.getUserIdForSession(sessionId);

      debugOAuth(
        `Token stored for session ${sessionId} → user ${userId || 'unknown'}`
      );
      debugOAuth(
        `Active users: ${this.oauthProvider.getActiveUserCount()}, Active sessions: ${this.oauthProvider.getActiveSessionCount()}`
      );

      if (!stored.refresh_token) {
        debugOAuth(
          'Captured token does not include a refresh token. Automatic refresh will not be available.'
        );
      }
    } catch (error) {
      debugOAuth(
        `Failed to capture token for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`
      );
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
      // Step 1: Validate DRUPAL_BASE_URL early
      const DRUPAL_BASE_URL = process.env.DRUPAL_BASE_URL;
      if (!DRUPAL_BASE_URL) {
        printWarning('DRUPAL_BASE_URL environment variable is required');
        printInfo('Set it in your .env file or environment:', 2);
        printInfo('DRUPAL_BASE_URL=https://your-drupal-site.com', 2);
        process.exit(1);
      }

      // Step 2: Create initial OAuth config
      printInfo('Initializing OAuth configuration...', 1);
      const oauthConfig = createOAuthConfigFromEnv();
      const configManager = new OAuthConfigManager(oauthConfig);

      // Step 3: Discover tools BEFORE OAuth initialization
      printSection('Discovering Tools', '🔍');
      let tools: ToolDefinition[];
      try {
        tools = await discoverTools(
          DRUPAL_BASE_URL,
          undefined // No token for initial discovery
        );
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

      // Step 4: Extract scopes from discovered tools + additional scopes
      const discoveredScopes = extractRequiredScopes(
        tools,
        oauthConfig.additionalScopes
      );

      printInfo(
        `Extracted ${discoveredScopes.length} scopes from tool definitions`,
        2
      );

      if (oauthConfig.additionalScopes.length > 0) {
        printInfo(
          `Additional scopes: ${oauthConfig.additionalScopes.join(', ')}`,
          2
        );
      }

      printInfo(`Total scopes: ${discoveredScopes.join(', ')}`, 2);

      // Step 5: Update config with discovered + additional scopes
      configManager.updateScopes(discoveredScopes);

      // Step 6: Store tools for ListToolsRequest handler
      setDiscoveredTools(tools);
      printSuccess('Tool definitions stored for per-session registration');

      // Step 7: Initialize OAuth with correct scopes (if enabled)
      if (this.config.enableAuth) {
        try {
          printInfo('Initializing OAuth provider...', 1);
          this.oauthProvider = createDrupalOAuthProvider(configManager);
          this.oauthConfigManager = configManager;

          // Step 8: Fetch OAuth metadata
          const metadata = await configManager.fetchMetadata();

          printSuccess('OAuth metadata discovered successfully');
          printInfo(`Issuer: ${metadata.issuer}`, 2);
          printInfo(`Authorization: ${metadata.authorization_endpoint}`, 2);
          printInfo(`Token: ${metadata.token_endpoint}`, 2);

          // Step 9: Validate scopes against server's supported scopes
          if (metadata.scopes_supported) {
            this.validateScopes(
              configManager.getConfig().scopes,
              metadata.scopes_supported
            );
          }

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
              scopesSupported: configManager.getConfig().scopes,
              resourceName: this.config.name,
            })
          );

          printSuccess('OAuth authentication initialized');
          printInfo(`Resource server: ${resourceServerUrl}`, 2);
          printInfo(
            `Scopes: ${configManager.getConfig().scopes.join(', ')}`,
            2
          );
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
      } else {
        console.log('OAuth authentication is disabled');
      }

      // Set up MCP endpoint
      printInfo('🚀 Setting up MCP endpoint...');
      await this.setupMcpEndpoint();

      // Health check endpoint
      this.app.get('/health', (_req, res) => {
        const activeUsers = this.oauthProvider?.getActiveUserCount() ?? 0;
        const activeSessions = this.oauthProvider?.getActiveSessionCount() ?? 0;
        const sessionMappings = this.oauthProvider
          ? Object.fromEntries(this.oauthProvider.getSessionMappings())
          : {};

        res.json({
          status: 'healthy',
          server: this.config.name,
          version: this.config.version,
          authEnabled: this.config.enableAuth,
          timestamp: new Date().toISOString(),

          // Session and authentication state
          activeUsers,
          activeSessions,
          activeTransports: this.transports.size,
          sessionMappings,
        });
      });

      // Debug sessions endpoint
      this.app.get('/debug/sessions', (_req, res) => {
        const sessionMappings = this.oauthProvider
          ? this.oauthProvider.getSessionMappings()
          : [];
        const activeUsers = this.oauthProvider?.getActiveUserIds() ?? [];
        const authenticatedSessions = this.oauthProvider
          ? this.oauthProvider.getAuthenticatedSessionCount()
          : 0;

        res.json({
          sessions: sessionMappings.map(([sessionId, userId]) => ({
            sessionId,
            userId,
            hasTokens: this.oauthProvider?.hasUserTokens(userId) ?? false,
            hasCapabilities: this.sessionCapabilities.has(sessionId),
            hasTransport: this.transports.has(sessionId),
          })),
          transports: Array.from(this.transports.keys()),
          users: activeUsers,
          summary: {
            totalSessions: this.oauthProvider?.getActiveSessionCount() ?? 0,
            totalUsers: this.oauthProvider?.getActiveUserCount() ?? 0,
            totalTransports: this.transports.size,
            authenticatedSessions,
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
              oauthClient: undefined,
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
    this.sessionCapabilities.clear();
    this.oauthProvider?.clearAllSessions();
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

// Export for programmatic use
export { type HttpServerConfig };
export { handleError };
export default main;
