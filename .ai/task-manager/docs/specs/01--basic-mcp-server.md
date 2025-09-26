# 01: Basic MCP Server Foundation

## Overview
Establish the foundational **MCP Server** with HTTP streamable transport, providing the core infrastructure for all subsequent features. This phase creates a working **MCP Server** that can accept connections from **MCP Clients** and handle basic protocol communications.

## User-Facing Features
- **HTTP-based MCP Server**: A remote **MCP Server** accessible via HTTP protocol that **MCP Clients** can connect to
- **Session Management**: Automatic session creation and management for each **MCP Client** connection
- **CORS Support**: Proper cross-origin resource sharing configuration for browser-based **MCP Clients**
- **DNS Rebinding Protection**: Security feature preventing unauthorized **MCP Client** access attempts

## Functional Capabilities
- Accept **MCP Client** connections over HTTP
- Generate unique session identifiers for each **MCP Client** connection
- Handle JSON-RPC 2.0 protocol messages from **MCP Clients**
- Support both request/response and server-sent events for **MCP Client** communication
- Maintain persistent connections with **MCP Clients**

## Technical Stack Requirements

### Core Dependencies
- **@modelcontextprotocol/sdk**: Official MCP SDK providing protocol implementation
- **express**: HTTP server framework
- **zod**: Schema validation library
- **TypeScript**: Type-safe development environment

### Node.js Requirements
- Node.js 18+ (for native crypto support)
- ES2022 target compilation

### Database Requirements
- **None Required**: The **MCP Server** operates entirely with in-memory session management. All session data, including encrypted tokens and user state, is stored temporarily in **MCP Server** memory for the duration of the **MCP Client** connection. This eliminates database dependencies, reduces complexity, and ensures automatic cleanup when **MCP Client** sessions end.

## Success Criteria
- **MCP Server** starts and listens on configured port
- Can accept connections from **MCP Clients**
- **MCP Client** sessions are properly initialized with unique IDs
- Basic health check endpoint responds correctly to **MCP Client** requests
- Compatible with MCP Inspector for **MCP Server** validation

## Relevant Resources
- [MCP Specification](https://modelcontextprotocol.io/docs/specification)
- [TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Transport Documentation](https://modelcontextprotocol.io/docs/concepts/transports)
- [MCP Inspector](https://github.com/modelcontextprotocol/inspector)