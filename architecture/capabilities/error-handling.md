# Error Handling Capability

## Overview

The Error Handling capability provides comprehensive error management for the MCP (Model Context Protocol) tutorial server, focusing on simplified error messaging for production use and graceful degradation patterns. This capability ensures consistent error responses across all system components while maintaining security through limited error disclosure in non-debug mode.

## Core Functionality

### Primary Features

- **Simplified Error Messages**: Clean, user-friendly error messages for non-debug mode
- **Comprehensive Error Scenarios**: Coverage of authentication, search, and API failure patterns
- **Graceful Degradation**: Fallback mechanisms when components fail
- **Error Response Formatting**: Consistent JSON error response structure
- **Debug Mode Support**: Detailed error information for development environments
- **Cross-Capability Integration**: Unified error handling across MCP Server, Search, and Authentication

### Error Categories

The error handling system categorizes errors into several key types:

- **Authentication Errors**: OAuth failures, token expiration, and authorization issues
- **Search Errors**: Invalid queries, API timeouts, and content retrieval failures
- **Protocol Errors**: MCP protocol violations and communication failures
- **System Errors**: Network connectivity, service unavailability, and internal server errors

## Error Response Format

### Standard Error Response Structure

All errors follow a consistent JSON response format based on JSON-RPC 2.0 error specification:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Request failed",
    "data": {
      "type": "AUTHENTICATION_ERROR",
      "details": "Authentication required",
      "timestamp": "2024-09-04T12:00:00Z",
      "request_id": "req_12345"
    }
  },
  "id": "search-request-001"
}
```

### Simplified vs Debug Mode Responses

#### Non-Debug Mode (Production)
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Service temporarily unavailable",
    "data": {
      "type": "SERVICE_ERROR",
      "details": "Please try again in a few moments"
    }
  },
  "id": "request-001"
}
```

#### Debug Mode (Development)
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32603,
    "message": "Service temporarily unavailable",
    "data": {
      "type": "SERVICE_ERROR",
      "details": "Connection timeout to Drupal API after 30s",
      "stack_trace": "Error: connect ETIMEDOUT...",
      "drupal_endpoint": "https://drupalize.me/jsonrpc",
      "request_params": {"method": "content.search", "query": "blocks"}
    }
  },
  "id": "request-001"
}
```

## Authentication Error Handling

### OAuth Authentication Errors

Authentication errors are handled through multiple layers with automatic recovery mechanisms:

```typescript
class AuthenticationErrorHandler {
  async handleAuthError(error, userId) {
    switch (error.code) {
      case 'TOKEN_EXPIRED':
        // Simplified user message
        const userMessage = this.isDebugMode ? 
          `Access token expired at ${error.expiredAt}` :
          'Session expired. Please authenticate again.';
          
        try {
          // Attempt automatic token refresh
          const newToken = await this.authManager.refreshToken(userId);
          return { recovered: true, token: newToken };
        } catch (refreshError) {
          return {
            error: {
              code: -32001,
              message: userMessage,
              data: {
                type: 'AUTHENTICATION_REQUIRED',
                action: 'reauth_required'
              }
            }
          };
        }

      case 'INVALID_TOKEN':
        return {
          error: {
            code: -32002,
            message: this.isDebugMode ? 
              `Token validation failed: ${error.reason}` :
              'Authentication failed. Please sign in again.',
            data: {
              type: 'INVALID_CREDENTIALS',
              action: 'reauth_required'
            }
          }
        };

      case 'REFRESH_FAILED':
        await this.authManager.clearUserTokens(userId);
        return {
          error: {
            code: -32003,
            message: 'Session expired. Please authenticate again.',
            data: {
              type: 'AUTHENTICATION_EXPIRED',
              action: 'reauth_required'
            }
          }
        };
    }
  }
}
```

### Token Validation Error Scenarios

Common authentication error patterns with their simplified responses:

#### 1. Missing Authorization Header
```json
{
  "error": {
    "code": -32001,
    "message": "Authentication required",
    "data": {
      "type": "MISSING_AUTH",
      "details": "Please authenticate to access this resource"
    }
  }
}
```

#### 2. Malformed Bearer Token
```json
{
  "error": {
    "code": -32002,
    "message": "Invalid authentication format",
    "data": {
      "type": "INVALID_AUTH_FORMAT",
      "details": "Authentication format not recognized"
    }
  }
}
```

#### 3. Expired Access Token
```json
{
  "error": {
    "code": -32003,
    "message": "Session expired",
    "data": {
      "type": "TOKEN_EXPIRED",
      "details": "Please authenticate again",
      "action": "reauth_required"
    }
  }
}
```

## Search Error Handling

### Search Query Validation

Search errors are handled at multiple levels with user-friendly messaging:

```typescript
class SearchErrorHandler {
  validateSearchQuery(query, filters) {
    const errors = [];

    // Query validation
    if (!query || typeof query !== 'string') {
      errors.push({
        field: 'query',
        code: 'REQUIRED_FIELD',
        message: 'Search query is required'
      });
    } else if (query.length < 2) {
      errors.push({
        field: 'query',
        code: 'MIN_LENGTH',
        message: 'Search query must be at least 2 characters'
      });
    }

    // Drupal version validation
    if (filters.drupal_version && !['9', '10', '11'].includes(filters.drupal_version)) {
      errors.push({
        field: 'drupal_version',
        code: 'INVALID_VALUE',
        message: 'Drupal version must be 9, 10, or 11'
      });
    }

    return errors;
  }

