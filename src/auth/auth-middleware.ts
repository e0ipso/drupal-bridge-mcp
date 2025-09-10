/**
 * MCP authentication middleware
 */

import type { TokenManager } from './token-manager.js';
import type { OAuthClient } from './oauth-client.js';

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
  private readonly config: AuthMiddlewareConfig;

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
   * Ensure user is authenticated - just check, don't initiate OAuth
   */
  async requireAuthentication(userId?: string): Promise<AuthContext> {
    const authContext = await this.authenticate(userId);

    // Just return the context - let the caller decide what to do if not authenticated
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
    tokenInfo?: {
      isValid: boolean;
      isExpired: boolean;
      needsRefresh: boolean;
      scopes?: string[];
      userId?: string;
    };
    needsAuthentication?: boolean;
  }> {
    const hasTokens = await this.config.tokenManager.hasValidTokens(
      userId,
      this.config.requiredScopes
    );

    if (hasTokens) {
      const tokenInfo = await this.config.tokenManager.getTokenInfo(userId);
      if (tokenInfo) {
        return {
          isAuthenticated: true,
          tokenInfo: {
            isValid: tokenInfo.hasTokens,
            isExpired: tokenInfo.isExpired ?? false,
            needsRefresh: tokenInfo.needsRefresh ?? false,
            scopes: tokenInfo.scopes,
            userId: tokenInfo.userId,
          },
        };
      }
    }

    return {
      isAuthenticated: false,
      needsAuthentication: true,
    };
  }

  /**
   * Logout user by clearing tokens
   */
  async logout(_userId?: string): Promise<void> {
    await this.config.tokenManager.clearTokens();
  }
}
