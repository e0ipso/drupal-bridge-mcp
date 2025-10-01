/**
 * auth_login Tool
 *
 * Authenticates the user using device authorization grant flow
 * and establishes an authenticated session.
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { DrupalOAuthProvider } from '../../oauth/provider.js';

/**
 * Input schema for auth_login tool
 * No parameters required - uses session ID from context
 */
export const authLoginSchema = z.object({});

/**
 * Context provided to the auth_login handler
 */
export interface AuthLoginContext {
  sessionId: string;
  oauthProvider: DrupalOAuthProvider;
}

/**
 * Authenticates the user using device authorization grant flow
 *
 * This triggers the complete device flow authentication process:
 * 1. Initiates device authorization request with Drupal
 * 2. Displays verification URL and user code to the user
 * 3. Polls for authorization completion
 * 4. Stores the resulting tokens in the session
 *
 * @param {z.infer<typeof authLoginSchema>} params Input parameters (empty)
 * @param {AuthLoginContext} context Request context with session ID and OAuth provider
 * @returns MCP tool response with authentication status
 * @throws {McpError} If authentication fails
 */
export async function authLogin(
  params: z.infer<typeof authLoginSchema>,
  context: AuthLoginContext
) {
  const { sessionId, oauthProvider } = context;

  try {
    // Trigger device flow authentication
    // This will display verification URL/code to user via device flow UI
    await oauthProvider.authenticateDeviceFlow(sessionId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'authenticated',
            sessionId,
            message: 'Successfully authenticated. Session established.',
          }),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