  formatValidationError(errors) {
    const message = this.isDebugMode ?
      `Validation failed: ${errors.map(e => `${e.field}: ${e.message}`).join(', ')}` :
      'Invalid search parameters';

    return {
      code: -32602,
      message: message,
      data: {
        type: 'VALIDATION_ERROR',
        errors: this.isDebugMode ? errors : undefined
      }
    };
  }
}
```

### API Request Error Scenarios

#### 1. Drupal API Timeout
```json
{
  "error": {
    "code": -32603,
    "message": "Search request timeout",
    "data": {
      "type": "TIMEOUT_ERROR",
      "details": "Search is taking longer than expected. Please try again.",
      "retry_suggested": true
    }
  }
}
```

#### 2. Drupal API Unavailable
```json
{
  "error": {
    "code": -32603,
    "message": "Service temporarily unavailable",
    "data": {
      "type": "SERVICE_UNAVAILABLE",
      "details": "Tutorial search service is temporarily down. Please try again later.",
      "retry_after": 300
    }
  }
}
```

#### 3. Invalid Search Response
```json
{
  "error": {
    "code": -32603,
    "message": "Search results unavailable",
    "data": {
      "type": "RESPONSE_ERROR",
      "details": "Unable to process search results. Please try a different search."
    }
  }
}
```

## MCP Server Error Handling

### Protocol-Level Error Handling

MCP protocol errors are handled with clear messaging about communication issues:

```typescript
class MCPProtocolErrorHandler {
  handleProtocolError(error, request) {
    switch (error.type) {
      case 'INVALID_REQUEST':
        return {
          code: -32600,
          message: this.isDebugMode ? 
            `Invalid request format: ${error.details}` :
            'Invalid request format',
          data: {
            type: 'PROTOCOL_ERROR',
            details: 'Request format not recognized'
          }
        };

      case 'METHOD_NOT_FOUND':
        return {
          code: -32601,
          message: this.isDebugMode ?
            `Method '${request.method}' not found` :
            'Requested operation not available',
          data: {
            type: 'METHOD_ERROR',
            available_methods: this.isDebugMode ? this.getAvailableMethods() : undefined
          }
        };

      case 'TRANSPORT_ERROR':
        return {
          code: -32603,
          message: 'Connection error',
          data: {
            type: 'TRANSPORT_ERROR',
            details: 'Communication with server interrupted',
            action: 'retry_connection'
          }
        };
    }
  }
}
```

### SSE Transport Error Scenarios

#### 1. Connection Loss
```json
{
  "error": {
    "code": -32603,
    "message": "Connection lost",
    "data": {
      "type": "CONNECTION_ERROR",
      "details": "Real-time connection interrupted. Reconnecting automatically.",
      "action": "reconnecting"
    }
  }
}
```

#### 2. Invalid MCP Message Format
```json
{
  "error": {
    "code": -32600,
    "message": "Invalid message format",
    "data": {
      "type": "FORMAT_ERROR",
      "details": "Message format not recognized by server"
    }
  }
}
```

## Cross-Capability Error Integration

### Error Flow Between Capabilities

The error handling system manages errors that span multiple capabilities, providing centralized coordination for:

- **[MCP Server](./mcp-server-sse.md) ↔ [Authentication](./authentication-flow.md)**: Protocol-level authentication errors and token validation failures
- **[Authentication](./authentication-flow.md) ↔ [Basic Search](./basic-search.md)**: Token refresh coordination during search API calls
- **[MCP Server](./mcp-server-sse.md) ↔ [Basic Search](./basic-search.md)**: Tool request validation and response error formatting

The error handling system manages errors that span multiple capabilities:

```typescript
class CrossCapabilityErrorHandler {
  async handleSearchWithAuth(query, filters, userId) {
    try {
      // Authentication error handling
      const token = await this.authManager.getValidToken(userId);
      
      // Search error handling
      const validationErrors = this.searchValidator.validate(query, filters);
      if (validationErrors.length > 0) {
        throw new SearchValidationError(validationErrors);
      }

      // Execute search with comprehensive error handling
      return await this.executeAuthenticatedSearch(query, filters, token);
      
    } catch (error) {
      // Route error to appropriate handler
      if (error instanceof AuthenticationError) {
        return await this.authErrorHandler.handle(error, userId);
      } else if (error instanceof SearchValidationError) {
        return this.searchErrorHandler.handleValidation(error);
      } else if (error instanceof NetworkError) {
        return this.systemErrorHandler.handleNetwork(error);
      } else {
        return this.systemErrorHandler.handleUnknown(error);
      }
    }
  }
}
```

### Capability Interaction Error Patterns

#### Authentication-Search Integration Errors

**Scenario**: Search request with expired token
```json
{
  "error": {
    "code": -32001,
    "message": "Authentication required for search",
    "data": {
      "type": "AUTH_SEARCH_ERROR",
      "details": "Please authenticate to search tutorials",
      "action": "reauth_required",
      "context": "search_request"
    }
  }
}
```

**Scenario**: Search request with insufficient permissions
```json
{
  "error": {
    "code": -32004,
    "message": "Insufficient permissions",
    "data": {
      "type": "PERMISSION_ERROR",
      "details": "Your account doesn't have access to search tutorials",
      "required_scope": "tutorial:read"
    }
  }
}
```

## Error Recovery and Graceful Degradation

### Automatic Recovery Mechanisms

The system implements several automatic recovery strategies:

```typescript
class ErrorRecoveryManager {
  async executeWithRecovery(operation, recoveryStrategies = []) {
    let lastError = null;
    
    for (const strategy of recoveryStrategies) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        const recovery = await strategy.attempt(error);
        if (recovery.success) {
          // Recovery successful, update operation context
          operation = recovery.updatedOperation;
          continue;
        } else if (recovery.shouldStop) {
          // Recovery indicates we should stop trying
          break;
        }
        // Continue to next recovery strategy
      }
    }
    
    // All recovery strategies failed
    throw this.formatFinalError(lastError);
  }
}

