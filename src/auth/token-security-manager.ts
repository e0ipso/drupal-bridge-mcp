/**
 * Token Security Manager
 *
 * Central integration point for all token security components including
 * secure storage, lifecycle management, validation, and background processing.
 */

import { EventEmitter } from 'events';
import type { Pool } from 'pg';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { metricsCollector } from '@/monitoring/metrics.js';

// Import all security components
import { SecureTokenStorage } from './secure-token-storage.js';
import { TokenLifecycleManager } from './token-lifecycle-manager.js';
import {
  TokenValidationService,
  type ValidationContext,
  type EnhancedValidationResult,
} from './token-validation-service.js';
import type { BackgroundTaskType } from './background-token-processor.js';
import { BackgroundTokenProcessor } from './background-token-processor.js';
import type { OAuthManager } from './oauth-client.js';
import type { TokenSet, OAuthContext } from '@/types/oauth.js';

/**
 * Security manager configuration
 */
export interface SecurityManagerConfig {
  enableBackgroundProcessing: boolean;
  enableProactiveRefresh: boolean;
  enableTokenIntrospection: boolean;
  enableSecurityAuditing: boolean;
  maxConcurrentOperations: number;
}

/**
 * Security manager status
 */
export interface SecurityManagerStatus {
  isInitialized: boolean;
  componentsHealthy: boolean;
  backgroundProcessorRunning: boolean;
  lastHealthCheck: Date | null;
  componentStatus: {
    tokenStorage: boolean;
    lifecycleManager: boolean;
    validationService: boolean;
    backgroundProcessor: boolean;
    oauthManager: boolean;
  };
}

/**
 * Comprehensive security statistics
 */
export interface SecurityStats {
  tokenOperations: {
    stored: number;
    validated: number;
    refreshed: number;
    expired: number;
    failed: number;
  };
  backgroundTasks: {
    executed: number;
    successful: number;
    failed: number;
  };
  validationMetrics: {
    averageTime: number;
    successRate: number;
    introspectionRate: number;
  };
  securityEvents: {
    suspiciousActivity: number;
    failedValidations: number;
    anomalousPatterns: number;
  };
}

/**
 * Central token security manager
 */
export class TokenSecurityManager extends EventEmitter {
  private readonly dbPool: Pool;
  private readonly config: SecurityManagerConfig;

  // Core components
  private readonly oauthManager: OAuthManager;
  private readonly tokenStorage: SecureTokenStorage;
  private readonly lifecycleManager: TokenLifecycleManager;
  private readonly validationService: TokenValidationService;
  private readonly backgroundProcessor: BackgroundTokenProcessor;

  private isInitialized = false;
  private lastHealthCheck: Date | null = null;

  constructor(
    dbPool: Pool,
    oauthManager: OAuthManager,
    securityConfig?: Partial<SecurityManagerConfig>
  ) {
    super();

    this.dbPool = dbPool;
    this.oauthManager = oauthManager;

    // Merge configuration with defaults
    this.config = {
      enableBackgroundProcessing: true,
      enableProactiveRefresh: true,
      enableTokenIntrospection: true,
      enableSecurityAuditing: true,
      maxConcurrentOperations: 10,
      ...securityConfig,
    };

    // Initialize core components
    this.tokenStorage = new SecureTokenStorage(dbPool);
    this.lifecycleManager = new TokenLifecycleManager(dbPool, oauthManager);
    this.validationService = new TokenValidationService(
      dbPool,
      oauthManager,
      this.lifecycleManager
    );
    this.backgroundProcessor = new BackgroundTokenProcessor(
      dbPool,
      oauthManager,
      this.lifecycleManager,
      this.validationService
    );

    this.setupEventHandlers();
  }

