# MCP Protocol Integration Test Suite

This directory contains comprehensive integration tests for the MCP (Model Context Protocol) server implementation. The tests validate end-to-end functionality across all system components and critical workflows.

## Test Structure

### Core Integration Tests

- **`mcp-protocol-integration.test.ts`** - Main end-to-end MCP protocol communication tests
- **`sse-transport-lifecycle.test.ts`** - SSE connection lifecycle and management tests
- **`tool-registry-workflow.test.ts`** - Tool registration, discovery, and invocation tests
- **`json-rpc-backend-integration.test.ts`** - JSON-RPC backend communication tests
- **`error-handling-recovery.test.ts`** - Comprehensive error handling and recovery tests
- **`performance-benchmarks.test.ts`** - Performance validation against specified criteria

### Test Utilities

- **`test-utils.ts`** - Shared utilities, mocks, and helpers for integration tests

## Performance Criteria Validation

The integration tests validate against these performance requirements:

- **SSE Connection Establishment**: < 100ms
- **Protocol Message Processing**: < 10ms per message  
- **Tool Registration Operations**: < 50ms
- **JSON-RPC Request/Response Cycle**: < 200ms (excluding backend processing)
- **Error Handling Overhead**: < 5ms per request

## Running the Tests

```bash
# Run all integration tests
npm run test:integration

# Run specific test suite
npm test tests/integration/mcp-protocol-integration.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## Test Categories

### 1. Server Startup and Health (`mcp-protocol-integration.test.ts`)
- Server initialization and health checks
- API endpoint availability
- Basic server functionality

### 2. SSE Connection Lifecycle (`sse-transport-lifecycle.test.ts`)
- Connection establishment and cleanup
- Heartbeat mechanism validation
- Connection limit enforcement
- Concurrent connection handling

### 3. Protocol Message Processing (`mcp-protocol-integration.test.ts`)
- JSON-RPC message parsing and validation
- Protocol method handling
- Request/response correlation
- Concurrent message processing

### 4. Tool Registry Workflows (`tool-registry-workflow.test.ts`)
- Tool registration and validation
- Tool discovery and search
- Parameter validation
- Tool invocation lifecycle
- Concurrent operations

### 5. JSON-RPC Backend Integration (`json-rpc-backend-integration.test.ts`)
- Single and batch request handling
- Connection pool management
- Retry logic and error recovery
- Health monitoring
- Request correlation tracking

### 6. Error Handling and Recovery (`error-handling-recovery.test.ts`)
- Network failure scenarios
- Protocol error handling
- Resource exhaustion recovery
- System resilience validation
- Edge case handling

### 7. Performance Benchmarks (`performance-benchmarks.test.ts`)
- Connection performance validation
- Message processing throughput
- Tool operation efficiency
- System scalability testing
- Load testing scenarios

## Test Philosophy

The integration tests follow the "write a few tests, mostly integration" philosophy:

### What IS Tested
- **Custom business logic** specific to the MCP implementation
- **Critical user workflows** and system integration points
- **Performance characteristics** under various load conditions
- **Error recovery scenarios** and system resilience
- **Protocol compliance** with MCP specifications

### What is NOT Tested
- Third-party library functionality (already tested upstream)
- Basic framework features (Express, Jest, etc.)
- Simple CRUD operations without custom logic
- Configuration file parsing
- Trivial getter/setter methods

## Mock Strategy

The tests use targeted mocking to isolate the system under test while maintaining realistic integration scenarios:

- **SSE Transport**: Custom MockEventSource for realistic connection simulation
- **HTTP Requests**: axios-mock-adapter for controlled response simulation  
- **Database**: In-memory implementations for fast, isolated tests
- **External Services**: Mock implementations that simulate realistic behavior

## Performance Testing

Performance tests validate that the system meets specified performance criteria:

```typescript
const PERFORMANCE_THRESHOLDS = {
  SSE_CONNECTION: 100,      // < 100ms
  MESSAGE_PROCESSING: 10,   // < 10ms per message
  TOOL_REGISTRATION: 50,    // < 50ms
  JSON_RPC_CYCLE: 200,      // < 200ms
  ERROR_HANDLING: 5         // < 5ms per request
};
```

Tests measure actual performance and fail if thresholds are exceeded, ensuring the system maintains acceptable performance characteristics.

## Error Scenario Coverage

Error handling tests cover:

- **Network failures**: Connection drops, timeouts, unreachable services
- **Protocol errors**: Malformed messages, unknown methods, invalid parameters
- **Resource exhaustion**: Connection limits, memory pressure, rate limiting
- **System recovery**: Graceful degradation, error recovery, service restoration

## Test Data and Fixtures

Tests use generated test data to ensure coverage of various scenarios:

- **Dynamic tool generation** for registry testing
- **Parameterized test cases** for protocol validation
- **Load testing data** for performance validation
- **Error condition simulation** for resilience testing

## Continuous Integration

The integration tests are designed to run reliably in CI environments:

- **Fast execution**: Optimized for quick feedback
- **Deterministic behavior**: No flaky or random failures
- **Resource efficient**: Minimal external dependencies
- **Clear reporting**: Detailed performance and failure reporting

## Contributing

When adding new integration tests:

1. Follow the existing test structure and naming conventions
2. Include performance validation where applicable
3. Test both success and error scenarios
4. Add appropriate documentation and comments
5. Ensure tests are deterministic and reliable
6. Update this README if adding new test categories

## Test Maintenance

- **Regular performance baseline updates** as the system evolves
- **Mock updates** to reflect changes in external dependencies
- **Test data refresh** to cover new scenarios and edge cases
- **CI optimization** to maintain fast feedback cycles