// Recovery strategies
const tokenRefreshRecovery = {
  async attempt(error) {
    if (error.code === 'TOKEN_EXPIRED') {
      try {
        const newToken = await authManager.refreshToken(error.userId);
        return {
          success: true,
          updatedOperation: () => operation(newToken)
        };
      } catch (refreshError) {
        return { success: false, shouldStop: true };
      }
    }
    return { success: false, shouldStop: false };
  }
};

const retryRecovery = {
  async attempt(error, retryCount = 0) {
    if (error.isRetryable && retryCount < 3) {
      await this.delay(Math.pow(2, retryCount) * 1000); // Exponential backoff
      return { success: true, updatedOperation: operation };
    }
    return { success: false, shouldStop: retryCount >= 3 };
  }
};
```

### Fallback Response Patterns

When all recovery attempts fail, the system provides meaningful fallback responses:

#### 1. Search Service Unavailable
```json
{
  "jsonrpc": "2.0",
  "result": {
    "message": "Tutorial search is temporarily unavailable",
    "suggestion": "Try browsing tutorials directly at drupalize.me",
    "fallback_url": "https://drupalize.me/tutorials",
    "retry_after": 300
  },
  "id": "search-request-001"
}
```

#### 2. Authentication Service Down
```json
{
  "jsonrpc": "2.0",
  "result": {
    "message": "Authentication service is temporarily unavailable",
    "suggestion": "Some features may be limited until authentication is restored",
    "public_content": "You can still browse public tutorials",
    "retry_after": 600
  },
  "id": "auth-request-001"
}
```

## Error Logging and Monitoring

### Structured Error Logging

Error information is logged in a structured format for monitoring and debugging:

```typescript
class ErrorLogger {
  logError(error, context) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: this.determineLogLevel(error),
      error: {
        type: error.constructor.name,
        message: error.message,
        code: error.code,
        stack: this.isDebugMode ? error.stack : undefined
      },
      context: {
        userId: context.userId,
        requestId: context.requestId,
        capability: context.capability,
        method: context.method,
        parameters: this.sanitizeParameters(context.parameters)
      },
      environment: {
        nodeVersion: process.version,
        environment: process.env.NODE_ENV
      }
    };

    // Log based on severity
    if (error.severity === 'critical') {
      console.error('[CRITICAL]', JSON.stringify(logEntry));
      this.notifyAdministrators(logEntry);
    } else if (error.severity === 'warning') {
      console.warn('[WARNING]', JSON.stringify(logEntry));
    } else {
      console.log('[INFO]', JSON.stringify(logEntry));
    }
  }

  sanitizeParameters(params) {
    // Remove sensitive information from logs
    const sanitized = { ...params };
    if (sanitized.token) sanitized.token = '[REDACTED]';
    if (sanitized.password) sanitized.password = '[REDACTED]';
    return sanitized;
  }
}
```

## Debug Mode Configuration

### Environment-Based Error Detail

Error verbosity is controlled through environment configuration:

```typescript
class ErrorConfigManager {
  constructor() {
    this.debugMode = process.env.NODE_ENV === 'development' || 
                    process.env.DEBUG_ERRORS === 'true';
    this.logLevel = process.env.LOG_LEVEL || 'info';
  }

