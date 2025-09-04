# Debug Mode Architecture

## Overview

The MCP server supports two operational modes to balance user experience with development needs:

- **Production Mode (Default)**: Simplified, user-friendly error messages
- **Debug Mode**: Verbose, developer-friendly error details

## Configuration

### Environment Variable Control

```yaml
# Environment Configuration
MCP_DEBUG_MODE: 'false' # Default: production mode
MCP_LOG_LEVEL: 'info' # Default: info, debug mode sets to "debug"
```

### Runtime Toggle (Optional)

```javascript
// Optional: Runtime debug toggle via MCP tool
const debugTools = [
  {
    name: 'toggle_debug_mode',
    description: 'Enable/disable verbose error reporting',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
      },
    },
  },
];
```

## Error Message Architecture

### Production Mode (Default)

```javascript
class ProductionErrorHandler {
  formatError(error, context) {
    return {
      error: {
        code: this.mapErrorCode(error),
        message: this.getSimpleMessage(error),
        suggestion: this.getSuggestion(error),
        retry_possible: this.canRetry(error),
      },
    };
  }

  getSimpleMessage(error) {
    const messageMap = {
      authentication_failed: 'Unable to connect to Drupalize.me',
      search_timeout: 'Search is temporarily unavailable',
      content_not_found: 'Tutorial not found or access denied',
      rate_limited: 'Too many requests, please wait',
      server_unavailable: 'Service temporarily unavailable',
    };

    return messageMap[error.code] || 'An unexpected error occurred';
  }
}
```

### Debug Mode

```javascript
class DebugErrorHandler {
  formatError(error, context) {
    return {
      error: {
        code: error.code,
        message: error.message,

        // Debug-specific details
        debug_info: {
          stack_trace: error.stack,
          request_details: {
            method: context.method,
            parameters: context.parameters,
            user_id: context.user?.id,
            timestamp: new Date().toISOString(),
          },

          // System state
          system_info: {
            token_status: this.getTokenStatus(),
            drupal_connectivity: this.checkDrupalHealth(),
            cache_stats: this.getCacheStats(),
            active_connections: this.getConnectionCount(),
          },

          // Request chain
          request_chain: this.buildRequestChain(context),

          // Related errors
          recent_errors: this.getRecentErrors(5),
        },

        // Still include user-friendly info
        suggestion: this.getSuggestion(error),
        retry_possible: this.canRetry(error),
      },
    };
  }
}
```

## Logging Strategy

### Production Logging

```javascript
class ProductionLogger {
  logError(error, context) {
    // Structured logging for observability
    this.logger.error('MCP request failed', {
      error_code: error.code,
      error_message: error.message,
      user_id: context.user?.id,
      request_method: context.method,
      duration_ms: context.duration,
      correlation_id: context.correlationId,
    });
  }

  logRequest(context) {
    this.logger.info('MCP request', {
      method: context.method,
      user_id: context.user?.id,
      correlation_id: context.correlationId,
    });
  }
}
```

### Debug Logging

```javascript
class DebugLogger {
  logError(error, context) {
    // Everything from production plus:
    this.logger.error('MCP request failed [DEBUG]', {
      ...this.productionLogger.buildLogEntry(error, context),

      // Debug details
      stack_trace: error.stack,
      request_parameters: context.parameters,
      drupal_response: context.drupalResponse,
      oauth_token_info: this.maskToken(context.tokenInfo),
      performance_metrics: context.performanceMetrics,
    });
  }

  logRequestFlow(context, step, details) {
    this.logger.debug('Request flow step', {
      correlation_id: context.correlationId,
      step: step,
      details: details,
      timestamp: Date.now(),
    });
  }
}
```

## Error Categories & Responses

### Authentication Errors

