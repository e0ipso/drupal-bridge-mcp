/**
 * MCP Server factory and configuration
 * 
 * Creates and configures the Model Context Protocol server with all necessary
 * tools and handlers for Drupal integration.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema 
} from '@modelcontextprotocol/sdk/types.js';

import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

/**
 * Creates and configures the MCP server instance
 */
export async function createServer(): Promise<Server> {
  const server = new Server(
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

  // Set up tool handlers
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Tools will be registered here as we implement them
        {
          name: 'search_content',
          description: 'Search Drupalize.me content with subscription-aware access',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for content',
              },
              content_type: {
                type: 'string',
                description: 'Content type filter (tutorial, guide, etc.)',
                enum: ['tutorial', 'guide', 'blog', 'all'],
                default: 'all',
              },
            },
            required: ['query'],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'search_content': {
        // Implementation will be added when we build the Drupal integration
        logger.info('Search content tool called', { args });
        
        return {
          content: [
            {
              type: 'text',
              text: 'Content search functionality will be implemented in the Drupal integration layer.',
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  logger.info('MCP Server created and configured');
  
  return server;
}