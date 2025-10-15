import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { DrupalConnector } from '../../drupal/connector.js';
import { DrupalOAuthProvider } from '../../oauth/provider.js';

/**
 * Input schema for get_tutorial tool
 */
export const getTutorialSchema = z.object({
  id: z.string().describe('Tutorial ID'),
});

/**
 * Context required for get_tutorial tool execution
 */
export interface GetTutorialContext {
  sessionId: string;
  oauthProvider: DrupalOAuthProvider;
  drupalConnector: DrupalConnector;
}

/**
 * Retrieve tutorial by ID
 *
 * Authenticates using session-based OAuth token and retrieves
 * a specific tutorial from Drupal via JSON-RPC.
 *
 * @param params - Tutorial ID parameter
 * @param context - Execution context with session and providers
 * @returns MCP tool response with full tutorial data
 * @throws McpError if authentication fails, ID is invalid, or tutorial not found
 */
export async function getTutorial(
  params: z.infer<typeof getTutorialSchema>,
  context: GetTutorialContext
) {
  const { sessionId, oauthProvider, drupalConnector } = context;
  const { id } = params;

  // Validate ID format (basic check)
  if (!id || id.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, 'Tutorial ID cannot be empty');
  }

  // Step 1: Retrieve OAuth token from session
  const token = await oauthProvider.getToken(sessionId);

  if (!token) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Authentication required. Please use the Authenticate button to login.'
    );
  }

  // Step 2: Call DrupalConnector with token
  try {
    const tutorial = await drupalConnector.getTutorial(id, token);

    // Step 3: Return full tutorial data
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(tutorial, null, 2),
        },
      ],
    };
  } catch (error) {
    // DrupalConnector already throws MCP errors, re-throw them
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(ErrorCode.InvalidRequest, `Tutorial not found: ${id}`);
  }
}
