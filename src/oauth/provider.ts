/**
 * Drupal OAuth Provider
 *
 * Implements OAuth server provider that proxies authentication
 * to a Drupal OAuth 2.1 server (Simple OAuth module).
 */

import {
  ProxyOAuthServerProvider,
  type ProxyEndpoints,
  type ProxyOptions,
} from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import {
  OAuthClientInformationFull,
  OAuthClientInformationFullSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthConfigManager } from './config.js';
import type { TokenResponse } from './device-flow-types.js';
import { DeviceFlow } from './device-flow.js';

/**
 * Token introspection response from Drupal
 */
interface DrupalTokenIntrospection {
  active: boolean;
  client_id?: string;
  scope?: string;
  exp?: number;
  aud?: string | string[];
}

/**
 * Drupal OAuth provider that proxies to Drupal OAuth server
 */
export class DrupalOAuthProvider extends ProxyOAuthServerProvider {
  private readonly configManager: OAuthConfigManager;
  private readonly drupalUrl: string;
  private clientCache: Map<string, OAuthClientInformationFull> = new Map();
  private sessionTokens: Map<string, TokenResponse> = new Map();

  constructor(configManager: OAuthConfigManager) {
    const config = configManager.getConfig();

    // Create endpoints from Drupal OAuth metadata
    // These will be updated after metadata discovery
    const endpoints: ProxyEndpoints = {
      authorizationUrl: `${config.drupalUrl}/oauth/authorize`,
      tokenUrl: `${config.drupalUrl}/oauth/token`,
      revocationUrl: `${config.drupalUrl}/oauth/revoke`,
    };

    const options: ProxyOptions = {
      endpoints,
      verifyAccessToken: async (token: string) => this.verifyToken(token),
      getClient: async (clientId: string) => this.getClientInfo(clientId),
    };

    super(options);

    this.configManager = configManager;
    this.drupalUrl = config.drupalUrl;

    // Initialize with actual endpoints from metadata
    this.initializeEndpoints().catch(error => {
      console.error('Failed to initialize OAuth endpoints:', error);
    });
  }

  /**
   * Initializes OAuth endpoints from discovered metadata
   */
  private async initializeEndpoints(): Promise<void> {
    try {
      const metadata = await this.configManager.fetchMetadata();

      // Update endpoints with discovered values
      this._endpoints.authorizationUrl = metadata.authorization_endpoint;
      this._endpoints.tokenUrl = metadata.token_endpoint;

      if (metadata.revocation_endpoint) {
        this._endpoints.revocationUrl = metadata.revocation_endpoint;
      }

      console.log('OAuth endpoints initialized from Drupal metadata');
    } catch (error) {
      console.error('Failed to discover OAuth endpoints:', error);
      // Keep using the default endpoints
    }
  }

