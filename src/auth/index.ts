/**
 * Authentication module exports
 */

export {
  OAuthClient,
  type OAuthConfig,
  type OAuthTokens,
  type PKCEChallenge,
} from './oauth-client.js';
export {
  TokenManager,
  type StoredTokens,
  type TokenValidationResult,
} from './token-manager.js';
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
