/**
 * Comprehensive User Session Management System
 *
 * Handles session lifecycle, recovery, connection state tracking, and
 * automatic token refresh for long-running MCP connections.
 */

import { EventEmitter } from 'events';
import type { Pool } from 'pg';
import { logger } from '@/utils/logger.js';
import { metricsCollector } from '@/monitoring/metrics.js';
import type { TokenSecurityManager } from './token-security-manager.js';
import type { OAuthManager } from './oauth-client.js';
import type { OAuthContext, TokenSet } from '@/types/oauth.js';
import {
  SessionErrorCode,
  AuthenticationRequiredError,
} from '@/types/session.js';
import type {
  UserSession,
  SessionData,
  SessionRecoveryResult,
  SessionValidationContext,
  SessionValidationResult,
  ConnectionInfo,
  UserContext,
  SessionStatistics,
  SessionManagerConfig,
  ConnectionCleanupResult,
  SubscriptionLevel,
  AuthenticationState,
  ConnectionState,
} from '@/types/session.js';

/**
 * Comprehensive Session Manager with persistence, recovery, and connection tracking
 */
export class SessionManager extends EventEmitter {
  private readonly dbPool: Pool;
  private readonly tokenSecurityManager: TokenSecurityManager;
  private readonly oauthManager: OAuthManager;
  private readonly config: SessionManagerConfig;

  /** In-memory session cache for performance */
  private readonly sessionCache = new Map<string, UserSession>();

  /** Active connection tracking */
  private readonly connectionTracker = new Map<string, ConnectionInfo>();

  /** Session cleanup interval */
  private cleanupInterval?: NodeJS.Timeout;

  /** Recovery queue for failed sessions */
  private readonly recoveryQueue = new Set<string>();

  private isInitialized = false;

  constructor(
    dbPool: Pool,
    tokenSecurityManager: TokenSecurityManager,
    oauthManager: OAuthManager,
    config?: Partial<SessionManagerConfig>
  ) {
    super();

    this.dbPool = dbPool;
    this.tokenSecurityManager = tokenSecurityManager;
    this.oauthManager = oauthManager;

    // Merge configuration with defaults
    this.config = {
      enableAutoRecovery: true,
      enableProactiveRefresh: true,
      cleanupInterval: 5 * 60 * 1000, // 5 minutes
      maxSessionsPerUser: 5,
      maxConnectionsPerSession: 10,
      inactivityTimeout: 30 * 60 * 1000, // 30 minutes
      tokenRefreshThreshold: 0.75, // Refresh at 75% of token lifetime
      maxFailureCount: 3,
      ...config,
    };

    this.setupEventHandlers();
  }

  /**
   * Initialize the session manager
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Session manager already initialized');
      return;
    }

    logger.info('Initializing session manager', { config: this.config });

    try {
      // Start cleanup interval
      if (this.config.cleanupInterval > 0) {
        this.cleanupInterval = setInterval(
          () => this.performCleanup(),
          this.config.cleanupInterval
        );
      }

      // Perform auto-recovery if enabled
      if (this.config.enableAutoRecovery) {
        await this.performAutoRecovery();
      }

      this.isInitialized = true;
      this.emit('initialized');

      logger.info('Session manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize session manager', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Shutdown the session manager
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    logger.info('Shutting down session manager');

    try {
      // Clear cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = undefined;
      }

      // Close all active connections
      await this.closeAllConnections();

      // Clear caches
      this.sessionCache.clear();
      this.connectionTracker.clear();
      this.recoveryQueue.clear();

      this.isInitialized = false;
      this.emit('shutdown');

      logger.info('Session manager shutdown complete');
    } catch (error) {
      logger.error('Error during session manager shutdown', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Recover user session with automatic token refresh
   */
  async recoverUserSession(userId: string): Promise<UserSession | null> {
    const startTime = Date.now();

    try {
      logger.debug('Attempting session recovery', { userId });

      // Check cache first
      const cachedSession = this.sessionCache.get(userId);
      if (cachedSession && this.isSessionValid(cachedSession)) {
        logger.debug('Session recovered from cache', { userId });
        return cachedSession;
      }

      // Retrieve from database
      const storedSession = await this.getStoredSession(userId);
      if (!storedSession) {
        logger.debug('No stored session found', { userId });
        return null;
      }

      // Check if session is expired
      if (this.isSessionExpired(storedSession)) {
        logger.debug('Stored session expired, attempting token refresh', {
          userId,
        });

        try {
          await this.attemptTokenRefresh(userId);
          // Re-fetch session after refresh
          return await this.recoverUserSession(userId);
        } catch (error) {
          logger.warn('Token refresh failed during recovery', {
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }
      }

      // Hydrate session from stored data
      const hydratedSession = await this.hydrateSession(storedSession);

      // Cache the recovered session
      this.sessionCache.set(userId, hydratedSession);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'session_recovery',
        success: true,
        responseTime: Date.now() - startTime,
      });

      this.emit('sessionRecovered', { userId, session: hydratedSession });

      logger.info('Session recovered successfully', {
        userId,
        sessionId: hydratedSession.sessionId,
        expiresAt: hydratedSession.expiresAt,
      });

      return hydratedSession;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'session_recovery',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Session recovery failed', {
        userId,
        error: errorMessage,
      });

