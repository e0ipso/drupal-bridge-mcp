---
id: 3
group: 'http-transport'
dependencies: [2]
status: 'pending'
created: '2025-09-29'
skills:
  - 'express'
  - 'http-security'
complexity_score: 6.0
complexity_notes:
  'Complexity score 6.0 at decomposition threshold. Kept as single task due to tight integration of
  HTTP transport, security, and session features in minimal server implementation.'
---

# HTTP Transport with Security Features

## Objective

Implement HTTP streamable transport layer using Express.js with comprehensive security features
including CORS, session management, Server-Sent Events, DNS rebinding protection, and origin
validation.

## Skills Required

- **express**: Build HTTP server with routing, middleware, and streaming capabilities
- **http-security**: Implement CORS, origin validation, DNS rebinding protection, and secure session
  management

## Acceptance Criteria

- [ ] Express.js HTTP server listening on configured port (default 3000)
- [ ] HTTP POST endpoint for JSON-RPC message handling
- [ ] Server-Sent Events (SSE) support for streaming communications
- [ ] CORS configuration for browser-based MCP clients
- [ ] Unique session ID generation and in-memory session management
- [ ] DNS rebinding protection implemented
- [ ] Origin header validation for security
- [ ] Session cleanup and timeout mechanisms
- [ ] Integration with core MCP server from Task 2

## Technical Requirements

- Use Express.js framework as specified in plan requirements
- Implement both single HTTP responses and SSE streaming as per MCP specification
- Generate cryptographically secure session IDs using Node.js native crypto
- Support localhost binding with proper security measures
- Handle both GET and POST requests according to MCP HTTP transport spec
- Implement session timeout and memory cleanup to prevent leaks
- Follow MCP specification security guidelines exactly

## Input Dependencies

- Core MCP server implementation from Task 2
- Project structure and TypeScript configuration from Task 1

## Output Artifacts

- Complete HTTP transport layer that accepts MCP client connections
- Secure session management system with cleanup mechanisms
- Ready for MCP Inspector validation and testing

## Implementation Notes

<details>
<summary>Detailed Implementation Instructions</summary>

1. **Express Server Setup:**

   ```typescript
   import express from 'express';
   import { randomBytes } from 'crypto';

   const app = express();
   app.use(express.json({ limit: '10mb' }));
   ```

2. **CORS Configuration:**
   - Configure CORS middleware for browser-based clients
   - Allow appropriate origins for development and production
   - Set proper headers for preflight requests
   - Consider security implications of origin policies

3. **Session Management:**
   - Generate unique session IDs using `crypto.randomBytes()`
   - Implement in-memory session storage with Map or similar
   - Add session timeout mechanisms (default 30 minutes)
   - Implement session cleanup to prevent memory leaks
   - Session ID format: visible ASCII characters only per MCP spec

4. **HTTP Endpoints:**
   - POST endpoint for JSON-RPC message handling
   - GET endpoint for Server-Sent Events streaming
   - Health check endpoint for connection validation
   - Proper error handling and HTTP status codes

5. **Server-Sent Events Implementation:**
   - SSE endpoint for streaming MCP communications
   - Proper SSE headers and formatting
   - Connection management and cleanup
   - Support for message resumability with event IDs

6. **Security Features:**
   - **DNS Rebinding Protection**: Validate Host header against allowed values
   - **Origin Validation**: Check Origin header for legitimate sources
   - **Localhost Binding**: Ensure server binds only to localhost interface
   - **Request Validation**: Sanitize and validate all incoming requests

7. **Integration with MCP Server:**
   - Route HTTP requests to MCP server message handlers
   - Handle MCP protocol responses appropriately
   - Support both streaming and non-streaming response patterns
   - Maintain session context throughout request lifecycle

8. **Memory Management:**
   - Implement session cleanup intervals
   - Monitor memory usage patterns
   - Handle connection timeouts gracefully
   - Prevent memory leaks from abandoned sessions

9. **Error Handling:**
   - HTTP error responses for malformed requests
   - JSON-RPC error formatting
   - Connection error handling
   - Graceful server shutdown procedures

10. **Configuration Integration:**
    - Use environment variables from .env file
    - Support port configuration (default 3000)
    - Integrate with existing npm scripts
    - Maintain compatibility with .mcp.json configuration

</details>
