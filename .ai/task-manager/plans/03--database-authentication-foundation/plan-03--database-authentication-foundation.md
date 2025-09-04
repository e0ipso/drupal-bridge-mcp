---
id: 3
summary: "Database & Authentication Foundation for MCP Server - PostgreSQL schema, OAuth 2.0 with Simple OAuth integration, token management, and user session management"
created: 2025-09-04
---

# Database & Authentication Foundation

## Executive Summary

This plan establishes the foundational data persistence and authentication infrastructure for the MCP (Model Context Protocol) server that connects to Drupalize.me's Drupal installation. The implementation provides secure user authentication via OAuth 2.0 Authorization Code Grant flow, robust token management with automatic refresh capabilities, and PostgreSQL-based session persistence.

The foundation enables per-user authentication to access subscription-level content from Drupalize.me while maintaining security best practices and supporting long-running MCP connections through Server-Sent Events (SSE).

## Architecture Documentation Review

This plan implements database and authentication components based on the comprehensive architecture documentation in `@architecture/`:

- `@architecture/authentication-analysis.md` - Detailed OAuth 2.0 integration patterns with Simple OAuth module
- `@architecture/final-technical-specifications.md` - Database schema and authentication flow specifications
- `@architecture/simplified-mvp-architecture.md` - MVP database architecture without caching complexity
- `@architecture/critical-integration-challenges.md` - Security considerations and authentication challenges

Review these documents to understand the OAuth flow design, token management strategy, and database schema requirements before implementation.

## Technical Architecture Overview

### Database Layer (PostgreSQL)
- **User Session Management**: Secure storage of OAuth tokens with encryption
- **Token Lifecycle**: Automated cleanup of expired sessions and token rotation
- **Request Logging**: Optional analytics and debugging capabilities
- **Performance Optimization**: Strategic indexing for user authentication flows

### Authentication Layer (OAuth 2.0)
- **Simple OAuth Integration**: Direct integration with Drupalize.me's Simple OAuth 5.x module
- **Authorization Code Grant**: Individual user consent flow with state validation
- **Token Management**: Access/refresh token handling with automatic renewal
- **Scope Management**: Granular permissions for content access and JSON-RPC methods

### Security Framework
- **Token Storage**: Encrypted storage of sensitive authentication data
- **State Validation**: CSRF protection through OAuth state parameter
- **Secure Transport**: SSL-enforced OAuth flows and API communications
- **Session Isolation**: Per-user token management with proper access controls

## Database Schema Specification

### Core Tables

#### user_sessions
Primary table for managing authenticated user sessions and OAuth token storage.

**Schema Definition:**
```sql
CREATE TABLE user_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  access_token_hash VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT[] DEFAULT '{}',
  subscription_level VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Key Features:**
- Hashed token storage for security
- Automatic expiration tracking
- Subscription level awareness for content access control
- Scope array for fine-grained permission management

#### request_logs (Optional)
Analytics and debugging table for tracking API usage patterns.

**Schema Definition:**
```sql
CREATE TABLE request_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  method VARCHAR(100) NOT NULL,
  parameters JSONB,
  response_size INTEGER,
  duration_ms INTEGER,
  status VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Performance Indexes:**
```sql
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_request_logs_user_created ON request_logs(user_id, created_at);
```

### Database Functions

#### Session Cleanup
Automated cleanup of expired authentication sessions:

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() 
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

## OAuth 2.0 Implementation Specification

### Authorization Code Grant Flow

#### Flow Overview
1. **Authorization Request**: Generate secure state and redirect user to Drupal OAuth endpoint
2. **User Authorization**: User authenticates and grants permissions on Drupalize.me
3. **Authorization Callback**: Receive authorization code and exchange for tokens
4. **Token Management**: Store tokens securely and handle automatic refresh

#### Implementation Components

##### OAuth Manager Class
Core OAuth flow management with state validation and token lifecycle:

