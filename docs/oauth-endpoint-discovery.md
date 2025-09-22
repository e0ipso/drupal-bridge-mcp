# OAuth 2.1 Endpoint Discovery (RFC8414)

This document describes the OAuth 2.1 endpoint discovery implementation that replaces hardcoded OAuth endpoint configuration with RFC8414-compliant `.well-known` metadata discovery.

## Overview

The OAuth endpoint discovery system automatically discovers OAuth authorization and token endpoints from the authorization server's metadata, providing better flexibility and reducing configuration maintenance. OAuth discovery is mandatory and will fail hard if the server does not provide proper RFC 8414 metadata.

## Key Features

- **RFC8414 Compliance**: Full implementation of OAuth 2.0 Authorization Server Metadata specification
- **Mandatory Discovery**: Requires RFC 8414 compliant metadata - no fallbacks or defaults
- **Performance Optimization**: In-memory caching with configurable TTL (default: 1 hour)
- **Robust Error Handling**: Comprehensive error handling for network failures, timeouts, and malformed responses
- **Retry Logic**: Exponential backoff retry mechanism for network failures
- **Development Support**: Support for both HTTP (development) and HTTPS (production) endpoints
- **Debug Logging**: Optional debug logging for troubleshooting

## Implementation Files

### Core Files

- `src/auth/types.ts` - TypeScript interfaces for OAuth metadata and discovery configuration
- `src/auth/endpoint-discovery.ts` - Main discovery implementation with caching and error handling
- `src/auth/endpoint-discovery.test.ts` - Comprehensive test suite covering all scenarios

### Integration

- `src/config/index.ts` - Configuration integration with automatic discovery during startup
- `src/auth/index.ts` - Module exports for discovery functions and types

## Configuration

### Environment Variables

Configure OAuth endpoint discovery using these environment variables:

```bash
# OAuth Discovery Settings
OAUTH_DISCOVERY_TIMEOUT=5000        # Discovery timeout in milliseconds (default: 5000)
OAUTH_DISCOVERY_RETRIES=2           # Number of retry attempts (default: 2)
OAUTH_DISCOVERY_CACHE_TTL=3600000   # Cache TTL in milliseconds (default: 3600000 = 1 hour)
OAUTH_DISCOVERY_VALIDATE_HTTPS=true # Require HTTPS in production (default: true)
OAUTH_DISCOVERY_DEBUG=true          # Enable debug logging (default: false)
OAUTH_SKIP_DISCOVERY=true           # Skip discovery, use hardcoded endpoints (default: false)
```

### Discovery Configuration

```typescript
import { discoverOAuthEndpoints } from '@/auth/endpoint-discovery.js';
import type { DiscoveryConfig } from '@/auth/types.js';

const config: DiscoveryConfig = {
  baseUrl: 'https://your-drupal-site.com',
  timeout: 5000,          // 5 second timeout
  retries: 2,             // 2 retry attempts
  cacheTtl: 3600000,      // 1 hour cache TTL
  validateHttps: true,    // Require HTTPS in production
  debug: false,           // Disable debug logging
};

const endpoints = await discoverOAuthEndpoints(config);
```

## Discovery Process

### 1. Well-Known Endpoint Query

The discovery process queries the OAuth authorization server's well-known metadata endpoint:

```
GET {baseUrl}/.well-known/oauth-authorization-server
Accept: application/json
User-Agent: Drupal-MCP-Bridge/1.0.0
```

### 2. Metadata Validation

The response is validated to ensure it contains required OAuth 2.0 metadata fields:

- `issuer` - Authorization server issuer identifier
- `authorization_endpoint` - Authorization endpoint URL
- `token_endpoint` - Token endpoint URL

Optional fields are also processed when available:

- `jwks_uri` - JWK Set document URL
- `scopes_supported` - Supported OAuth scopes
- `code_challenge_methods_supported` - Supported PKCE methods

### 3. Failure Handling

If discovery fails for any reason, the system throws a DiscoveryError with detailed information about the failure. No fallback endpoints are created.

## Error Handling

### Discovery Error Types

```typescript
enum DiscoveryErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',           // Network connectivity issues
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',           // Request timeout
  INVALID_JSON = 'INVALID_JSON',             // Malformed JSON response
  MISSING_REQUIRED_FIELDS = 'MISSING_REQUIRED_FIELDS', // Missing metadata fields
  HTTPS_REQUIRED = 'HTTPS_REQUIRED',         // HTTPS required in production
  INVALID_URL = 'INVALID_URL',               // Invalid URL format
}
```

### Error Recovery

- **Network Failures**: Automatic retry with exponential backoff
- **Timeout Errors**: Retry with same timeout settings
- **Invalid Responses**: Throws DiscoveryError with INVALID_JSON type
- **Missing Fields**: Throws DiscoveryError with MISSING_REQUIRED_FIELDS type
- **URL Errors**: Throws DiscoveryError with INVALID_URL type

## Caching

### Cache Behavior

- **Hit**: Returns cached endpoints immediately (< 1ms response time)
- **Miss**: Performs discovery and caches successful results
- **TTL**: Cached entries expire after configured TTL (default: 1 hour)
- **Error Cache**: Failed discovery attempts are not cached to allow immediate retry

### Cache Management