  formatError(error, context) {
    const baseError = {
      code: error.code,
      message: this.getSimplifiedMessage(error),
      data: {
        type: error.type,
        timestamp: new Date().toISOString()
      }
    };

    if (this.debugMode) {
      // Include detailed information for debugging
      baseError.data.debug = {
        originalMessage: error.message,
        stack: error.stack,
        context: context,
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage()
      };
    }

    return baseError;
  }

  getSimplifiedMessage(error) {
    const simplifiedMessages = {
      'ECONNREFUSED': 'Service unavailable',
      'ENOTFOUND': 'Service unavailable',
      'ETIMEDOUT': 'Request timeout',
      'TOKEN_EXPIRED': 'Session expired',
      'INVALID_TOKEN': 'Authentication failed',
      'VALIDATION_ERROR': 'Invalid request parameters'
    };

    return simplifiedMessages[error.code] || 'An error occurred';
  }
}
```

## Implementation Requirements

### Error Handler Components

```typescript
// Core error handling infrastructure
class ErrorHandlingSystem {
  constructor() {
    this.authErrorHandler = new AuthenticationErrorHandler();
    this.searchErrorHandler = new SearchErrorHandler();
    this.protocolErrorHandler = new MCPProtocolErrorHandler();
    this.recoveryManager = new ErrorRecoveryManager();
    this.logger = new ErrorLogger();
    this.config = new ErrorConfigManager();
  }

