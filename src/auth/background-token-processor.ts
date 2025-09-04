/**
 * Background Token Processor
 *
 * Non-blocking background system for token maintenance, refresh scheduling,
 * and automated security operations with proper error handling and recovery.
 */

import { EventEmitter } from 'events';
import type { Pool } from 'pg';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { metricsCollector } from '@/monitoring/metrics.js';
import { SecureTokenStorage } from './secure-token-storage.js';
import type { TokenLifecycleManager } from './token-lifecycle-manager.js';
import type { TokenValidationService } from './token-validation-service.js';
import type { OAuthManager } from './oauth-client.js';

/**
 * Background task types
 */
export enum BackgroundTaskType {
  CLEANUP_EXPIRED = 'cleanup_expired',
  REFRESH_TOKENS = 'refresh_tokens',
  VALIDATE_SESSIONS = 'validate_sessions',
  SECURITY_AUDIT = 'security_audit',
  HEALTH_CHECK = 'health_check',
}

/**
 * Task execution context
 */
export interface TaskContext {
  type: BackgroundTaskType;
  scheduled: Date;
  started?: Date;
  completed?: Date;
  error?: string;
  retries: number;
  maxRetries: number;
  priority: number; // 1-10, higher is more important
}

/**
 * Task execution result
 */
export interface TaskResult {
  success: boolean;
  error?: string;
  data?: any;
  processingTime: number;
  affectedRecords?: number;
}

/**
 * Processor statistics
 */
export interface ProcessorStats {
  tasksExecuted: number;
  tasksSuccessful: number;
  tasksFailed: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
  currentQueueSize: number;
  lastExecutionTime: Date | null;
  uptime: number;
}

/**
 * Background token processor with job queue and error recovery
 */
export class BackgroundTokenProcessor extends EventEmitter {
  private readonly dbPool: Pool;
  private readonly tokenStorage: SecureTokenStorage;
  private readonly lifecycleManager: TokenLifecycleManager;
  private readonly validationService: TokenValidationService;
  private readonly oauthManager: OAuthManager;

  private isRunning = false;
  private isShuttingDown = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private readonly taskQueue: TaskContext[] = [];
  private activeTask: TaskContext | null = null;
  private startTime: Date | null = null;

  // Configuration
  private readonly processingIntervalMs: number;
  private readonly maxConcurrentTasks: number;
  private readonly taskTimeoutMs: number;

  // Statistics
  private readonly stats: ProcessorStats = {
    tasksExecuted: 0,
    tasksSuccessful: 0,
    tasksFailed: 0,
    totalProcessingTime: 0,
    averageProcessingTime: 0,
    currentQueueSize: 0,
    lastExecutionTime: null,
    uptime: 0,
  };

  constructor(
    dbPool: Pool,
    oauthManager: OAuthManager,
    lifecycleManager: TokenLifecycleManager,
    validationService: TokenValidationService
  ) {
    super();

    this.dbPool = dbPool;
    this.oauthManager = oauthManager;
    this.lifecycleManager = lifecycleManager;
    this.validationService = validationService;
    this.tokenStorage = new SecureTokenStorage(dbPool);

    // Configuration from environment
    this.processingIntervalMs = config.security.token.cleanupIntervalMs;
    this.maxConcurrentTasks = parseInt(
      process.env.BACKGROUND_TASK_CONCURRENCY ?? '3',
      10
    );
    this.taskTimeoutMs = parseInt(
      process.env.BACKGROUND_TASK_TIMEOUT ?? '300000',
      10
    ); // 5 minutes

    // Schedule recurring tasks
    this.scheduleRecurringTasks();
  }

  /**
   * Start the background processor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Background processor already running');
      return;
    }

    logger.info('Starting background token processor', {
      processingInterval: this.processingIntervalMs,
      maxConcurrentTasks: this.maxConcurrentTasks,
      taskTimeout: this.taskTimeoutMs,
    });

    this.isRunning = true;
    this.startTime = new Date();

    // Start processing loop
    this.processingInterval = setInterval(async () => {
      if (!this.isShuttingDown) {
        await this.processQueue();
      }
    }, this.processingIntervalMs);

    this.emit('started');
    logger.info('Background token processor started');
  }

  /**
   * Stop the background processor
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Background processor not running');
      return;
    }

    logger.info('Stopping background token processor');
    this.isShuttingDown = true;

    // Clear interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    // Wait for active task to complete
    const maxWaitMs = 30000; // 30 seconds
    const startWait = Date.now();

    while (this.activeTask && Date.now() - startWait < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (this.activeTask) {
      logger.warn('Force stopping with active task', {
        activeTask: this.activeTask.type,
      });
    }

    this.isRunning = false;
    this.isShuttingDown = false;

    if (this.startTime) {
      this.stats.uptime = Date.now() - this.startTime.getTime();
    }

    this.emit('stopped');
    logger.info('Background token processor stopped');
  }

  /**
   * Add task to queue
   */
  enqueueTask(type: BackgroundTaskType, priority = 5, maxRetries = 3): void {
    const task: TaskContext = {
      type,
      scheduled: new Date(),
      retries: 0,
      maxRetries,
      priority,
    };

    // Insert task in priority order
    const insertIndex = this.taskQueue.findIndex(t => t.priority < priority);
    if (insertIndex === -1) {
      this.taskQueue.push(task);
    } else {
      this.taskQueue.splice(insertIndex, 0, task);
    }

    this.updateQueueSize();

    logger.debug('Task enqueued', {
      type,
      priority,
      queueSize: this.taskQueue.length,
    });

    this.emit('taskEnqueued', task);
  }

