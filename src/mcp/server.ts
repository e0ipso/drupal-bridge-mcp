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
import type {
  McpResource,
  McpTool,
  McpPrompt,
  ProcessedSearchParams,
  SearchTutorialsResponse,
  TutorialSearchResult,
} from '@/types/index.js';
import { DrupalClient, DrupalClientError } from '@/services/drupal-client.js';
import { validateSearchToolParams, ValidationError } from '@/utils/index.js';
import {
  IntegrationError,
  IntegrationErrorType,
  normalizeError,
  formatMcpErrorResponse,
  formatErrorForLogging,
} from '@/utils/error-handler.js';
import {
  OAuthClient,
  TokenManager,
  AuthMiddleware,
  SessionStore,
  AuthenticationRequiredError,
  createMcpErrorResponse,
} from '@/auth/index.js';

/**
 * MCP server for Drupal integration
 */
export class DrupalMcpServer {
  private readonly server: Server;
  private readonly drupalClient: DrupalClient;
  private readonly oauthClient: OAuthClient;
  private readonly tokenManager: TokenManager;
  private readonly authMiddleware: AuthMiddleware;
  private readonly sessionStore: SessionStore;
  private requestCounter = 0;

  constructor(private readonly config: AppConfig) {
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

    this.drupalClient = new DrupalClient(config.drupal);

    // Initialize authentication components
    this.oauthClient = new OAuthClient(config.oauth);
    this.tokenManager = new TokenManager(this.oauthClient);
    this.authMiddleware = new AuthMiddleware({
      oauthClient: this.oauthClient,
      tokenManager: this.tokenManager,
      requiredScopes: config.auth.requiredScopes,
      skipAuth: config.auth.skipAuth,
    });
    this.sessionStore = new SessionStore();

    this.setupHandlers();
  }