      return null;
    }
  }

  /**
   * Validate user session with comprehensive security checks
   */
  async validateUserSession(
    context: SessionValidationContext
  ): Promise<SessionValidationResult> {
    const startTime = Date.now();

    try {
      const { userId, accessToken, requiredScopes, skipIntrospection } =
        context;

      // Get session from cache or database
      let session = this.sessionCache.get(userId);
      if (!session) {
        session = await this.recoverUserSession(userId);
        if (!session) {
          return {
            valid: false,
            error: 'Session not found',
            errorCode: SessionErrorCode.SESSION_NOT_FOUND,
            refreshed: false,
          };
        }
      }

      // Check session validity
      if (!this.isSessionValid(session)) {
        return {
          valid: false,
          session,
          error: 'Session invalid',
          errorCode: SessionErrorCode.SESSION_INVALID,
          refreshed: false,
        };
      }

      // Check token expiration
      if (this.isSessionExpired(session)) {
        try {
          await this.attemptTokenRefresh(userId);
          session = await this.recoverUserSession(userId);

          if (!session) {
            return {
              valid: false,
              error: 'Session recovery failed after refresh',
              errorCode: SessionErrorCode.REFRESH_FAILED,
              refreshed: true,
            };
          }

          // Update cache and return validated session
          this.sessionCache.set(userId, session);

          return {
            valid: true,
            session,
            refreshed: true,
            context: session.oauthContext,
          };
        } catch (error) {
          await this.invalidateSession(userId);

          return {
            valid: false,
            session,
            error: 'Token refresh failed',
            errorCode: SessionErrorCode.REFRESH_FAILED,
            refreshed: false,
          };
        }
      }

      // Check required scopes
      if (requiredScopes && requiredScopes.length > 0) {
        const hasRequiredScopes = requiredScopes.every(scope =>
          session.oauthContext.scopes.includes(scope)
        );

        if (!hasRequiredScopes) {
          return {
            valid: false,
            session,
            error: 'Insufficient scopes',
            errorCode: SessionErrorCode.INSUFFICIENT_SCOPES,
            refreshed: false,
          };
        }
      }

      // Perform token introspection if needed
      if (!skipIntrospection) {
        const validationResult =
          await this.tokenSecurityManager.validateUserToken({
            userId,
            accessToken,
            requiredScopes,
            skipQuickChecks: false,
          });

        if (!validationResult.valid) {
          return {
            valid: false,
            session,
            error: validationResult.error || 'Token validation failed',
            errorCode: SessionErrorCode.TOKEN_INVALID,
            refreshed: false,
          };
        }
      }

      // Update session activity
      session.lastActiveAt = new Date();
      this.sessionCache.set(userId, session);
      await this.updateSessionActivity(userId);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'session_validation',
        success: true,
        responseTime: Date.now() - startTime,
      });

      return {
        valid: true,
        session,
        refreshed: false,
        context: session.oauthContext,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'session_validation',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Session validation failed', {
        userId: context.userId,
        error: errorMessage,
      });

      return {
        valid: false,
        error: errorMessage,
        errorCode: SessionErrorCode.DATABASE_ERROR,
        refreshed: false,
      };
    }
  }

  /**
   * Create user session from token set
   */
  async createUserSession(
    userId: string,
    tokenSet: TokenSet,
    metadata?: Record<string, any>
  ): Promise<UserSession> {
    const startTime = Date.now();

    try {
      logger.debug('Creating user session', { userId });

      // Store session in database
      const sessionId = await this.storeUserSession(userId, tokenSet, metadata);

      // Create session object
      const session: UserSession = {
        userId,
        sessionId,
        authState: 'authenticated',
        oauthContext: {
          userId,
          scopes: tokenSet.scopes,
          subscriptionLevel: tokenSet.subscriptionLevel || 'free',
          expiresAt: tokenSet.expiresAt,
        },
        subscriptionLevel:
          (tokenSet.subscriptionLevel as SubscriptionLevel) || 'free',
        createdAt: new Date(),
        lastActiveAt: new Date(),
        expiresAt: tokenSet.expiresAt,
        lastTokenRefresh: new Date(),
        failureCount: 0,
        metadata: {
          ...metadata,
        },
      };

      // Cache the session
      this.sessionCache.set(userId, session);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'session_creation',
        success: true,
        responseTime: Date.now() - startTime,
      });

      this.emit('sessionCreated', { userId, session });

      logger.info('User session created successfully', {
        userId,
        sessionId,
        subscriptionLevel: session.subscriptionLevel,
      });

      return session;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordOAuth({
        timestamp: startTime,
        operation: 'session_creation',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Failed to create user session', {
        userId,
        error: errorMessage,
      });

      throw error;
    }
  }

  /**
   * Invalidate user session
   */
  async invalidateSession(userId: string): Promise<void> {
    try {
      logger.debug('Invalidating session', { userId });

      // Remove from cache
      this.sessionCache.delete(userId);

      // Close associated connections
      await this.closeUserConnections(userId);

      // Mark session as invalid in database
      const client = await this.dbPool.connect();
      try {
        const query = `
          UPDATE user_sessions 
          SET 
            expires_at = NOW(),
            updated_at = NOW()
          WHERE user_id = $1
        `;

        await client.query(query, [userId]);
      } finally {
        client.release();
      }

      this.emit('sessionInvalidated', { userId });

      logger.info('Session invalidated', { userId });
    } catch (error) {
      logger.error('Failed to invalidate session', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Register active connection
   */
  registerConnection(
    userId: string,
    connectionId: string,
    metadata?: Record<string, any>
  ): ConnectionInfo {
    const connection: ConnectionInfo = {
      connectionId,
      userId,
      state: 'active',
      connectedAt: new Date(),
      lastActivityAt: new Date(),
      metadata: {
        ...metadata,
      },
    };

    this.connectionTracker.set(connectionId, connection);

    this.emit('connectionRegistered', { userId, connectionId });

    logger.debug('Connection registered', { userId, connectionId });

    return connection;
  }

  /**
   * Update connection activity
   */
  updateConnectionActivity(connectionId: string): void {
    const connection = this.connectionTracker.get(connectionId);
    if (connection) {
      connection.lastActivityAt = new Date();
      this.connectionTracker.set(connectionId, connection);

      logger.debug('Connection activity updated', {
        connectionId,
        userId: connection.userId,
      });
    }
  }

  /**
   * Close specific connection
   */
  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connectionTracker.get(connectionId);
    if (connection) {
      connection.state = 'terminated';
      this.connectionTracker.delete(connectionId);

      this.emit('connectionClosed', {
        userId: connection.userId,
        connectionId,
      });

      logger.debug('Connection closed', {
        connectionId,
        userId: connection.userId,
      });
    }
  }

  /**
   * Get user context with permissions and subscription information
   */
  async getUserContext(userId: string): Promise<UserContext | null> {
    const session = await this.recoverUserSession(userId);
    if (!session) {
      return null;
    }

    return this.buildUserContext(session);
  }

  /**
   * Get comprehensive session statistics
   */
  async getSessionStatistics(): Promise<SessionStatistics> {
    const client = await this.dbPool.connect();

    try {
      const query = `
        SELECT 
          COUNT(*) as total_sessions,
          COUNT(*) FILTER (WHERE expires_at > NOW()) as active_sessions,
          COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_sessions,
          COUNT(*) FILTER (WHERE expires_at > NOW() AND expires_at < NOW() + INTERVAL '1 hour') as sessions_needing_refresh,
          COUNT(*) FILTER (WHERE failure_count > 0) as failed_sessions,
          AVG(EXTRACT(EPOCH FROM (COALESCE(updated_at, NOW()) - created_at))) as avg_duration_seconds,
          COUNT(*) FILTER (WHERE subscription_level = 'free') as free_sessions,
          COUNT(*) FILTER (WHERE subscription_level = 'plus') as plus_sessions,
          COUNT(*) FILTER (WHERE subscription_level = 'pro') as pro_sessions
        FROM user_sessions
      `;

      const result = await client.query(query);
      const stats = result.rows[0];

      return {
        activeSessions: parseInt(stats.active_sessions, 10),
        expiredSessions: parseInt(stats.expired_sessions, 10),
        activeConnections: this.connectionTracker.size,
        sessionsNeedingRefresh: parseInt(stats.sessions_needing_refresh, 10),
        failedSessions: parseInt(stats.failed_sessions, 10),
        avgSessionDuration: parseFloat(stats.avg_duration_seconds) || 0,
        sessionsBySubscription: {
          free: parseInt(stats.free_sessions, 10),
          plus: parseInt(stats.plus_sessions, 10),
          pro: parseInt(stats.pro_sessions, 10),
        },
      };
    } finally {
      client.release();
    }
  }

  /**
   * Attempt token refresh for user
   */
  private async attemptTokenRefresh(userId: string): Promise<void> {
    try {
      logger.debug('Attempting token refresh', { userId });

      if (this.recoveryQueue.has(userId)) {
        logger.debug('Token refresh already in progress', { userId });
        return;
      }

      this.recoveryQueue.add(userId);

      try {
        const refreshResult =
          await this.tokenSecurityManager.forceRefreshUserToken(userId);

        if (!refreshResult.success) {
          throw new AuthenticationRequiredError(
            refreshResult.error || 'Token refresh failed',
            SessionErrorCode.REFRESH_FAILED,
            userId
          );
        }

        // Update session cache if exists
        const cachedSession = this.sessionCache.get(userId);
        if (cachedSession && refreshResult.newTokens) {
          cachedSession.lastTokenRefresh = new Date();
          cachedSession.expiresAt = refreshResult.newTokens.expiresAt;
          cachedSession.authState = 'authenticated';
          cachedSession.failureCount = 0;
          this.sessionCache.set(userId, cachedSession);
        }

        logger.info('Token refresh successful', { userId });
      } finally {
        this.recoveryQueue.delete(userId);
      }
    } catch (error) {
      this.recoveryQueue.delete(userId);

      // Mark session as requiring re-authorization
      await this.markSessionForReauth(userId);

      if (error instanceof AuthenticationRequiredError) {
        throw error;
      }

      throw new AuthenticationRequiredError(
        error instanceof Error ? error.message : String(error),
        SessionErrorCode.REFRESH_FAILED,
        userId
      );
    }
  }

  /**
   * Check if session is valid
   */
  private isSessionValid(session: UserSession): boolean {
    return (
      session.authState === 'authenticated' &&
      session.expiresAt > new Date() &&
      session.failureCount < this.config.maxFailureCount
    );
  }

  /**
   * Check if session is expired
   */
  private isSessionExpired(session: UserSession | SessionData): boolean {
    return session.expiresAt <= new Date();
  }

  /**
   * Get stored session from database
   */
  private async getStoredSession(userId: string): Promise<SessionData | null> {
    const client = await this.dbPool.connect();

    try {
      const query = `
        SELECT id, user_id, access_token_hash, refresh_token_hash, 
               expires_at, scope, subscription_level, metadata, 
               failure_count, created_at, updated_at
        FROM user_sessions 
        WHERE user_id = $1
      `;

      const result = await client.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        userId: row.user_id,
        accessTokenHash: row.access_token_hash,
        refreshTokenHash: row.refresh_token_hash,
        expiresAt: new Date(row.expires_at),
        scopes: row.scope || [],
        subscriptionLevel: row.subscription_level,
        metadata: row.metadata || {},
        failureCount: row.failure_count || 0,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
      };
    } finally {
      client.release();
    }
  }

  /**
   * Hydrate session from stored data
   */
  private async hydrateSession(sessionData: SessionData): Promise<UserSession> {
    const oauthContext: OAuthContext = {
      userId: sessionData.userId,
      scopes: sessionData.scopes,
      subscriptionLevel: sessionData.subscriptionLevel,
      expiresAt: sessionData.expiresAt,
    };

    return {
      userId: sessionData.userId,
      sessionId: sessionData.id,
      authState: this.determineAuthState(sessionData),
      oauthContext,
      subscriptionLevel: sessionData.subscriptionLevel as SubscriptionLevel,
      createdAt: sessionData.createdAt,
      lastActiveAt: sessionData.updatedAt,
      expiresAt: sessionData.expiresAt,
      failureCount: sessionData.failureCount,
      metadata: sessionData.metadata,
    };
  }

  /**
   * Determine authentication state from session data
   */
  private determineAuthState(sessionData: SessionData): AuthenticationState {
    if (sessionData.failureCount >= this.config.maxFailureCount) {
      return 'invalid';
    }

    if (sessionData.expiresAt <= new Date()) {
      return 'expired';
    }

    return 'authenticated';
  }

  /**
   * Store user session in database
   */
  private async storeUserSession(
    userId: string,
    tokenSet: TokenSet,
    metadata?: Record<string, any>
  ): Promise<number> {
    const client = await this.dbPool.connect();

    try {
      const query = `
        INSERT INTO user_sessions (
          user_id, access_token_hash, refresh_token_hash, 
          expires_at, scope, subscription_level, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE SET
          access_token_hash = EXCLUDED.access_token_hash,
          refresh_token_hash = EXCLUDED.refresh_token_hash,
          expires_at = EXCLUDED.expires_at,
          scope = EXCLUDED.scope,
          subscription_level = EXCLUDED.subscription_level,
          metadata = EXCLUDED.metadata,
          failure_count = 0,
          updated_at = NOW()
        RETURNING id
      `;

      const accessTokenHash = this.hashToken(tokenSet.accessToken);
      const refreshTokenHash = this.hashToken(tokenSet.refreshToken);

      const result = await client.query(query, [
        userId,
        accessTokenHash,
        refreshTokenHash,
        tokenSet.expiresAt,
        tokenSet.scopes,
        tokenSet.subscriptionLevel || 'free',
        metadata || {},
      ]);

      return result.rows[0].id;
    } finally {
      client.release();
    }
  }

  /**
   * Update session activity timestamp
   */
  private async updateSessionActivity(userId: string): Promise<void> {
    const client = await this.dbPool.connect();

    try {
      const query = `
        UPDATE user_sessions 
        SET updated_at = NOW() 
        WHERE user_id = $1
      `;

      await client.query(query, [userId]);
    } finally {
      client.release();
    }
  }

  /**
   * Mark session for re-authorization
   */
  private async markSessionForReauth(userId: string): Promise<void> {
    const client = await this.dbPool.connect();

    try {
      const query = `
        UPDATE user_sessions 
        SET 
          failure_count = failure_count + 1,
          updated_at = NOW()
        WHERE user_id = $1
      `;

      await client.query(query, [userId]);

      // Update cached session if exists
      const cachedSession = this.sessionCache.get(userId);
      if (cachedSession) {
        cachedSession.failureCount += 1;
        cachedSession.authState =
          cachedSession.failureCount >= this.config.maxFailureCount
            ? 'invalid'
            : 'refresh_failed';
        this.sessionCache.set(userId, cachedSession);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Build user context with permissions
   */
  private buildUserContext(session: UserSession): UserContext {
    const { scopes, subscriptionLevel } = session.oauthContext;

    return {
      userId: session.userId,
      scopes,
      subscriptionLevel: subscriptionLevel as SubscriptionLevel,
      expiresAt: session.expiresAt,
      permissions: {
        canRead: scopes.includes('content:read'),
        canSearch: scopes.includes('content:search'),
        canExecuteJsonRpc: scopes.includes('jsonrpc:execute'),
        canDiscoverJsonRpc: scopes.includes('jsonrpc:discovery'),
      },
      access: {
        hasContentAccess: subscriptionLevel !== 'free',
        hasAdvancedFeatures:
          subscriptionLevel === 'plus' || subscriptionLevel === 'pro',
        hasPremiumContent: subscriptionLevel === 'pro',
      },
    };
  }

  /**
   * Close all connections for a user
   */
  private async closeUserConnections(userId: string): Promise<void> {
    const userConnections = Array.from(this.connectionTracker.entries()).filter(
      ([, connection]) => connection.userId === userId
    );

    for (const [connectionId] of userConnections) {
      await this.closeConnection(connectionId);
    }
  }

  /**
   * Close all connections
   */
  private async closeAllConnections(): Promise<void> {
    const connectionIds = Array.from(this.connectionTracker.keys());

    for (const connectionId of connectionIds) {
      await this.closeConnection(connectionId);
    }
  }

  /**
   * Perform auto-recovery on startup
   */
  private async performAutoRecovery(): Promise<void> {
    logger.info('Performing session auto-recovery');

    const client = await this.dbPool.connect();

    try {
      const query = `
        SELECT user_id 
        FROM user_sessions 
        WHERE expires_at > NOW() AND failure_count < $1
      `;

      const result = await client.query(query, [this.config.maxFailureCount]);

      const recoveryPromises = result.rows.map(row =>
        this.recoverUserSession(row.user_id).catch(error => {
          logger.warn('Auto-recovery failed for user', {
            userId: row.user_id,
            error: error instanceof Error ? error.message : String(error),
          });
        })
      );

      await Promise.all(recoveryPromises);

      logger.info('Auto-recovery completed', {
        sessionsProcessed: result.rows.length,
        sessionsRecovered: this.sessionCache.size,
      });
    } finally {
      client.release();
    }
  }

  /**
   * Perform periodic cleanup
   */
  private async performCleanup(): Promise<ConnectionCleanupResult> {
    const startTime = Date.now();
    const errors: Array<{ connectionId: string; error: string }> = [];
    let connectionsRemoved = 0;
    let sessionsInvalidated = 0;

    try {
      logger.debug('Starting periodic cleanup');

      // Clean up expired sessions
      const client = await this.dbPool.connect();
      try {
        const cleanupQuery =
          'DELETE FROM user_sessions WHERE expires_at <= NOW()';
        const result = await client.query(cleanupQuery);
        sessionsInvalidated = result.rowCount || 0;
      } finally {
        client.release();
      }

      // Clean up inactive connections
      const now = Date.now();
      const inactiveConnections = Array.from(
        this.connectionTracker.entries()
      ).filter(
        ([, connection]) =>
          now - connection.lastActivityAt.getTime() >
          this.config.inactivityTimeout
      );

      for (const [connectionId, connection] of inactiveConnections) {
        try {
          await this.closeConnection(connectionId);
          connectionsRemoved++;
        } catch (error) {
          errors.push({
            connectionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // Clean up invalid cached sessions
      const invalidUserIds: string[] = [];
      for (const [userId, session] of this.sessionCache.entries()) {
        if (!this.isSessionValid(session)) {
          invalidUserIds.push(userId);
        }
      }

      for (const userId of invalidUserIds) {
        this.sessionCache.delete(userId);
      }

      const cleanupDuration = Date.now() - startTime;

      logger.info('Periodic cleanup completed', {
        connectionsRemoved,
        sessionsInvalidated,
        invalidCacheEntriesRemoved: invalidUserIds.length,
        cleanupDuration,
        errors: errors.length,
      });

      return {
        connectionsRemoved,
        sessionsInvalidated,
        cleanupDuration,
        errors,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      logger.error('Periodic cleanup failed', {
        error: errorMessage,
        cleanupDuration: Date.now() - startTime,
      });

      throw error;
    }
  }

  /**
   * Setup event handlers for component coordination
   */
  private setupEventHandlers(): void {
    // Listen for token security manager events
    this.tokenSecurityManager.on('tokenRefreshed', ({ userId }) => {
      // Update session cache after token refresh
      const session = this.sessionCache.get(userId);
      if (session) {
        session.lastTokenRefresh = new Date();
        session.authState = 'authenticated';
        session.failureCount = 0;
        this.sessionCache.set(userId, session);
      }
    });

    this.tokenSecurityManager.on('validationFailed', ({ userId }) => {
      // Increment failure count for session
      const session = this.sessionCache.get(userId);
      if (session) {
        session.failureCount += 1;
        session.authState =
          session.failureCount >= this.config.maxFailureCount
            ? 'invalid'
            : 'refresh_failed';
        this.sessionCache.set(userId, session);
      }
    });
  }

  /**
   * Hash token for secure storage
   */
  private hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
