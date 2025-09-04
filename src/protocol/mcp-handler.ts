/**
 * MCP Protocol Handler Integration
 * 
 * Integrates the MCP protocol manager with the HTTP server and SSE transport,
 * implements standard MCP message handlers, and provides the bridge between
 * the protocol layer and the existing Drupal-based MCP server.
 */

import { logger } from '@/utils/logger';
import { SimplifiedMCPServer } from '@/mcp/server';
import type { SSETransport } from '@/transport/sse-transport';
import { MCPProtocolManager } from './protocol-manager';
import type {
  ListToolsParams,
  ListToolsResult,
  CallToolParams,
  CallToolResult,
  RequestContext,
  LogLevel
} from './types';

/**
 * Configuration for MCP handler
 */
export interface MCPHandlerConfig {
  readonly drupalBaseUrl?: string;
  readonly enableToolDiscovery?: boolean;
  readonly toolRefreshInterval?: number;
}

/**
 * MCP Protocol Handler
 * 
 * Bridges the protocol layer with the existing MCP server implementation
 */
export class MCPProtocolHandler {
  private readonly protocolManager: MCPProtocolManager;
  private readonly mcpServer: SimplifiedMCPServer;
  private readonly config: MCPHandlerConfig;

  constructor(config: MCPHandlerConfig = {}) {
    this.config = {
      drupalBaseUrl: config.drupalBaseUrl,
      enableToolDiscovery: config.enableToolDiscovery ?? true,
      toolRefreshInterval: config.toolRefreshInterval ?? 300000 // 5 minutes
    };

    // Create simplified MCP server
    this.mcpServer = new SimplifiedMCPServer({
      baseUrl: this.config.drupalBaseUrl
    });

    // Create protocol manager with server capabilities
    this.protocolManager = new MCPProtocolManager({
      serverInfo: {
        name: 'drupalize-mcp-server',
        version: '1.0.0'
      },
      serverCapabilities: {
        tools: { 
          listChanged: this.config.enableToolDiscovery 
        },
        logging: {},
        experimental: {}
      }
    });

    this.setupProtocolHandlers();
    this.setupEventListeners();

    logger.info('MCP Protocol Handler initialized', {
      drupalBaseUrl: this.config.drupalBaseUrl,
      toolDiscovery: this.config.enableToolDiscovery
    });
  }

