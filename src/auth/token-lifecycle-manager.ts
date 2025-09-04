/**
 * Token Lifecycle Manager
 *
 * Handles automatic token refresh, background processing, and lifecycle management
 * with exponential backoff for failed refresh attempts and proactive renewal.
 */

import type { Pool } from 'pg';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { metricsCollector } from '@/monitoring/metrics.js';
import { SecureTokenStorage } from './secure-token-storage.js';
import type { OAuthManager } from './oauth-client.js';
import type { OAuthSession, TokenSet } from '@/types/oauth.js';

/**
 * Refresh attempt result
 */
export interface RefreshAttemptResult {
  success: boolean;
  error?: string;
  newTokens?: TokenSet;
  retryAfter?: number; // milliseconds
}

/**
 * Lifecycle management statistics
 */
export interface LifecycleStats {
  activeTokens: number;
  expiredTokens: number;
  tokensRequiringRefresh: number;
  successfulRefreshes: number;
  failedRefreshes: number;
  lastCleanupTime: Date | null;
  lastRefreshTime: Date | null;
}

/**
 * Background refresh task status
 */
export interface RefreshTaskStatus {
  isRunning: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  activeRefreshes: number;
  failedRetries: Map<string, number>;
}

/**
 * Token lifecycle manager with automatic refresh and background processing
 */
export class TokenLifecycleManager {
  private readonly dbPool: Pool;
  private readonly tokenStorage: SecureTokenStorage;
  private readonly oauthManager: OAuthManager;
  private readonly refreshThreshold: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelay: number;
  private readonly cleanupInterval: number;

  private cleanupTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  // Track refresh attempts to implement exponential backoff
  private readonly refreshAttempts = new Map<string, number>();
  private readonly refreshTimestamps = new Map<string, number>();

  // Background processing state
  private refreshTaskRunning = false;
  private activeRefreshes = 0;
  private readonly stats: LifecycleStats = {
    activeTokens: 0,
    expiredTokens: 0,
    tokensRequiringRefresh: 0,
    successfulRefreshes: 0,
    failedRefreshes: 0,
    lastCleanupTime: null,
    lastRefreshTime: null,
  };

  constructor(dbPool: Pool, oauthManager: OAuthManager) {
    this.dbPool = dbPool;
    this.tokenStorage = new SecureTokenStorage(dbPool);
    this.oauthManager = oauthManager;
    this.refreshThreshold = config.security.token.refreshThreshold;
    this.maxRetries = config.security.token.maxRefreshRetries;
    this.baseRetryDelay = config.security.token.refreshRetryDelayMs;
    this.cleanupInterval = config.security.token.cleanupIntervalMs;
  }

  /**
   * Start the lifecycle management system
   */
  async start(): Promise<void> {
    if (this.isShuttingDown) {
      throw new Error('Cannot start lifecycle manager during shutdown');
    }

    logger.info('Starting token lifecycle manager', {
      refreshThreshold: this.refreshThreshold,
      maxRetries: this.maxRetries,
      cleanupInterval: this.cleanupInterval,
    });

    // Start background cleanup
    this.startCleanupTimer();

    // Start background refresh monitoring
    this.startRefreshMonitoring();

    logger.info('Token lifecycle manager started successfully');
  }

  /**
   * Stop the lifecycle management system
   */
  async stop(): Promise<void> {
    this.isShuttingDown = true;

    logger.info('Stopping token lifecycle manager');

    // Clear timers
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }

    // Wait for active refreshes to complete (with timeout)
    const maxWaitMs = 30000; // 30 seconds
    const startTime = Date.now();

    while (this.activeRefreshes > 0 && Date.now() - startTime < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeRefreshes > 0) {
      logger.warn('Forcing shutdown with active refreshes', {
        activeRefreshes: this.activeRefreshes,
      });
    }