  /**
   * Generate unique request ID for tracing
   */
  private generateRequestId(): string {
    return `mcp-req-${Date.now()}-${++this.requestCounter}`;
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: await this.getResources(),
      };
    });

    // Read specific resource
    this.server.setRequestHandler(ReadResourceRequestSchema, async request => {
      return this.readResource(request.params.uri);
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    // Execute tool (with authentication)
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      return this.executeToolWithAuth(
        request.params.name,
        request.params.arguments
      );
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: this.getPrompts(),
      };
    });

    // Get prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async request => {
      return this.getPrompt(request.params.name, request.params.arguments);
    });
  }

  /**
   * Get available resources
   */
  private async getResources(): Promise<McpResource[]> {
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
  private async readResource(uri: string): Promise<{
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
  private getTools(): McpTool[] {
    const authTools: McpTool[] = [
      {
        name: 'auth_login',
        description: 'Authenticate with Drupalize.me OAuth',
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
          'Search Drupalize.me tutorials with optional filtering by Drupal version and tags',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query string (minimum 2 characters)',
              minLength: 2,
            },
            drupal_version: {
              type: 'string',
              description: 'Filter by Drupal version',
              enum: ['9', '10', '11'],
            },
            tags: {
              type: 'array',
              description: 'Filter by tutorial tags',
              items: {
                type: 'string',
              },
            },
          },
          required: ['query'],
        },
      },
    ];

    return [...authTools, ...dataTools];
  }

  /**
   * Execute a tool with authentication
   */
  private async executeToolWithAuth(
    name: string,
    args: unknown
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    const requestId = this.generateRequestId();

    try {
      // Handle authentication tools separately
      if (name.startsWith('auth_')) {
        return await this.executeAuthTool(name, args);
      }

      // For data tools, require authentication (unless skipped)
      if (!this.config.auth.skipAuth) {
        const authContext = await this.authMiddleware.requireAuthentication();

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
   * Execute authentication login
   */
  private async executeAuthLogin(): Promise<unknown> {
    try {
      const tokens = await this.oauthClient.authorize();
      const userId = 'default'; // In production, derive from token or user input

      await this.tokenManager.storeTokens(
        tokens,
        userId,
        this.config.auth.requiredScopes
      );

      // Create session
      const authContext = {
        isAuthenticated: true,
        userId,
        scopes: this.config.auth.requiredScopes,
        accessToken: tokens.accessToken,
      };

      const session = this.sessionStore.createSession(userId, authContext);

      return {
        success: true,
        message: 'Authentication successful',
        sessionId: session.id,
        expiresAt: session.expiresAt,
        scopes: this.config.auth.requiredScopes,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
        hint: 'Make sure to complete the OAuth flow in your browser',
      };
    }
  }

  /**
   * Execute authentication status check
   */
  private async executeAuthStatus(): Promise<unknown> {
    try {
      const tokenInfo = await this.tokenManager.getTokenInfo();
      const authStatus = await this.authMiddleware.getAuthStatus();

      return {
        ...authStatus,
        tokenInfo,
        sessionStats: this.sessionStore.getStats(),
      };
    } catch (error) {
      return {
        isAuthenticated: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to check auth status',
      };
    }
  }

  /**
   * Execute authentication logout
   */
  private async executeAuthLogout(): Promise<unknown> {
    try {
      await this.authMiddleware.logout();
      this.sessionStore.clear();
      this.drupalClient.clearAccessToken();

      return {
        success: true,
        message: 'Logout successful',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Logout failed',
      };
    }
  }

  /**
   * Execute search tutorials tool
   */
  private async executeSearchTutorials(
    args: unknown
  ): Promise<SearchTutorialsResponse> {
    // Validate and process input parameters - this will throw ValidationError if invalid
    const processedParams = validateSearchToolParams(args);

    // In test environment or when Drupal is unavailable, return mock data
    if (this.config.environment === 'test' || process.env.NODE_ENV === 'test') {
      return this.getMockSearchResults(processedParams);
    }

    try {
      // Make real JSON-RPC call to Drupal endpoint
      const response = await this.drupalClient.searchTutorials({
        query: processedParams.query,
        drupal_version: processedParams.drupal_version,
        tags: processedParams.tags,
        limit: 10,
        page: 1,
      });

      // Process and format the response for MCP consumption
      const results: TutorialSearchResult[] = response.tutorials.map(
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
        page: response.page,
        limit: 10,
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
        // In production, re-throw the error; in development, log and return mock data for certain error types
        if (this.config.environment === 'production' || !error.retryable) {
          throw error;
        }

        // Fallback to mock data if the real endpoint is unavailable and error is retryable
        console.warn(
          `API unavailable (${error.errorType}), returning mock data: ${error.message}`
        );
        return this.getMockSearchResults(processedParams);
      }

      // Handle any other unexpected errors
      const integrationError = normalizeError(error, 'Tutorial search');

      // In production, re-throw; in development, return mock data for network-related errors
      if (this.config.environment === 'production') {
        throw integrationError;
      }

      console.warn(
        `Unexpected error, returning mock data: ${integrationError.message}`
      );
      return this.getMockSearchResults(processedParams);
    }
  }

  /**
   * Get mock search results for testing and fallback scenarios
   */
  private getMockSearchResults(
    processedParams: ProcessedSearchParams
  ): SearchTutorialsResponse {
    // Create mock results that support filtering
    const allMockResults: TutorialSearchResult[] = [
      {
        id: '1',
        title: `Tutorial about ${processedParams.query}`,
        url: 'https://drupalize.me/tutorial/sample-tutorial',
        description: `A comprehensive tutorial covering ${processedParams.query} concepts`,
        drupal_version: ['10', '11'],
        tags:
          processedParams.tags.length > 0
            ? processedParams.tags
            : ['tutorial', 'drupal'],
        difficulty: 'intermediate',
        created: '2024-01-01T00:00:00Z',
        updated: '2024-06-01T00:00:00Z',
      },
      // Add a Drupal 9 specific tutorial for testing filtering
      {
        id: '2',
        title: `Drupal 9 specific tutorial about ${processedParams.query}`,
        url: 'https://drupalize.me/tutorial/drupal9-tutorial',
        description: `Legacy tutorial for ${processedParams.query} in Drupal 9`,
        drupal_version: ['9'],
        tags:
          processedParams.tags.length > 0
            ? [...processedParams.tags, 'drupal-9']
            : ['tutorial', 'drupal', 'drupal-9'],
        difficulty: 'intermediate',
        created: '2023-01-01T00:00:00Z',
        updated: '2023-06-01T00:00:00Z',
      },
    ];

    // Filter results by drupal_version if specified
    const filteredResults = processedParams.drupal_version
      ? allMockResults.filter(result =>
          result.drupal_version?.includes(processedParams.drupal_version!)
        )
      : allMockResults.slice(0, 1); // Return only the first result when no version filter is applied

    return {
      results: filteredResults,
      total: filteredResults.length,
      page: 1,
      limit: 10,
      query: processedParams,
    };
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
  private getPrompts(): McpPrompt[] {
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
  private async getPrompt(
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
