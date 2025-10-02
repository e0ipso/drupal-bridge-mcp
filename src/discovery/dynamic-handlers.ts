/**
 * Dynamic Handler Registration
 *
 * Registers MCP tool handlers dynamically based on discovered tool definitions.
 * Converts JSON Schema to Zod for runtime validation and proxies requests to
 * Drupal JSON-RPC endpoints with OAuth authentication.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { convertJsonSchemaToZod } from 'zod-from-json-schema';
import type { ToolDefinition } from './tool-discovery.js';

interface DynamicToolContext {
  tool: ToolDefinition;
  schema: any; // Using any to handle Zod version differences
}

/**
 * Session interface matching the existing OAuth provider session structure
 */
export interface Session {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * Convert tool schemas with error handling
 */
function convertToolSchemas(
  tools: ToolDefinition[]
): Map<string, DynamicToolContext> {
  const toolContexts = new Map<string, DynamicToolContext>();

  for (const tool of tools) {
    try {
      // Convert JSON Schema to Zod schema using zod-from-json-schema
      // Cast to any to handle version differences between zod v3 and v4
      const zodSchema = convertJsonSchemaToZod(tool.inputSchema as any);

      toolContexts.set(tool.name, {
        tool,
        schema: zodSchema as any,
      });

      console.log(`✓ Registered schema for tool: ${tool.name}`);
    } catch (error) {
      // Log warning but continue with other tools
      console.warn(
        `⚠ Skipping tool "${tool.name}": Schema conversion failed.`,
        error instanceof Error ? error.message : String(error)
      );
      console.warn(
        `  Input schema:`,
        JSON.stringify(tool.inputSchema, null, 2)
      );
    }
  }

  return toolContexts;
}

/**
 * Register dynamic tools with the MCP server
 *
 * This function registers a single CallToolRequestSchema handler that dynamically
 * routes to discovered tools based on tool name. It validates parameters with
 * Zod schemas and handles OAuth token propagation.
 *
 * @param server - MCP Server instance
 * @param tools - Array of discovered tool definitions
 * @param makeRequest - Function to make authenticated JSON-RPC requests
 * @param getSession - Function to retrieve session tokens
 */
export function registerDynamicTools(
  server: Server,
  tools: ToolDefinition[],
  makeRequest: (
    method: string,
    params: unknown,
    token?: string
  ) => Promise<unknown>,
  getSession: (sessionId: string) => Promise<Session | null>
): void {
  // Convert schemas and create tool contexts
  const toolContexts = convertToolSchemas(tools);

  if (toolContexts.size === 0) {
    throw new Error(
      'No valid tools after schema conversion. All tools had invalid ' +
        'JSON schemas. Cannot start MCP server without any tools.'
    );
  }

  // Register single CallToolRequest handler with dynamic routing
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const toolName = request.params.name;
    const context = toolContexts.get(toolName);

    // Handle unknown tool
    if (!context) {
      const availableTools = Array.from(toolContexts.keys()).join(', ');
      throw new Error(
        `Unknown tool: "${toolName}". Available tools: ${availableTools}`
      );
    }

    // Handle OAuth authentication if required
    let accessToken: string | undefined;
    if (context.tool.requiresAuth) {
      const sessionId = extra?.sessionId;

      if (!sessionId) {
        throw new Error(
          `Tool "${toolName}" requires authentication but no session ID ` +
            `provided. Use auth_login to authenticate first.`
        );
      }

      const session = await getSession(sessionId);

      if (!session?.accessToken) {
        throw new Error(
          `Tool "${toolName}" requires authentication. Session expired or ` +
            `invalid. Use auth_login to authenticate.`
        );
      }

      accessToken = session.accessToken;
    }

    // Validate parameters with Zod schema
    let validatedParams: unknown;
    try {
      validatedParams = context.schema.parse(request.params.arguments || {});
    } catch (zodError) {
      // Format Zod validation errors nicely
      throw new Error(
        `Invalid parameters for tool "${toolName}": ` +
          `${zodError instanceof Error ? zodError.message : String(zodError)}`
      );
    }

    // Proxy request to Drupal JSON-RPC endpoint
    try {
      const result = await makeRequest(
        context.tool.method,
        validatedParams,
        accessToken
      );

      // Format response for MCP
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (drupalError) {
      // Add context to Drupal errors
      throw new Error(
        `Tool "${toolName}" execution failed: ` +
          `${drupalError instanceof Error ? drupalError.message : String(drupalError)}`
      );
    }
  });

  console.log(`✓ Registered ${toolContexts.size} dynamic tool handlers`);
}
