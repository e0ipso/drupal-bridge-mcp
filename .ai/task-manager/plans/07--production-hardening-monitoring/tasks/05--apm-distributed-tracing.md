---
id: 5
group: 'observability'
dependencies: [3, 4]
status: 'pending'
created: '2025-09-04'
skills: ['apm', 'distributed-tracing']
---

## Objective

Deploy Application Performance Monitoring (APM) and distributed tracing for end-to-end visibility
across MCP → OAuth → JSON-RPC → PostgreSQL request flows.

## Skills Required

- **apm**: Application performance monitoring, error tracking, and performance analysis
- **distributed-tracing**: Request flow tracking across microservices and external APIs

## Acceptance Criteria

- [ ] Sentry integration for error tracking and performance monitoring
- [ ] End-to-end request tracing with correlation IDs
- [ ] Performance metrics collection (response time percentiles, throughput)
- [ ] Database connection and query performance monitoring
- [ ] OAuth flow analytics and token refresh tracking
- [ ] Integration with existing logging and health check infrastructure

Use your internal TODO tool to track these and keep on track.

## Technical Requirements

- Sentry SDK integration with Node.js/TypeScript application
- Distributed tracing spans for all critical operations
- Performance transaction monitoring with custom instrumentation
- Database query performance tracking and connection pool monitoring
- OAuth flow tracing with sensitive data filtering
- Integration with correlation ID system from logging infrastructure

## Input Dependencies

- Logging infrastructure with correlation IDs (Task 3)
- Basic monitoring and health checks (Task 4)

## Output Artifacts

- Sentry APM integration and configuration
- Distributed tracing implementation
- Performance monitoring instrumentation
- Database monitoring hooks
- OAuth flow analytics implementation

## Implementation Notes

Focus on the unique challenges of monitoring long-running MCP connections and OAuth token lifecycle.
Implement sensitive data filtering to prevent token exposure in traces.
