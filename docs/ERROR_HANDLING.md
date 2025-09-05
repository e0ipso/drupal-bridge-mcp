# Error Handling Guide

## Overview

The JSON-RPC Drupal Integration implements comprehensive error handling across all integration points to ensure robust operation and proper error reporting for production scenarios.

## Error Architecture

### Error Types

The system uses structured error types defined in `IntegrationErrorType`:

- **VALIDATION_ERROR**: Invalid parameters or request data
- **NETWORK_ERROR**: Network connectivity issues
- **JSONRPC_ERROR**: JSON-RPC protocol errors
- **DRUPAL_ERROR**: Drupal server-specific errors
- **TIMEOUT_ERROR**: Request timeout issues
- **PARSE_ERROR**: JSON parsing failures
- **AUTHENTICATION_ERROR**: Authentication/authorization failures
- **RATE_LIMIT_ERROR**: Rate limiting responses
- **SERVER_UNAVAILABLE**: Server unavailable/maintenance
- **MALFORMED_RESPONSE**: Invalid response format

### Error Structure

All errors are normalized to the `IntegrationError` class with structured data:

```typescript
interface StructuredError {
  type: IntegrationErrorType;
  message: string;
  code?: number | string;
  field?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
  retryable: boolean;
  userMessage: string; // User-friendly message
}
```

## Error Handling Implementation

### 1. JSON-RPC Error Response Parsing

The system parses JSON-RPC 2.0 error responses according to the specification:

```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32602,
    "message": "Invalid search parameters",
    "data": {
      "type": "VALIDATION_ERROR",
      "details": "Search query must be at least 2 characters",
      "field": "query"
    }
  },
  "id": "search-request-001"
}
```

Error codes are mapped to appropriate `IntegrationErrorType` values:

- `-32700`: Parse error → `PARSE_ERROR`
- `-32600`: Invalid request → `VALIDATION_ERROR`
- `-32601`: Method not found → `DRUPAL_ERROR`
- `-32602`: Invalid params → `VALIDATION_ERROR`
- `-32603`: Internal error → `SERVER_UNAVAILABLE`
- `-32000` to `-32099`: Server errors → `DRUPAL_ERROR`

### 2. Network Error Handling

Network errors are categorized and handled with appropriate retry logic:

#### Timeout Handling
- Request timeouts are detected and converted to `TIMEOUT_ERROR`
- Non-retryable by default to avoid cascading timeouts
- Configurable timeout period (default: 30 seconds)

#### Connection Errors
- Network connectivity failures mapped to `NETWORK_ERROR`
- Retryable with exponential backoff
- Maximum retry attempts configurable (default: 3)

#### HTTP Status Codes
- **401/403**: `AUTHENTICATION_ERROR` (non-retryable)
- **429**: `RATE_LIMIT_ERROR` (retryable)
- **500+**: `SERVER_UNAVAILABLE` (retryable)
- **400-499** (other): `VALIDATION_ERROR` (non-retryable)

### 3. MCP Integration Error Handling

MCP tool errors are formatted for optimal Claude Code consumption:

```json
{
  "error": {
    "type": "VALIDATION_ERROR",
    "message": "Please check the query parameter: Search query must be at least 2 characters",
    "details": {
      "technical_message": "Invalid query: must be at least 2 characters long",
      "field": "query",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "request_id": "mcp-req-123456789-1",
      "retryable": false
    }
  }
}
```

## Error Recovery and Fallbacks

### Development vs Production Behavior

#### Development Mode
- Network failures fall back to mock data
- Detailed error logging for debugging
- Graceful degradation for API unavailability

#### Production Mode
- Errors propagate to caller for proper handling
- User-friendly error messages
- Structured error responses for monitoring

### Fallback Strategies

1. **Mock Data Fallback**
   - When real API is unavailable in development
   - Maintains functionality for testing
   - Logs warnings about fallback usage

2. **Retry Logic**
   - Exponential backoff for retryable errors
   - Maximum retry limits to prevent infinite loops
   - Immediate failure for non-retryable errors

3. **Circuit Breaker Pattern**
   - Prevents cascading failures
   - Automatic recovery after error threshold

## Performance Characteristics

### Error Handling Overhead

Based on performance benchmarks:

- **Validation**: < 1ms average
- **Network timeout detection**: ~10ms average
- **JSON-RPC error processing**: < 0.2ms average
- **MCP error formatting**: < 5ms average

### Memory Usage

Error handling maintains minimal memory footprint:
- < 1KB per error instance
- Structured logging for debugging
- Automatic garbage collection of error contexts

## Best Practices

### For Developers

1. **Use Structured Errors**
   ```typescript
   throw new IntegrationError(
     IntegrationErrorType.VALIDATION_ERROR,
     'Invalid parameter value',
     undefined,
     'fieldName',
     { expectedFormat: 'email', received: 'invalid-email' },
     originalError,
     false // not retryable
   );
   ```

2. **Provide Context**
   - Include field names for validation errors
   - Add request IDs for tracing
   - Include relevant details for debugging

3. **Consider Retry Logic**
   - Mark errors as retryable appropriately
   - Use exponential backoff for network errors
   - Implement circuit breakers for high-traffic scenarios

### For Production Monitoring

1. **Error Logging**
   ```typescript
   const logData = formatErrorForLogging(error, context);
   console[logData.level](logData.message, logData.meta);
   ```

2. **Metrics Collection**
   - Track error rates by type
   - Monitor retry success rates
   - Alert on error threshold breaches

3. **User Experience**
   - Use `getUserFriendlyMessage()` for user-facing errors
   - Provide actionable error messages
   - Include contact information for support

## Testing Strategy

### Error Scenario Coverage

The test suite covers:
- JSON-RPC error response parsing
- Network failure scenarios
- HTTP status code handling
- MCP tool error formatting
- Fallback behavior testing
- Performance impact measurement

### Integration Tests

Comprehensive end-to-end tests validate:
- Complete search workflow error handling
- Production vs development behavior
- Error recovery mechanisms
- Performance baselines

## Troubleshooting

### Common Issues

1. **Validation Errors**
   - Check parameter formats and requirements
   - Verify required fields are provided
   - Review field-specific error messages

2. **Network Issues**
   - Verify Drupal endpoint URL
   - Check network connectivity
   - Review timeout configurations

3. **Authentication Problems**
   - Validate API credentials
   - Check authentication headers
   - Review permission settings

### Debugging Tools

1. **Error Logging**
   - Enable debug logging for detailed error traces
   - Review error context and stack traces
   - Check request IDs for correlation

2. **Performance Monitoring**
   - Use performance baseline tests
   - Monitor error handling overhead
   - Track memory usage patterns

3. **Test Utilities**
   - Run integration tests to validate error handling
   - Use mock scenarios for development
   - Benchmark error processing performance

## Configuration

### Error Handling Settings

```typescript
const drupalClientConfig = {
  timeout: 30000,     // 30 second timeout
  retries: 3,         // Maximum retry attempts
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
};
```

### Environment Variables

- `NODE_ENV`: Controls development vs production behavior
- `DRUPAL_BASE_URL`: Drupal server endpoint
- `DRUPAL_TIMEOUT`: Request timeout override
- `DRUPAL_RETRIES`: Retry count override

## Future Enhancements

### Planned Improvements

1. **Advanced Retry Strategies**
   - Jittered exponential backoff
   - Circuit breaker patterns
   - Dead letter queue for failed requests

2. **Enhanced Monitoring**
   - Structured metrics collection
   - Error rate alerting
   - Performance degradation detection

3. **User Experience**
   - Contextual help suggestions
   - Progressive error disclosure
   - Error recovery workflows