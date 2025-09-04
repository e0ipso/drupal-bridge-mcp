/**
 * Token Validation Service
 *
 * Comprehensive token validation system with expiration checking,
 * introspection, and integration with the secure token storage and lifecycle manager.
 */

import type { Pool } from 'pg';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { metricsCollector } from '@/monitoring/metrics.js';
import {
  SecureTokenStorage,
  type TokenValidationResult,
} from './secure-token-storage.js';
import type { TokenLifecycleManager } from './token-lifecycle-manager.js';
import type { OAuthManager } from './oauth-client.js';
import type { OAuthSession, OAuthContext } from '@/types/oauth.js';

/**
 * Validation context for requests
 */
export interface ValidationContext {
  userId: string;
  accessToken: string;
  requiredScopes?: string[];
  allowExpiredWithRefresh?: boolean;
}

/**
 * Enhanced validation result with context
 */
export interface EnhancedValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  context?: OAuthContext;
  refreshed?: boolean;
  session?: OAuthSession;
  introspectionResult?: {
    active: boolean;
    userId?: string;
    scopes?: string[];
    expiresAt?: Date;
  };
}

/**
 * Validation statistics
 */
export interface ValidationStats {
  totalValidations: number;
  successfulValidations: number;
  failedValidations: number;
  expiredTokens: number;
  refreshedTokens: number;
  introspectionCalls: number;
  averageValidationTime: number;
}

/**
 * Token validation service with comprehensive security checks
 */
export class TokenValidationService {
  private readonly dbPool: Pool;
  private readonly tokenStorage: SecureTokenStorage;
  private readonly lifecycleManager: TokenLifecycleManager;
  private readonly oauthManager: OAuthManager;

  private stats: ValidationStats = {
    totalValidations: 0,
    successfulValidations: 0,
    failedValidations: 0,
    expiredTokens: 0,
    refreshedTokens: 0,
    introspectionCalls: 0,
    averageValidationTime: 0,
  };

  // Running average for validation time
  private totalValidationTime = 0;

  constructor(
    dbPool: Pool,
    oauthManager: OAuthManager,
    lifecycleManager: TokenLifecycleManager
  ) {
    this.dbPool = dbPool;
    this.tokenStorage = new SecureTokenStorage(dbPool);
    this.oauthManager = oauthManager;
    this.lifecycleManager = lifecycleManager;
  }

  /**
   * Validate token with comprehensive security checks
   */
  async validateToken(
    context: ValidationContext
  ): Promise<EnhancedValidationResult> {
    const startTime = Date.now();
    this.stats.totalValidations++;

    try {
      logger.debug('Starting token validation', {
        userId: context.userId,
        requiredScopes: context.requiredScopes,
        allowExpiredWithRefresh: context.allowExpiredWithRefresh,
      });

      // Step 1: Validate token against stored hash
      const validationResult = await this.tokenStorage.validateToken(
        context.userId,
        context.accessToken
      );

      if (!validationResult.valid) {
        // Handle specific error cases
        if (
          validationResult.errorCode === 'TOKEN_EXPIRED' &&
          context.allowExpiredWithRefresh
        ) {
          // Attempt automatic refresh
          const refreshResult = await this.attemptTokenRefresh(context.userId);
          if (refreshResult.success) {
            this.stats.refreshedTokens++;

            // Re-validate with new token
            const newValidation = await this.tokenStorage.validateToken(
              context.userId,
              refreshResult.newAccessToken!
            );

            if (newValidation.valid && newValidation.session) {
              return await this.buildValidationResult(
                newValidation.session,
                true
              );
            }
          }
        }

        this.stats.failedValidations++;

        if (validationResult.errorCode === 'TOKEN_EXPIRED') {
          this.stats.expiredTokens++;
        }

        const responseTime = Date.now() - startTime;
        this.updateAverageTime(responseTime);

        return {
          valid: false,
          error: validationResult.error,
          errorCode: validationResult.errorCode,
        };
      }

      const session = validationResult.session!;

      // Step 2: Check scope requirements
      if (context.requiredScopes && context.requiredScopes.length > 0) {
        const scopeCheck = this.validateScopes(
          session.scopes,
          context.requiredScopes
        );
        if (!scopeCheck.valid) {
          this.stats.failedValidations++;

          const responseTime = Date.now() - startTime;
          this.updateAverageTime(responseTime);

          return {
            valid: false,
            error: scopeCheck.error,
            errorCode: 'INSUFFICIENT_SCOPE',
            session,
          };
        }
      }

      // Step 3: Optional token introspection for additional validation
      let introspectionResult;
      if (this.shouldPerformIntrospection(session)) {
        introspectionResult = await this.performIntrospection(
          context.accessToken
        );
        this.stats.introspectionCalls++;

        if (!introspectionResult.active) {
          this.stats.failedValidations++;

          const responseTime = Date.now() - startTime;
          this.updateAverageTime(responseTime);

          return {
            valid: false,
            error: 'Token is not active according to introspection',
            errorCode: 'TOKEN_INACTIVE',
            session,
            introspectionResult,
          };
        }
      }

      // Step 4: Check if token needs proactive refresh
      if (validationResult.requiresRefresh) {
        // Trigger background refresh (non-blocking)
        setImmediate(() => {
          this.lifecycleManager
            .refreshUserTokenIfNeeded(context.userId)
            .catch(error => {
              logger.warn('Background token refresh failed', {
                userId: context.userId,
                error: error instanceof Error ? error.message : String(error),
              });
            });
        });
      }

      // Step 5: Build successful validation result
      const result = await this.buildValidationResult(
        session,
        false,
        introspectionResult
      );

      this.stats.successfulValidations++;

      const responseTime = Date.now() - startTime;
      this.updateAverageTime(responseTime);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_validate',
        success: true,
        responseTime,
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.stats.failedValidations++;

      const responseTime = Date.now() - startTime;
      this.updateAverageTime(responseTime);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_validate',
        success: false,
        error: errorMessage,
        responseTime,
      });