```typescript
class OAuthManager {
  async initializeUserAuth(userId: string): Promise<string> {
    const state = this.generateSecureState();
    const authUrl = this.buildAuthorizationUrl(state);
    
    await this.storeAuthState(userId, state);
    return authUrl;
  }
  
  async handleCallback(code: string, state: string): Promise<TokenSet> {
    await this.validateState(state);
    const tokenResponse = await this.exchangeCodeForTokens(code);
    await this.storeUserTokens(tokenResponse);
    return tokenResponse;
  }
  
  async refreshUserToken(userId: string): Promise<TokenSet> {
    const session = await this.getUserSession(userId);
    if (!session?.refresh_token_hash) {
      throw new Error('No valid refresh token available');
    }
    
    const tokens = await this.performTokenRefresh(session.refresh_token_hash);
    await this.updateUserSession(userId, tokens);
    return tokens;
  }
}
```

##### Authorization URL Construction
Secure parameter construction with state validation:

```typescript
private buildAuthorizationUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: this.clientId,
    redirect_uri: this.redirectUri,
    scope: 'content:read content:search jsonrpc:execute',
    state: state
  });
  
  return `${this.drupalBaseUrl}/oauth/authorize?${params.toString()}`;
}
```

### Required OAuth Scopes

#### Content Access Scopes
- `content:read` - Tutorial content via JSON:API
- `content:search` - Search index access
- `content:meta` - Content metadata and relationships

#### API Method Scopes  
- `jsonrpc:discovery` - Method discovery via `/jsonrpc/methods`
- `jsonrpc:execute` - Method execution via `/jsonrpc`

## Token Management System

### Token Lifecycle Management

#### Automatic Refresh Strategy
- **Proactive Refresh**: Refresh tokens before expiration (90% of lifetime)
- **Background Processing**: Non-blocking token refresh for active sessions
- **Fallback Handling**: Graceful degradation when refresh fails
- **Connection Recovery**: Automatic reconnection after token renewal

#### Security Implementation

##### Token Storage Security
```typescript
class SecureTokenStorage {
  async storeTokens(userId: string, tokens: TokenSet): Promise<void> {
    const hashedAccess = await this.hashToken(tokens.access_token);
    const hashedRefresh = await this.hashToken(tokens.refresh_token);
    
    await this.database.upsert('user_sessions', {
      user_id: userId,
      access_token_hash: hashedAccess,
      refresh_token_hash: hashedRefresh,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      scope: tokens.scope?.split(' ') || [],
      updated_at: new Date()
    });
  }
  
  private async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, this.saltRounds);
  }
}
```

##### Token Validation
```typescript
async validateToken(userId: string): Promise<boolean> {
  const session = await this.getUserSession(userId);
  
  if (!session || session.expires_at < new Date()) {
    return false;
  }
  
  // Additional token introspection with Drupal if needed
  return this.introspectToken(session.access_token_hash);
}
```

## User Session Management

### Session Persistence Strategy

#### Session Structure
Each user session maintains:
- **Authentication State**: Valid OAuth tokens and expiration
- **Permission Context**: Subscription level and granted scopes  
- **Connection State**: Active MCP connections and their status
- **Usage Tracking**: Request history and rate limiting data

#### Session Recovery
```typescript
class SessionManager {
  async recoverUserSession(userId: string): Promise<UserSession | null> {
    const storedSession = await this.database.getUserSession(userId);
    
    if (!storedSession) {
      return null;
    }
    
    if (this.isSessionExpired(storedSession)) {
      await this.attemptTokenRefresh(userId);
      return this.getUserSession(userId);
    }
    
    return this.hydrateSession(storedSession);
  }
  
  private async attemptTokenRefresh(userId: string): Promise<void> {
    try {
      await this.oauthManager.refreshUserToken(userId);
    } catch (error) {
      // Mark session as requiring re-authorization
      await this.invalidateSession(userId);
      throw new AuthenticationRequiredError();
    }
  }
}
```