  /**
   * Verifies an access token with Drupal's introspection endpoint
   */
  private async verifyToken(token: string): Promise<AuthInfo> {
    const config = this.configManager.getConfig();
    const metadata = await this.configManager.fetchMetadata();

    // Use introspection endpoint if available, otherwise validate locally
    const introspectionUrl =
      metadata.introspection_endpoint || `${this.drupalUrl}/oauth/introspect`;

    try {
      const response = await fetch(introspectionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(
            `${config.clientId}:${config.clientSecret}`
          ).toString('base64')}`,
        },
        body: new URLSearchParams({
          token,
          token_type_hint: 'access_token',
        }),
      });

      if (!response.ok) {
        throw new Error(`Token introspection failed: ${response.status}`);
      }

      const introspection: DrupalTokenIntrospection = await response.json();

      if (!introspection.active) {
        throw new Error('Token is not active');
      }

      // Parse scopes
      const scopes = introspection.scope
        ? introspection.scope.split(/[\s,]+/).filter(s => s.length > 0)
        : [];

      // Create AuthInfo
      const authInfo: AuthInfo = {
        token,
        clientId: introspection.client_id || config.clientId,
        scopes,
        expiresAt: introspection.exp,
      };

      // Add resource if present
      if (introspection.aud) {
        const audience = Array.isArray(introspection.aud)
          ? introspection.aud[0]
          : introspection.aud;
        if (audience) {
          try {
            authInfo.resource = new URL(audience);
          } catch {
            // Invalid URL, skip resource field
          }
        }
      }

      return authInfo;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Token verification failed: ${error.message}`);
      }
      throw new Error('Token verification failed: Unknown error');
    }
  }

  /**
   * Gets OAuth client information
   */
  private async getClientInfo(
    clientId: string
  ): Promise<OAuthClientInformationFull | undefined> {
    // Check cache first
    if (this.clientCache.has(clientId)) {
      return this.clientCache.get(clientId);
    }

    const config = this.configManager.getConfig();

    // If this is our configured client, return its info
    if (clientId === config.clientId) {
      const metadata = await this.configManager.fetchMetadata();

      const clientInfo: OAuthClientInformationFull = {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uris: [], // Will be provided by client during authorization
        grant_types: metadata.grant_types_supported || [
          'authorization_code',
          'refresh_token',
        ],
        response_types: metadata.response_types_supported || ['code'],
        token_endpoint_auth_method:
          metadata.token_endpoint_auth_methods_supported?.[0] ||
          'client_secret_basic',
        scope: config.scopes.join(' '),
      };

      // Validate with schema
      const validated = OAuthClientInformationFullSchema.parse(clientInfo);

      // Cache it
      this.clientCache.set(clientId, validated);

      return validated;
    }

    // For other clients, we don't have information
    return undefined;
  }

  /**
   * Clears the client cache
   */
  clearClientCache(): void {
    this.clientCache.clear();
  }

  /**
   * Authenticates using device authorization grant flow
   * @param {string} sessionId Session identifier
   * @returns {Promise<TokenResponse>} OAuth tokens
   */
  async authenticateDeviceFlow(sessionId: string): Promise<TokenResponse> {
    const config = this.configManager.getConfig();
    const metadata = await this.configManager.fetchMetadata();

    // Create device flow handler
    const deviceFlow = new DeviceFlow(config, metadata);

    // Execute authentication flow
    const tokens = await deviceFlow.authenticate();

    // Store tokens for this session
    this.sessionTokens.set(sessionId, tokens);

    return tokens;
  }

  /**
   * Gets the access token for a session
   * @param {string} sessionId Session identifier
   * @returns {Promise<string | null>} Access token or null if not authenticated
   */
  async getToken(sessionId: string): Promise<string | null> {
    const tokenResponse = this.sessionTokens.get(sessionId);
    return tokenResponse?.access_token || null;
  }

  /**
   * Clears the session and removes stored tokens
   * @param {string} sessionId Session identifier
   * @returns {Promise<void>}
   */
  async clearSession(sessionId: string): Promise<void> {
    const tokenResponse = this.sessionTokens.get(sessionId);

    // Optionally revoke token with Drupal if revocation is supported
    if (tokenResponse && this.revokeToken) {
      try {
        const clientInfo = await this.getClientInfo(
          this.configManager.getConfig().clientId
        );
        if (clientInfo) {
          await this.revokeToken(clientInfo, {
            token: tokenResponse.access_token,
            token_type_hint: 'access_token',
          });
        }
      } catch (error) {
        // Log error but don't throw - still clear the session
        console.error('Token revocation failed:', error);
      }
    }

    // Clear session from storage
    this.sessionTokens.delete(sessionId);
  }

  /**
   * Gets the token expiration time for a session
   * @param {string} sessionId Session identifier
   * @returns {Promise<string | null>} ISO 8601 expiration time or null
   */
  async getTokenExpiration(sessionId: string): Promise<string | null> {
    const tokenResponse = this.sessionTokens.get(sessionId);

    if (!tokenResponse || !tokenResponse.expires_in) {
      return null;
    }

    // Calculate expiration time from current time + expires_in seconds
    // Note: In a production system, you'd want to store the issue time
    // For now, we'll estimate based on current time (this is imprecise)
    const expirationDate = new Date(
      Date.now() + tokenResponse.expires_in * 1000
    );
    return expirationDate.toISOString();
  }

  /**
   * Gets the scopes for a session's token
   * @param {string} sessionId Session identifier
   * @returns {Promise<string[] | null>} Array of scope strings or null
   */
  async getTokenScopes(sessionId: string): Promise<string[] | null> {
    const tokenResponse = this.sessionTokens.get(sessionId);

    if (!tokenResponse || !tokenResponse.scope) {
      return null;
    }

    // Parse scope string into array
    return tokenResponse.scope.split(/[\s,]+/).filter(s => s.length > 0);
  }
}

/**
 * Creates a Drupal OAuth provider from configuration
 */
export function createDrupalOAuthProvider(
  configManager: OAuthConfigManager
): DrupalOAuthProvider {
  return new DrupalOAuthProvider(configManager);
}