  /**
   * Initialize the security manager and all components
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Token security manager already initialized');
      return;
    }

    logger.info('Initializing token security manager', {
      config: this.config,
    });

    try {
      // Start lifecycle manager
      await this.lifecycleManager.start();

      // Start background processor if enabled
      if (this.config.enableBackgroundProcessing) {
        await this.backgroundProcessor.start();
      }

      // Perform initial health check
      await this.performHealthCheck();

      this.isInitialized = true;
      this.emit('initialized');

      logger.info('Token security manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize token security manager', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Shutdown the security manager and all components
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Token security manager not initialized');
      return;
    }

    logger.info('Shutting down token security manager');

    try {
      // Stop background processor
      if (this.config.enableBackgroundProcessing) {
        await this.backgroundProcessor.stop();
      }

      // Stop lifecycle manager
      await this.lifecycleManager.stop();

      this.isInitialized = false;
      this.emit('shutdown');

      logger.info('Token security manager shutdown complete');
    } catch (error) {
      logger.error('Error during security manager shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Store tokens securely
   */
  async storeUserTokens(
    userId: string,
    tokens: TokenSet
  ): Promise<{
    success: boolean;
    error?: string;
    sessionId?: number;
  }> {
    try {
      const result = await this.tokenStorage.storeTokens(userId, tokens);

      if (result.success && this.config.enableProactiveRefresh) {
        // Schedule proactive refresh monitoring
        this.scheduleProactiveRefresh(userId, tokens.expiresAt);
      }

      this.emit('tokensStored', { userId, sessionId: result.sessionId });
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Failed to store tokens', { error: errorMessage, userId });
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate token with comprehensive security checks
   */
  async validateUserToken(
    context: ValidationContext
  ): Promise<EnhancedValidationResult> {
    try {
      const result = await this.validationService.validateToken(context);

      // Emit security events
      if (!result.valid) {
        this.emit('validationFailed', {
          userId: context.userId,
          error: result.error,
          errorCode: result.errorCode,
        });
      } else if (result.refreshed) {
        this.emit('tokenRefreshed', {
          userId: context.userId,
          context: result.context,
        });
      }

      return result;
    } catch (error) {
      logger.error('Token validation error', {
        error: error instanceof Error ? error.message : String(error),
        userId: context.userId,
      });

      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
        errorCode: 'VALIDATION_ERROR',
      };
    }
  }

  /**
   * Quick token validation for high-frequency operations
   */
  async quickValidateToken(
    userId: string,
    accessToken: string
  ): Promise<{
    valid: boolean;
    error?: string;
  }> {
    return await this.validationService.quickValidateToken(userId, accessToken);
  }

  /**
   * Force token refresh for a user
   */
  async forceRefreshUserToken(userId: string): Promise<{
    success: boolean;
    error?: string;
    newTokens?: TokenSet;
  }> {
    try {
      const result = await this.lifecycleManager.forceRefreshUser(userId);

      if (result.success) {
        this.emit('tokenForceRefreshed', {
          userId,
          newTokens: result.newTokens,
        });
      }

      return {
        success: result.success,
        error: result.error,
        newTokens: result.newTokens,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error('Force token refresh failed', {
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
   * Get user authentication context
   */
  async getUserAuthContext(userId: string): Promise<OAuthContext | null> {
    try {
      return await this.oauthManager.getAuthContext(userId);
    } catch (error) {
      logger.error('Failed to get auth context', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return null;
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<SecurityManagerStatus> {
    const startTime = Date.now();

    try {
      const [
        tokenStorageHealth,
        oauthManagerHealth,
        backgroundProcessorHealth,
      ] = await Promise.all([
        this.checkTokenStorageHealth(),
        this.oauthManager.checkHealth(),
        this.checkBackgroundProcessorHealth(),
      ]);

      const componentStatus = {
        tokenStorage: tokenStorageHealth,
        lifecycleManager: true, // Lifecycle manager doesn't have explicit health check
        validationService: true, // Validation service doesn't have explicit health check
        backgroundProcessor: backgroundProcessorHealth,
        oauthManager: oauthManagerHealth,
      };

      const componentsHealthy = Object.values(componentStatus).every(Boolean);
      this.lastHealthCheck = new Date();

      const status: SecurityManagerStatus = {
        isInitialized: this.isInitialized,
        componentsHealthy,
        backgroundProcessorRunning:
          this.config.enableBackgroundProcessing && backgroundProcessorHealth,
        lastHealthCheck: this.lastHealthCheck,
        componentStatus,
      };

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'health_check',
        success: componentsHealthy,
        responseTime: Date.now() - startTime,
      });

      if (!componentsHealthy) {
        this.emit('healthCheckFailed', status);
        logger.warn('Security manager health check failed', status);
      } else {
        this.emit('healthCheckPassed', status);
        logger.debug('Security manager health check passed');
      }

      return status;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'health_check',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Health check error', { error: errorMessage });
      throw error;
    }
  }

  /**
   * Get comprehensive security statistics
   */
  getSecurityStats(): SecurityStats {
    const tokenStorageStats = this.tokenStorage.cleanupExpiredTokens;
    const validationStats = this.validationService.getStats();
    const backgroundStats = this.backgroundProcessor.getStats();
    const lifecycleStats = this.lifecycleManager.getStats();

    return {
      tokenOperations: {
        stored: 0, // Would need to track this
        validated: validationStats.totalValidations,
        refreshed: lifecycleStats.successfulRefreshes,
        expired: lifecycleStats.expiredTokens,
        failed: validationStats.failedValidations,
      },
      backgroundTasks: {
        executed: backgroundStats.tasksExecuted,
        successful: backgroundStats.tasksSuccessful,
        failed: backgroundStats.tasksFailed,
      },
      validationMetrics: {
        averageTime: validationStats.averageValidationTime,
        successRate:
          validationStats.totalValidations > 0
            ? (validationStats.successfulValidations /
                validationStats.totalValidations) *
              100
            : 0,
        introspectionRate:
          validationStats.totalValidations > 0
            ? (validationStats.introspectionCalls /
                validationStats.totalValidations) *
              100
            : 0,
      },
      securityEvents: {
        suspiciousActivity: 0, // Would need to implement detection
        failedValidations: validationStats.failedValidations,
        anomalousPatterns: 0, // Would need to implement detection
      },
    };
  }

  /**
   * Trigger immediate background task execution
   */
  triggerBackgroundTask(taskType: BackgroundTaskType): void {
    if (!this.config.enableBackgroundProcessing) {
      logger.warn('Background processing disabled, cannot trigger task', {
        taskType,
      });
      return;
    }

    this.backgroundProcessor.forceExecuteTask(taskType);
    this.emit('backgroundTaskTriggered', { taskType });
  }

  /**
   * Get current system status
   */
  getCurrentStatus(): SecurityManagerStatus {
    return {
      isInitialized: this.isInitialized,
      componentsHealthy: this.lastHealthCheck ? true : false, // Simplified
      backgroundProcessorRunning: this.config.enableBackgroundProcessing,
      lastHealthCheck: this.lastHealthCheck,
      componentStatus: {
        tokenStorage: true, // Simplified
        lifecycleManager: true,
        validationService: true,
        backgroundProcessor: this.config.enableBackgroundProcessing,
        oauthManager: true,
      },
    };
  }

  /**
   * Setup event handlers for component coordination
   */
  private setupEventHandlers(): void {
    // Background processor events
    this.backgroundProcessor.on('taskCompleted', (task, result) => {
      this.emit('backgroundTaskCompleted', { task, result });
      logger.debug('Background task completed', { type: task.type });
    });

    this.backgroundProcessor.on('taskFailed', (task, error) => {
      this.emit('backgroundTaskFailed', { task, error });
      logger.warn('Background task failed', {
        type: task.type,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Add more event handlers as needed
  }

  /**
   * Schedule proactive refresh for a token
   */
  private scheduleProactiveRefresh(userId: string, expiresAt: Date): void {
    if (!this.config.enableProactiveRefresh) return;

    const { refreshThreshold } = config.security.token;
    const now = new Date();
    const timeToExpiry = expiresAt.getTime() - now.getTime();
    const refreshTime = timeToExpiry * (1 - refreshThreshold);

    if (refreshTime > 0) {
      setTimeout(() => {
        this.lifecycleManager.refreshUserTokenIfNeeded(userId).catch(error => {
          logger.warn('Proactive token refresh failed', {
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }, refreshTime);

      logger.debug('Proactive refresh scheduled', {
        userId,
        refreshIn: refreshTime,
        expiresAt: expiresAt.toISOString(),
      });
    }
  }

  /**
   * Check token storage health
   */
  private async checkTokenStorageHealth(): Promise<boolean> {
    try {
      const client = await this.dbPool.connect();
      try {
        await client.query('SELECT 1 FROM user_sessions LIMIT 1');
        return true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  /**
   * Check background processor health
   */
  private checkBackgroundProcessorHealth(): boolean {
    if (!this.config.enableBackgroundProcessing) return true;

    const stats = this.backgroundProcessor.getStats();
    // Consider healthy if it's processing or has processed tasks recently
    return stats.uptime > 0;
  }
}