### Connection-Level Authentication

#### SSE Transport Integration
Long-running Server-Sent Events connections require special token handling:

```typescript
class SSEAuthenticationMiddleware {
  async authenticateConnection(request: Request): Promise<UserContext> {
    const userId = this.extractUserId(request);
    const session = await this.sessionManager.getValidSession(userId);
    
    if (!session) {
      throw new AuthenticationRequiredError({
        type: 'authorization_required',
        authorization_url: await this.oauthManager.initializeUserAuth(userId)
      });
    }
    
    return this.createUserContext(session);
  }
  
  async maintainConnectionAuth(connectionId: string): Promise<void> {
    // Background token refresh for active connections
    setInterval(async () => {
      await this.refreshConnectionToken(connectionId);
    }, this.tokenRefreshInterval);
  }
}
```

## Security Considerations

### Data Protection

#### Token Storage Security
- **Encryption at Rest**: All tokens encrypted using AES-256
- **Hash-Based Storage**: Tokens hashed with bcrypt before database storage
- **Salt Rotation**: Regular rotation of encryption salts
- **Secure Deletion**: Proper cleanup of expired or revoked tokens

#### Transport Security
- **SSL/TLS Enforcement**: All OAuth flows require HTTPS
- **Certificate Validation**: Strict certificate validation for Drupal communications
- **HSTS Headers**: HTTP Strict Transport Security for web endpoints
- **Secure Cookies**: HttpOnly, Secure, SameSite cookie attributes

### Access Control

#### Scope Minimization
- **Minimal Permissions**: Request only necessary OAuth scopes
- **Dynamic Scope Adjustment**: Scope-based feature availability
- **Permission Validation**: Regular validation of granted permissions
- **Scope Degradation**: Graceful handling of reduced permissions

#### Audit and Monitoring
- **Authentication Events**: Log all authentication attempts and outcomes
- **Token Usage Tracking**: Monitor token usage patterns for anomaly detection
- **Failed Authorization Logging**: Track and alert on authentication failures
- **Session Anomaly Detection**: Identify unusual session behavior patterns

### Error Handling

#### Authentication Failure Recovery
```typescript
class AuthenticationErrorHandler {
  async handleAuthError(error: AuthError, userId: string): Promise<AuthRecovery> {
    switch (error.type) {
      case 'token_expired':
        return this.attemptTokenRefresh(userId);
      
      case 'invalid_scope':
        return this.requestScopeReauthorization(userId);
      
      case 'revoked_token':
        return this.initiateFullReauthorization(userId);
      
      default:
        return this.escalateAuthError(error);
    }
  }
}
```

## Environment Configuration

### Database Configuration
```bash
# PostgreSQL connection
DATABASE_URL=postgresql://user:pass@localhost:5432/mcp_server
DB_SSL_MODE=require
DB_CONNECTION_POOL_SIZE=20
DB_COMMAND_TIMEOUT=5000

# Database security
DB_ENCRYPTION_KEY=your-32-byte-encryption-key
DB_TOKEN_SALT_ROUNDS=12
```

### OAuth Configuration  
```bash
# Drupal OAuth integration
DRUPAL_BASE_URL=https://drupalize.me
OAUTH_CLIENT_ID=mcp-rag-client
OAUTH_CLIENT_SECRET=your-oauth-client-secret
OAUTH_REDIRECT_URI=https://your-server.railway.app/oauth/callback

# Token management
TOKEN_REFRESH_THRESHOLD=0.9
TOKEN_CLEANUP_INTERVAL=3600
SESSION_CLEANUP_INTERVAL=86400
```

### Security Configuration
```bash
# Encryption and hashing
ENCRYPTION_ALGORITHM=aes-256-gcm
TOKEN_HASH_ALGORITHM=bcrypt
STATE_TOKEN_LENGTH=32

# SSL and transport
ENFORCE_HTTPS=true
HSTS_MAX_AGE=31536000
CERT_VALIDATION=strict
```

