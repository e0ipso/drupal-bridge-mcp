/**
 * auth_logout Tool
 *
 * Logs out the current session by clearing stored tokens
 * and optionally revoking them with the Drupal OAuth server.
 */

import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { DrupalOAuthProvider } from '../../oauth/provider.js';

/**
 * Input schema for auth_logout tool
 * No parameters required - uses session ID from context
 */
export const authLogoutSchema = z.object({});

/**
 * Context provided to the auth_logout handler
 */
export interface AuthLogoutContext {
  sessionId: string;
  oauthProvider: DrupalOAuthProvider;
}

/**
 * Logs out the current session
 *
 * This performs the following actions:
 * 1. Revokes the access token with Drupal (if revocation is supported)
 * 2. Clears the stored tokens from the session
 *
 * @param {z.infer<typeof authLogoutSchema>} params Input parameters (empty)
 * @param {AuthLogoutContext} context Request context with session ID and OAuth provider
 * @returns MCP tool response with logout status
 * @throws {McpError} If logout fails
 */
export async function authLogout(
  params: z.infer<typeof authLogoutSchema>,
  context: AuthLogoutContext
) {
  const { sessionId, oauthProvider } = context;

  try {
    // Clear session from storage (this also attempts token revocation)
    await oauthProvider.clearSession(sessionId);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            status: 'logged_out',
            message: 'Successfully logged out. Session cleared.',
          }),
        },
      ],
    };
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