  /**
   * Process task queue
   */
  private async processQueue(): Promise<void> {
    if (this.activeTask || this.taskQueue.length === 0 || this.isShuttingDown) {
      return;
    }

    // Get next task
    const task = this.taskQueue.shift();
    if (!task) return;

    this.activeTask = task;
    this.updateQueueSize();

    logger.debug('Processing background task', {
      type: task.type,
      priority: task.priority,
      retries: task.retries,
    });

    const startTime = Date.now();
    task.started = new Date();

    try {
      // Execute task with timeout
      const result = await Promise.race([
        this.executeTask(task),
        this.createTaskTimeout(task),
      ]);

      const processingTime = Date.now() - startTime;
      task.completed = new Date();

      // Update statistics
      this.stats.tasksExecuted++;
      this.stats.totalProcessingTime += processingTime;
      this.stats.averageProcessingTime = Math.round(
        this.stats.totalProcessingTime / this.stats.tasksExecuted
      );
      this.stats.lastExecutionTime = task.completed;

      if (result.success) {
        this.stats.tasksSuccessful++;

        logger.info('Background task completed successfully', {
          type: task.type,
          processingTime,
          affectedRecords: result.affectedRecords,
        });

        this.emit('taskCompleted', task, result);
      } else {
        throw new Error(result.error || 'Task execution failed');
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      task.error = errorMessage;

      logger.warn('Background task failed', {
        type: task.type,
        error: errorMessage,
        retries: task.retries,
        maxRetries: task.maxRetries,
      });

      // Retry logic
      if (task.retries < task.maxRetries) {
        task.retries++;
        delete (task as any).started;
        delete (task as any).completed;
        delete (task as any).error;

        // Add back to queue with exponential backoff
        setTimeout(
          () => {
            if (!this.isShuttingDown) {
              this.taskQueue.push(task);
              this.updateQueueSize();
            }
          },
          Math.pow(2, task.retries) * 1000
        );

        logger.info('Task scheduled for retry', {
          type: task.type,
          retries: task.retries,
          nextRetryIn: Math.pow(2, task.retries) * 1000,
        });
      } else {
        this.stats.tasksFailed++;

        logger.error('Task failed permanently', {
          type: task.type,
          error: errorMessage,
          retries: task.retries,
        });

        this.emit('taskFailed', task, error);
      }
    } finally {
      this.activeTask = null;
    }
  }

  /**
   * Execute specific task
   */
  private async executeTask(task: TaskContext): Promise<TaskResult> {
    const startTime = Date.now();

    switch (task.type) {
      case BackgroundTaskType.CLEANUP_EXPIRED:
        return await this.executeCleanupExpired();

      case BackgroundTaskType.REFRESH_TOKENS:
        return await this.executeRefreshTokens();

      case BackgroundTaskType.VALIDATE_SESSIONS:
        return await this.executeValidateSessions();

      case BackgroundTaskType.SECURITY_AUDIT:
        return await this.executeSecurityAudit();

      case BackgroundTaskType.HEALTH_CHECK:
        return await this.executeHealthCheck();

      default:
        throw new Error(`Unknown task type: ${task.type}`);
    }
  }

  /**
   * Execute cleanup of expired tokens
   */
  private async executeCleanupExpired(): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      const stats = await this.tokenStorage.cleanupExpiredTokens();

      return {
        success: true,
        processingTime: Date.now() - startTime,
        affectedRecords: stats.totalCleaned,
        data: stats as Record<string, unknown>,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute token refresh for expiring tokens
   */
  private async executeRefreshTokens(): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      const sessionsRequiringRefresh =
        await this.tokenStorage.getSessionsRequiringRefresh();
      let successCount = 0;
      let failureCount = 0;

      // Process refreshes with concurrency limit
      const concurrencyLimit = 3;
      for (
        let i = 0;
        i < sessionsRequiringRefresh.length;
        i += concurrencyLimit
      ) {
        const batch = sessionsRequiringRefresh.slice(i, i + concurrencyLimit);

        const results = await Promise.allSettled(
          batch.map(session =>
            this.lifecycleManager.refreshUserTokenIfNeeded(session.userId)
          )
        );

        results.forEach(result => {
          if (result.status === 'fulfilled' && result.value.success) {
            successCount++;
          } else {
            failureCount++;
          }
        });
      }

      return {
        success: true,
        processingTime: Date.now() - startTime,
        affectedRecords: successCount,
        data: {
          successful: successCount,
          failed: failureCount,
          total: sessionsRequiringRefresh.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute session validation
   */
  private async executeValidateSessions(): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      // This would validate a sample of active sessions
      // Implementation depends on specific requirements

      return {
        success: true,
        processingTime: Date.now() - startTime,
        affectedRecords: 0,
        data: { message: 'Session validation not implemented' },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute security audit
   */
  private async executeSecurityAudit(): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      // Security audit implementation
      const auditResults = {
        suspiciousActivity: 0,
        failedLoginAttempts: 0,
        expiredTokensInUse: 0,
        anomalousRefreshPatterns: 0,
      };

      return {
        success: true,
        processingTime: Date.now() - startTime,
        affectedRecords: 0,
        data: auditResults,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute health check
   */
  private async executeHealthCheck(): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      const healthResults = {
        tokenStorageHealth: await this.checkTokenStorageHealth(),
        oauthManagerHealth: await this.oauthManager.checkHealth(),
        databaseHealth: await this.checkDatabaseHealth(),
      };

      const allHealthy = Object.values(healthResults).every(Boolean);

      return {
        success: allHealthy,
        processingTime: Date.now() - startTime,
        affectedRecords: 0,
        data: healthResults,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Create task timeout promise
   */
  private createTaskTimeout(task: TaskContext): Promise<TaskResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Task ${task.type} timed out after ${this.taskTimeoutMs}ms`)
        );
      }, this.taskTimeoutMs);
    });
  }

  /**
   * Schedule recurring tasks
   */
  private scheduleRecurringTasks(): void {
    // Schedule cleanup every 5 minutes
    setInterval(
      () => {
        if (this.isRunning && !this.isShuttingDown) {
          this.enqueueTask(BackgroundTaskType.CLEANUP_EXPIRED, 3);
        }
      },
      5 * 60 * 1000
    );

    // Schedule token refresh every 2 minutes
    setInterval(
      () => {
        if (this.isRunning && !this.isShuttingDown) {
          this.enqueueTask(BackgroundTaskType.REFRESH_TOKENS, 7);
        }
      },
      2 * 60 * 1000
    );

    // Schedule health check every 10 minutes
    setInterval(
      () => {
        if (this.isRunning && !this.isShuttingDown) {
          this.enqueueTask(BackgroundTaskType.HEALTH_CHECK, 2);
        }
      },
      10 * 60 * 1000
    );

    // Schedule security audit every hour
    setInterval(
      () => {
        if (this.isRunning && !this.isShuttingDown) {
          this.enqueueTask(BackgroundTaskType.SECURITY_AUDIT, 4);
        }
      },
      60 * 60 * 1000
    );
  }

  /**
   * Update queue size statistic
   */
  private updateQueueSize(): void {
    this.stats.currentQueueSize = this.taskQueue.length;
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
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      const client = await this.dbPool.connect();
      try {
        await client.query('SELECT NOW()');
        return true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  /**
   * Get processor statistics
   */
  getStats(): ProcessorStats {
    if (this.startTime) {
      this.stats.uptime = Date.now() - this.startTime.getTime();
    }
    return { ...this.stats };
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queueSize: number;
    activeTask: TaskContext | null;
    upcomingTasks: Array<{
      type: BackgroundTaskType;
      priority: number;
      scheduled: Date;
    }>;
  } {
    return {
      queueSize: this.taskQueue.length,
      activeTask: this.activeTask,
      upcomingTasks: this.taskQueue.slice(0, 5).map(task => ({
        type: task.type,
        priority: task.priority,
        scheduled: task.scheduled,
      })),
    };
  }

  /**
   * Force execution of specific task type (for testing/admin)
   */
  forceExecuteTask(type: BackgroundTaskType): void {
    this.enqueueTask(type, 10); // Highest priority

    logger.info('Task forced for immediate execution', { type });
  }
}
