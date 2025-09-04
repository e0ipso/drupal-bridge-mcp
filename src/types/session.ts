/**
 * Session Management Type Definitions
 *
 * Comprehensive types for user session management including authentication state,
 * connection tracking, and error handling for long-running MCP connections.
 */

import type { OAuthContext, TokenSet } from './oauth.js';

/**
 * User subscription level for content access authorization
 */
export type SubscriptionLevel = 'free' | 'plus' | 'pro';

/**
 * Authentication state of a user session
 */
export type AuthenticationState =
  | 'authenticated' // Valid tokens and active session
  | 'expired' // Tokens expired, refresh attempted
  | 'refresh_failed' // Token refresh failed, re-auth required
  | 'invalid' // Session invalid, cleanup required
  | 'pending'; // Initial authentication in progress

/**
 * Connection state for active MCP Server-Sent Event connections
 */
export type ConnectionState =
  | 'active' // Connection is active and authenticated
  | 'inactive' // Connection is dormant but session valid
  | 'authentication_required' // Connection needs re-authentication
  | 'terminated'; // Connection permanently closed

/**
 * Core user session interface with authentication and permission context
 */
export interface UserSession {
  /** Unique user identifier */
  userId: string;

  /** Current authentication state */
  authState: AuthenticationState;

  /** Session database ID for persistence */
  sessionId: number;

  /** OAuth context with scopes and permissions */
  oauthContext: OAuthContext;

  /** User subscription level for content access */
  subscriptionLevel: SubscriptionLevel;

  /** Session creation timestamp */
  createdAt: Date;

  /** Last session activity timestamp */
  lastActiveAt: Date;

  /** Session expiration timestamp */
  expiresAt: Date;

  /** Last successful token refresh timestamp */
  lastTokenRefresh?: Date;

  /** Number of consecutive authentication failures */
  failureCount: number;

  /** Session metadata for analytics and debugging */
  metadata: {
    userAgent?: string;
    ipAddress?: string;
    connectionId?: string;
    mcpClientVersion?: string;
  };
}

/**
 * Connection tracking for MCP Server-Sent Event streams
 */
export interface ConnectionInfo {
  /** Unique connection identifier */
  connectionId: string;

  /** Associated user session */
  userId: string;

  /** Current connection state */
  state: ConnectionState;

  /** Connection creation timestamp */
  connectedAt: Date;

  /** Last activity timestamp */
  lastActivityAt: Date;

  /** Connection metadata */
  metadata: {
    userAgent?: string;
    clientVersion?: string;
    serverVersion?: string;
  };
}

/**
 * Session persistence data structure for database storage
 */
export interface SessionData {
  /** Session database ID */
  id: number;

  /** User identifier */
  userId: string;

  /** Hashed access token for security */
  accessTokenHash: string;

  /** Hashed refresh token for security */
  refreshTokenHash: string;

  /** Token expiration timestamp */
  expiresAt: Date;

  /** Available OAuth scopes */
  scopes: string[];

  /** User subscription level */
  subscriptionLevel: string;

  /** Session metadata as JSON */
  metadata: Record<string, any>;

  /** Authentication failure count */
  failureCount: number;

  /** Creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Session recovery result interface
 */
export interface SessionRecoveryResult {
  /** Whether session was successfully recovered */
  success: boolean;

  /** Recovered session if successful */
  session?: UserSession;

  /** Error message if recovery failed */
  error?: string;

  /** Error code for programmatic handling */
  errorCode?: SessionErrorCode;

  /** Whether token refresh was attempted */
  refreshAttempted: boolean;

  /** Recovery action taken */
  action: 'restored' | 'refreshed' | 'failed' | 'requires_reauth';
}

/**
 * Session validation context for security checks
 */
export interface SessionValidationContext {
  /** User identifier */
  userId: string;

  /** Access token for validation */
  accessToken: string;

  /** Connection identifier for tracking */
  connectionId?: string;

  /** Required scopes for operation */
  requiredScopes?: string[];

