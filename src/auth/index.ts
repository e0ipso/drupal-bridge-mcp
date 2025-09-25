/**
 * Authentication module exports
 */

// MCP OAuth provider
export {
  McpOAuthProvider,
  type McpOAuthConfig,
  type OAuthTokens,
  type TokenValidationResult,
} from './oauth-provider.js';

// Authentication errors and types
export {
  AuthError,
  ValidationError,
  AuthenticationRequiredError,
  InvalidTokenError,
  InsufficientScopesError,
  OAuthFlowError,
  TokenRefreshError,
  SessionError,
  AuthConfigError,
  createMcpErrorResponse,
  isAuthError,
  extractMcpErrorDetails,
  type AuthContext,
} from './auth-errors.js';

// OAuth 2.1 endpoint discovery (RFC8414)
export {
  discoverOAuthEndpoints,
  clearDiscoveryCache,
  cleanupDiscoveryCache,
} from './endpoint-discovery.js';
export type {
  OAuthServerMetadata,
  OAuthEndpoints,
  DiscoveryConfig,
  CacheEntry,
  DiscoveryErrorType,
} from './types.js';
export { DiscoveryError } from './types.js';
