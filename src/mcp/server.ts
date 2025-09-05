/**
 * MCP server implementation for Drupal integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import type { AppConfig } from '@/config/index.js';
import type { McpResource, McpTool, McpPrompt } from '@/types/index.js';
import { DrupalClient, DrupalClientError } from '@/services/drupal-client.js';

/**
 * MCP server for Drupal integration
 */
export class DrupalMcpServer {
  private readonly server: Server;
  private readonly drupalClient: DrupalClient;

  constructor(private readonly config: AppConfig) {
    this.server = new Server(
      {
        name: config.mcp.name,
        version: config.mcp.version,
      },
      {
        capabilities: config.mcp.capabilities as any,
      }
    );

    this.drupalClient = new DrupalClient(config.drupal);
    this.setupHandlers();
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
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return this.readResource(request.params.uri);
    });

    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.executeTool(request.params.name, request.params.arguments);
    });

    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: this.getPrompts(),
      };
    });

    // Get prompt
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
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
  private async readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string }> }> {
    try {
      let content: unknown;
      
      switch (uri) {
        case 'drupal://nodes':
          content = await this.drupalClient.getNodes({ limit: 10 });
          break;
          
        case 'drupal://entities':
          content = await this.drupalClient.queryEntities('node', undefined, { limit: 10 });
          break;
          
        default:
          throw new Error(`Unknown resource URI: ${uri}`);
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
      const message = error instanceof DrupalClientError 
        ? error.message 
        : `Failed to read resource: ${String(error)}`;
      
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ error: message }, null, 2),
          },
        ],
      };
    }
  }

  /**
   * Get available tools
   */
  private getTools(): McpTool[] {
    return [
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
    ];
  }

  /**
   * Execute a tool
   */
  private async executeTool(name: string, args: unknown): Promise<{ content: Array<{ type: string; text: string }> }> {
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
          
        default:
          throw new Error(`Unknown tool: ${name}`);
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
      const message = error instanceof DrupalClientError 
        ? error.message 
        : `Tool execution failed: ${String(error)}`;
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: message }, null, 2),
          },
        ],
      };
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

    const { type, title, body, status = true } = args as {
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
    const options = (args as { type?: string; status?: boolean; limit?: number }) || {};
    return this.drupalClient.getNodes(options);
  }

  /**
   * Execute test connection tool
   */
  private async executeTestConnection(): Promise<{ connected: boolean; config: unknown }> {
    const connected = await this.drupalClient.testConnection();
    const config = this.drupalClient.getConfig();
    
    return { connected, config };
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
  private async getPrompt(name: string, args?: Record<string, unknown>): Promise<{ description: string; messages: Array<{ role: string; content: { type: string; text: string } }> }> {
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
  ): Promise<{ description: string; messages: Array<{ role: string; content: { type: string; text: string } }> }> {
    const contentType = args?.content_type as string | undefined;
    const limit = (args?.limit as number) || 10;

    try {
      const nodes = await this.drupalClient.getNodes({
        type: contentType,
        limit,
      });

      const content = `Here are the recent Drupal nodes${contentType ? ` of type "${contentType}"` : ''}:\n\n${nodes
        .map((node, index) => `${index + 1}. ${node.attributes.title} (ID: ${node.attributes.nid})`)
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
      const errorMessage = error instanceof DrupalClientError 
        ? error.message 
        : String(error);

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
  async connect(transport: any): Promise<void> {
    await this.server.connect(transport);
  }

  /**
   * Close the server
   */
  async close(): Promise<void> {
    await this.server.close();
  }
}