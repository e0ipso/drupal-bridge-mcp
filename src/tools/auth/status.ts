/**
 * auth_status Tool
 *
 * Checks the current authentication status and returns
 * information about the session's OAuth token.
 */

import { z } from 'zod';
import type { DrupalOAuthProvider } from '../../oauth/provider.js';

/**
 * Input schema for auth_status tool
 * No parameters required - uses session ID from context
 */
export const authStatusSchema = z.object({});

/**
 * Context provided to the auth_status handler
 */
export interface AuthStatusContext {
  sessionId: string;
  oauthProvider: DrupalOAuthProvider;
}

/**
 * Checks the current authentication status
 *
 * Returns information about the current session's authentication state:
 * - Whether the session is authenticated
 * - Token expiration time (if authenticated)
 * - Granted OAuth scopes (if authenticated)
 *
 * @param {z.infer<typeof authStatusSchema>} params Input parameters (empty)
 * @param {AuthStatusContext} context Request context with session ID and OAuth provider
 * @returns MCP tool response with authentication status
 */
export async function authStatus(
  params: z.infer<typeof authStatusSchema>,
  context: AuthStatusContext
) {
  const { sessionId, oauthProvider } = context;

  const token = await oauthProvider.getToken(sessionId);
  const authenticated = token !== null;

  let expiresAt: string | undefined;
  let scopes: string[] | undefined;

  if (authenticated) {
    const expiration = await oauthProvider.getTokenExpiration(sessionId);
    expiresAt = expiration || undefined;

    const tokenScopes = await oauthProvider.getTokenScopes(sessionId);
    scopes = tokenScopes || undefined;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          authenticated,
          expiresAt,
          scopes,
        }),
      },
    ],
  };
}
