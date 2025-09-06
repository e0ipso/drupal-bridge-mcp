/**
 * User session management for MCP authentication
 */

import { AuthContext } from './auth-middleware.js';

export interface Session {
  id: string;
  userId: string;
  authContext: AuthContext;
  createdAt: number;
  lastAccessedAt: number;
  expiresAt?: number;
}

/**
 * In-memory session store for MCP user sessions
 */
export class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private readonly defaultTtl: number = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Create new session for authenticated user
   */
  createSession(
    userId: string,
    authContext: AuthContext,
    ttl?: number
  ): Session {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session: Session = {
      id: sessionId,
      userId,
      authContext,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: ttl ? now + ttl : now + this.defaultTtl,
    };

    this.sessions.set(sessionId, session);

    // Clean up expired sessions
    this.cleanupExpiredSessions();

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt && Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    // Update last accessed time
    session.lastAccessedAt = Date.now();

    return session;
  }

  /**
   * Get session by user ID
   */
  getSessionByUserId(userId: string): Session | null {
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        (!session.expiresAt || Date.now() < session.expiresAt)
      ) {
        session.lastAccessedAt = Date.now();
        return session;
      }
    }
    return null;
  }

  /**
   * Update session auth context
   */
  updateSession(sessionId: string, authContext: AuthContext): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    session.authContext = authContext;
    session.lastAccessedAt = Date.now();

    return true;
  }

  /**
   * Extend session expiration
   */
  extendSession(sessionId: string, additionalTime?: number): boolean {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    const extension = additionalTime || this.defaultTtl;
    session.expiresAt = Date.now() + extension;
    session.lastAccessedAt = Date.now();

    return true;
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Delete all sessions for a user
   */
  deleteUserSessions(userId: string): number {
    let deleted = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.userId === userId) {
        this.sessions.delete(sessionId);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get all active sessions for a user
   */
  getUserSessions(userId: string): Session[] {
    const userSessions: Session[] = [];
    const now = Date.now();

    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        (!session.expiresAt || now < session.expiresAt)
      ) {
        userSessions.push(session);
      }
    }

    return userSessions;
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    uniqueUsers: number;
  } {
    const now = Date.now();
    let activeSessions = 0;
    let expiredSessions = 0;
    const uniqueUsers = new Set<string>();

    for (const session of this.sessions.values()) {
      if (!session.expiresAt || now < session.expiresAt) {
        activeSessions++;
        uniqueUsers.add(session.userId);
      } else {
        expiredSessions++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions,
      expiredSessions,
      uniqueUsers: uniqueUsers.size,
    };
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt && now > session.expiresAt) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Generate secure session ID
   */
  private generateSessionId(): string {
    const { randomBytes } = require('crypto');
    return randomBytes(32).toString('hex');
  }

  /**
   * Clear all sessions (for testing or reset)
   */
  clear(): void {
    this.sessions.clear();
  }
}