## Performance and Monitoring

### Performance Targets
- **Token Exchange**: < 200ms for initial OAuth flow
- **Token Refresh**: < 100ms for background refresh
- **Session Recovery**: < 50ms for existing valid sessions  
- **Database Queries**: < 25ms for session lookups

### Monitoring Metrics
- Authentication success/failure rates
- Token refresh frequency and success rates
- Session duration and cleanup efficiency
- Database connection pool utilization
- OAuth flow completion times

### Health Checks
```typescript
class AuthenticationHealthCheck {
  async checkDatabaseConnection(): Promise<HealthStatus> {
    try {
      await this.database.query('SELECT 1');
      return { status: 'healthy', latency: performance.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
  
  async checkOAuthEndpoint(): Promise<HealthStatus> {
    try {
      const response = await fetch(`${this.drupalBaseUrl}/oauth/authorize`);
      return { status: 'healthy', statusCode: response.status };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }
}
```

## Success Criteria

### Functional Requirements
✅ **OAuth Integration**: Complete Authorization Code Grant flow with Simple OAuth
✅ **Token Management**: Automatic token refresh with secure storage
✅ **Session Persistence**: Reliable user session recovery and management
✅ **Database Operations**: Efficient schema with proper indexing and cleanup
✅ **Security Compliance**: Encrypted token storage and secure transport

### Performance Requirements  
✅ **Authentication Speed**: OAuth flows complete within performance targets
✅ **Session Recovery**: Fast session restoration for returning users
✅ **Database Performance**: Optimized queries with sub-25ms response times
✅ **Connection Stability**: Stable SSE connections with token refresh

### Security Requirements
✅ **Data Protection**: All sensitive data encrypted at rest and in transit
✅ **Access Controls**: Proper scope validation and permission enforcement
✅ **Audit Compliance**: Comprehensive logging of authentication events
✅ **Error Handling**: Secure error responses without information leakage

## Architecture Decision Records (ADRs)

During implementation of this plan, create ADRs to document critical database and authentication decisions:

- **ADR-009**: Database Schema Design for User Sessions and Token Storage
- **ADR-010**: OAuth 2.0 Flow Implementation with Simple OAuth Integration
- **ADR-011**: Token Security Strategy (Encryption, Hashing, Storage)
- **ADR-012**: Session Management and Connection State Handling

These ADRs should be created in the `@architecture/adr/` directory following the established format and numbering sequence.

## Task Dependencies

```mermaid
graph TD
    001[Task 001: Database Schema Setup] --> 002[Task 002: OAuth Manager Implementation]
    002 --> 003[Task 003: Token Management Security]
    003 --> 004[Task 004: User Session Management]
    004 --> 005[Task 005: Connection Authentication Middleware]
```

## Execution Blueprint

**Validation Gates:**
- Reference: `@.ai/task-manager/VALIDATION_GATES.md`

### Phase 1: Database Foundation
**Parallel Tasks:**
- Task 001: Database Schema Setup (PostgreSQL tables, indexes, functions)

### Phase 2: OAuth Integration  
**Parallel Tasks:**
- Task 002: OAuth Manager Implementation (depends on: 001)

### Phase 3: Token Security
**Parallel Tasks:**
- Task 003: Token Management Security (depends on: 001, 002)

### Phase 4: Session Persistence
**Parallel Tasks:**
- Task 004: User Session Management (depends on: 003)

### Phase 5: Connection Transport
**Parallel Tasks:**
- Task 005: Connection Authentication Middleware (depends on: 004)

### Execution Summary
- Total Phases: 5
- Total Tasks: 5
- Maximum Parallelism: 1 task per phase
- Critical Path Length: 5 phases

This foundation provides the secure, scalable authentication and data persistence layer required for the MCP server's integration with Drupalize.me, enabling personalized content access while maintaining security best practices.