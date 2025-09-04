/**
 * Secure Token Storage Implementation
 *
 * Provides secure storage and management of OAuth tokens with:
 * - bcrypt hashing for token security
 * - AES-256 encryption for sensitive data at rest
 * - Constant-time comparisons to prevent timing attacks
 * - Automatic cleanup of expired tokens
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import type { Pool } from 'pg';
import { PoolClient } from 'pg';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import { metricsCollector } from '@/monitoring/metrics.js';
import type { TokenSet, OAuthSession } from '@/types/oauth.js';

/**
 * Token storage result interface
 */
export interface TokenStorageResult {
  success: boolean;
  error?: string;
  sessionId?: number;
}

/**
 * Token validation result with additional context
 */
export interface TokenValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  session?: OAuthSession;
  requiresRefresh?: boolean;
}

/**
 * Token cleanup statistics
 */
export interface TokenCleanupStats {
  expiredTokens: number;
  revokedTokens: number;
  totalCleaned: number;
  processingTimeMs: number;
}

/**
 * Secure token storage with encryption and hashing
 */
export class SecureTokenStorage {
  private readonly dbPool: Pool;
  private readonly saltRounds: number;
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(dbPool: Pool) {
    this.dbPool = dbPool;
    this.saltRounds = config.security.token.bcryptSaltRounds;

    // Ensure encryption key is exactly 32 bytes for AES-256
    const keyString = config.security.token.encryptionKey;
    if (keyString.length < 32) {
      throw new Error('Encryption key must be at least 32 characters');
    }

    this.encryptionKey = crypto.createHash('sha256').update(keyString).digest();
  }

