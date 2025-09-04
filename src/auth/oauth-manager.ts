/**
 * OAuth 2.0 Manager - Core implementation
 *
 * This module exports the complete OAuth manager for easier importing
 * and provides additional utility functions for OAuth operations.
 */

export { OAuthManager, OAuthClient, type OAuthStatus } from './oauth-client.js';

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

import type { Pool } from 'pg';
import { OAuthManager } from './oauth-client.js';

/**
 * Create OAuth manager instance with database pool
 */
export function createOAuthManager(dbPool: Pool): OAuthManager {
  return new OAuthManager(dbPool);
}

/**
 * OAuth scope validation utilities
 */
export class OAuthScopes {
  static readonly CONTENT_READ = 'content:read';
  static readonly CONTENT_SEARCH = 'content:search';
  static readonly JSONRPC_DISCOVERY = 'jsonrpc:discovery';
  static readonly JSONRPC_EXECUTE = 'jsonrpc:execute';

  static readonly DEFAULT_SCOPES = [
    OAuthScopes.CONTENT_READ,
    OAuthScopes.CONTENT_SEARCH,
    OAuthScopes.JSONRPC_DISCOVERY,
    OAuthScopes.JSONRPC_EXECUTE,
  ];

  /**
   * Validate if required scopes are present
   */
  static hasRequiredScopes(
    userScopes: string[],
    requiredScopes: string[]
  ): boolean {
    return requiredScopes.every(scope => userScopes.includes(scope));
  }

  /**
   * Check if user has content access scope
   */
  static canAccessContent(userScopes: string[]): boolean {
    return userScopes.includes(OAuthScopes.CONTENT_READ);
  }

  /**
   * Check if user has search access scope
   */
  static canSearch(userScopes: string[]): boolean {
    return userScopes.includes(OAuthScopes.CONTENT_SEARCH);
  }

  /**
   * Check if user can execute JSON-RPC methods
   */
  static canExecuteJsonRpc(userScopes: string[]): boolean {
    return userScopes.includes(OAuthScopes.JSONRPC_EXECUTE);
  }

  /**
   * Check if user can discover JSON-RPC methods
   */
  static canDiscoverJsonRpc(userScopes: string[]): boolean {
    return userScopes.includes(OAuthScopes.JSONRPC_DISCOVERY);
  }
}

/**
 * OAuth error types for better error handling
 */
export class OAuthErrors {
  static readonly INVALID_REQUEST = 'invalid_request';
  static readonly INVALID_CLIENT = 'invalid_client';
  static readonly INVALID_GRANT = 'invalid_grant';
  static readonly UNAUTHORIZED_CLIENT = 'unauthorized_client';
  static readonly UNSUPPORTED_GRANT_TYPE = 'unsupported_grant_type';
  static readonly INVALID_SCOPE = 'invalid_scope';
  static readonly ACCESS_DENIED = 'access_denied';
  static readonly SERVER_ERROR = 'server_error';
  static readonly TEMPORARILY_UNAVAILABLE = 'temporarily_unavailable';

  /**
   * Create OAuth error with proper formatting
   */
  static createError(error: string, description?: string, uri?: string): Error {
    const message = description ? `${error}: ${description}` : error;
    const oauthError = new Error(message);
    (oauthError as any).oauthError = error;
    (oauthError as any).errorDescription = description;
    (oauthError as any).errorUri = uri;
    return oauthError;
  }

  /**
   * Check if error is OAuth-related
   */
  static isOAuthError(error: any): boolean {
    return error && typeof error.oauthError === 'string';
  }
}
