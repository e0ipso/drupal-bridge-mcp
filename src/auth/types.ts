/**
 * TypeScript interfaces for OAuth 2.1 endpoint discovery and metadata
 */

/**
 * OAuth 2.0 Authorization Server Metadata as defined by RFC8414
 * https://tools.ietf.org/html/rfc8414#section-2
 */
export interface OAuthServerMetadata {
  /** The authorization server's issuer identifier */
  issuer: string;

  /** URL of the authorization server's authorization endpoint */
  authorization_endpoint: string;

  /** URL of the authorization server's token endpoint */
  token_endpoint: string;

  /** URL of the authorization server's JWK Set document */
  jwks_uri?: string;

  /** JSON array containing a list of OAuth 2.0 scope values supported */
  scopes_supported?: string[];

  /** JSON array containing a list of PKCE code challenge methods supported */
  code_challenge_methods_supported?: string[];

  /** JSON array containing a list of response types supported */
  response_types_supported?: string[];

  /** JSON array containing a list of grant types supported */
  grant_types_supported?: string[];

  /** JSON array containing a list of token endpoint authentication methods */
  token_endpoint_auth_methods_supported?: string[];

  /** URL of the authorization server's revocation endpoint */
  revocation_endpoint?: string;

  /** URL of the authorization server's introspection endpoint */
  introspection_endpoint?: string;
}

/**
 * Resolved OAuth endpoints for client use
 */
export interface OAuthEndpoints {
  /** The authorization endpoint URL */
  authorizationEndpoint: string;

  /** The token endpoint URL */
  tokenEndpoint: string;

  /** The issuer identifier */
  issuer: string;

  /** When the endpoints were discovered */
  discoveredAt: Date;

  /** Whether fallback endpoints were used due to discovery failure */
  isFallback?: boolean;

  /** Additional metadata from discovery (optional) */
  metadata?: Partial<OAuthServerMetadata>;
}

/**
 * Configuration options for endpoint discovery
 */
export interface DiscoveryConfig {
  /** Base URL of the OAuth authorization server */
  baseUrl: string;

  /** Timeout for discovery requests in milliseconds (default: 5000) */
  timeout?: number;

  /** Number of retry attempts for failed requests (default: 2) */
  retries?: number;

  /** TTL for cached metadata in milliseconds (default: 3600000 = 1 hour) */
  cacheTtl?: number;

  /** Whether to validate HTTPS in production (default: true) */
  validateHttps?: boolean;

  /** Whether to enable debug logging (default: false) */
  debug?: boolean;
}

/**
 * Cache entry for discovered metadata
 */
export interface CacheEntry {
  /** The cached OAuth endpoints */
  endpoints: OAuthEndpoints;

  /** Expiration timestamp */
  expiresAt: number;
}

/**
 * Discovery error types
 */
export enum DiscoveryErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  INVALID_JSON = 'INVALID_JSON',
  MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS',
  HTTPS_REQUIRED = 'HTTPS_REQUIRED',
  INVALID_URL = 'INVALID_URL',
}

/**
 * Discovery error class
 */
export class DiscoveryError extends Error {
  public readonly type: DiscoveryErrorType;
  public override readonly cause?: Error;

  constructor(message: string, type: DiscoveryErrorType, cause?: Error) {
    super(message);
    this.name = 'DiscoveryError';
    this.type = type;
    this.cause = cause;
  }
}
