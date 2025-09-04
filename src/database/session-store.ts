/**
 * Database session store implementation
 *
 * This file will contain PostgreSQL session management for user authentication.
 * Implementation will be added in the database integration tasks.
 */

import { Pool } from 'pg';
import { config } from '@/config/index.js';
import { logger } from '@/utils/logger.js';

let pool: Pool | null = null;

/**
 * Get or create database connection pool
 */
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', err => {
      logger.error('Unexpected error on idle client', err);
    });
  }

  return pool;
}

/**
 * Check database connection health
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  const startTime = Date.now();

  try {
    const dbPool = getPool();
    const client = await dbPool.connect();

    try {
      await client.query('SELECT 1');

      // Record successful health check
      const { metricsCollector } = await import('@/monitoring/metrics.js');
      metricsCollector.recordDatabase({
        timestamp: startTime,
        operation: 'health_check',
        success: true,
        responseTime: Date.now() - startTime,
      });

      return true;
    } finally {
      client.release();
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Record failed health check
    const { metricsCollector } = await import('@/monitoring/metrics.js');
    metricsCollector.recordDatabase({
      timestamp: startTime,
      operation: 'health_check',
      success: false,
      responseTime: Date.now() - startTime,
      error: errorMessage,
    });

    logger.warn('Database health check failed', {
      error: errorMessage,
      responseTime: `${Date.now() - startTime}ms`,
    });
    return false;
  }
}

/**
 * Get database pool health information
 */
export function getDatabasePoolHealth(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
} {
  if (!pool) {
    return {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    };
  }

  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

/**
 * Get or create shared database pool instance
 */
export function getSharedPool(): Pool {
  return getPool();
}

/**
 * Execute database cleanup tasks
 */
export async function executeCleanupTasks(): Promise<void> {
  const dbPool = getPool();
  const client = await dbPool.connect();

  try {
    // Clean up expired sessions using the database function
    await client.query('SELECT cleanup_expired_sessions()');

    logger.info('Database cleanup tasks completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn('Database cleanup failed', { error: errorMessage });
  } finally {
    client.release();
  }
}

/**
 * Session store implementation with OAuth integration
 */
export class SessionStore {
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Get user session by user ID
   */
  async getUserSession(userId: string): Promise<any | null> {
    const client = await this.pool.connect();

    try {
      const query = `
        SELECT *
        FROM user_sessions 
        WHERE user_id = $1 AND expires_at > NOW()
      `;

      const result = await client.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    const client = await this.pool.connect();

    try {
      const query = 'DELETE FROM user_sessions WHERE expires_at <= NOW()';
      const result = await client.query(query);

      logger.info('Cleaned up expired sessions', { count: result.rowCount });
      return result.rowCount || 0;
    } finally {
      client.release();
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStats(): Promise<{
    activeSessions: number;
    expiredSessions: number;
    totalSessions: number;
  }> {
    const client = await this.pool.connect();

    try {
      const query = `
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE expires_at > NOW()) as active,
          COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired
        FROM user_sessions
      `;

      const result = await client.query(query);
      const row = result.rows[0];

      return {
        totalSessions: parseInt(row.total, 10),
        activeSessions: parseInt(row.active, 10),
        expiredSessions: parseInt(row.expired, 10),
      };
    } finally {
      client.release();
    }
  }
}
