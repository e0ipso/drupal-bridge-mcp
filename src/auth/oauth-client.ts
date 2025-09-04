/**
 * OAuth 2.0 Authorization Code Grant implementation for Drupal Simple OAuth
 *
 * This implementation follows RFC 6749 specification and integrates with
 * Drupalize.me's Simple OAuth module for secure user authentication.
 */

import crypto from 'crypto';
import type { Pool } from 'pg';
import { metricsCollector } from '@/monitoring/metrics.js';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import type {
  TokenResponse,
  TokenSet,
  OAuthState,
  OAuthError,
  AuthorizationUrlParams,
  TokenExchangeParams,
  TokenRefreshParams,
  OAuthConfig,
  OAuthSession,
  ValidationResult,
  OAuthContext,
} from '@/types/oauth.js';

/**
 * OAuth status interface for health checks
 */
export interface OAuthStatus {
  isConfigured: boolean;
  hasValidCredentials: boolean;
  lastRefreshAttempt?: number;
  lastRefreshSuccess?: number;
  consecutiveFailures: number;
}

/**
 * OAuth 2.0 Manager implementing Authorization Code Grant flow
 *
 * Provides secure authentication with Drupal's Simple OAuth module including:
 * - Authorization URL generation with CSRF protection
 * - Token exchange and refresh
 * - Session management with PostgreSQL storage
 * - Comprehensive error handling and logging
 */
export class OAuthManager {
  private readonly dbPool: Pool;
  private readonly oauthConfig: OAuthConfig;
  private readonly status: OAuthStatus = {
    isConfigured: false,
    hasValidCredentials: false,
    consecutiveFailures: 0,
  };

  /** In-memory state storage for CSRF protection */
  private readonly stateStore = new Map<string, OAuthState>();

  /** State cleanup interval (5 minutes) */
  private readonly stateCleanupInterval: NodeJS.Timeout;

