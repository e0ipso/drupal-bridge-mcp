/**
 * OAuth 2.0 type definitions for Drupal Simple OAuth integration
 *
 * These interfaces define the structure of OAuth responses and token data
 * according to RFC 6749 and Drupal's Simple OAuth module implementation.
 */

/**
 * OAuth 2.0 token response from Drupal's token endpoint
 */
export interface TokenResponse {
  /** Access token for API requests */
  access_token: string;

  /** Token type - typically "Bearer" */
  token_type: string;

  /** Token expiration time in seconds */
  expires_in: number;

  /** Refresh token for obtaining new access tokens */
  refresh_token: string;

  /** Granted scopes as space-separated string */
  scope: string;
}

/**
 * OAuth error response structure
 */
export interface OAuthError {
  /** Error code as defined in RFC 6749 */
  error:
    | 'invalid_request'
    | 'invalid_client'
    | 'invalid_grant'
    | 'unauthorized_client'
    | 'unsupported_grant_type'
    | 'invalid_scope'
    | string;

  /** Human-readable error description */
  error_description?: string;

  /** URI with error information */
  error_uri?: string;
}

/**
 * Complete token set with metadata
 */
export interface TokenSet {
  /** Access token for API requests */
  accessToken: string;

  /** Refresh token for token renewal */
  refreshToken: string;

  /** Token type - typically "Bearer" */
  tokenType: string;

  /** Token expiration timestamp */
  expiresAt: Date;

  /** Granted scopes as array */
  scopes: string[];

  /** Drupal user ID associated with token */
  userId?: string;

  /** Subscription level for content access */
  subscriptionLevel?: 'free' | 'plus' | 'pro';
}

/**
 * OAuth state parameter for CSRF protection
 */
export interface OAuthState {
  /** Cryptographically secure random state value */
  state: string;

  /** Timestamp when state was created */
  createdAt: Date;

  /** Optional user identifier for session correlation */
  userId?: string;

  /** Optional redirect URL after successful authentication */
  redirectUrl?: string | undefined;
}

/**
 * OAuth authorization URL parameters
 */
export interface AuthorizationUrlParams {
  /** OAuth client identifier */
  clientId: string;

  /** Redirect URI after authorization */
  redirectUri: string;

  /** Requested scopes */
  scopes: string[];

  /** State parameter for CSRF protection */
  state: string;

  /** Response type - always "code" for Authorization Code Grant */
  responseType: 'code';
}

/**
 * Token exchange request parameters
 */
export interface TokenExchangeParams {
  /** Authorization code from callback */
  code: string;

  /** OAuth client identifier */
  clientId: string;

  /** OAuth client secret */
  clientSecret: string;

  /** Redirect URI used in authorization request */
  redirectUri: string;

  /** Grant type - always "authorization_code" */
  grantType: 'authorization_code';
}

/**
 * Token refresh request parameters
 */
export interface TokenRefreshParams {
  /** Refresh token */
  refreshToken: string;

  /** OAuth client identifier */
  clientId: string;

  /** OAuth client secret */
  clientSecret: string;

  /** Grant type - always "refresh_token" */
  grantType: 'refresh_token';

  /** Optional scope limitation */
  scope?: string;
}

/**
 * OAuth configuration interface
 */
export interface OAuthConfig {
  /** Drupal base URL */
  baseUrl: string;

  /** OAuth client identifier */
  clientId: string;

  /** OAuth client secret */
  clientSecret: string;

  /** OAuth redirect URI */
  redirectUri: string;

  /** Authorization endpoint path */
  authorizationEndpoint: string;

  /** Token endpoint path */
  tokenEndpoint: string;

  /** Default scopes for content access */
  defaultScopes: string[];

  /** Token refresh buffer time in seconds */
  tokenRefreshBuffer: number;
}

/**
 * OAuth session data stored in database
 */
export interface OAuthSession {
  /** Database record ID */
  id: number;

  /** User identifier */
  userId: string;

  /** Hashed access token for security */
  accessTokenHash: string;

  /** Hashed refresh token for security */
  refreshTokenHash: string;

  /** Token expiration timestamp */
  expiresAt: Date;

  /** Granted scopes */
  scopes: string[];

  /** User subscription level */
  subscriptionLevel: string;

  /** Record creation timestamp */
  createdAt: Date;

  /** Record last update timestamp */
  updatedAt: Date;
}

/**
 * OAuth validation result
 */
export interface ValidationResult {
  /** Whether validation was successful */
  valid: boolean;

  /** Error message if validation failed */
  error?: string;

  /** Error code for programmatic handling */
  errorCode?: string;
}

/**
 * OAuth method execution context
 */
export interface OAuthContext {
  /** User ID for the authenticated user */
  userId: string;

  /** Available scopes for the session */
  scopes: string[];

  /** Subscription level for content access */
  subscriptionLevel: string;

  /** Token expiration timestamp */
  expiresAt: Date;
}
