/**
 * Domain-specific type definitions (Drupal + Auth)
 * Consolidated for MVP simplification
 */

// =============================================================================
// Drupal API Types
// =============================================================================

/**
 * Drupal entity base structure
 */
export interface DrupalEntity {
  readonly id: string;
  readonly type: string;
  readonly attributes: Record<string, unknown>;
  readonly relationships?: Record<string, unknown>;
  readonly links?: Record<string, string>;
}

/**
 * Drupal node entity
 */
export interface DrupalNode extends DrupalEntity {
  readonly type: 'node--article' | 'node--page' | string;
  readonly attributes: DrupalNodeAttributes;
}

/**
 * Drupal node attributes
 */
export interface DrupalNodeAttributes {
  readonly nid: number;
  readonly title: string;
  readonly body?: {
    readonly value: string;
    readonly format: string;
    readonly processed: string;
  };
  readonly status: boolean;
  readonly created: string;
  readonly changed: string;
  readonly path?: {
    readonly alias: string;
    readonly pid: number;
  };
  readonly [key: string]: unknown;
}

/**
 * Drupal JSON-RPC method names for common operations
 */
export const DrupalJsonRpcMethod = {
  // Entity operations
  ENTITY_LOAD: 'entity.load',
  ENTITY_CREATE: 'entity.create',
  ENTITY_UPDATE: 'entity.update',
  ENTITY_DELETE: 'entity.delete',
  ENTITY_QUERY: 'entity.query',

  // Node operations
  NODE_LOAD: 'node.load',
  NODE_CREATE: 'node.create',
  NODE_UPDATE: 'node.update',
  NODE_DELETE: 'node.delete',
  NODE_INDEX: 'node.index',

  // User operations
  USER_LOAD: 'user.load',
  USER_LOGIN: 'user.login',
  USER_LOGOUT: 'user.logout',

  // System operations
  SYSTEM_CONNECT: 'system.connect',
  SYSTEM_GET_VARIABLE: 'system.get_variable',
} as const;

export type DrupalJsonRpcMethod =
  (typeof DrupalJsonRpcMethod)[keyof typeof DrupalJsonRpcMethod];

/**
 * Parameters for entity load operations
 */
export interface EntityLoadParams {
  readonly entity_type: string;
  readonly entity_id: string | number;
}

/**
 * Parameters for entity query operations
 */
export interface EntityQueryParams {
  readonly entity_type: string;
  readonly conditions?: Record<string, unknown>;
  readonly limit?: number;
  readonly offset?: number;
  readonly sort?: Record<string, 'ASC' | 'DESC'>;
}

/**
 * Parameters for node creation
 */
export interface NodeCreateParams {
  readonly type: string;
  readonly title: string;
  readonly body?: string;
  readonly status?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Drupal API response wrapper
 */
export interface DrupalApiResponse<TData = unknown> {
  readonly data: TData;
  readonly included?: DrupalEntity[];
  readonly meta?: Record<string, unknown>;
  readonly links?: Record<string, string>;
}

/**
 * Drupal error response
 */
export interface DrupalErrorResponse {
  readonly errors: Array<{
    readonly title: string;
    readonly detail: string;
    readonly status: string;
    readonly source?: {
      readonly pointer: string;
    };
  }>;
}

/**
 * Configuration for Drupal JSON-RPC client
 */
export interface DrupalClientConfig {
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly timeout?: number;
  readonly retries?: number;
  readonly headers?: Record<string, string>;
}

// =============================================================================
// Authentication Types (consolidated from auth modules)
// =============================================================================

/**
 * OAuth 2.0 configuration
 */
export interface OAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * OAuth 2.0 token set
 */
export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
  scope?: string;
}

/**
 * PKCE challenge for OAuth flow
 */
export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * Stored tokens with metadata (from token-manager.ts)
 */
export interface StoredTokens extends OAuthTokens {
  expiresAt?: number;
  userId: string;
  scopes: string[];
  refreshExpiresAt?: number;
}

/**
 * Token validation result (from token-manager.ts)
 */
export interface TokenValidationResult {
  isValid: boolean;
  isExpired: boolean;
  needsRefresh: boolean;
  scopes?: string[];
  userId?: string;
}

// Authentication types moved to auth-errors.ts for OAuth 2.1 stateless design
// AuthMiddlewareConfig removed - simplified for MVP, use inline configuration
