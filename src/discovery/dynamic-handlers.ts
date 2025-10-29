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
 * Extracts scopes from a JWT access token.
 *
 * Decodes the JWT (without verification - verification happens elsewhere)
 * and extracts the scope claim from the payload. Handles both space-separated
 * string format and array format.
 *
 * @param token - JWT access token
 * @returns Array of scope strings, or empty array if no scopes or invalid token
 */
function extractScopesFromToken(token: string): string[] {
  try {
    // Decode JWT payload (base64url decode the middle part)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return [];
    }

    const payload = parts[1];
    if (!payload) {
      return [];
    }

    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf-8')
    ) as Record<string, unknown>;

    const scopeClaim = decoded.scope;

    if (!scopeClaim) {
      return [];
    }

    // Handle both string (space-separated) and array formats
    if (typeof scopeClaim === 'string') {
      return scopeClaim.split(/[\s,]+/).filter(s => s.length > 0);
    } else if (Array.isArray(scopeClaim)) {
      return scopeClaim.filter(s => typeof s === 'string' && s.length > 0);
    }

    return [];
  } catch {
    // Invalid token format - return empty scopes
    return [];
  }
}

/**
 * Validates tool access for a session.
 *
 * @param tool - Tool definition
 * @param accessToken - OAuth access token (optional)
 * @throws McpError if access is denied
 */
function validateToolAccessForSession(
  tool: ToolDefinition,
  accessToken?: string
): void {
  const authMetadata = tool.annotations?.auth;
  const authLevel = getAuthLevel(authMetadata);

  // Allow access if auth level is 'none'
  if (authLevel === 'none') {
    return;
  }

  // For 'optional' auth, allow access without token
  if (authLevel === 'optional') {
    return;
  }

  // For 'required' auth, enforce authentication
  if (authLevel === 'required') {
    // Require access token
    if (!accessToken) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Tool "${tool.name}" requires authentication. Please authenticate first.`
      );
    }

    // Extract scopes from the access token
    const sessionScopes = extractScopesFromToken(accessToken);

    if (!sessionScopes || sessionScopes.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Tool "${tool.name}" requires authentication. No valid scopes found in token.`
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
 */
export function registerDynamicTools(
  server: Server,
  tools: ToolDefinition[],
  makeRequest: (
    toolName: string,
    params: unknown,
    token?: string,
    sessionId?: string
  ) => Promise<unknown>,
  getSession: (sessionId: string) => Promise<Session | null>,
  localHandlers: Map<string, LocalToolHandler> = new Map()
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

    // Attempt to get OAuth token if available (let Drupal handle auth)
    let accessToken: string | undefined;
    const sessionId = extra?.sessionId;

    if (sessionId) {
      const session = await getSession(sessionId);
      if (session?.accessToken) {
        accessToken = session.accessToken;
      }
    }

    // Validate tool access based on session scopes BEFORE parameter validation
    if (context) {
      validateToolAccessForSession(context.tool, accessToken);
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
        accessToken,
        sessionId // Pass sessionId for reactive refresh
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
