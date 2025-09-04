/**
 * Token Security System - Main Export Index
 *
 * Comprehensive authentication and token security system for MCP server
 * with OAuth integration, secure storage, lifecycle management, and validation.
 */

// Core OAuth components
export { OAuthManager, OAuthClient, type OAuthStatus } from './oauth-client.js';
export {
  createOAuthManager,
  OAuthScopes,
  OAuthErrors,
} from './oauth-manager.js';

// Secure token storage
export {
  SecureTokenStorage,
  type TokenStorageResult,
  type TokenValidationResult as SecureTokenValidationResult,
  type TokenCleanupStats,
} from './secure-token-storage.js';

// Token lifecycle management
export {
  TokenLifecycleManager,
  type RefreshAttemptResult,
  type LifecycleStats,
  type RefreshTaskStatus,
} from './token-lifecycle-manager.js';

// Token validation service
export {
  TokenValidationService,
  type ValidationContext,
  type EnhancedValidationResult,
  type ValidationStats,
} from './token-validation-service.js';

// Background processing
export {
  BackgroundTokenProcessor,
  BackgroundTaskType,
  type TaskContext,
  type TaskResult,
  type ProcessorStats,
} from './background-token-processor.js';

// Central security manager
export {
  TokenSecurityManager,
  type SecurityManagerConfig,
  type SecurityManagerStatus,
  type SecurityStats,
} from './token-security-manager.js';

// Database session store
export {
  SessionStore,
  checkDatabaseConnection,
  getDatabasePoolHealth,
  getSharedPool,
  executeCleanupTasks,
} from '../database/session-store.js';

// Type exports from oauth types
export type {
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

// Import this type for the convenience function
import type { SecurityManagerConfig } from './token-security-manager.js';
import { OAuthManager } from './oauth-client.js';
import { TokenSecurityManager } from './token-security-manager.js';
import type { TokenSet } from '@/types/oauth.js';

/**
 * Create a complete token security system
 */
export function createTokenSecuritySystem(
  dbPool: any, // Pool from pg
  oauthConfig?: Partial<SecurityManagerConfig>
) {
  const oauthManager = new OAuthManager(dbPool);
  const securityManager = new TokenSecurityManager(
    dbPool,
    oauthManager,
    oauthConfig
  );

  return {
    oauthManager,
    securityManager,

    // Convenience methods
    async initialize() {
      await securityManager.initialize();
    },

    async shutdown() {
      await securityManager.shutdown();
    },

    async validateToken(
      userId: string,
      accessToken: string,
      requiredScopes?: string[]
    ) {
      return await securityManager.validateUserToken({
        userId,
        accessToken,
        requiredScopes,
        allowExpiredWithRefresh: true,
      });
    },

    async storeTokens(userId: string, tokens: TokenSet) {
      return await securityManager.storeUserTokens(userId, tokens);
    },

    async refreshUserToken(userId: string) {
      return await securityManager.forceRefreshUserToken(userId);
    },

    async getAuthContext(userId: string) {
      return await securityManager.getUserAuthContext(userId);
    },

    async performHealthCheck() {
      return await securityManager.performHealthCheck();
    },

    getSecurityStats() {
      return securityManager.getSecurityStats();
    },
  };
}