    logger.info('Token lifecycle manager stopped');
  }

  /**
   * Refresh a specific user's token if needed
   */
  async refreshUserTokenIfNeeded(
    userId: string
  ): Promise<RefreshAttemptResult> {
    const startTime = Date.now();

    try {
      // Get current session
      const session = await this.tokenStorage.getUserSession(userId);
      if (!session) {
        return {
          success: false,
          error: 'No active session found',
        };
      }

      // Check if refresh is needed
      const now = new Date();
      const timeRemaining = session.expiresAt.getTime() - now.getTime();
      const sessionLifetime =
        session.expiresAt.getTime() - session.createdAt.getTime();
      const percentageRemaining = timeRemaining / sessionLifetime;

      if (percentageRemaining >= 1 - this.refreshThreshold) {
        // Token doesn't need refresh yet
        return {
          success: true,
          error: 'Token refresh not needed',
        };
      }

      return await this.performTokenRefresh(userId, session);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_refresh_check',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Failed to check token refresh', {
        error: errorMessage,
        userId,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Perform token refresh with exponential backoff
   */
  private async performTokenRefresh(
    userId: string,
    session: OAuthSession
  ): Promise<RefreshAttemptResult> {
    const startTime = Date.now();

    // Check retry limits
    const attemptCount = this.refreshAttempts.get(userId) || 0;
    if (attemptCount >= this.maxRetries) {
      const error = `Maximum refresh attempts exceeded for user ${userId}`;
      logger.warn(error, { attemptCount, maxRetries: this.maxRetries });

      return {
        success: false,
        error,
      };
    }

    // Implement exponential backoff
    if (attemptCount > 0) {
      const lastAttempt = this.refreshTimestamps.get(userId) || 0;
      const backoffDelay = this.baseRetryDelay * Math.pow(2, attemptCount - 1);
      const timeSinceLastAttempt = Date.now() - lastAttempt;

      if (timeSinceLastAttempt < backoffDelay) {
        const retryAfter = backoffDelay - timeSinceLastAttempt;
        return {
          success: false,
          error: 'Backoff period not elapsed',
          retryAfter,
        };
      }
    }

    this.activeRefreshes++;
    this.refreshAttempts.set(userId, attemptCount + 1);
    this.refreshTimestamps.set(userId, Date.now());

    try {
      logger.info('Attempting token refresh', {
        userId,
        attemptCount: attemptCount + 1,
        expiresAt: session.expiresAt.toISOString(),
      });

      // Extract refresh token (in production, this would come from secure storage)
      // For now, we'll need to implement a way to get the actual refresh token
      // This is a simplified approach - in practice, you'd need to store the refresh token securely
      const refreshTokenResult = await this.getRefreshTokenForSession(session);
      if (!refreshTokenResult.success) {
        throw new Error(
          refreshTokenResult.error || 'Failed to get refresh token'
        );
      }

      // Perform the actual token refresh through OAuth manager
      // Note: This would require extending the OAuth manager with refresh capability
      const newTokens = await this.requestTokenRefresh(
        refreshTokenResult.refreshToken!
      );

      // Store the new tokens
      const storeResult = await this.tokenStorage.storeTokens(
        userId,
        newTokens
      );
      if (!storeResult.success) {
        throw new Error(
          storeResult.error || 'Failed to store refreshed tokens'
        );
      }

      // Reset retry counter on success
      this.refreshAttempts.delete(userId);
      this.refreshTimestamps.delete(userId);
      this.stats.successfulRefreshes++;
      this.stats.lastRefreshTime = new Date();

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_refresh',
        success: true,
        responseTime: Date.now() - startTime,
      });

      logger.info('Token refresh successful', {
        userId,
        newExpiresAt: newTokens.expiresAt.toISOString(),
        sessionId: storeResult.sessionId,
      });

      return {
        success: true,
        newTokens,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.stats.failedRefreshes++;

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'token_refresh',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Token refresh failed', {
        error: errorMessage,
        userId,
        attemptCount: attemptCount + 1,
      });

      return {
        success: false,
        error: errorMessage,
        retryAfter: this.baseRetryDelay * Math.pow(2, attemptCount),
      };
    } finally {
      this.activeRefreshes--;
    }
  }

  /**
   * Start background cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        const stats = await this.tokenStorage.cleanupExpiredTokens();
        this.stats.lastCleanupTime = new Date();

        if (stats.totalCleaned > 0) {
          logger.info('Background token cleanup completed', stats);
        }
      } catch (error) {
        logger.error('Background cleanup failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.cleanupInterval);
  }

  /**
   * Start background refresh monitoring
   */
  private startRefreshMonitoring(): void {
    // Run refresh check every minute
    this.refreshTimer = setInterval(async () => {
      if (this.isShuttingDown || this.refreshTaskRunning) return;

      await this.runBackgroundRefreshTask();
    }, 60000); // 1 minute
  }

  /**
   * Run background refresh task for all sessions requiring refresh
   */
  private async runBackgroundRefreshTask(): Promise<void> {
    if (this.refreshTaskRunning) return;

    this.refreshTaskRunning = true;

    try {
      const sessionsRequiringRefresh =
        await this.tokenStorage.getSessionsRequiringRefresh();
      this.stats.tokensRequiringRefresh = sessionsRequiringRefresh.length;

      if (sessionsRequiringRefresh.length > 0) {
        logger.info('Starting background token refresh', {
          sessionCount: sessionsRequiringRefresh.length,
        });

        // Process refreshes in parallel but with concurrency limit
        const concurrencyLimit = 5;
        const refreshPromises: Promise<void>[] = [];

        for (
          let i = 0;
          i < sessionsRequiringRefresh.length;
          i += concurrencyLimit
        ) {
          const batch = sessionsRequiringRefresh.slice(i, i + concurrencyLimit);

          const batchPromises = batch.map(async session => {
            try {
              await this.refreshUserTokenIfNeeded(session.userId);
            } catch (error) {
              logger.warn('Background refresh failed for session', {
                userId: session.userId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          });

          refreshPromises.push(...batchPromises);

          // Wait for current batch before starting next
          await Promise.all(batchPromises);
        }

        logger.info('Background token refresh completed', {
          processedSessions: sessionsRequiringRefresh.length,
        });
      }
    } catch (error) {
      logger.error('Background refresh task failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.refreshTaskRunning = false;
    }
  }

  /**
   * Get refresh token for a session (placeholder implementation)
   * In production, this would securely retrieve the refresh token
   */
  private async getRefreshTokenForSession(session: OAuthSession): Promise<{
    success: boolean;
    error?: string;
    refreshToken?: string;
  }> {
    // This is a placeholder - in production you would:
    // 1. Decrypt the stored refresh token hash
    // 2. Validate the token is still valid
    // 3. Return the actual refresh token
    return {
      success: false,
      error:
        'Refresh token retrieval not implemented - requires secure token decryption',
    };
  }

  /**
   * Request token refresh from OAuth provider (placeholder)
   * This would use the OAuth manager's refresh capability
   */
  private async requestTokenRefresh(refreshToken: string): Promise<TokenSet> {
    // Placeholder - would use OAuth manager's refresh method
    throw new Error(
      'Token refresh implementation requires OAuth manager refresh method'
    );
  }

  /**
   * Get current lifecycle statistics
   */
  getStats(): LifecycleStats {
    return { ...this.stats };
  }

  /**
   * Get refresh task status
   */
  getRefreshTaskStatus(): RefreshTaskStatus {
    return {
      isRunning: this.refreshTaskRunning,
      lastRun: this.stats.lastRefreshTime,
      nextRun: null, // Would calculate based on timer
      activeRefreshes: this.activeRefreshes,
      failedRetries: new Map(this.refreshAttempts),
    };
  }

  /**
   * Force refresh for specific user (for testing/admin purposes)
   */
  async forceRefreshUser(userId: string): Promise<RefreshAttemptResult> {
    // Clear any existing retry counts for forced refresh
    this.refreshAttempts.delete(userId);
    this.refreshTimestamps.delete(userId);

    const session = await this.tokenStorage.getUserSession(userId);
    if (!session) {
      return {
        success: false,
        error: 'No active session found',
      };
    }

    return await this.performTokenRefresh(userId, session);
  }
}