  async handleError(error, context) {
    // Log error for monitoring
    this.logger.logError(error, context);

    // Determine appropriate handler
    const handler = this.getErrorHandler(error.type);
    
    // Attempt error recovery
    const recoveryResult = await this.recoveryManager.attemptRecovery(error, context);
    
    if (recoveryResult.success) {
      return recoveryResult.result;
    }

    // Format error for client response
    return this.config.formatError(error, context);
  }
}
```

## Dependencies

### Internal Dependencies

The Error Handling capability provides centralized error management for all other capabilities:

- **[MCP Server SSE](./mcp-server-sse.md)**: Protocol error handling, transport-level error management, and SSE connection error recovery
- **[Basic Search](./basic-search.md)**: Search validation errors, query parameter validation, API request error handling, and Drupal API timeout management  
- **[Authentication Flow](./authentication-flow.md)**: OAuth errors, token validation failures, session management errors, and automatic token refresh error handling

### Cross-Capability Error Coordination

This capability serves as the central error management system:

- **Unified Error Format**: Provides consistent JSON-RPC error response format used by all capabilities
- **Debug Mode Integration**: Controls error verbosity across all capabilities based on environment configuration
- **Error Recovery Orchestration**: Coordinates error recovery strategies across capabilities (e.g., authentication retry for search failures)
- **Logging Standardization**: Provides structured error logging format for monitoring all capability interactions

### External Dependencies

- **Node.js Error Handling**: Native error handling and stack trace management
- **HTTP Status Codes**: Standard HTTP error code mapping
- **JSON-RPC 2.0**: Error response format specification
- **Logging Libraries**: Structured logging and monitoring integration

## Success Criteria

### Error Handling Validation

- ✅ Simplified error messages implemented for non-debug mode
- ✅ Comprehensive error scenarios covered for all capabilities
- ✅ Graceful degradation patterns implemented
- ✅ Cross-capability error integration working
- ✅ Error recovery mechanisms operational
- ✅ Debug mode configuration functional
- ✅ Structured error logging implemented

### Integration Validation

- ✅ Authentication errors handled with automatic token refresh
- ✅ Search errors provide clear user feedback
- ✅ MCP protocol errors maintain communication flow
- ✅ Error responses follow consistent JSON format
- ✅ Debug information available in development environment
- ✅ Production security through limited error disclosure

## Implementation Notes

### Development Priorities

1. **Security First**: Ensure error messages don't leak sensitive information in production
2. **User Experience**: Provide clear, actionable error messages
3. **Recovery Mechanisms**: Implement automatic error recovery where possible
4. **Monitoring**: Ensure all errors are properly logged for system monitoring
5. **Consistency**: Maintain consistent error response format across all capabilities

### Production Considerations

- **Error Message Security**: Sanitize error messages to prevent information disclosure
- **Performance Impact**: Minimize error handling overhead on successful requests
- **Monitoring Integration**: Ensure error logs integrate with monitoring systems
- **Alert Thresholds**: Configure appropriate error rate alerts for operations

This capability provides the foundation for reliable error handling across the entire MCP tutorial server system, ensuring users receive helpful feedback while maintaining system security and operational visibility.