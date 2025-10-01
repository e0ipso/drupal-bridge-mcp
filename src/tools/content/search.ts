import { z } from 'zod';
import {
  McpError,
  ErrorCode,
  type ClientCapabilities,
} from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { DrupalConnector } from '../../drupal/connector.js';
import { DrupalOAuthProvider } from '../../oauth/provider.js';
import {
  analyzeQuery,
  type EnhancedSearchParams,
} from '../../sampling/query-analyzer.js';

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
 * Uses AI-powered query analysis when sampling is available to optimize
 * search keywords and extract user intent.
 *
 * @param params - Search parameters (query and optional limit)
 * @param context - Execution context with session and providers
 * @returns MCP tool response with search results and AI enhancement metadata
 * @throws McpError if authentication fails or search encounters errors
 */
export async function searchTutorial(
  params: z.infer<typeof searchTutorialSchema>,
  context: SearchTutorialContext
) {
  const {
    sessionId,
    oauthProvider,
    drupalConnector,
    samplingCapabilities,
    server,
  } = context;
  const { query, limit } = params;

  // Step 1: Retrieve OAuth token from session
  const token = await oauthProvider.getToken(sessionId);

  if (!token) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Authentication required. Please login first using auth_login tool.'
    );
  }

  // Step 2: Attempt AI enhancement if available
  let enhancedParams: EnhancedSearchParams | null = null;
  let aiEnhanced = false;

  const canUseSampling = samplingCapabilities?.sampling !== undefined && server;

  if (canUseSampling) {
    try {
      enhancedParams = await analyzeQuery(query, { server, sessionId });
      if (enhancedParams) {
        aiEnhanced = true;
        console.log('Using AI-enhanced search parameters');
      }
    } catch (error) {
      // analyzeQuery should never throw, but handle defensively
      console.warn('AI analysis unexpected error:', error);
    }
  }

  // Step 3: Build search parameters
  // Use optimized keywords if available, otherwise use original query
  const searchQuery = enhancedParams?.optimizedKeywords.join(' ') || query;

  // Step 4: Call DrupalConnector with token
  try {
    const searchResponse = await drupalConnector.searchTutorial(
      searchQuery,
      token,
      limit
    );

    // Step 5: Format results with AI enhancement metadata
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...searchResponse,
              metadata: {
                aiEnhanced,
                ...(aiEnhanced && enhancedParams
                  ? {
                      intent: enhancedParams.intent,
                      contentTypes: enhancedParams.contentTypes,
                      drupalVersions: enhancedParams.drupalVersions,
                    }
                  : {}),
              },
            },
            null,
            2
          ),
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
