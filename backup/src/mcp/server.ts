/**
 * MCP server implementation for Drupal integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { AppConfig } from '@/config/index.js';
import { createOAuthProvider } from '@/config/index.js';
import type {
  McpResource,
  McpTool,
  McpPrompt,
  SearchContentResponse,
  TutorialSearchResult,
} from '@/types/index.js';
import { DrupalClient, DrupalClientError } from '@/services/drupal-client.js';
import {
  validateSearchContentParams,
  ValidationError,
} from '@/utils/validation.js';
import {
  IntegrationError,
  IntegrationErrorType,
  normalizeError,
  formatMcpErrorResponse,
  formatErrorForLogging,
} from '@/utils/error-handler.js';
import {
  AuthenticationRequiredError,
  createMcpErrorResponse,
  McpOAuthProvider,
  type AuthContext,
} from '@/auth/index.js';
import { createChildLogger, isLoggerInitialized } from '@/utils/logger.js';
import createDebug from 'debug';

const debug = createDebug('mcp:server');

/**
 * MCP server for Drupal integration
 */
export class DrupalMcpServer {
  private readonly server: Server;
  private readonly drupalClient: DrupalClient;
  private readonly mcpOAuthProvider: McpOAuthProvider | null;
  private requestCounter = 0;

  constructor(private readonly config: AppConfig) {
    debug('Initializing Drupal MCP Server...');
    const logger = isLoggerInitialized()
      ? createChildLogger({ component: 'server' })
      : null;
    logger?.info('Initializing Drupal MCP Server...');

    debug('Step 1/5: Creating MCP Server instance...');
    logger?.info('Step 1/5: Creating MCP Server instance...');
    this.server = new Server(
      {
        name: config.mcp.name,
        version: config.mcp.version,
      },
      {
        capabilities: {
          resources: config.mcp.capabilities.resources,
          tools: config.mcp.capabilities.tools,
          prompts: config.mcp.capabilities.prompts,
        },
      }
    );
    debug(`✓ MCP Server created: ${config.mcp.name} v${config.mcp.version}`);
    logger?.info('MCP Server created', {
      name: config.mcp.name,
      version: config.mcp.version,
    });
    debug(`- Protocol version: ${config.mcp.protocolVersion}`);
    debug(
      `- Resources enabled: ${config.mcp.capabilities.resources?.subscribe ? 'YES' : 'NO'}`
    );
    debug(
      `- Tools enabled: ${config.mcp.capabilities.tools?.listChanged ? 'YES' : 'NO'}`
    );
    debug(
      `- Prompts enabled: ${config.mcp.capabilities.prompts?.listChanged ? 'YES' : 'NO'}`
    );

    debug('Step 2/5: Initializing Drupal client...');
    logger?.info('Step 2/5: Initializing Drupal client...');
    this.drupalClient = new DrupalClient(config.drupal);
    debug(`✓ Drupal client initialized`);
    logger?.info('Drupal client initialized', {
      baseUrl: config.drupal.baseUrl,
      endpoint: config.drupal.endpoint,
      timeout: config.drupal.timeout,
      retries: config.drupal.retries,
    });
    debug(`- Base URL: ${config.drupal.baseUrl}`);
    debug(`- Endpoint: ${config.drupal.endpoint}`);
    debug(`- Timeout: ${config.drupal.timeout}ms`);
    debug(`- Retries: ${config.drupal.retries}`);

    debug('Step 3/5: Setting up OAuth providers...');
    logger?.info('Step 3/5: Setting up OAuth providers...');
    // Initialize authentication components with new MCP OAuth provider (OAuth 2.1 stateless design)
    this.mcpOAuthProvider = createOAuthProvider(config);

    if (this.mcpOAuthProvider) {
      debug('✓ MCP OAuth provider initialized (OAuth 2.1 stateless)');
      logger?.info('MCP OAuth provider initialized (OAuth 2.1 stateless)');
      debug('✓ OAuth provider configured');
      logger?.info('OAuth provider configured');
    } else {
      debug('✓ Authentication disabled, OAuth provider skipped');
      logger?.info('Authentication disabled, OAuth provider skipped');
    }

    debug('Step 4/5: Setting up request handlers...');
    logger?.info('Step 4/5: Setting up request handlers...');
    this.setupHandlers();
    debug('✓ Request handlers configured');
    logger?.info('Request handlers configured');

    debug('Step 5/5: Server initialization complete');
    logger?.info('Step 5/5: Server initialization complete');
    debug(`🎯 Server ready to accept connections`);
    logger?.info('Server ready to accept connections');
  }

