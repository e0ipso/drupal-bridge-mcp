/**
 * Dynamic Handler Registration
 *
 * Registers MCP tool handlers dynamically based on discovered tool definitions.
 * Converts JSON Schema to Zod for runtime validation and proxies requests to
 * Drupal JSON-RPC endpoints with OAuth authentication.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  type CallToolResult,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { convertJsonSchemaToZod } from 'zod-from-json-schema';
import type { z } from 'zod';
import type { ToolDefinition } from './tool-discovery.js';
import { getAuthLevel, validateToolAccess } from './tool-discovery.js';
import type { DrupalOAuthProvider } from '../oauth/provider.js';

interface DynamicToolContext {
  tool: ToolDefinition;
  schema: z.ZodTypeAny;
}

export type LocalToolHandler = (
  params: unknown,
  extra: { sessionId?: string }
) => Promise<CallToolResult>;

/**
 * Session interface matching the existing OAuth provider session structure
 */
export interface Session {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * Validates tool access for a session.
 *
 * @param tool - Tool definition
 * @param oauthProvider - OAuth provider instance (optional)
 * @param sessionId - Session identifier (optional)
 * @throws McpError if access is denied
 */
async function validateToolAccessForSession(
  tool: ToolDefinition,
  oauthProvider?: DrupalOAuthProvider,
  sessionId?: string
): Promise<void> {
  const authMetadata = tool.annotations?.auth;
  const authLevel = getAuthLevel(authMetadata);

  // Allow access if auth level is 'none'
  if (authLevel === 'none') {
    return;
  }

  // For 'optional' auth, allow access without provider/session
  if (authLevel === 'optional') {
    return;
  }

  // For 'required' auth, enforce authentication
  if (authLevel === 'required') {
    // Require OAuth provider and session
    if (!oauthProvider || !sessionId) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Tool "${tool.name}" requires authentication. Please authenticate first.`
      );
    }

    // Get session scopes
    const sessionScopes = await oauthProvider.getTokenScopes(sessionId);

    if (!sessionScopes || sessionScopes.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Tool "${tool.name}" requires authentication. No valid session found.`
      );
    }

    // Validate scopes
    try {
      validateToolAccess(tool, sessionScopes);
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        error instanceof Error ? error.message : 'Access denied'
      );
    }
  }
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
      const zodSchema = convertJsonSchemaToZod(
        tool.inputSchema as Record<string, unknown>
      );

      toolContexts.set(tool.name, {
        tool,
        schema: zodSchema as unknown as z.ZodTypeAny,
      });

      console.log(`✓ Registered schema for tool: ${tool.name}`);
    } catch (error) {
      // Log warning but continue with other tools
      console.warn(
        `⚠ Skipping tool "${tool.name}": Schema conversion failed.`,
        error instanceof Error ? error.message : String(error)
      );
      // Try to stringify schema, but handle circular references
      try {
        console.warn(
          `  Input schema:`,
          JSON.stringify(tool.inputSchema, null, 2)
        );
      } catch {
        console.warn(`  Input schema: <circular or non-serializable>`);
      }
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
 * @param makeRequest - Function to invoke tools via A2A /mcp/tools/invoke endpoint
 * @param getSession - Function to retrieve session tokens
 * @param localHandlers - Map of local tool handlers (optional)
 * @param oauthProvider - OAuth provider instance for scope validation (optional)
 */
export function registerDynamicTools(
  server: Server,
  tools: ToolDefinition[],
  makeRequest: (
    toolName: string,
    params: unknown,
    token?: string
  ) => Promise<unknown>,
  getSession: (sessionId: string) => Promise<Session | null>,
  localHandlers: Map<string, LocalToolHandler> = new Map(),
  oauthProvider?: DrupalOAuthProvider
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
    if (!context && !localHandlers.has(toolName)) {
      const availableTools = Array.from(toolContexts.keys()).join(', ');
      throw new Error(
        `Unknown tool: "${toolName}". Available tools: ${availableTools}`
      );
    }

    // Validate tool access based on session scopes BEFORE parameter validation
    if (context) {
      await validateToolAccessForSession(
        context.tool,
        oauthProvider,
        extra?.sessionId
      );
    }

    // Attempt to get OAuth token if available (let Drupal handle auth)
    let accessToken: string | undefined;
    const sessionId = extra?.sessionId;

    if (sessionId) {
      const session = await getSession(sessionId);
      if (session?.accessToken) {
        accessToken = session.accessToken;
      }
    }

    // Validate parameters with Zod schema
    let validatedParams: unknown;
    try {
      validatedParams = context
        ? context.schema.parse(request.params.arguments || {})
        : request.params.arguments || {};
    } catch (zodError) {
      // Format Zod validation errors nicely
      throw new Error(
        `Invalid parameters for tool "${toolName}": ` +
          `${zodError instanceof Error ? zodError.message : String(zodError)}`
      );
    }

    const localHandler = localHandlers.get(toolName);
    if (localHandler) {
      return await localHandler(validatedParams, { sessionId });
    }

    if (!context) {
      throw new Error(`Tool "${toolName}" is not available`);
    }

    // Proxy request to Drupal via A2A /mcp/tools/invoke endpoint
    try {
      const result = await makeRequest(
        context.tool.name,
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
