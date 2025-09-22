/**
 * Authentication module exports
 */

// Legacy OAuth client removed - use McpOAuthProvider instead
export { TokenManager, type StoredTokens } from './token-manager.js';

// New MCP SDK-based OAuth provider (recommended)
export {
  McpOAuthProvider,
  type McpOAuthConfig,
  type OAuthTokens,
  type TokenValidationResult,
} from './oauth-provider.js';
// CryptoUtils removed for MVP simplification
// Simplified authentication errors and types for OAuth 2.1 stateless design
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
  type Session,
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
