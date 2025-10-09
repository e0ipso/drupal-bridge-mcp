/**
 * Drupal OAuth Provider
 *
 * Implements OAuth server provider that proxies authentication
 * to a Drupal OAuth 2.1 server (Simple OAuth module) and manages
 * per-session token storage with automatic refresh support.
 */

import {
  ProxyOAuthServerProvider,
  type ProxyEndpoints,
  type ProxyOptions,
} from '@modelcontextprotocol/sdk/server/auth/providers/proxyProvider.js';
import {
  OAuthClientInformationFull,
  OAuthClientInformationFullSchema,
  type OAuthMetadata,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import debug from 'debug';
import { extractUserId } from './jwt-decoder.js';
import type { OAuthConfigManager, OAuthConfig } from './config.js';
import type { TokenResponse } from './device-flow-types.js';
import { DeviceFlow } from './device-flow.js';

const debugOAuth = debug('mcp:oauth');

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

interface StoredToken extends TokenResponse {
  issuedAt: number;
}

export interface SessionAuthorization {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

/**
 * Drupal OAuth provider that proxies to Drupal OAuth server
 */
export class DrupalOAuthProvider extends ProxyOAuthServerProvider {
  private static readonly TOKEN_EXPIRY_SKEW_MS = 30_000;

  private readonly configManager: OAuthConfigManager;
  private readonly drupalUrl: string;
  private clientCache: Map<string, OAuthClientInformationFull> = new Map();

  private sessionTokens: Map<string, StoredToken> = new Map();
  private userTokens: Map<string, StoredToken> = new Map();
  private sessionToUser: Map<string, string> = new Map();
  private tokenRefreshPromises: Map<string, Promise<StoredToken>> = new Map();

  constructor(configManager: OAuthConfigManager) {
    const config = configManager.getConfig();

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

    this.initializeEndpoints().catch(error => {
      console.error('Failed to initialize OAuth endpoints:', error);
    });
  }

  /**
   * Provides read-only access to OAuth configuration
   */
  getOAuthConfig(): OAuthConfig {
    return this.configManager.getConfig();
  }

  /**
   * Fetches the latest OAuth metadata from Drupal
   */
  async fetchOAuthMetadata(): Promise<OAuthMetadata> {
    return this.configManager.fetchMetadata();
  }

  /**
   * Initializes OAuth endpoints from discovered metadata
   */
  private async initializeEndpoints(): Promise<void> {
    try {
      const metadata = await this.configManager.fetchMetadata();
      this._endpoints.authorizationUrl = metadata.authorization_endpoint;
      this._endpoints.tokenUrl = metadata.token_endpoint;
      if (metadata.revocation_endpoint) {
        this._endpoints.revocationUrl = metadata.revocation_endpoint;
      }
      console.log('OAuth endpoints initialized from Drupal metadata');
    } catch (error) {
      console.error('Failed to discover OAuth endpoints:', error);
      // Keep defaults on failure
    }
  }

  /**
   * Verifies an access token with Drupal's introspection endpoint
   */
  private async verifyToken(token: string): Promise<AuthInfo> {
    const config = this.configManager.getConfig();
    const metadata = await this.configManager.fetchMetadata();
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

      const scopes = introspection.scope
        ? introspection.scope.split(/[\s,]+/).filter(s => s.length > 0)
        : [];

      const authInfo: AuthInfo = {
        token,
        clientId: introspection.client_id || config.clientId,
        scopes,
        expiresAt: introspection.exp,
      };

      if (introspection.aud) {
        const audience = Array.isArray(introspection.aud)
          ? introspection.aud[0]
          : introspection.aud;
        if (audience) {
          try {
            authInfo.resource = new URL(audience);
          } catch {
            // Ignore invalid resource URIs
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
    if (this.clientCache.has(clientId)) {
      return this.clientCache.get(clientId);
    }

    const config = this.configManager.getConfig();

    if (clientId === config.clientId) {
      const metadata = await this.configManager.fetchMetadata();
      const clientInfo: OAuthClientInformationFull = {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uris: [],
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

      const validated = OAuthClientInformationFullSchema.parse(clientInfo);
      this.clientCache.set(clientId, validated);
      return validated;
    }

    return undefined;
  }

  clearClientCache(): void {
    this.clientCache.clear();
  }

  /**
   * Authenticates using device authorization grant flow
   */
  async authenticateDeviceFlow(sessionId: string): Promise<TokenResponse> {
    const config = this.configManager.getConfig();
    const metadata = await this.configManager.fetchMetadata();
    const deviceFlow = new DeviceFlow(config, metadata);
    const tokens = await deviceFlow.authenticate();
    this.storeSessionTokens(sessionId, tokens);
    return tokens;
  }

  /**
   * Stores OAuth tokens for a session and user
   */
  storeSessionTokens(
    sessionId: string,
    tokens: TokenResponse,
    fallbackUserId?: string
  ): StoredToken {
    const userId = this.resolveUserId(tokens.access_token, fallbackUserId || sessionId);
    const previousTokens = this.userTokens.get(userId);

    const storedToken: StoredToken = {
      ...(previousTokens ? { ...previousTokens } : {}),
      ...tokens,
      refresh_token: tokens.refresh_token ?? previousTokens?.refresh_token,
      scope: tokens.scope ?? previousTokens?.scope ?? '',
      issuedAt: Date.now(),
    };

    this.userTokens.set(userId, storedToken);
    this.sessionToUser.set(sessionId, userId);

    for (const [existingSessionId, mappedUser] of this.sessionToUser.entries()) {
      if (mappedUser === userId) {
        this.sessionTokens.set(existingSessionId, storedToken);
      }
    }

    debugOAuth(
      `Session ${sessionId} mapped to user ${userId}. Active users: ${this.userTokens.size}, Active sessions: ${this.sessionToUser.size}`
    );

    return storedToken;
  }

  setSessionTokens(sessionId: string, tokens: TokenResponse): void {
    this.storeSessionTokens(sessionId, tokens);
  }

  captureSessionToken(
    sessionId: string,
    accessToken: string,
    options: { expiresIn?: number; tokenType?: string; scope?: string } = {}
  ): StoredToken {
    const tokenResponse: TokenResponse = {
      access_token: accessToken,
      token_type: options.tokenType || 'Bearer',
      expires_in: options.expiresIn ?? 3600,
      refresh_token: undefined,
      scope: options.scope ?? '',
    };

    return this.storeSessionTokens(sessionId, tokenResponse);
  }

  getUserIdForSession(sessionId: string): string | undefined {
    return this.sessionToUser.get(sessionId);
  }

  getActiveUserCount(): number {
    return this.userTokens.size;
  }

  getActiveSessionCount(): number {
    return this.sessionToUser.size;
  }

  getActiveUserIds(): string[] {
    return Array.from(this.userTokens.keys());
  }

  getSessionMappings(): Array<[string, string]> {
    return Array.from(this.sessionToUser.entries());
  }

  hasUserTokens(userId: string): boolean {
    return this.userTokens.has(userId);
  }

  getAuthenticatedSessionCount(): number {
    let count = 0;
    for (const userId of this.sessionToUser.values()) {
      if (this.userTokens.has(userId)) {
        count++;
      }
    }
    return count;
  }

  detachSession(sessionId: string): void {
    this.sessionTokens.delete(sessionId);
    this.sessionToUser.delete(sessionId);
  }

  async logoutSession(sessionId: string): Promise<void> {
    const userId = this.sessionToUser.get(sessionId);

    if (!userId) {
      this.detachSession(sessionId);
      return;
    }

    const sessionsForUser = this.getSessionMappings()
      .filter(([, mappedUser]) => mappedUser === userId)
      .map(([sid]) => sid);

    for (const sid of sessionsForUser) {
      await this.clearSession(sid);
    }

    this.clearUserTokens(userId);
  }

  async getToken(sessionId: string): Promise<string | null> {
    const tokens = await this.ensureSessionToken(sessionId);
    return tokens?.access_token || null;
  }

  async getSessionAuthorization(
    sessionId: string
  ): Promise<SessionAuthorization | null> {
    const tokens = await this.ensureSessionToken(sessionId);
    if (!tokens) {
      return null;
    }

    const expiresAt = this.calculateExpiresAt(tokens);
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:
        expiresAt ?? Date.now() + (tokens.expires_in ? tokens.expires_in * 1000 : 3600 * 1000),
    };
  }

  async getTokenExpiration(sessionId: string): Promise<string | null> {
    const tokens = await this.ensureSessionToken(sessionId);
    if (!tokens) {
      return null;
    }

    const expiresAt = this.calculateExpiresAt(tokens);
    return expiresAt ? new Date(expiresAt).toISOString() : null;
  }

  async getTokenScopes(sessionId: string): Promise<string[] | null> {
    const tokens = await this.ensureSessionToken(sessionId);
    if (!tokens) {
      return null;
    }

    const scopeSource = tokens.scope || this.configManager.getConfig().scopes.join(' ');
    return scopeSource.split(/[\s,]+/).filter(scope => scope.length > 0);
  }

  /**
   * Clears the session and removes stored tokens for that session
   */
  async clearSession(sessionId: string): Promise<void> {
    const tokenResponse = this.sessionTokens.get(sessionId);

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
        console.error('Token revocation failed:', error);
      }
    }

    this.sessionTokens.delete(sessionId);
    this.sessionToUser.delete(sessionId);
  }

  clearAllSessions(): void {
    this.sessionTokens.clear();
    this.sessionToUser.clear();
    this.userTokens.clear();
    this.tokenRefreshPromises.clear();
  }

  private resolveUserId(accessToken: string, fallback: string): string {
    try {
      const userId = extractUserId(accessToken);
      debugOAuth(`Resolved user ID ${userId} from access token`);
      return userId;
    } catch (error) {
      debugOAuth(
        `Failed to extract user ID from token. Using fallback ${fallback}. Error: ${error instanceof Error ? error.message : String(error)}`
      );
      return fallback;
    }
  }

  private calculateExpiresAt(tokens: StoredToken): number | null {
    if (!tokens.expires_in) {
      return null;
    }
    return tokens.issuedAt + tokens.expires_in * 1000;
  }

  private async ensureSessionToken(
    sessionId: string
  ): Promise<StoredToken | null> {
    const userId = this.sessionToUser.get(sessionId);
    if (!userId) {
      debugOAuth(`Session ${sessionId} is not mapped to a user`);
      return null;
    }

    let tokens = this.userTokens.get(userId);
    if (!tokens) {
      debugOAuth(`No tokens found for user ${userId}`);
      return null;
    }

    let expiresAt = this.calculateExpiresAt(tokens);

    if (
      expiresAt !== null &&
      Date.now() >= expiresAt - DrupalOAuthProvider.TOKEN_EXPIRY_SKEW_MS
    ) {
      debugOAuth(`Token for user ${userId} is expired or near expiry. Attempting refresh.`);

      if (!tokens.refresh_token) {
        debugOAuth(`No refresh token available for user ${userId}. Clearing tokens.`);
        this.clearUserTokens(userId);
        return null;
      }

      try {
        tokens = await this.refreshTokens(userId, sessionId, tokens);
        expiresAt = this.calculateExpiresAt(tokens);
      } catch (error) {
        debugOAuth(
          `Token refresh failed for user ${userId}: ${error instanceof Error ? error.message : String(error)}`
        );
        this.clearUserTokens(userId);
        throw new Error('Authentication expired. Please log in again.');
      }
    }

    this.sessionTokens.set(sessionId, tokens);
    return tokens;
  }

  private async refreshTokens(
    userId: string,
    sessionId: string,
    tokens: StoredToken
  ): Promise<StoredToken> {
    const existingPromise = this.tokenRefreshPromises.get(userId);
    if (existingPromise) {
      return existingPromise;
    }

    const refreshPromise = this.performTokenRefresh(sessionId, tokens)
      .then(refreshed => {
        debugOAuth(`Token refresh successful for user ${userId}`);
        return refreshed;
      })
      .finally(() => {
        this.tokenRefreshPromises.delete(userId);
      });

    this.tokenRefreshPromises.set(userId, refreshPromise);
    return refreshPromise;
  }

  private async performTokenRefresh(
    sessionId: string,
    tokens: StoredToken
  ): Promise<StoredToken> {
    if (!tokens.refresh_token) {
      throw new Error('Refresh token is not available');
    }

    const config = this.configManager.getConfig();
    const metadata = await this.configManager.fetchMetadata();
    const tokenEndpoint = metadata.token_endpoint;

    if (!tokenEndpoint) {
      throw new Error('Token endpoint not available in OAuth metadata');
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: config.clientId,
    });

    if (config.clientSecret) {
      params.append('client_secret', config.clientSecret);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: params.toString(),
    });

    const responseText = await response.text();

    if (!response.ok) {
      let errorMessage = `Token refresh failed: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(responseText);
        if (errorJson.error) {
          errorMessage = `Token refresh failed: ${errorJson.error}`;
          if (errorJson.error_description) {
            errorMessage += ` - ${errorJson.error_description}`;
          }
        }
      } catch {
        if (responseText) {
          errorMessage += ` - ${responseText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const refreshed = JSON.parse(responseText) as TokenResponse;
    const normalizedTokens: TokenResponse = {
      access_token: refreshed.access_token,
      token_type: refreshed.token_type || tokens.token_type,
      expires_in: refreshed.expires_in || tokens.expires_in,
      refresh_token: refreshed.refresh_token || tokens.refresh_token,
      scope: refreshed.scope || tokens.scope,
    };

    return this.storeSessionTokens(sessionId, normalizedTokens);
  }

  private clearUserTokens(userId: string): void {
    this.userTokens.delete(userId);
    this.tokenRefreshPromises.delete(userId);

    for (const [sessionId, mappedUser] of this.sessionToUser.entries()) {
      if (mappedUser === userId) {
        this.sessionTokens.delete(sessionId);
        this.sessionToUser.delete(sessionId);
      }
    }
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