  /**
   * Process incoming message from SSE connection
   */
  async handleMessage(
    rawMessage: string | Buffer,
    connectionId: string
  ): Promise<string | null> {
    try {
      const response = await this.protocolManager.processMessage(rawMessage, connectionId);
      
      if (response) {
        return JSON.stringify(response);
      }
      
      return null;
    } catch (error) {
      logger.error('Error handling MCP message', {
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return a generic error response
      const errorResponse = {
        jsonrpc: '2.0' as const,
        id: null,
        error: {
          code: -32603,
          message: 'Internal error processing message'
        }
      };
      
      return JSON.stringify(errorResponse);
    }
  }

  /**
   * Handle connection established
   */
  onConnectionEstablished(connectionId: string): void {
    logger.debug('New MCP connection established', { connectionId });
  }

  /**
   * Handle connection closed
   */
  onConnectionClosed(connectionId: string): void {
    logger.debug('MCP connection closed', { connectionId });
    this.protocolManager.cleanupConnection(connectionId);
  }

  /**
   * Get protocol statistics
   */
  getStats() {
    return {
      protocol: this.protocolManager.getStats(),
      server: {
        name: 'drupalize-mcp-server',
        version: '1.0.0',
        drupalBaseUrl: this.config.drupalBaseUrl
      }
    };
  }

  /**
   * Set up protocol message handlers
   */
  private setupProtocolHandlers(): void {
    // Tools list handler
    this.protocolManager.registerHandler(
      'tools/list',
      async (params: ListToolsParams, context: RequestContext): Promise<ListToolsResult> => {
        return await this.handleListTools(params, context);
      }
    );

    // Tools call handler
    this.protocolManager.registerHandler(
      'tools/call',
      async (params: CallToolParams, context: RequestContext): Promise<CallToolResult> => {
        return await this.handleCallTool(params, context);
      }
    );

    // Logging level handler
    this.protocolManager.registerHandler(
      'logging/setLevel',
      async (params: { level: LogLevel }, context: RequestContext): Promise<void> => {
        await this.handleSetLogLevel(params, context);
      }
    );

    logger.debug('Protocol handlers registered', {
      handlers: ['tools/list', 'tools/call', 'logging/setLevel']
    });
  }

  /**
   * Set up event listeners
   */
  private setupEventListeners(): void {
    this.protocolManager.on('initialized', (connectionId, state) => {
      logger.info('Client initialized', {
        connectionId,
        protocolVersion: state.protocolVersion,
        clientName: state.clientInfo?.name,
        clientVersion: state.clientInfo?.version
      });
    });

    this.protocolManager.on('error', (error, connectionId) => {
      logger.error('Protocol manager error', {
        connectionId,
        error: error.message
      });
    });

    this.protocolManager.on('timeout', (requestId, connectionId) => {
      logger.warn('Request timeout', {
        requestId,
        connectionId
      });
    });
  }

  /**
   * Handle tools/list request
   */
  private async handleListTools(
    params: ListToolsParams,
    context: RequestContext
  ): Promise<ListToolsResult> {
    logger.debug('Handling tools/list request', {
      connectionId: context.connectionId,
      cursor: params.cursor
    });

    try {
      // Get tools from the simplified MCP server
      const toolsResponse = await this.getToolsFromMCPServer();
      
      // Apply cursor-based pagination if needed
      let tools = toolsResponse.tools;
      let nextCursor: string | undefined;

      if (params.cursor) {
        // Simple cursor implementation - in production this might be more sophisticated
        const cursorIndex = parseInt(params.cursor, 10);
        if (!isNaN(cursorIndex) && cursorIndex < tools.length) {
          tools = tools.slice(cursorIndex);
        }
      }

      // Implement pagination limit (e.g., 50 tools per page)
      const pageSize = 50;
      if (tools.length > pageSize) {
        const currentCursor = params.cursor ? parseInt(params.cursor, 10) : 0;
        tools = tools.slice(0, pageSize);
        nextCursor = String(currentCursor + pageSize);
      }

      logger.debug('Returning tools list', {
        connectionId: context.connectionId,
        toolCount: tools.length,
        hasNextCursor: !!nextCursor
      });

      return {
        tools,
        ...(nextCursor && { nextCursor })
      };

    } catch (error) {
      logger.error('Error listing tools', {
        connectionId: context.connectionId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw {
        code: -32603,
        message: 'Failed to list tools',
        data: { 
          originalError: error instanceof Error ? error.message : String(error) 
        }
      };
    }
  }

  /**
   * Handle tools/call request
   */
  private async handleCallTool(
    params: CallToolParams,
    context: RequestContext
  ): Promise<CallToolResult> {
    logger.debug('Handling tools/call request', {
      connectionId: context.connectionId,
      toolName: params.name,
      hasArguments: !!params.arguments
    });

    try {
      // Extract authentication token from the connection context
      // In a real implementation, this would come from the SSE connection headers
      // For now, we'll need to get it from the arguments or connection metadata
      const token = this.extractAuthToken(params, context);
      
      if (!token) {
        throw {
          code: -32006, // Unauthorized
          message: 'Authentication token required. Please provide an OAuth access token.',
          data: { 
            hint: 'Include the token in the Authorization header or tool arguments' 
          }
        };
      }

      // Create a mock request object that the existing MCP server expects
      const mockRequest = {
        params: {
          name: params.name,
          arguments: params.arguments || {}
        },
        meta: {
          headers: {
            authorization: `Bearer ${token}`
          }
        }
      };

      // Call the existing MCP server's tool handler
      const result = await this.callMCPServerTool(mockRequest);
      
      logger.debug('Tool call completed', {
        connectionId: context.connectionId,
        toolName: params.name,
        success: true
      });

      return result;

    } catch (error) {
      logger.error('Error calling tool', {
        connectionId: context.connectionId,
        toolName: params.name,
        error: error instanceof Error ? error.message : String(error)
      });

      // Check if it's already a properly formatted MCP error
      if (this.isMCPError(error)) {
        throw error;
      }

      throw {
        code: -32603,
        message: `Failed to call tool '${params.name}'`,
        data: { 
          originalError: error instanceof Error ? error.message : String(error) 
        }
      };
    }
  }

  /**
   * Handle logging/setLevel request
   */
  private async handleSetLogLevel(
    params: { level: LogLevel },
    context: RequestContext
  ): Promise<void> {
    logger.info('Setting log level', {
      connectionId: context.connectionId,
      newLevel: params.level,
      currentLevel: (logger as any).level || 'unknown'
    });

    // Update logger level if supported
    try {
      // Try to update the log level - implementation depends on logger type
      if (typeof (logger as any).level === 'string') {
        (logger as any).level = params.level;
      } else if (typeof (logger as any).setLevel === 'function') {
        (logger as any).setLevel(params.level);
      }
      
      logger.info('Log level update requested', { 
        newLevel: params.level,
        connectionId: context.connectionId 
      });
    } catch (error) {
      logger.warn('Dynamic log level change not supported by current logger configuration', {
        requestedLevel: params.level,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get tools from the existing MCP server
   */
  private async getToolsFromMCPServer(): Promise<ListToolsResult> {
    // The SimplifiedMCPServer doesn't expose tools directly,
    // so we'll recreate the tools list based on its implementation
    const tools = [
      {
        name: 'search_content',
        description: 'Search Drupalize.me tutorials and educational content with subscription-aware access',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query for content (required)'
            },
            content_type: {
              type: 'string',
              description: 'Content type filter',
              enum: ['tutorial', 'guide', 'blog', 'all'],
              default: 'all'
            },
            drupal_version: {
              type: 'string',
              description: 'Filter by Drupal version (e.g., "10", "9", "8")'
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Filter by content tags'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 20, max: 100)',
              minimum: 1,
              maximum: 100,
              default: 20
            },
            sort: {
              type: 'string',
              enum: ['relevance', 'date', 'title'],
              description: 'Sort order for results',
              default: 'relevance'
            },
            access_level: {
              type: 'string',
              enum: ['free', 'subscriber', 'all'],
              description: 'Filter by access level (user permissions apply)',
              default: 'all'
            }
          },
          required: ['query']
        }
      },
      {
        name: 'get_tutorial',
        description: 'Retrieve specific tutorial content with full details and markdown content',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Tutorial ID (required)'
            },
            include_content: {
              type: 'boolean',
              description: 'Include full tutorial content (default: true)',
              default: true
            },
            format: {
              type: 'string',
              enum: ['html', 'markdown'],
              description: 'Content format preference',
              default: 'markdown'
            }
          },
          required: ['id']
        }
      },
      {
        name: 'discover_methods',
        description: 'Discover available Drupal JSON-RPC methods (for debugging/development)',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'health_check',
        description: 'Check Drupal API health and connectivity',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      }
    ];

    return { tools };
  }

  /**
   * Call tool on the existing MCP server
   */
  private async callMCPServerTool(mockRequest: any): Promise<CallToolResult> {
    // Access the underlying Server instance from SimplifiedMCPServer
    const server = this.mcpServer.getServer();
    
    // Get the call tool request handler
    const handlers = (server as any)._requestHandlers;
    const callToolHandler = handlers?.get('tools/call');
    
    if (!callToolHandler) {
      throw {
        code: -32601, // Method not found
        message: 'Tool call handler not available'
      };
    }

    // Execute the handler with the mock request
    const result = await callToolHandler(mockRequest);
    
    return result;
  }

  /**
   * Extract authentication token from request
   */
  private extractAuthToken(params: CallToolParams, context: RequestContext): string | null {
    // Try to get token from arguments first (for backward compatibility)
    if (params.arguments?.token && typeof params.arguments.token === 'string') {
      return params.arguments.token;
    }

    if (params.arguments?.access_token && typeof params.arguments.access_token === 'string') {
      return params.arguments.access_token;
    }

    // In a real implementation, we would extract this from SSE connection headers
    // For now, return null to indicate missing token
    return null;
  }

  /**
   * Check if error is already an MCP-formatted error
   */
  private isMCPError(error: any): boolean {
    return (
      error &&
      typeof error.code === 'number' &&
      typeof error.message === 'string'
    );
  }
}

/**
 * Factory function to create MCP protocol handler
 */
export function createMCPProtocolHandler(config?: MCPHandlerConfig): MCPProtocolHandler {
  return new MCPProtocolHandler(config);
}