# ADR-004: Technology Stack Selection

## Status

**Accepted** - 2025-09-04

## Context

The Drupalize.me MCP Server requires a robust technology stack that can handle real-time
communication, OAuth authentication flows, and integration with Drupal's JSON-RPC API. The
technology choices must align with the project's core requirements:

- Server-Sent Events (SSE) transport for MCP protocol communication
- OAuth 2.0 Authorization Code Grant flow implementation
- JSON-RPC API client for Drupal integration
- PostgreSQL database connectivity for session management
- Strong type safety for maintainable code
- Active ecosystem support for MCP development

The architectural decision for an
[LLM-Free Server Architecture (ADR-001)](./ADR-001-llm-free-server-architecture.md) eliminates the
need for additional LLM SDK integrations, simplifying the technology requirements.

## Decision

**Primary Stack: Node.js with TypeScript**

The MCP server will be built using Node.js runtime with TypeScript for type safety and enhanced
developer experience.

### Core Runtime & Language

- **Node.js**: JavaScript runtime environment
- **TypeScript**: Typed superset of JavaScript for enhanced reliability

### Framework & Protocol Support

- **Express.js**: Web framework for HTTP server and OAuth callback handling
- **@anthropic/server-sdk**: Official MCP SDK for protocol implementation
- **eventsource**: Server-Sent Events implementation
- **node-jsonrpc-client**: JSON-RPC 2.0 client for Drupal communication

### Database & Authentication

- **pg**: PostgreSQL client for session storage
- **jose**: JWT and OAuth token handling
- **bcrypt**: Secure token hashing

## Rationale

### Why Node.js?

1. **MCP SDK Ecosystem**: Anthropic's official MCP SDKs have first-class Node.js support
2. **SSE Native Support**: Excellent built-in support for Server-Sent Events
3. **JSON-First**: Native JSON handling aligns perfectly with JSON-RPC API communication
4. **OAuth Libraries**: Mature OAuth 2.0 client libraries available
5. **PostgreSQL Integration**: Well-established database connectivity options
6. **Async I/O**: Event-driven architecture suits real-time MCP communication patterns
7. **Rapid Development**: Fast iteration for MVP development and testing

### Why TypeScript?

1. **Type Safety**: Prevents common runtime errors in API integrations
2. **MCP Protocol Typing**: Strong typing for MCP message structures and validation
3. **OAuth Flow Safety**: Type-safe implementation of complex authentication flows
4. **Refactoring Support**: Safe code changes as architecture evolves
5. **IDE Experience**: Enhanced autocomplete and error detection
6. **Team Collaboration**: Self-documenting code through type definitions
7. **Ecosystem Alignment**: Most modern Node.js MCP examples use TypeScript

## Consequences

### Positive Consequences

**Development Velocity**

- Rapid prototyping with familiar JavaScript ecosystem
- Rich package ecosystem for all integration needs
- Hot reloading and fast development cycles
- Extensive tooling support for debugging and testing

**Runtime Performance**

- Efficient I/O handling for concurrent OAuth flows
- Low memory footprint suitable for cloud deployment
- Fast JSON processing for API communication
- Non-blocking operations for real-time MCP communication

**Maintenance & Operations**

- Single language across entire server codebase
- Familiar deployment patterns for Node.js applications
- Strong community support and documentation
- Easy integration with monitoring and logging tools

### Negative Consequences

**Language Limitations**

- JavaScript's dynamic nature requires careful type checking
- Single-threaded execution (mitigated by async/await patterns)
- Dependency management complexity with npm/yarn

**Performance Considerations**

- CPU-intensive operations may require worker threads
- Memory usage can grow with poor coding practices
- Garbage collection pauses (minimal for typical MCP workloads)

### Mitigation Strategies

- **TypeScript Configuration**: Strict type checking to catch errors early
- **Code Quality**: ESLint and Prettier for consistent code style
- **Testing Strategy**: Comprehensive unit and integration testing
- **Performance Monitoring**: Application metrics and profiling tools
- **Security Practices**: Regular dependency updates and security audits

## Alternatives Considered

### Alternative 1: Python with FastAPI

**Description**: Python-based server using FastAPI framework **Rejected Because**:

- Limited MCP SDK support compared to Node.js ecosystem
- SSE implementation less mature than Node.js
- OAuth client libraries not as robust for complex flows
- Deployment complexity higher for simple MCP server needs
- Team expertise strongly favors Node.js/TypeScript stack

### Alternative 2: Go

**Description**: Go-based server with Gin or native HTTP server **Rejected Because**:

- MCP SDK ecosystem primarily focuses on Node.js and Python
- Additional development time required for JSON-RPC client implementation
- Less flexibility for rapid iteration during MVP development
- Team learning curve would delay initial delivery
- OAuth library ecosystem less mature than Node.js

### Alternative 3: Java with Spring Boot

**Description**: Java-based server using Spring Boot framework **Rejected Because**:

- Significantly higher resource usage for simple MCP server
- Longer development cycles not suitable for MVP approach
- No official MCP SDK support for Java ecosystem
- Complex deployment requirements compared to Node.js
- Overkill for the scope of required functionality

### Alternative 4: Deno/TypeScript

**Description**: Deno runtime with native TypeScript support **Rejected Because**:

- MCP SDK primarily targets Node.js ecosystem
- Less mature package ecosystem for OAuth and database clients
- Deployment complexity higher than standard Node.js
- Team familiarity with Node.js provides better velocity
- Potential compatibility issues with existing tooling

## Implementation Notes

### Development Environment

```bash
# Required versions
node: >=18.0.0
npm: >=8.0.0
typescript: ^5.0.0
```

### Key Dependencies Structure

```json
{
  "dependencies": {
    "@anthropic/server-sdk": "^1.0.0",
    "express": "^4.18.0",
    "pg": "^8.8.0",
    "jose": "^4.11.0",
    "eventsource": "^2.0.2"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^18.0.0",
    "@types/express": "^4.17.0",
    "@types/pg": "^8.6.0"
  }
}
```

### Build Configuration

```typescript
// tsconfig.json targeting Node.js environment
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src"
  }
}
```

## Related ADRs

- [ADR-001: LLM-Free Server Architecture](./ADR-001-llm-free-server-architecture.md) - Eliminated
  need for LLM SDK dependencies
- [ADR-002: JSON-RPC Direct Markdown Transformation](./ADR-002-json-rpc-markdown-transformation.md) -
  Requires robust JSON-RPC client
- [ADR-003: OAuth 2.0 Authentication Strategy](./ADR-003-oauth-authentication-strategy.md) -
  Requires OAuth 2.0 client libraries
- [ADR-005: Development Tooling Choices](./ADR-005-development-tooling-choices.md) - Tooling stack
  built around Node.js/TypeScript
