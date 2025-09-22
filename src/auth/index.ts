/**
 * Authentication module exports
 */

// Legacy OAuth client (deprecated)
export {
  OAuthClient,
  type OAuthConfig,
  type PKCEChallenge,
} from './oauth-client.js';
export { TokenManager, type StoredTokens } from './token-manager.js';

// New MCP SDK-based OAuth provider (recommended)
export {
  McpOAuthProvider,
  type McpOAuthConfig,
  type OAuthTokens,
  type TokenValidationResult,
} from './oauth-provider.js';
// CryptoUtils removed for MVP simplification
export {
  AuthMiddleware,
  type AuthContext,
  type AuthMiddlewareConfig,
} from './auth-middleware.js';
export { SessionStore, type Session } from './session-store.js';
export {
  AuthError,
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
} from './auth-errors.js';

// OAuth 2.1 endpoint discovery (RFC8414)
export {
  discoverOAuthEndpoints,
  clearDiscoveryCache,
  cleanupDiscoveryCache,
  getDiscoveryCacheStats,
} from './endpoint-discovery.js';
export type {
  OAuthServerMetadata,
  OAuthEndpoints,
  DiscoveryConfig,
  CacheEntry,
  DiscoveryErrorType,
} from './types.js';
export { DiscoveryError } from './types.js';