  /** Skip token introspection for performance */
  skipIntrospection?: boolean;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  /** Whether session is valid */
  valid: boolean;

  /** Session data if valid */
  session?: UserSession;

  /** Error message if invalid */
  error?: string;

  /** Error code for programmatic handling */
  errorCode?: SessionErrorCode;

  /** Whether token was refreshed */
  refreshed: boolean;

  /** Updated OAuth context */
  context?: OAuthContext;
}

/**
 * Session error codes for programmatic error handling
 */
export enum SessionErrorCode {
  // General session errors
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_INVALID = 'SESSION_INVALID',

  // Authentication errors
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  REFRESH_TOKEN_EXPIRED = 'REFRESH_TOKEN_EXPIRED',
  REFRESH_FAILED = 'REFRESH_FAILED',
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',

  // Permission errors
  INSUFFICIENT_SCOPES = 'INSUFFICIENT_SCOPES',
  SUBSCRIPTION_REQUIRED = 'SUBSCRIPTION_REQUIRED',
  ACCESS_DENIED = 'ACCESS_DENIED',

  // System errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
}

/**
 * Custom authentication error class
 */
export class AuthenticationRequiredError extends Error {
  public readonly code: SessionErrorCode;
  public readonly userId?: string;
  public readonly sessionId?: number;

  constructor(
    message: string,
    code: SessionErrorCode = SessionErrorCode.AUTHENTICATION_REQUIRED,
    userId?: string,
    sessionId?: number
  ) {
    super(message);
    this.name = 'AuthenticationRequiredError';
    this.code = code;
    this.userId = userId;
    this.sessionId = sessionId;
  }
}

/**
 * Session statistics for monitoring and analytics
 */
export interface SessionStatistics {
  /** Total active sessions */
  activeSessions: number;

  /** Total expired sessions awaiting cleanup */
  expiredSessions: number;

  /** Total connections across all sessions */
  activeConnections: number;

  /** Sessions requiring token refresh */
  sessionsNeedingRefresh: number;

  /** Sessions with authentication failures */
  failedSessions: number;

  /** Average session duration */
  avgSessionDuration: number;

  /** Sessions by subscription level */
  sessionsBySubscription: Record<SubscriptionLevel, number>;
}

/**
 * User context with full permission and subscription information
 */
export interface UserContext {
  /** User identifier */
  userId: string;

  /** Available OAuth scopes */
  scopes: string[];

  /** User subscription level */
  subscriptionLevel: SubscriptionLevel;

  /** Session expiration timestamp */
  expiresAt: Date;

  /** Connection-specific permissions */
  permissions: {
    canRead: boolean;
    canSearch: boolean;
    canExecuteJsonRpc: boolean;
    canDiscoverJsonRpc: boolean;
  };

  /** Subscription-level access */
  access: {
    hasContentAccess: boolean;
    hasAdvancedFeatures: boolean;
    hasPremiumContent: boolean;
  };
}

/**
 * Session manager configuration
 */
export interface SessionManagerConfig {
  /** Enable automatic session recovery on startup */
  enableAutoRecovery: boolean;

  /** Enable proactive token refresh */
  enableProactiveRefresh: boolean;

  /** Session cleanup interval in milliseconds */
  cleanupInterval: number;

  /** Maximum number of concurrent sessions per user */
  maxSessionsPerUser: number;

  /** Maximum number of connections per session */
  maxConnectionsPerSession: number;

  /** Session inactivity timeout in milliseconds */
  inactivityTimeout: number;

  /** Token refresh threshold (0.0 - 1.0) */
  tokenRefreshThreshold: number;

  /** Maximum authentication failures before lockout */
  maxFailureCount: number;
}

/**
 * Connection cleanup result
 */
export interface ConnectionCleanupResult {
  /** Number of connections cleaned up */
  connectionsRemoved: number;

  /** Number of sessions invalidated */
  sessionsInvalidated: number;

  /** Cleanup duration in milliseconds */
  cleanupDuration: number;

  /** Errors encountered during cleanup */
  errors: Array<{
    connectionId: string;
    error: string;
  }>;
}