```javascript
// Production
{
  error: {
    code: "authentication_failed",
    message: "Unable to connect to Drupalize.me",
    suggestion: "Please check your connection and try again",
    retry_possible: true
  }
}

// Debug
{
  error: {
    code: "oauth_token_expired",
    message: "OAuth access token has expired (401 from /jsonrpc)",
    debug_info: {
      token_expires_at: "2024-01-15T10:30:00Z",
      refresh_token_available: true,
      last_refresh_attempt: "2024-01-15T10:25:00Z",
      drupal_response: { status: 401, headers: {...}, body: "..." }
    }
  }
}
```

### Search Errors

```javascript
// Production
{
  error: {
    code: "search_unavailable",
    message: "Search is temporarily unavailable",
    suggestion: "Try a simpler query or check back in a few minutes"
  }
}

// Debug
{
  error: {
    code: "solr_timeout",
    message: "Search request to Drupal timed out after 5000ms",
    debug_info: {
      search_query: "custom blocks drupal 10",
      timeout_threshold: 5000,
      partial_results: [...],
      solr_status: "degraded",
      request_chain: [
        { step: "mcp_search_request", duration: 50 },
        { step: "oauth_validation", duration: 100 },
        { step: "jsonrpc_call", duration: 4950, status: "timeout" }
      ]
    }
  }
}
```

## Implementation Pattern

### Unified Error Handler

```javascript
class UnifiedErrorHandler {
  constructor() {
    this.isDebugMode = process.env.MCP_DEBUG_MODE === 'true';
    this.productionHandler = new ProductionErrorHandler();
    this.debugHandler = new DebugErrorHandler();
  }

  handleError(error, context) {
    // Always log for observability
    this.logError(error, context);

    // Return appropriate response format
    if (this.isDebugMode) {
      return this.debugHandler.formatError(error, context);
    } else {
      return this.productionHandler.formatError(error, context);
    }
  }

  logError(error, context) {
    if (this.isDebugMode) {
      this.debugLogger.logError(error, context);
    } else {
      this.productionLogger.logError(error, context);
    }
  }
}
```

### Context Builder

```javascript
class RequestContext {
  constructor(request) {
    this.correlationId = this.generateId();
    this.method = request.method;
    this.parameters = request.params;
    this.startTime = Date.now();
    this.user = this.extractUser(request);
  }

  addDrupalResponse(response) {
    this.drupalResponse = {
      status: response.status,
      headers: this.sanitizeHeaders(response.headers),
      body: this.isDebugMode ? response.body : '[hidden]',
    };
  }

  complete() {
    this.duration = Date.now() - this.startTime;
    this.endTime = Date.now();
  }
}
```

## Sentry Integration

### Configuration

```javascript
// Sentry setup with debug mode awareness
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  beforeSend(event) {
    // In debug mode, include more context
    if (process.env.MCP_DEBUG_MODE === 'true') {
      event.extra = {
        ...event.extra,
        debug_mode: true,
        full_context: event.contexts,
      };
    }
    return event;
  },
});
```

### Error Reporting

```javascript
class SentryErrorReporter {
  reportError(error, context) {
    Sentry.withScope(scope => {
      scope.setContext('mcp_request', {
        method: context.method,
        correlation_id: context.correlationId,
        user_id: context.user?.id,
      });

      if (this.isDebugMode) {
        scope.setContext('debug_details', context.debugInfo);
      }

      Sentry.captureException(error);
    });
  }
}
```

## Benefits of This Architecture

### For Development

- **Rich Debugging**: Full context for troubleshooting
- **Request Tracing**: Complete request flow visibility
- **Performance Insights**: Timing and bottleneck identification

### For Production

- **User-Friendly**: Simple, actionable error messages
- **Security**: No sensitive data exposure
- **Performance**: Minimal overhead from error processing

### For Operations

- **Observability**: Structured logs for monitoring
- **Alerting**: Clear error categorization for alerts
- **Troubleshooting**: Debug mode can be enabled for specific issues

This debug mode architecture provides comprehensive error handling while maintaining excellent user
experience in production.