```typescript
import { 
  clearDiscoveryCache, 
  cleanupDiscoveryCache, 
  getDiscoveryCacheStats 
} from '@/auth/endpoint-discovery.js';

// Clear all cached entries
clearDiscoveryCache();

// Clean up expired entries
cleanupDiscoveryCache();

// Get cache statistics
const stats = getDiscoveryCacheStats();
console.log(`Cache size: ${stats.size}, Entries: ${stats.entries.join(', ')}`);
```

## Usage Examples

### Basic Discovery

```typescript
import { discoverOAuthEndpoints } from '@/auth/endpoint-discovery.js';

const endpoints = await discoverOAuthEndpoints({
  baseUrl: 'https://example.com',
});

// Use discovered endpoints
const authUrl = `${endpoints.authorizationEndpoint}?client_id=...`;
```

### With Custom Configuration

```typescript
const endpoints = await discoverOAuthEndpoints({
  baseUrl: 'https://example.com',
  timeout: 10000,         // 10 second timeout
  retries: 3,             // 3 retry attempts
  cacheTtl: 7200000,      // 2 hour cache
  debug: true,            // Enable debug logging
});
```

### Error Handling

```typescript
import { DiscoveryError, DiscoveryErrorType } from '@/auth/types.js';

try {
  const endpoints = await discoverOAuthEndpoints(config);
  console.log('Discovery successful:', endpoints);
} catch (error) {
  if (error instanceof DiscoveryError) {
    switch (error.type) {
      case DiscoveryErrorType.NETWORK_ERROR:
        console.log('Network connectivity issue');
        break;
      case DiscoveryErrorType.TIMEOUT_ERROR:
        console.log('Request timed out');
        break;
      default:
        console.log('Discovery error:', error.message);
    }
  }
}
```

## Integration with Configuration

The discovery system is automatically integrated into the application configuration loading process:

```typescript
// src/config/index.ts
export const loadConfig = async (): Promise<AppConfig> => {
  const config = getEnvConfig();
  
  // Perform OAuth endpoint discovery if authentication is enabled
  if (config.auth.enabled && !process.env.OAUTH_SKIP_DISCOVERY) {
    try {
      const discoveredEndpoints = await discoverOAuthEndpoints(config.discovery);
      
      // Update OAuth config with discovered endpoints
      config.oauth = {
        ...config.oauth,
        authorizationEndpoint: discoveredEndpoints.authorizationEndpoint,
        tokenEndpoint: discoveredEndpoints.tokenEndpoint,
      };
    } catch (error) {
      // OAuth discovery is mandatory - throw error on failure
      throw new Error(`OAuth endpoint discovery failed: ${error.message}`);
    }
  }
  
  return config;
};
```

## Production Considerations

### HTTPS Validation

In production environments, the system enforces HTTPS for OAuth endpoints:

```typescript
if (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') {
  throw new DiscoveryError(
    'HTTPS is required in production environments',
    DiscoveryErrorType.HTTPS_REQUIRED
  );
}
```

### Security Headers

All discovery requests include appropriate security headers:

```typescript
{
  'Accept': 'application/json',
  'User-Agent': 'Drupal-MCP-Bridge/1.0.0',
}
```

### Content Type Validation

Responses are validated to ensure they contain valid JSON:

```typescript
const contentType = response.headers.get('content-type');
if (!contentType?.includes('application/json')) {
  throw new DiscoveryError(
    `Invalid content type: ${contentType}. Expected application/json`,
    DiscoveryErrorType.INVALID_JSON
  );
}
```

## Performance Characteristics

- **Cache Hit**: < 1ms response time
- **Cache Miss (Success)**: 50-500ms depending on network latency
- **Cache Miss (Fallback)**: 1-5 seconds with retries
- **Memory Usage**: ~1KB per cached entry
- **Network Overhead**: Single HTTP request per cache miss

## Testing

The implementation includes comprehensive tests covering:

- Successful discovery scenarios
- Network failure handling
- Timeout scenarios
- Invalid response handling
- Cache behavior
- URL handling variations
- Error type classification

Run the endpoint discovery tests:

```bash
npm test src/auth/endpoint-discovery.test.ts
```

## Debugging

Enable debug logging to troubleshoot discovery issues:

```bash
export OAUTH_DISCOVERY_DEBUG=true
```

Debug output includes:

- Discovery attempt URLs
- Retry attempts with timing
- Cache hit/miss information
- Fallback activation
- Error details with context

Example debug output:

```
[Discovery] Discovering OAuth endpoints from: https://example.com/.well-known/oauth-authorization-server
[Discovery] Attempt 1/3: https://example.com/.well-known/oauth-authorization-server
[Discovery] Successfully discovered OAuth endpoints
```

## Migration from Hardcoded Endpoints

To migrate from hardcoded OAuth endpoints:

1. **Enable Discovery**: Remove `OAUTH_SKIP_DISCOVERY=true` from environment
2. **Configure Base URL**: Ensure `DRUPAL_BASE_URL` points to your OAuth server
3. **Test Discovery**: Run with `OAUTH_DISCOVERY_DEBUG=true` to verify
4. **Monitor Failures**: Check logs for discovery failures indicating server configuration issues

The system requires proper OAuth server configuration with RFC 8414 metadata support. No fallback endpoints are provided.