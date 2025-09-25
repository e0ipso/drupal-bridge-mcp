#!/usr/bin/env node
/**
 * Minimal Drupal MCP Server - 350 lines vs 6000 lines
 * Based on MCP TypeScript implementation research
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ============================================================================
// 1. Simple OAuth Client (~50 lines)
// ============================================================================

class SimpleOAuth {
  private token?: string;
  private tokenExpiry?: number;

  constructor(
    private baseUrl: string,
    private clientId: string,
    private clientSecret?: string
  ) {}

  async getToken(): Promise<string> {
    // Check if token is still valid
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    // Get new token
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        ...(this.clientSecret && { client_secret: this.clientSecret })
      })
    });

    if (!response.ok) {
      throw new Error(`OAuth failed: ${response.statusText}`);
    }

    const data = await response.json();
    this.token = data.access_token;
    this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 10000; // 10s buffer

    return this.token;
  }

  clearToken(): void {
    this.token = undefined;
    this.tokenExpiry = undefined;
  }
}

// ============================================================================
// 2. Simple Drupal JSON-RPC Client (~80 lines)
// ============================================================================

class DrupalClient {
  constructor(
    private baseUrl: string,
    private oauth: SimpleOAuth
  ) {}

  private async jsonRpc(method: string, params?: any): Promise<any> {
    const token = await this.oauth.getToken();

    const response = await fetch(`${this.baseUrl}/jsonrpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params
      })
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(`Drupal RPC Error: ${result.error.message}`);
    }

    return result.result;
  }

  async searchTutorials(params: {
    keywords: string;
    types?: string[];
    drupal_version?: string[];
    limit?: number;
    offset?: number;
  }) {
    return this.jsonRpc('tutorial.search', params);
  }

  async loadNode(nodeId: string) {
    return this.jsonRpc('entity.load', {
      entity_type: 'node',
      entity_id: nodeId
    });
  }

  async createNode(params: {
    type: string;
    title: string;
    body?: string;
    status?: boolean;
  }) {
    return this.jsonRpc('node.create', params);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.jsonRpc('system.connect');
      return true;
    } catch {
      return false;
    }
  }
}

// ============================================================================
// 3. MCP Server Implementation (~150 lines)
// ============================================================================

class MinimalDrupalMcpServer {
  private server: Server;
  private drupalClient: DrupalClient;

  constructor() {
    // Configuration from environment
    const baseUrl = process.env.DRUPAL_BASE_URL || 'https://drupalize.me';
    const clientId = process.env.OAUTH_CLIENT_ID;
    const clientSecret = process.env.OAUTH_CLIENT_SECRET;

    if (!clientId) {
      throw new Error('OAUTH_CLIENT_ID environment variable is required');
    }

    // Initialize components
    const oauth = new SimpleOAuth(baseUrl, clientId, clientSecret);
    this.drupalClient = new DrupalClient(baseUrl, oauth);

    // Initialize MCP server
    this.server = new Server(
      { name: "drupal-mcp", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_tutorials",
          description: "Search Drupal tutorials and educational content",
          inputSchema: {
            type: "object",
            properties: {
              keywords: {
                type: "string",
                description: "Search keywords (minimum 2 characters)",
                minLength: 2
              },
              types: {
                type: "array",
                description: "Filter by content types",
                items: {
                  type: "string",
                  enum: ["tutorial", "topic", "course", "video", "guide"]
                }
              },
              drupal_version: {
                type: "array",
                description: "Filter by Drupal versions",
                items: {
                  type: "string",
                  enum: ["9", "10", "11"]
                }
              },
              limit: {
                type: "number",
                description: "Maximum number of results",
                minimum: 1,
                maximum: 100,
                default: 10
              }
            },
            required: ["keywords"]
          }
        },
        {
          name: "load_node",
          description: "Load a Drupal node by ID",
          inputSchema: {
            type: "object",
            properties: {
              nodeId: {
                type: ["string", "number"],
                description: "The node ID to load"
              }
            },
            required: ["nodeId"]
          }
        },
        {
          name: "create_node",
          description: "Create a new Drupal node",
          inputSchema: {
            type: "object",
            properties: {
              type: {
                type: "string",
                description: "The node type (e.g., 'article', 'page')"
              },
              title: {
                type: "string",
                description: "The node title"
              },
              body: {
                type: "string",
                description: "The node body content"
              },
              status: {
                type: "boolean",
                description: "Whether the node is published",
                default: true
              }
            },
            required: ["type", "title"]
          }
        },
        {
          name: "test_connection",
          description: "Test connection to Drupal server",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    }));

    // Execute tools
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result: any;

        switch (name) {
          case "search_tutorials":
            result = await this.drupalClient.searchTutorials(args as any);
            break;

          case "load_node":
            const { nodeId } = args as any;
            result = await this.drupalClient.loadNode(String(nodeId));
            break;

          case "create_node":
            result = await this.drupalClient.createNode(args as any);
            break;

          case "test_connection":
            const connected = await this.drupalClient.testConnection();
            result = { connected, server: process.env.DRUPAL_BASE_URL };
            break;

          default:
            throw new Error(`Unknown tool: ${name}`);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: error instanceof Error ? error.message : String(error)
              }, null, 2)
            }
          ]
        };
      }
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Minimal Drupal MCP Server started");
  }
}

// ============================================================================
// 4. Start Server
// ============================================================================

async function main() {
  try {
    const server = new MinimalDrupalMcpServer();
    await server.start();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { MinimalDrupalMcpServer };