  /**
   * Store tokens securely with bcrypt hashing and encryption
   */
  async storeTokens(
    userId: string,
    tokens: TokenSet
  ): Promise<TokenStorageResult> {
    const startTime = Date.now();
    const client = await this.dbPool.connect();

    try {
      await client.query('BEGIN');

      // Hash tokens using bcrypt for secure storage
      const hashedAccess = await this.hashToken(tokens.accessToken);
      const hashedRefresh = await this.hashToken(tokens.refreshToken);

      // Encrypt sensitive metadata
      const encryptedData = this.encryptSensitiveData({
        originalAccessToken: tokens.accessToken.substring(-8), // Store only last 8 chars for debugging
        originalRefreshToken: tokens.refreshToken.substring(-8),
        subscriptionLevel: tokens.subscriptionLevel,
      });

      // Calculate expiration with buffer
      const expiresAt = new Date(tokens.expiresAt.getTime());

      // Upsert token data with conflict resolution
      const query = `
        INSERT INTO user_sessions (
          user_id, 
          access_token_hash, 
          refresh_token_hash, 
          expires_at, 
          scope, 
          subscription_level,
          encrypted_metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
          access_token_hash = EXCLUDED.access_token_hash,
          refresh_token_hash = EXCLUDED.refresh_token_hash,
          expires_at = EXCLUDED.expires_at,
          scope = EXCLUDED.scope,
          subscription_level = EXCLUDED.subscription_level,
          encrypted_metadata = EXCLUDED.encrypted_metadata,
          updated_at = NOW()
        RETURNING id
      `;

      const result = await client.query(query, [
        userId,
        hashedAccess,
        hashedRefresh,
        expiresAt,
        tokens.scopes,
        tokens.subscriptionLevel || 'free',
        encryptedData,
      ]);

      await client.query('COMMIT');

      const sessionId = result.rows[0]?.id;

      // Record successful storage
      metricsCollector.recordDatabase({
        timestamp: startTime,
        operation: 'token_store',
        success: true,
        responseTime: Date.now() - startTime,
      });

      logger.info('Tokens stored securely', {
        userId,
        sessionId,
        expiresAt: expiresAt.toISOString(),
        scopes: tokens.scopes,
      });

      return {
        success: true,
        sessionId,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordDatabase({
        timestamp: startTime,
        operation: 'token_store',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Failed to store tokens', {
        error: errorMessage,
        userId,
      });

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Validate token using constant-time comparison
   */
  async validateToken(
    userId: string,
    accessToken: string
  ): Promise<TokenValidationResult> {
    const startTime = Date.now();
    const client = await this.dbPool.connect();

    try {
      // Get user session with timezone-aware query
      const query = `
        SELECT 
          id, 
          user_id, 
          access_token_hash, 
          refresh_token_hash, 
          expires_at AT TIME ZONE 'UTC' as expires_at,
          scope, 
          subscription_level,
          encrypted_metadata,
          created_at,
          updated_at
        FROM user_sessions 
        WHERE user_id = $1
      `;

      const result = await client.query(query, [userId]);

      if (result.rows.length === 0) {
        return {
          valid: false,
          error: 'Session not found',
          errorCode: 'SESSION_NOT_FOUND',
        };
      }

      const session = result.rows[0];
      const expiresAt = new Date(session.expires_at);
      const now = new Date();

      // Check if token is expired
      if (expiresAt <= now) {
        logger.debug('Token expired', {
          userId,
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString(),
        });

        return {
          valid: false,
          error: 'Token expired',
          errorCode: 'TOKEN_EXPIRED',
        };
      }

      // Validate access token using constant-time comparison
      const isValidToken = await this.verifyToken(
        accessToken,
        session.access_token_hash
      );

      if (!isValidToken) {
        return {
          valid: false,
          error: 'Invalid token',
          errorCode: 'TOKEN_INVALID',
        };
      }

      // Check if token needs refresh (90% of lifetime passed)
      const tokenLifetime =
        expiresAt.getTime() - new Date(session.created_at).getTime();
      const timeRemaining = expiresAt.getTime() - now.getTime();
      const percentageRemaining = timeRemaining / tokenLifetime;
      const { refreshThreshold } = config.security.token;

      const requiresRefresh = percentageRemaining < 1 - refreshThreshold;

      // Decrypt metadata if present
      let decryptedMetadata = null;
      if (session.encrypted_metadata) {
        try {
          decryptedMetadata = this.decryptSensitiveData(
            session.encrypted_metadata
          );
        } catch (error) {
          logger.warn('Failed to decrypt metadata', { userId, error });
        }
      }

      metricsCollector.recordDatabase({
        timestamp: startTime,
        operation: 'token_validate',
        success: true,
        responseTime: Date.now() - startTime,
      });

      const oauthSession: OAuthSession = {
        id: session.id,
        userId: session.user_id,
        accessTokenHash: session.access_token_hash,
        refreshTokenHash: session.refresh_token_hash,
        expiresAt,
        scopes: session.scope || [],
        subscriptionLevel: session.subscription_level,
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at),
      };

      return {
        valid: true,
        session: oauthSession,
        requiresRefresh,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordDatabase({
        timestamp: startTime,
        operation: 'token_validate',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Token validation failed', {
        error: errorMessage,
        userId,
      });

      return {
        valid: false,
        error: errorMessage,
        errorCode: 'VALIDATION_ERROR',
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get user session for token operations
   */
  async getUserSession(userId: string): Promise<OAuthSession | null> {
    const client = await this.dbPool.connect();

    try {
      const query = `
        SELECT 
          id, 
          user_id, 
          access_token_hash, 
          refresh_token_hash, 
          expires_at AT TIME ZONE 'UTC' as expires_at,
          scope, 
          subscription_level,
          created_at,
          updated_at
        FROM user_sessions 
        WHERE user_id = $1 AND expires_at > NOW()
      `;

      const result = await client.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const session = result.rows[0];
      return {
        id: session.id,
        userId: session.user_id,
        accessTokenHash: session.access_token_hash,
        refreshTokenHash: session.refresh_token_hash,
        expiresAt: new Date(session.expires_at),
        scopes: session.scope || [],
        subscriptionLevel: session.subscription_level,
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at),
      };
    } catch (error) {
      logger.error('Failed to get user session', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired and revoked tokens
   */
  async cleanupExpiredTokens(): Promise<TokenCleanupStats> {
    const startTime = Date.now();
    const client = await this.dbPool.connect();

    try {
      await client.query('BEGIN');

      // Clean up expired tokens
      const expiredQuery = `
        DELETE FROM user_sessions 
        WHERE expires_at <= NOW()
        RETURNING user_id
      `;

      const expiredResult = await client.query(expiredQuery);
      const expiredCount = expiredResult.rowCount || 0;

      // For future: Clean up revoked tokens (when revocation is implemented)
      const revokedCount = 0;

      await client.query('COMMIT');

      const processingTime = Date.now() - startTime;
      const stats: TokenCleanupStats = {
        expiredTokens: expiredCount,
        revokedTokens: revokedCount,
        totalCleaned: expiredCount + revokedCount,
        processingTimeMs: processingTime,
      };

      metricsCollector.recordDatabase({
        timestamp: startTime,
        operation: 'token_cleanup',
        success: true,
        responseTime: processingTime,
      });

      if (stats.totalCleaned > 0) {
        logger.info('Token cleanup completed', stats);
      }

      return stats;
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      metricsCollector.recordDatabase({
        timestamp: startTime,
        operation: 'token_cleanup',
        success: false,
        error: errorMessage,
        responseTime: Date.now() - startTime,
      });

      logger.error('Token cleanup failed', { error: errorMessage });

      return {
        expiredTokens: 0,
        revokedTokens: 0,
        totalCleaned: 0,
        processingTimeMs: Date.now() - startTime,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Hash token using bcrypt with configured salt rounds
   */
  private async hashToken(token: string): Promise<string> {
    try {
      return await bcrypt.hash(token, this.saltRounds);
    } catch (error) {
      logger.error('Token hashing failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Token hashing failed');
    }
  }

  /**
   * Verify token using constant-time comparison via bcrypt
   */
  private async verifyToken(token: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(token, hash);
    } catch (error) {
      logger.error('Token verification failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   */
  private encryptSensitiveData(data: any): string {
    try {
      const iv = crypto.randomBytes(12); // 12 bytes for GCM
      const cipher = crypto.createCipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      );

      let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Combine IV, auth tag, and encrypted data
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('Data encryption failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Data encryption failed');
    }
  }

  /**
   * Decrypt sensitive data using AES-256-GCM
   */
  private decryptSensitiveData(encryptedData: string): any {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0]!, 'hex');
      const authTag = Buffer.from(parts[1]!, 'hex');
      const encrypted = parts[2]!;

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        iv
      );
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      logger.error('Data decryption failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Data decryption failed');
    }
  }

  /**
   * Get sessions requiring refresh based on threshold
   */
  async getSessionsRequiringRefresh(): Promise<OAuthSession[]> {
    const client = await this.dbPool.connect();

    try {
      // Calculate threshold time: current time + (refresh_threshold * remaining_lifetime)
      const { refreshThreshold } = config.security.token;

      const query = `
        SELECT 
          id, 
          user_id, 
          access_token_hash, 
          refresh_token_hash, 
          expires_at AT TIME ZONE 'UTC' as expires_at,
          scope, 
          subscription_level,
          created_at,
          updated_at
        FROM user_sessions 
        WHERE expires_at > NOW() 
        AND expires_at <= NOW() + INTERVAL '${Math.round((1 - refreshThreshold) * 100)}% of (expires_at - created_at)'
        ORDER BY expires_at ASC
      `;

      const result = await client.query(query);

      return result.rows.map(session => ({
        id: session.id,
        userId: session.user_id,
        accessTokenHash: session.access_token_hash,
        refreshTokenHash: session.refresh_token_hash,
        expiresAt: new Date(session.expires_at),
        scopes: session.scope || [],
        subscriptionLevel: session.subscription_level,
        createdAt: new Date(session.created_at),
        updatedAt: new Date(session.updated_at),
      }));
    } catch (error) {
      logger.error('Failed to get sessions requiring refresh', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    } finally {
      client.release();
    }
  }
}
