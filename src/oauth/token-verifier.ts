/**
 * Drupal Token Verifier
 *
 * Implements resource server token verification using JWT signature validation.
 * This verifier validates OAuth access tokens against Drupal's JWKS endpoint
 * and extracts authentication information for request authorization.
 */

import { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { verifyJWT } from './jwt-verifier.js';
import type { OAuthConfigManager } from './config.js';

/**
 * Token verifier for Drupal OAuth 2.1 access tokens
 *
 * Validates JWT access tokens using Drupal's public keys (JWKS)
 * and extracts authentication information for MCP server authorization.
 */
export class DrupalTokenVerifier implements OAuthTokenVerifier {
  private readonly configManager: OAuthConfigManager;

  constructor(configManager: OAuthConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Verifies an access token and returns authentication information
   *
   * @param token - JWT access token to verify
   * @returns AuthInfo with token metadata and claims
   * @throws Error if token is invalid, expired, or verification fails
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      // Fetch OAuth metadata and verify JWT signature
      const metadata = await this.configManager.fetchMetadata();
      const payload = await verifyJWT(token, metadata);

      // Extract scopes from JWT payload
      // Handle both space-separated string and array formats
      const scopes = payload.scope
        ? (payload.scope as string).split(/[\s,]+/).filter(s => s.length > 0)
        : [];

      // Build AuthInfo from JWT claims
      const authInfo: AuthInfo = {
        token,
        clientId: (payload.client_id as string) || 'unknown',
        scopes,
        expiresAt: payload.exp as number | undefined,
      };

      // Extract resource (audience) as URL if present
      if (payload.aud) {
        const audience = Array.isArray(payload.aud)
          ? payload.aud[0]
          : payload.aud;
        if (audience && typeof audience === 'string') {
          try {
            authInfo.resource = new URL(audience);
          } catch {
            // Ignore invalid resource URIs - not required field
          }
        }
      }

      return authInfo;
    } catch (error) {
      // Provide descriptive error messages for verification failures
      if (error instanceof Error) {
        throw new Error(`Token verification failed: ${error.message}`);
      }
      throw new Error('Token verification failed: Unknown error');
    }
  }
}