  /**
   * Generate unique request ID for tracing
   */
  private generateRequestId(): string {
    return `mcp-req-${Date.now()}-${++this.requestCounter}`;
  }

  /**
   * Format standard auth response structure
   */
  private formatAuthResponse(
    success: boolean,
    data: Record<string, unknown>,
    error?: string
  ): Record<string, unknown> {
    const baseResponse: Record<string, unknown> = { success };

    if (success) {
      return { ...baseResponse, ...data };
    } else {
      return { ...baseResponse, error, ...data };
    }
  }

  /**
   * Format auth status response with consistent structure
   */
  private formatAuthStatusResponse(
    authContext: AuthContext,
    tokenInfo: unknown
  ): Record<string, unknown> {
    return {
      isAuthenticated: authContext.isAuthenticated,
      userId: authContext.userId,
      scopes: authContext.scopes,
      tokenInfo,
      provider: 'McpOAuthProvider (OAuth 2.1 Stateless)',
      configInfo: {
        authEnabled: this.config.auth.enabled,
        endpointsDiscovered: !!this.config.oauth.discoveredEndpoints,
        authorizationEndpoint: this.config.oauth.authorizationEndpoint,
        tokenEndpoint: this.config.oauth.tokenEndpoint,
      },
    };
  }

  /**
   * Simplified authentication check for OAuth 2.1 stateless design
   */
  private async requireAuthentication(): Promise<AuthContext> {
    // If authentication is disabled entirely, allow access
    if (!this.config.auth.enabled || !this.mcpOAuthProvider) {
      return { isAuthenticated: true };
    }

    try {
      // Try to get valid access token from new MCP OAuth provider first
      const validToken = await this.mcpOAuthProvider.getValidAccessToken();

      if (validToken) {
        // OAuth 2.1 tokens are stateless - no user info stored in token
        return {
          isAuthenticated: true,
          userId: 'default', // OAuth 2.1 stateless design - derive from token claims if needed
          scopes: this.config.auth.requiredScopes,
          accessToken: validToken,
        };
      }

      // Using MCP OAuth provider for authentication

      return { isAuthenticated: false };
    } catch (error) {
      const logger = isLoggerInitialized()
        ? createChildLogger({ component: 'server' })
        : null;
      logger?.error({ err: error }, 'Authentication error');
      return { isAuthenticated: false };
    }
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    debug('Registering MCP request handlers...');

    // List available resources
    debug('- Registering ListResources handler');
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: await this.getResources(),
      };
    });

    // Read specific resource
    debug('- Registering ReadResource handler');
    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      return this.readResource(request.params.uri);
    });

    // List available tools
    debug('- Registering ListTools handler');
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    // Execute tool (with authentication)
    debug('- Registering CallTool handler (with auth)');
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      return this.executeToolWithAuth(
        request.params.name,
        request.params.arguments
      );
    });

    // List available prompts
    debug('- Registering ListPrompts handler');
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: this.getPrompts(),
      };
    });

    // Get prompt
    debug('- Registering GetPrompt handler');
    this.server.setRequestHandler(GetPromptRequestSchema, async request => {
      return this.getPrompt(request.params.name, request.params.arguments);
    });

    const toolCount = this.getTools().length;
    const promptCount = this.getPrompts().length;

    debug(`✓ All handlers registered successfully`);
    debug(`- Available tools: ${toolCount}`);
    debug(`- Available resources: 2 (nodes, entities)`);
    debug(`- Available prompts: ${promptCount}`);
  }

  /**
   * Get available resources
   */
  public async getResources(): Promise<McpResource[]> {
    const resources: McpResource[] = [
      {
        uri: 'drupal://nodes',
        name: 'Drupal Nodes',
        description: 'Access to Drupal node content',
        mimeType: 'application/json',
      },
      {
        uri: 'drupal://entities',
        name: 'Drupal Entities',
        description: 'Access to Drupal entity data',
        mimeType: 'application/json',
      },
    ];

    return resources;
  }

  /**
   * Read a specific resource
   */
  public async readResource(uri: string): Promise<{
    contents: Array<{ uri: string; mimeType?: string; text?: string }>;
  }> {
    try {
      let content: unknown;

      switch (uri) {
        case 'drupal://nodes':
          content = await this.drupalClient.getNodes({ limit: 10 });
          break;

        case 'drupal://entities':
          content = await this.drupalClient.queryEntities('node', undefined, {
            limit: 10,
          });
          break;

        default:
          throw new IntegrationError(
            IntegrationErrorType.VALIDATION_ERROR,
            `Unknown resource URI: ${uri}`,
            undefined,
            'uri',
            { validUris: ['drupal://nodes', 'drupal://entities'] },
            undefined,
            false
          );
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2),
          },
        ],
      };
    } catch (error) {
      const integrationError =
        error instanceof IntegrationError
          ? error
          : normalizeError(error, `Reading resource: ${uri}`);

      // Log the error for debugging
      const logData = formatErrorForLogging(integrationError, { uri });
      console[logData.level](logData.message, logData.meta);

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                error: {
                  type: integrationError.errorType,
                  message: integrationError.getUserFriendlyMessage(),
                  details: {
                    technical_message: integrationError.message,
                    timestamp: new Date().toISOString(),
                    retryable: integrationError.retryable,
                  },
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  }

  /**
   * Get available tools
   */
  public getTools(): McpTool[] {
    const authTools: McpTool[] = [
      {
        name: 'auth_login',
        description: 'Authenticate with Drupal OAuth',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'auth_status',
        description: 'Check current authentication status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'auth_logout',
        description: 'Logout and clear stored tokens',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];

    const dataTools: McpTool[] = [
      {
        name: 'load_node',
        description: 'Load a Drupal node by ID',
        inputSchema: {
          type: 'object',
          properties: {
            nodeId: {
              type: ['string', 'number'],
              description: 'The node ID to load',
            },
          },
          required: ['nodeId'],
        },
      },
      {
        name: 'create_node',
        description: 'Create a new Drupal node',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'The node type (e.g., "article", "page")',
            },
            title: {
              type: 'string',
              description: 'The node title',
            },
            body: {
              type: 'string',
              description: 'The node body content',
            },
            status: {
              type: 'boolean',
              description: 'Whether the node is published',
              default: true,
            },
          },
          required: ['type', 'title'],
        },
      },
      {
        name: 'search_nodes',
        description: 'Search for Drupal nodes',
        inputSchema: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Filter by node type',
            },
            status: {
              type: 'boolean',
              description: 'Filter by published status',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results',
              default: 10,
              minimum: 1,
              maximum: 100,
            },
          },
        },
      },
      {
        name: 'test_connection',
        description: 'Test connection to Drupal server',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'search_tutorials',
        description:
          'Search Drupalize.me tutorials with filtering by content types, Drupal versions, categories, and sorting options',
        inputSchema: {
          type: 'object',
          properties: {
            keywords: {
              type: 'string',
              description: 'Search keywords (minimum 2 characters)',
              minLength: 2,
            },
            types: {
              type: 'array',
              description:
                'Filter by content types (defaults to ["tutorial", "topic", "course"])',
              items: {
                type: 'string',
                enum: ['tutorial', 'topic', 'course', 'video', 'guide'],
              },
            },
            drupal_version: {
              type: 'array',
              description: 'Filter by Drupal versions',
              items: {
                type: 'string',
                enum: ['9', '10', '11'],
              },
            },
            category: {
              type: 'array',
              description: 'Filter by tutorial categories/tags',
              items: {
                type: 'string',
              },
            },
            sort: {
              type: 'string',
              description: 'Sort results by relevance, date, or title',
              enum: ['search_api_relevance', 'created', 'changed', 'title'],
            },
            page: {
              type: 'object',
              description: 'Pagination settings',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Number of results per page',
                  minimum: 1,
                  maximum: 100,
                  default: 10,
                },
                offset: {
                  type: 'number',
                  description: 'Number of results to skip',
                  minimum: 0,
                  default: 0,
                },
              },
            },
          },
          required: ['keywords'],
        },
      },
    ];

    return [...authTools, ...dataTools];
  }

  /**
   * Execute a tool with authentication
   */
  public async executeToolWithAuth(
    name: string,
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const requestId = this.generateRequestId();

    try {
      // Handle authentication tools separately
      if (name.startsWith('auth_')) {
        return await this.executeAuthTool(name, args);
      }

      // For data tools, check if auth is required and provider exists
      if (this.mcpOAuthProvider) {
        const authContext = await this.requireAuthentication();

        if (!authContext.isAuthenticated) {
          throw new AuthenticationRequiredError(
            'Please authenticate first using auth_login tool'
          );
        }

        // Update Drupal client with access token
        if (authContext.accessToken) {
          this.drupalClient.setAccessToken(authContext.accessToken);
        }
      }

      return await this.executeTool(name, args);
    } catch (error) {
      if (error instanceof AuthenticationRequiredError) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                createMcpErrorResponse(requestId, error),
                null,
                2
              ),
            },
          ],
        };
      }

      throw error;
    }
  }

  /**
   * Execute authentication tools
   */
  private async executeAuthTool(
    name: string,
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    // Check if authentication is disabled first
    if (!this.config.auth.enabled) {
      debug(`Auth tool called with authentication disabled: ${name}`);
      const logger = isLoggerInitialized()
        ? createChildLogger({ component: 'server' })
        : null;
      logger?.info('Auth tool called with authentication disabled', {
        toolName: name,
      });
      return this.getAuthDisabledResponse(name);
    }

    try {
      let result: unknown;

      switch (name) {
        case 'auth_login':
          result = await this.executeAuthLogin();
          break;

        case 'auth_status':
          result = await this.executeAuthStatus();
          break;

        case 'auth_logout':
          result = await this.executeAuthLogout();
          break;

        default:
          throw new Error(`Unknown auth tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const integrationError =
        error instanceof IntegrationError
          ? error
          : normalizeError(error, `Executing auth tool: ${name}`);

      const logData = formatErrorForLogging(integrationError, {
        tool: name,
        args,
      });
      console[logData.level](logData.message, logData.meta);

      return formatMcpErrorResponse(integrationError, this.generateRequestId());
    }
  }

  /**
   * Get user-friendly response when authentication is disabled
   */
  private getAuthDisabledResponse(toolName: string): {
    content: Array<{ type: string; text: string }>;
  } {
    const messages = {
      auth_login:
        'Authentication is disabled for this server. No login required to access available tools. You can immediately use the data tools like search_tutorials, load_node, create_node, and test_connection.',
      auth_status:
        'Authentication status: DISABLED. This server is running in non-authenticated mode. All tools are available without authentication.',
      auth_logout:
        'Authentication is disabled for this server. No logout action is needed since there are no active sessions to terminate.',
    };

    const baseMessage =
      messages[toolName as keyof typeof messages] ||
      'Authentication is disabled for this server.';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              success: true,
              authenticationDisabled: true,
              message: baseMessage,
              serverMode: 'non-authenticated',
              availableTools: [
                'search_tutorials',
                'load_node',
                'create_node',
                'search_nodes',
                'test_connection',
              ],
            },
            null,
            2
          ),
        },
      ],
    };
  }

  /**
   * Execute data tools (original executeTool method)
   */
  private async executeTool(
    name: string,
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const requestId = this.generateRequestId();

    try {
      let result: unknown;

      switch (name) {
        case 'load_node':
          result = await this.executeLoadNode(args);
          break;

        case 'create_node':
          result = await this.executeCreateNode(args);
          break;

        case 'search_nodes':
          result = await this.executeSearchNodes(args);
          break;

        case 'test_connection':
          result = await this.executeTestConnection();
          break;

        case 'search_tutorials':
          result = await this.executeSearchTutorials(args);
          break;

        default:
          throw new IntegrationError(
            IntegrationErrorType.VALIDATION_ERROR,
            `Unknown tool: ${name}`,
            undefined,
            'name',
            {
              validTools: [
                'load_node',
                'create_node',
                'search_nodes',
                'test_connection',
                'search_tutorials',
              ],
              requestedTool: name,
            },
            undefined,
            false
          );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const integrationError =
        error instanceof IntegrationError
          ? error
          : normalizeError(error, `Executing tool: ${name}`, requestId);

      // Log the error for debugging
      const logData = formatErrorForLogging(integrationError, {
        tool: name,
        args,
      });
      console[logData.level](logData.message, logData.meta);

      return formatMcpErrorResponse(integrationError, requestId);
    }
  }

  /**
   * Execute load node tool
   */
  private async executeLoadNode(args: unknown): Promise<unknown> {
    if (!args || typeof args !== 'object' || !('nodeId' in args)) {
      throw new Error('nodeId is required');
    }

    const { nodeId } = args as { nodeId: string | number };
    return this.drupalClient.loadNode(nodeId);
  }

  /**
   * Execute create node tool
   */
  private async executeCreateNode(args: unknown): Promise<unknown> {
    if (!args || typeof args !== 'object') {
      throw new Error('Invalid arguments');
    }

    const {
      type,
      title,
      body,
      status = true,
    } = args as {
      type: string;
      title: string;
      body?: string;
      status?: boolean;
    };

    if (!type || !title) {
      throw new Error('type and title are required');
    }

    return this.drupalClient.createNode({ type, title, body, status });
  }

  /**
   * Execute search nodes tool
   */
  private async executeSearchNodes(args: unknown): Promise<unknown> {
    const options =
      (args as { type?: string; status?: boolean; limit?: number }) || {};
    return this.drupalClient.getNodes(options);
  }

  /**
   * Execute test connection tool
   */
  private async executeTestConnection(): Promise<{
    connected: boolean;
    config: unknown;
  }> {
    const connected = await this.drupalClient.testConnection();
    const config = this.drupalClient.getConfig();

    return { connected, config };
  }

  /**
   * Execute authentication login using new MCP OAuth provider
   */
  private async executeAuthLogin(): Promise<unknown> {
    // Note: Authentication disabled check is now handled in executeAuthTool method
    if (!this.mcpOAuthProvider) {
      throw new Error('OAuth provider not configured');
    }

    try {
      // Use the new MCP OAuth provider for authentication
      const tokens = await this.mcpOAuthProvider.authorize();
      const userId = 'default'; // In production, derive from token or user input

      // Store tokens using MCP OAuth provider
      await this.mcpOAuthProvider.saveTokens(tokens);

      // Set access token on Drupal client for immediate use
      this.drupalClient.setAccessToken(tokens.access_token);

      return this.formatAuthResponse(true, {
        message:
          'Authentication successful using OAuth 2.1 stateless configuration',
        userId,
        scopes: this.config.auth.requiredScopes,
        provider: 'McpOAuthProvider',
        endpointsDiscovered: !!this.config.oauth.discoveredEndpoints,
        tokenExpiry: tokens.expires_in
          ? Date.now() + tokens.expires_in * 1000
          : undefined,
      });
    } catch (error) {
      // Construct authorization URL for user convenience
      const baseUrl =
        this.config.oauth.discoveredEndpoints?.authorizationEndpoint ||
        `${this.config.oauth.serverUrl}/oauth/authorize`;
      const authUrl = new URL(baseUrl);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', this.config.oauth.clientId);
      authUrl.searchParams.set('redirect_uri', this.config.oauth.redirectUri);
      authUrl.searchParams.set('scope', this.config.oauth.scopes.join(' '));
      authUrl.searchParams.set('code_challenge_method', 'S256');

      return this.formatAuthResponse(
        false,
        {
          hint: 'Make sure to complete the OAuth flow in your browser. Check that DRUPAL_BASE_URL and OAUTH_CLIENT_ID are set correctly.',
          authorizationUrl: authUrl.toString(),
          instructions:
            'Copy and paste the authorization URL above into your browser to complete authentication. Note: The code_challenge parameter will be generated automatically when you use the actual OAuth flow.',
        },
        error instanceof Error ? error.message : 'Authentication failed'
      );
    }
  }

  /**
   * Execute authentication status check
   */
  private async executeAuthStatus(): Promise<unknown> {
    // Note: Authentication disabled check is now handled in executeAuthTool method
    if (!this.mcpOAuthProvider) {
      throw new Error('OAuth provider not configured');
    }

    try {
      const mcpTokenInfo = await this.mcpOAuthProvider.getTokenInfo();
      const hasValidTokens = await this.mcpOAuthProvider.hasValidTokens();
      const authContext = await this.requireAuthentication();

      return this.formatAuthStatusResponse(
        authContext,
        mcpTokenInfo
          ? {
              ...mcpTokenInfo,
              mcpProvider: {
                hasValidTokens,
                tokenInfo: mcpTokenInfo,
              },
            }
          : {
              mcpProvider: {
                hasValidTokens,
                tokenInfo: mcpTokenInfo,
              },
            }
      );
    } catch (error) {
      return this.formatAuthStatusResponse(
        { isAuthenticated: false },
        {
          error:
            error instanceof Error
              ? error.message
              : 'Failed to check auth status',
        }
      );
    }
  }

  /**
   * Execute authentication logout
   */
  private async executeAuthLogout(): Promise<unknown> {
    // Note: Authentication disabled check is now handled in executeAuthTool method
    if (!this.mcpOAuthProvider) {
      throw new Error('OAuth provider not configured');
    }

    try {
      await this.mcpOAuthProvider.clearTokens();
      this.drupalClient.clearAccessToken();

      return this.formatAuthResponse(true, {
        message: 'Logout successful - cleared all tokens',
      });
    } catch (error) {
      return this.formatAuthResponse(
        false,
        {},
        error instanceof Error ? error.message : 'Logout failed'
      );
    }
  }

  /**
   * Execute search tutorials tool
   */
  private async executeSearchTutorials(
    args: unknown
  ): Promise<SearchContentResponse> {
    // Validate and process input parameters using new validation function
    const processedParams = validateSearchContentParams(args);

    try {
      // Make real JSON-RPC call to Drupal endpoint using new parameter structure
      const response = await this.drupalClient.searchTutorials({
        keywords: processedParams.keywords,
        types: processedParams.types,
        drupal_version: processedParams.drupal_version,
        category: processedParams.category,
        sort: processedParams.sort,
        page: processedParams.page,
      });

      // Process and format the response for MCP consumption
      const results: TutorialSearchResult[] = response.results.map(
        tutorial => ({
          id: tutorial.id,
          title: tutorial.title,
          url: tutorial.url,
          description:
            tutorial.description ||
            this.extractDescriptionFromContent(tutorial.content),
          drupal_version: tutorial.drupal_version,
          tags: tutorial.tags,
          difficulty: tutorial.difficulty as
            | 'beginner'
            | 'intermediate'
            | 'advanced'
            | undefined,
          created: tutorial.created,
          updated: tutorial.updated,
        })
      );

      return {
        results,
        total: response.total,
        facets: response.facets,
        query: processedParams,
      };
    } catch (error) {
      // Convert any validation errors to IntegrationError
      if (error instanceof ValidationError) {
        throw new IntegrationError(
          IntegrationErrorType.VALIDATION_ERROR,
          error.message,
          undefined,
          error.field,
          { processedParams },
          error,
          false
        );
      }

      // Handle IntegrationErrors from the DrupalClient
      if (error instanceof IntegrationError) {
        throw error;
      }

      // Handle any other unexpected errors
      const integrationError = normalizeError(error, 'Tutorial search');
      throw integrationError;
    }
  }

  /**
   * Extract description from tutorial content for RAG optimization
   */
  private extractDescriptionFromContent(content: string): string {
    // Extract first paragraph or first 200 characters as description
    const lines = content.split('\n').filter(line => line.trim());
    const firstContentLine = lines.find(
      line => !line.startsWith('#') && line.trim().length > 0
    );

    if (firstContentLine) {
      return firstContentLine.length > 200
        ? `${firstContentLine.substring(0, 197)}...`
        : firstContentLine;
    }

    // Fallback: return first 200 characters
    return `${content.substring(0, 197)}...`;
  }

  /**
   * Get available prompts
   */
  public getPrompts(): McpPrompt[] {
    return [
      {
        name: 'drupal_content_summary',
        description: 'Generate a summary of Drupal content',
        arguments: [
          {
            name: 'content_type',
            description: 'Type of content to summarize',
            required: false,
          },
          {
            name: 'limit',
            description: 'Maximum number of items to include',
            required: false,
          },
        ],
      },
    ];
  }

  /**
   * Get a specific prompt
   */
  public async getPrompt(
    name: string,
    args?: Record<string, unknown>
  ): Promise<{
    description: string;
    messages: Array<{ role: string; content: { type: string; text: string } }>;
  }> {
    switch (name) {
      case 'drupal_content_summary':
        return this.getDrupalContentSummaryPrompt(args);
      default:
        throw new Error(`Unknown prompt: ${name}`);
    }
  }

  /**
   * Get Drupal content summary prompt
   */
  private async getDrupalContentSummaryPrompt(
    args?: Record<string, unknown>
  ): Promise<{
    description: string;
    messages: Array<{ role: string; content: { type: string; text: string } }>;
  }> {
    const contentType = args?.content_type as string | undefined;
    const limit = (args?.limit as number) || 10;

    try {
      const nodes = await this.drupalClient.getNodes({
        type: contentType,
        limit,
      });

      const content = `Here are the recent Drupal nodes${contentType ? ` of type "${contentType}"` : ''}:\n\n${nodes
        .map(
          (node, index) =>
            `${index + 1}. ${node.attributes.title} (ID: ${node.attributes.nid})`
        )
        .join('\n')}\n\nPlease provide a summary of this content.`;

      return {
        description: `Summary of Drupal content${contentType ? ` (${contentType})` : ''}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: content,
            },
          },
        ],
      };
    } catch (error) {
      const errorMessage =
        error instanceof DrupalClientError ? error.message : String(error);

      return {
        description: 'Error generating Drupal content summary',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Error fetching Drupal content: ${errorMessage}`,
            },
          },
        ],
      };
    }
  }

  /**
   * Get the underlying server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Connect the server to a transport
   */
  async connect(transport: Transport): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * Close the server
   */
  async close(): Promise<void> {
    await this.server.close();
  }
}
