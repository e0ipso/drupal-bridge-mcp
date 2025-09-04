/**
 * MCP Server with Simplified Architecture and Direct Token Pass-through
 *
 * Creates and configures the Model Context Protocol server with simplified
 * token handling that passes OAuth tokens directly to Drupal without complex
 * session management.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from '@/utils/logger.js';
import {
  TokenExtractor,
  TokenValidationError,
  type TokenValidationResult,
  createSafeTokenForLogging,
} from './token-extractor.js';
import type { JsonRpcClient } from '@/drupal/json-rpc-client.js';
import {
  createJsonRpcClient,
  DrupalErrorUtils,
  type ContentSearchParams,
  type GetTutorialParams,
  type TutorialContent,
  type ContentSearchResult,
} from '@/drupal/json-rpc-client.js';

/**
 * Simplified MCP server with direct token pass-through
 */
export class SimplifiedMCPServer {
  private readonly drupalClient: JsonRpcClient;
  private readonly server: Server;

  constructor(drupalConfig?: { baseUrl?: string }) {
    // Initialize Drupal JSON-RPC client
    this.drupalClient = createJsonRpcClient(drupalConfig);

    // Create MCP server instance
    this.server = new Server(
      {
        name: 'drupalize-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {},
        },
      }
    );

    this.setupToolHandlers();
    logger.info('Simplified MCP Server initialized');
  }

  /**
   * Get the underlying Server instance
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Set up MCP tool handlers with direct token pass-through
   */
  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, () => {
      return {
        tools: [
          {
            name: 'search_content',
            description:
              'Search Drupalize.me tutorials and educational content with subscription-aware access',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query for content (required)',
                },
                content_type: {
                  type: 'string',
                  description: 'Content type filter',
                  enum: ['tutorial', 'guide', 'blog', 'all'],
                  default: 'all',
                },
                drupal_version: {
                  type: 'string',
                  description:
                    'Filter by Drupal version (e.g., "10", "9", "8")',
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by content tags',
                },
                limit: {
                  type: 'number',
                  description:
                    'Maximum number of results (default: 20, max: 100)',
                  minimum: 1,
                  maximum: 100,
                  default: 20,
                },
                sort: {
                  type: 'string',
                  enum: ['relevance', 'date', 'title'],
                  description: 'Sort order for results',
                  default: 'relevance',
                },
                access_level: {
                  type: 'string',
                  enum: ['free', 'subscriber', 'all'],
                  description:
                    'Filter by access level (user permissions apply)',
                  default: 'all',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'get_tutorial',
            description:
              'Retrieve specific tutorial content with full details and markdown content',
            inputSchema: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Tutorial ID (required)',
                },
                include_content: {
                  type: 'boolean',
                  description: 'Include full tutorial content (default: true)',
                  default: true,
                },
                format: {
                  type: 'string',
                  enum: ['html', 'markdown'],
                  description: 'Content format preference',
                  default: 'markdown',
                },
              },
              required: ['id'],
            },
          },
          {
            name: 'discover_methods',
            description:
              'Discover available Drupal JSON-RPC methods (for debugging/development)',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
          {
            name: 'health_check',
            description: 'Check Drupal API health and connectivity',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params;

      logger.info('MCP Tool called', { tool: name, args });

      try {
        // Extract token from the request
        const tokenResult = this.extractToken(request);
        if (!tokenResult.isValid || !tokenResult.token) {
          throw this.createAuthError(tokenResult);
        }

        const userToken = tokenResult.token;

        logger.debug('Token extracted successfully', {
          tool: name,
          tokenPreview: createSafeTokenForLogging(userToken),
        });

        // Route to appropriate handler
        switch (name) {
          case 'search_content':
            return await this.handleSearchContent(args as any, userToken);

          case 'get_tutorial':
            return await this.handleGetTutorial(args as any, userToken);

          case 'discover_methods':
            return await this.handleDiscoverMethods(userToken);

          case 'health_check':
            return await this.handleHealthCheck(userToken);

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}. Available tools: search_content, get_tutorial, discover_methods, health_check`
            );
        }
      } catch (error) {
        // Transform errors into MCP-compatible format
        throw this.transformErrorForMCP(error, name);
      }
    });
  }

  /**
   * Extract token from MCP request
   */
  private extractToken(request: any): TokenValidationResult {
    // Try to extract from meta headers first, then from arguments
    const context = {
      headers: request.meta?.headers,
      params: request.params?.arguments,
    };

    return TokenExtractor.extractFromRequest(context);
  }

  /**
   * Create authentication error for token issues
   */
  private createAuthError(tokenResult: TokenValidationResult): McpError {
    let message = 'Authentication required';
    let errorCode = ErrorCode.InvalidRequest;

    switch (tokenResult.errorCode) {
      case TokenValidationError.MISSING_TOKEN:
        message =
          'Missing authentication token. Please provide an OAuth access token in the Authorization header.';
        errorCode = ErrorCode.InvalidRequest;
        break;
      case TokenValidationError.INVALID_FORMAT:
        message =
          'Invalid token format. Token must be a valid OAuth access token.';
        errorCode = ErrorCode.InvalidRequest;
        break;
      case TokenValidationError.EMPTY_TOKEN:
        message = 'Empty authentication token provided.';
        errorCode = ErrorCode.InvalidRequest;
        break;
      case TokenValidationError.INVALID_BEARER_FORMAT:
        message =
          'Invalid Authorization header format. Expected: "Bearer <token>"';
        errorCode = ErrorCode.InvalidRequest;
        break;
    }

    return new McpError(errorCode, message);
  }

  /**
   * Handle search_content tool
   */
  private async handleSearchContent(
    args: Partial<ContentSearchParams>,
    userToken: string
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!args.query || typeof args.query !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Missing required parameter: query (must be a non-empty string)'
      );
    }

    const searchParams: ContentSearchParams = {
      query: args.query,
      content_type: args.content_type || 'all',
      tags: args.tags || [],
      limit: Math.min(args.limit || 20, 100),
      offset: args.offset || 0,
      sort: args.sort || 'relevance',
      access_level: args.access_level || 'all',
    };

    // Add optional drupal_version only if provided
    if (args.drupal_version) {
      searchParams.drupal_version = args.drupal_version;
    }

    logger.debug('Searching Drupal content', { searchParams });

    const results = await this.drupalClient.searchContent(
      searchParams,
      userToken
    );

    // Format results for MCP response
    const formattedResults = this.formatSearchResults(results);

    return {
      content: [
        {
          type: 'text',
          text: formattedResults,
        },
      ],
    };
  }

  /**
   * Handle get_tutorial tool
   */
  private async handleGetTutorial(
    args: Partial<GetTutorialParams>,
    userToken: string
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    if (!args.id || typeof args.id !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Missing required parameter: id (must be a non-empty string)'
      );
    }

    const tutorialParams: GetTutorialParams = {
      id: args.id,
      include_content: args.include_content !== false,
      format: args.format || 'markdown',
    };

    logger.debug('Retrieving tutorial', { tutorialParams });

    const tutorial = await this.drupalClient.getTutorial(
      tutorialParams,
      userToken
    );

    // Format tutorial for MCP response
    const formattedTutorial = this.formatTutorial(tutorial);

    return {
      content: [
        {
          type: 'text',
          text: formattedTutorial,
        },
      ],
    };
  }

  /**
   * Handle discover_methods tool
   */
  private async handleDiscoverMethods(
    userToken: string
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.debug('Discovering Drupal JSON-RPC methods');

    const methods = await this.drupalClient.discoverMethods(userToken);

    const formattedMethods = `# Available Drupal JSON-RPC Methods\n\n${methods.map(method => `- ${method}`).join('\n')}`;

    return {
      content: [
        {
          type: 'text',
          text: formattedMethods,
        },
      ],
    };
  }

  /**
   * Handle health_check tool
   */
  private async handleHealthCheck(
    userToken: string
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    logger.debug('Checking Drupal API health');

    const health = await this.drupalClient.healthCheck(userToken);

    const formattedHealth = `# Drupal API Health Check\n\n- Status: ${health.status}\n- Timestamp: ${new Date(health.timestamp).toISOString()}\n- Connection: OK`;

    return {
      content: [
        {
          type: 'text',
          text: formattedHealth,
        },
      ],
    };
  }

  /**
   * Format search results for display
   */
  private formatSearchResults(results: ContentSearchResult): string {
    const { results: tutorials, total, query, took } = results;

    let formatted = `# Search Results for "${query}"\n\n`;
    formatted += `Found ${total} results in ${took}ms\n\n`;

    if (tutorials.length === 0) {
      formatted += 'No tutorials found matching your query.';
      return formatted;
    }

    tutorials.forEach((tutorial, index) => {
      formatted += `## ${index + 1}. ${tutorial.title}\n\n`;

      if (tutorial.summary) {
        formatted += `**Summary:** ${tutorial.summary}\n\n`;
      }

      formatted += `- **Content Type:** ${tutorial.content_type}\n`;
      formatted += `- **Access Level:** ${tutorial.access_level}\n`;

      if (tutorial.drupal_version) {
        formatted += `- **Drupal Version:** ${tutorial.drupal_version}\n`;
      }

      if (tutorial.difficulty_level) {
        formatted += `- **Difficulty:** ${tutorial.difficulty_level}\n`;
      }

      if (tutorial.tags.length > 0) {
        formatted += `- **Tags:** ${tutorial.tags.join(', ')}\n`;
      }

      formatted += `- **Created:** ${new Date(tutorial.created).toLocaleDateString()}\n`;
      formatted += `- **Updated:** ${new Date(tutorial.updated).toLocaleDateString()}\n`;

      if (tutorial.url) {
        formatted += `- **URL:** ${tutorial.url}\n`;
      }

      if (tutorial.author) {
        formatted += `- **Author:** ${tutorial.author.name}\n`;
      }

      formatted += `- **ID:** ${tutorial.id}\n\n`;
      formatted += '---\n\n';
    });

    return formatted;
  }

  /**
   * Format tutorial content for display
   */
  private formatTutorial(tutorial: TutorialContent): string {
    let formatted = `# ${tutorial.title}\n\n`;

    if (tutorial.summary) {
      formatted += `**Summary:** ${tutorial.summary}\n\n`;
    }

    formatted += `- **Content Type:** ${tutorial.content_type}\n`;
    formatted += `- **Access Level:** ${tutorial.access_level}\n`;

    if (tutorial.drupal_version) {
      formatted += `- **Drupal Version:** ${tutorial.drupal_version}\n`;
    }

    if (tutorial.difficulty_level) {
      formatted += `- **Difficulty:** ${tutorial.difficulty_level}\n`;
    }

    if (tutorial.tags.length > 0) {
      formatted += `- **Tags:** ${tutorial.tags.join(', ')}\n`;
    }

    formatted += `- **Created:** ${new Date(tutorial.created).toLocaleDateString()}\n`;
    formatted += `- **Updated:** ${new Date(tutorial.updated).toLocaleDateString()}\n`;

    if (tutorial.author) {
      formatted += `- **Author:** ${tutorial.author.name}\n`;
      if (tutorial.author.bio) {
        formatted += `- **Author Bio:** ${tutorial.author.bio}\n`;
      }
    }

    if (tutorial.url) {
      formatted += `- **URL:** ${tutorial.url}\n`;
    }

    formatted += '\n---\n\n';

    if (tutorial.content) {
      formatted += '# Content\n\n';
      formatted += tutorial.content;
    } else {
      formatted += '*Content not included in response*';
    }

    return formatted;
  }

  /**
   * Transform errors into MCP-compatible format
   */
  private transformErrorForMCP(error: any, toolName: string): McpError {
    // Handle Drupal-specific errors
    if (DrupalErrorUtils.isDrupalError(error)) {
      if (DrupalErrorUtils.isAuthError(error)) {
        return new McpError(
          ErrorCode.InvalidRequest,
          DrupalErrorUtils.getUserMessage(error)
        );
      }

      if (DrupalErrorUtils.isPermissionError(error)) {
        return new McpError(
          ErrorCode.InvalidRequest,
          DrupalErrorUtils.getUserMessage(error)
        );
      }

      return new McpError(
        ErrorCode.InternalError,
        DrupalErrorUtils.getUserMessage(error)
      );
    }

    // Handle MCP errors (pass through)
    if (error instanceof McpError) {
      return error;
    }

    // Handle generic errors
    logger.error('Unexpected error in MCP tool', {
      tool: toolName,
      error: error.message,
      stack: error.stack,
    });

    return new McpError(
      ErrorCode.InternalError,
      `An unexpected error occurred while executing ${toolName}: ${error.message || 'Unknown error'}`
    );
  }
}

/**
 * Factory function to create and configure the MCP server
 */
export function createServer(config?: {
  drupal?: { baseUrl?: string };
}): Server {
  const mcpServer = new SimplifiedMCPServer(config?.drupal);

  logger.info('MCP Server created and configured with simplified architecture');

  return mcpServer.getServer();
}