      logger.error('Token validation failed with error', {
        error: errorMessage,
        userId: context.userId,
      });

      return {
        valid: false,
        error: errorMessage,
        errorCode: 'VALIDATION_ERROR',
      };
    }
  }

  /**
   * Validate token for MCP method execution
   */
  async validateForMethodExecution(
    userId: string,
    accessToken: string,
    methodName: string
  ): Promise<EnhancedValidationResult> {
    // Determine required scopes based on method
    const requiredScopes = this.getScopesForMethod(methodName);

    return await this.validateToken({
      userId,
      accessToken,
      requiredScopes,
      allowExpiredWithRefresh: true,
    });
  }

  /**
   * Fast token check for high-frequency operations
   */
  async quickValidateToken(
    userId: string,
    accessToken: string
  ): Promise<{
    valid: boolean;
    error?: string;
  }> {
    try {
      // Skip introspection for quick validation
      const result = await this.tokenStorage.validateToken(userId, accessToken);
      return {
        valid: result.valid,
        error: result.error,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Attempt token refresh for expired tokens
   */
  private async attemptTokenRefresh(userId: string): Promise<{
    success: boolean;
    error?: string;
    newAccessToken?: string;
  }> {
    try {
      const refreshResult =
        await this.lifecycleManager.refreshUserTokenIfNeeded(userId);

      if (refreshResult.success && refreshResult.newTokens) {
        return {
          success: true,
          newAccessToken: refreshResult.newTokens.accessToken,
        };
      }

      return {
        success: false,
        error: refreshResult.error || 'Token refresh failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Validate scopes against requirements
   */
  private validateScopes(
    userScopes: string[],
    requiredScopes: string[]
  ): {
    valid: boolean;
    error?: string;
  } {
    const missingScopes = requiredScopes.filter(
      scope => !userScopes.includes(scope)
    );

    if (missingScopes.length > 0) {
      return {
        valid: false,
        error: `Missing required scopes: ${missingScopes.join(', ')}`,
      };
    }

    return { valid: true };
  }

  /**
   * Determine if introspection should be performed
   */
  private shouldPerformIntrospection(session: OAuthSession): boolean {
    // Perform introspection if:
    // 1. Token is close to expiration (within 5 minutes)
    // 2. Session is older than 1 hour
    // 3. Random sampling (5% of requests)

    const now = new Date();
    const timeToExpiry = session.expiresAt.getTime() - now.getTime();
    const sessionAge = now.getTime() - session.createdAt.getTime();
    const fiveMinutes = 5 * 60 * 1000;
    const oneHour = 60 * 60 * 1000;

    if (timeToExpiry < fiveMinutes) {
      return true;
    }

    if (sessionAge > oneHour) {
      return true;
    }

    // 5% random sampling
    return Math.random() < 0.05;
  }

  /**
   * Perform token introspection
   */
  private async performIntrospection(accessToken: string): Promise<{
    active: boolean;
    userId?: string;
    scopes?: string[];
    expiresAt?: Date;
  }> {
    try {
      return await this.oauthManager.introspectToken(accessToken);
    } catch (error) {
      logger.warn('Token introspection failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Assume token is active if introspection fails
      return { active: true };
    }
  }

  /**
   * Build validation result with context
   */
  private async buildValidationResult(
    session: OAuthSession,
    refreshed = false,
    introspectionResult?: any
  ): Promise<EnhancedValidationResult> {
    const context: OAuthContext = {
      userId: session.userId,
      scopes: session.scopes,
      subscriptionLevel: session.subscriptionLevel,
      expiresAt: session.expiresAt,
    };

    return {
      valid: true,
      context,
      refreshed,
      session,
      introspectionResult,
    };
  }

  /**
   * Get required scopes for MCP method
   */
  private getScopesForMethod(methodName: string): string[] {
    const scopeMap: Record<string, string[]> = {
      'content/search': ['content:search'],
      'content/get': ['content:read'],
      'jsonrpc/discover': ['jsonrpc:discovery'],
      'jsonrpc/execute': ['jsonrpc:execute'],
    };

    return scopeMap[methodName] || ['content:read'];
  }

  /**
   * Update running average for validation time
   */
  private updateAverageTime(responseTime: number): void {
    this.totalValidationTime += responseTime;
    this.stats.averageValidationTime = Math.round(
      this.totalValidationTime / this.stats.totalValidations
    );
  }

  /**
   * Get validation statistics
   */
  getStats(): ValidationStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics (for testing/monitoring)
   */
  resetStats(): void {
    this.stats = {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0,
      expiredTokens: 0,
      refreshedTokens: 0,
      introspectionCalls: 0,
      averageValidationTime: 0,
    };
    this.totalValidationTime = 0;
  }

  /**
   * Validate multiple tokens in batch (for admin operations)
   */
  async batchValidateTokens(
    contexts: ValidationContext[]
  ): Promise<EnhancedValidationResult[]> {
    // Process in parallel with concurrency limit
    const concurrencyLimit = 10;
    const results: EnhancedValidationResult[] = [];

    for (let i = 0; i < contexts.length; i += concurrencyLimit) {
      const batch = contexts.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.all(
        batch.map(context => this.validateToken(context))
      );
      results.push(...batchResults);
    }

    return results;
  }
}