  constructor(dbPool: Pool) {
    this.dbPool = dbPool;
    this.oauthConfig = {
      baseUrl: config.drupal.baseUrl,
      clientId: config.oauth.clientId,
      clientSecret: config.oauth.clientSecret,
      redirectUri: config.oauth.redirectUri,
      authorizationEndpoint: '/oauth/authorize',
      tokenEndpoint: '/oauth/token',
      defaultScopes: [
        'content:read',
        'content:search',
        'jsonrpc:discovery',
        'jsonrpc:execute',
      ],
      tokenRefreshBuffer: config.oauth.tokenRefreshBuffer,
    };

    // Validate configuration on startup
    this.status.isConfigured = this.validateConfiguration();

    // Set up periodic state cleanup (every 5 minutes)
    this.stateCleanupInterval = setInterval(
      () => {
        this.cleanupExpiredStates();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Initialize user authentication flow
   *
   * Generates a secure authorization URL with CSRF protection state parameter
   * and stores the state for later validation during the callback.
   */
  async initializeUserAuth(
    userId: string,
    redirectUrl?: string
  ): Promise<string> {
    const startTime = Date.now();

    try {
      if (!this.status.isConfigured) {
        throw new Error('OAuth not properly configured');
      }

      // Generate cryptographically secure state
      const state = this.generateSecureState();

      // Store state with metadata
      const oauthState: OAuthState = {
        state,
        createdAt: new Date(),
        userId,
        redirectUrl,
      };

      await this.storeAuthState(userId, oauthState);

      // Build authorization URL
      const authUrl = this.buildAuthorizationUrl(state);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'init_auth',
        success: true,
        responseTime: Date.now() - startTime,
      });

      logger.info('OAuth authorization initialized', {
        userId,
        state: `${state.substring(0, 8)}...`,
      });
      return authUrl;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'init_auth',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Failed to initialize OAuth authentication', {
        error: errorMessage,
        userId,
      });
      throw error;
    }
  }

  /**
   * Handle OAuth callback with authorization code
   *
   * Validates the state parameter, exchanges authorization code for tokens,
   * and stores the session securely in PostgreSQL.
   */
  async handleCallback(code: string, state: string): Promise<TokenSet> {
    const startTime = Date.now();

    try {
      // Validate state parameter
      const stateValidation = await this.validateState(state);
      if (!stateValidation.valid) {
        throw new Error(`State validation failed: ${stateValidation.error}`);
      }

      // Exchange code for tokens
      const tokenResponse = await this.exchangeCodeForTokens(code);

      // Parse and validate token response
      const tokenSet = this.parseTokenResponse(tokenResponse);

      // Store user session
      await this.storeUserSession(tokenSet);

      // Clean up used state
      this.stateStore.delete(state);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'handle_callback',
        success: true,
        responseTime: Date.now() - startTime,
      });

      logger.info('OAuth callback handled successfully', {
        userId: tokenSet.userId,
      });
      return tokenSet;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'handle_callback',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('OAuth callback handling failed', {
        error: errorMessage,
        code: `${code.substring(0, 8)}...`,
      });
      throw error;
    }
  }

  /**
   * Build OAuth authorization URL with required parameters
   */
  private buildAuthorizationUrl(state: string): string {
    const params: AuthorizationUrlParams = {
      clientId: this.oauthConfig.clientId,
      redirectUri: this.oauthConfig.redirectUri,
      scopes: this.oauthConfig.defaultScopes,
      state,
      responseType: 'code',
    };

    const urlParams = new URLSearchParams({
      response_type: params.responseType,
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      scope: params.scopes.join(' '),
      state: params.state,
    });

    const authUrl = `${this.oauthConfig.baseUrl}${this.oauthConfig.authorizationEndpoint}?${urlParams.toString()}`;

    logger.debug('Authorization URL built', {
      url: authUrl.replace(/client_id=[^&]+/, 'client_id=***'),
      scopes: params.scopes,
    });

    return authUrl;
  }

  /**
   * Generate cryptographically secure state parameter (32 bytes)
   */
  private generateSecureState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Store OAuth state for CSRF validation
   */
  private async storeAuthState(
    userId: string,
    oauthState: OAuthState
  ): Promise<void> {
    this.stateStore.set(oauthState.state, oauthState);
    logger.debug('OAuth state stored', {
      userId,
      statePreview: `${oauthState.state.substring(0, 8)}...`,
      storeSize: this.stateStore.size,
    });
  }

  /**
   * Validate OAuth state parameter
   */
  private async validateState(state: string): Promise<ValidationResult> {
    if (!state || typeof state !== 'string') {
      return {
        valid: false,
        error: 'Missing or invalid state parameter',
        errorCode: 'INVALID_STATE',
      };
    }

    const storedState = this.stateStore.get(state);
    if (!storedState) {
      return {
        valid: false,
        error: 'State parameter not found or expired',
        errorCode: 'STATE_NOT_FOUND',
      };
    }

    // Check if state is expired (15 minutes max)
    const maxAge = 15 * 60 * 1000;
    const age = Date.now() - storedState.createdAt.getTime();
    if (age > maxAge) {
      this.stateStore.delete(state);
      return {
        valid: false,
        error: 'State parameter expired',
        errorCode: 'STATE_EXPIRED',
      };
    }

    return { valid: true };
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(code: string): Promise<TokenResponse> {
    const tokenParams: TokenExchangeParams = {
      code,
      clientId: this.oauthConfig.clientId,
      clientSecret: this.oauthConfig.clientSecret,
      redirectUri: this.oauthConfig.redirectUri,
      grantType: 'authorization_code',
    };

    const body = new URLSearchParams({
      grant_type: tokenParams.grantType,
      code: tokenParams.code,
      client_id: tokenParams.clientId,
      client_secret: tokenParams.clientSecret,
      redirect_uri: tokenParams.redirectUri,
    });

    const tokenUrl = `${this.oauthConfig.baseUrl}${this.oauthConfig.tokenEndpoint}`;

    logger.debug('Exchanging authorization code for tokens', {
      tokenUrl,
      code: `${code.substring(0, 8)}...`,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'MCP-Drupal-Server/1.0',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorData: OAuthError;

      try {
        errorData = JSON.parse(errorText) as OAuthError;
      } catch {
        errorData = { error: 'unknown_error', error_description: errorText };
      }

      throw new Error(
        `Token exchange failed: ${errorData.error} - ${errorData.error_description || 'Unknown error'}`
      );
    }

    const tokenData = (await response.json()) as TokenResponse;
    logger.debug('Token exchange successful', {
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
    });

    return tokenData;
  }

  /**
   * Parse token response into TokenSet format
   */
  private parseTokenResponse(tokenResponse: TokenResponse): TokenSet {
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
    const scopes = tokenResponse.scope ? tokenResponse.scope.split(' ') : [];

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type,
      expiresAt,
      scopes,
      subscriptionLevel: 'free', // Default, can be updated based on user data
    };
  }

  /**
   * Store user session in PostgreSQL with token hashes
   */
  private async storeUserSession(tokenSet: TokenSet): Promise<void> {
    const client = await this.dbPool.connect();

    try {
      // Hash tokens for secure storage
      const accessTokenHash = this.hashToken(tokenSet.accessToken);
      const refreshTokenHash = this.hashToken(tokenSet.refreshToken);

      // Generate user ID if not provided (from token introspection if needed)
      const userId = tokenSet.userId || crypto.randomUUID();

      const query = `
        INSERT INTO user_sessions (
          user_id, access_token_hash, refresh_token_hash, 
          expires_at, scope, subscription_level
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) DO UPDATE SET
          access_token_hash = EXCLUDED.access_token_hash,
          refresh_token_hash = EXCLUDED.refresh_token_hash,
          expires_at = EXCLUDED.expires_at,
          scope = EXCLUDED.scope,
          subscription_level = EXCLUDED.subscription_level,
          updated_at = NOW()
      `;

      await client.query(query, [
        userId,
        accessTokenHash,
        refreshTokenHash,
        tokenSet.expiresAt,
        tokenSet.scopes,
        tokenSet.subscriptionLevel,
      ]);

      // Update tokenSet with userId for return
      tokenSet.userId = userId;

      logger.info('User session stored successfully', {
        userId,
        expiresAt: tokenSet.expiresAt,
        scopes: tokenSet.scopes,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Hash token for secure storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Clean up expired OAuth states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    const maxAge = 15 * 60 * 1000; // 15 minutes
    let cleanedCount = 0;

    for (const [state, stateData] of this.stateStore.entries()) {
      if (now - stateData.createdAt.getTime() > maxAge) {
        this.stateStore.delete(state);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired OAuth states', {
        count: cleanedCount,
        remaining: this.stateStore.size,
      });
    }
  }

  /**
   * Get OAuth authentication context for a user
   */
  async getAuthContext(userId: string): Promise<OAuthContext | null> {
    const client = await this.dbPool.connect();

    try {
      const query = `
        SELECT user_id, scope, subscription_level, expires_at
        FROM user_sessions 
        WHERE user_id = $1 AND expires_at > NOW()
      `;

      const result = await client.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const session = result.rows[0];
      return {
        userId: session.user_id,
        scopes: session.scope || [],
        subscriptionLevel: session.subscription_level,
        expiresAt: new Date(session.expires_at),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Validate OAuth configuration
   */
  validateConfiguration(): boolean {
    const hasClientId = Boolean(
      this.oauthConfig.clientId && this.oauthConfig.clientId.length > 0
    );
    const hasClientSecret = Boolean(
      this.oauthConfig.clientSecret && this.oauthConfig.clientSecret.length > 0
    );
    const hasRedirectUri = Boolean(
      this.oauthConfig.redirectUri && this.oauthConfig.redirectUri.length > 0
    );
    const hasBaseUrl = Boolean(
      this.oauthConfig.baseUrl && this.oauthConfig.baseUrl.length > 0
    );

    const isValid =
      hasClientId && hasClientSecret && hasRedirectUri && hasBaseUrl;

    if (!isValid) {
      logger.warn('OAuth configuration incomplete', {
        hasClientId,
        hasClientSecret,
        hasRedirectUri,
        hasBaseUrl,
      });
    }

    return isValid;
  }

  /**
   * Check OAuth health status
   */
  async checkHealth(): Promise<boolean> {
    const startTime = Date.now();

    try {
      if (!this.validateConfiguration()) {
        metricsCollector.recordOAuth({
          timestamp: startTime,
          operation: 'validate',
          success: false,
          error: 'OAuth not configured',
        });
        return false;
      }

      // Test database connectivity for session storage
      const client = await this.dbPool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'validate',
        success: true,
        responseTime: Date.now() - startTime,
      });

      this.status.hasValidCredentials = true;
      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'validate',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('OAuth health check failed', { error: errorMessage });
      this.status.hasValidCredentials = false;
      return false;
    }
  }

  /**
   * Get OAuth status for monitoring
   */
  getStatus(): OAuthStatus {
    return { ...this.status };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<TokenSet> {
    const startTime = Date.now();

    try {
      const refreshParams: TokenRefreshParams = {
        refreshToken,
        clientId: this.oauthConfig.clientId,
        clientSecret: this.oauthConfig.clientSecret,
        grantType: 'refresh_token',
      };

      const body = new URLSearchParams({
        grant_type: refreshParams.grantType,
        refresh_token: refreshParams.refreshToken,
        client_id: refreshParams.clientId,
        client_secret: refreshParams.clientSecret,
      });

      const tokenUrl = `${this.oauthConfig.baseUrl}${this.oauthConfig.tokenEndpoint}`;

      logger.debug('Refreshing access token', { tokenUrl });

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'MCP-Drupal-Server/1.0',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: OAuthError;

        try {
          errorData = JSON.parse(errorText) as OAuthError;
        } catch {
          errorData = { error: 'unknown_error', error_description: errorText };
        }

        this.status.consecutiveFailures++;
        this.status.lastRefreshAttempt = startTime;

        throw new Error(
          `Token refresh failed: ${errorData.error} - ${errorData.error_description || 'Unknown error'}`
        );
      }

      const tokenData = (await response.json()) as TokenResponse;
      const tokenSet = this.parseTokenResponse(tokenData);

      // Reset failure counter on success
      this.status.consecutiveFailures = 0;
      this.status.lastRefreshAttempt = startTime;
      this.status.lastRefreshSuccess = startTime;

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_refresh',
        success: true,
        responseTime: Date.now() - startTime,
      });

      logger.info('Token refresh successful', {
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
        scope: tokenData.scope,
      });

      return tokenSet;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.status.consecutiveFailures++;
      this.status.lastRefreshAttempt = startTime;

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_refresh',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Token refresh failed', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Introspect token with Drupal (optional validation)
   */
  async introspectToken(accessToken: string): Promise<{
    active: boolean;
    userId?: string;
    scopes?: string[];
    expiresAt?: Date;
  }> {
    const startTime = Date.now();

    try {
      // This would be implemented based on Drupal's token introspection endpoint
      // For now, we'll do basic validation

      const introspectionUrl = `${this.oauthConfig.baseUrl}/oauth/introspect`;

      const response = await fetch(introspectionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'MCP-Drupal-Server/1.0',
        },
        body: new URLSearchParams({
          token: accessToken,
          token_type_hint: 'access_token',
        }),
      });

      if (!response.ok) {
        logger.warn('Token introspection failed', {
          status: response.status,
          statusText: response.statusText,
        });

        return { active: false };
      }

      const introspectionData = await response.json();

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_introspect',
        success: true,
        responseTime: Date.now() - startTime,
      });

      return {
        active: introspectionData.active === true,
        userId: introspectionData.sub as string | undefined,
        scopes: introspectionData.scope
          ? (introspectionData.scope as string).split(' ')
          : undefined,
        expiresAt: introspectionData.exp
          ? new Date((introspectionData.exp as number) * 1000)
          : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_introspect',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.warn('Token introspection error', { error: errorMessage });
      return { active: false };
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.stateCleanupInterval) {
      clearInterval(this.stateCleanupInterval);
    }
    this.stateStore.clear();
  }
}

/**
 * Legacy OAuth client for backward compatibility
 * @deprecated Use OAuthManager instead
 */
export class OAuthClient {
  private readonly manager: OAuthManager;

  constructor(dbPool: Pool) {
    this.manager = new OAuthManager(dbPool);
  }

  getStatus(): OAuthStatus {
    return this.manager.getStatus();
  }

  validateConfiguration(): boolean {
    return this.manager.validateConfiguration();
  }

  async refreshToken(): Promise<boolean> {
    // Legacy method - implement token refresh logic if needed
    return this.manager.checkHealth();
  }

  async checkHealth(): Promise<boolean> {
    return this.manager.checkHealth();
  }
}
