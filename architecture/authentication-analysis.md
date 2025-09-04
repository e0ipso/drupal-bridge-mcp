# Authentication Architecture Analysis

## Simple OAuth Capabilities vs MCP Requirements

### Simple OAuth Strengths

- **OAuth 2.0 Compliance**: Full OAuth 2.0 Authorization Framework implementation
- **Security Hardened**: Removed less secure grants (Implicit, Password) in v6.0.x
- **Decoupled Ready**: Designed for headless Drupal architectures
- **Token-based**: Stateless authentication suitable for API access
- **SSL Enforced**: Requires SSL for secure token exchange

### Critical Authentication Gaps

#### 1. Connection Persistence Mismatch

**Problem**: Simple OAuth designed for stateless HTTP requests, but MCP often uses long-running
connections (stdio/SSE) **Impact**: Token validation per-request vs per-connection authentication
**Solutions**:

- Implement token refresh within persistent connections
- Use SSE transport with periodic authentication refresh
- Consider connection pooling with token rotation

#### 2. Token Lifecycle in Long-Running Contexts

**Problem**: OAuth tokens expire (typically 1-3600 seconds), breaking MCP sessions **Impact**:
Connection drops, tool discovery failures, interrupted workflows **Solutions**:

- Automatic token refresh with refresh tokens
- Graceful connection recovery on token expiry
- Background token validation and preemptive refresh

#### 3. Scope Granularity Requirements

**Problem**: MCP server needs granular access to multiple Drupal subsystems **Required Scopes**:

- `jsonrpc:discovery` - Method discovery via `/jsonrpc/methods`
- `jsonrpc:execute` - Method execution via `/jsonrpc`
- `search:content` - Solr search index access
- `content:read` - Tutorial content via JSON:API
- `content:meta` - Content metadata and relationships

#### 4. Multi-Context Authentication

**Problem**: RAG system may need different user contexts for content access **Challenges**:

- User-specific content permissions
- Tutorial access levels (free vs premium)
- Administrative vs content access separation
- Cross-site authentication for multisite Drupal

#### 5. Rate Limiting Coordination

**Problem**: OAuth rate limits may conflict with MCP discovery + content retrieval patterns
**Impact**: Discovery failures, search timeouts, content retrieval bottlenecks **Solutions**:

- Implement exponential backoff
- Request prioritization (discovery > search > content)
- Connection pooling to distribute load

## Recommended Authentication Architecture

### Hybrid Authentication Strategy

1. **Initial OAuth Flow**: Standard authorization code flow for user consent
2. **Long-lived Refresh Tokens**: For background MCP server operations
3. **Connection-level Authentication**: Per-connection token caching
4. **Graceful Degradation**: Fallback mechanisms for token refresh failures

### Token Management Layer

```
┌─────────────────────────────────────┐
│        Token Management Layer       │
├─────────────────────────────────────┤
│ • Token Cache with TTL              │
│ • Automatic Refresh Logic           │
│ • Scope Validation                  │
│ • Rate Limit Coordination          │
│ • Multi-Context Token Pools        │
└─────────────────────────────────────┘
```

### Security Considerations

- **Token Storage**: Secure storage for refresh tokens (encrypted, rotation)
- **Scope Minimization**: Request minimum required scopes per operation
- **Audit Logging**: Track authentication events and scope usage
- **Error Handling**: Distinguish auth failures from authorization failures
