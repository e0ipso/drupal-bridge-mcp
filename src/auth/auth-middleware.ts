/**
 * MCP authentication middleware
 */

import { TokenManager } from './token-manager.js';
import { OAuthClient } from './oauth-client.js';

export interface AuthContext {
  isAuthenticated: boolean;
  userId?: string;
  scopes?: string[];
  accessToken?: string;
}

export interface AuthMiddlewareConfig {
  oauthClient: OAuthClient;
  tokenManager: TokenManager;
  requiredScopes?: string[];
  skipAuth?: boolean;
}

/**
 * Authentication middleware for MCP requests
 */
export class AuthMiddleware {
  private config: AuthMiddlewareConfig;

  constructor(config: AuthMiddlewareConfig) {
    this.config = config;
  }

  /**
   * Authenticate MCP request and return auth context
   */
  async authenticate(userId?: string): Promise<AuthContext> {
    // Skip authentication if configured
    if (this.config.skipAuth) {
      return { isAuthenticated: true };
    }

    try {
      // Check for valid access token
      const accessToken = await this.config.tokenManager.getValidAccessToken(
        userId,
        this.config.requiredScopes
      );

      if (accessToken) {
        // Validate token and get user info
        const validation = await this.config.tokenManager.validateToken(
          accessToken,
          this.config.requiredScopes
        );

        if (validation.isValid) {
          return {
            isAuthenticated: true,
            userId: validation.userId,
            scopes: validation.scopes,
            accessToken,
          };
        }
      }

      return { isAuthenticated: false };
    } catch (error) {
      console.error('Authentication error:', error);
      return { isAuthenticated: false };
    }
  }

  /**
   * Ensure user is authenticated, initiate OAuth flow if not
   */
  async requireAuthentication(userId?: string): Promise<AuthContext> {
    const authContext = await this.authenticate(userId);

    if (!authContext.isAuthenticated) {
      // Initiate OAuth flow
      try {
        console.log('Authentication required. Starting OAuth flow...');

        const tokens = await this.config.oauthClient.authorize();
        const actualUserId = userId || 'default';

        await this.config.tokenManager.storeTokens(
          tokens,
          actualUserId,
          this.config.requiredScopes || []
        );

        return {
          isAuthenticated: true,
          userId: actualUserId,
          scopes: this.config.requiredScopes,
          accessToken: tokens.accessToken,
        };
      } catch (error) {
        throw new Error(
          `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return authContext;
  }

  /**
   * Check if user has required scopes
   */
  hasRequiredScopes(userScopes: string[], requiredScopes: string[]): boolean {
    return requiredScopes.every(scope => userScopes.includes(scope));
  }

  /**
   * Get authentication status for user
   */
  async getAuthStatus(userId?: string): Promise<{
    isAuthenticated: boolean;
    tokenInfo?: any;
    needsAuthentication?: boolean;
  }> {
    const hasTokens = await this.config.tokenManager.hasValidTokens(
      userId,
      this.config.requiredScopes
    );

    if (hasTokens) {
      const tokenInfo = await this.config.tokenManager.getTokenInfo(userId);
      return {
        isAuthenticated: true,
        tokenInfo,
      };
    }

    return {
      isAuthenticated: false,
      needsAuthentication: true,
    };
  }

  /**
   * Logout user by clearing tokens
   */
  async logout(userId?: string): Promise<void> {
    await this.config.tokenManager.clearTokens();
  }
}
