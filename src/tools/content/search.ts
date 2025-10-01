import { z } from 'zod';
import {
  McpError,
  ErrorCode,
  type ClientCapabilities,
} from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { DrupalConnector } from '../../drupal/connector.js';
import { DrupalOAuthProvider } from '../../oauth/provider.js';

/**
 * Input schema for search_tutorial tool
 */
export const searchTutorialSchema = z.object({
  query: z.string().describe('Search keywords'),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe('Maximum results (Drupal enforces server-side limits)'),
});

/**
 * Context required for search_tutorial tool execution
 */
export interface SearchTutorialContext {
  sessionId: string;
  oauthProvider: DrupalOAuthProvider;
  drupalConnector: DrupalConnector;
  samplingCapabilities?: ClientCapabilities;
  server: Server;
}

/**
 * Search tutorials by keyword query
 *
 * Authenticates using session-based OAuth token and searches
 * the Drupal tutorial repository via JSON-RPC.
 *
 * @param params - Search parameters (query and optional limit)
 * @param context - Execution context with session and providers
 * @returns MCP tool response with search results
 * @throws McpError if authentication fails or search encounters errors
 */
export async function searchTutorial(
  params: z.infer<typeof searchTutorialSchema>,
  context: SearchTutorialContext
) {
  const { sessionId, oauthProvider, drupalConnector } = context;
  const { query, limit } = params;

  // Step 1: Retrieve OAuth token from session
  const token = await oauthProvider.getToken(sessionId);

  if (!token) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Authentication required. Please login first using auth_login tool.'
    );
  }

  // Step 2: Call DrupalConnector with token
  try {
    const searchResponse = await drupalConnector.searchTutorial(
      query,
      token,
      limit
    );

    // Step 3: Format results as MCP tool response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(searchResponse, null, 2),
        },
      ],
    };
  } catch (error) {
    // DrupalConnector already throws MCP errors, re-throw them
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Tutorial search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
