---
id: 3
group: "dependencies"
dependencies: [1]
status: "completed"
created: "2025-09-04"
completed: "2025-09-04"
skills: ["nodejs"]
---

## Objective
Install and configure all essential dependencies required for the MCP server including the MCP Protocol SDK, OAuth 2.0 client libraries, PostgreSQL client, HTTP/SSE server capabilities, and JSON-RPC client for Drupal integration.

## Skills Required
- **nodejs**: Package management, dependency installation, version compatibility management

## Acceptance Criteria
- [ ] MCP Protocol SDK installed and configured (`@modelcontextprotocol/sdk`)
- [ ] OAuth 2.0 client libraries installed for Drupal authentication integration
- [ ] PostgreSQL client installed with TypeScript definitions (`pg`, `@types/pg`)
- [ ] HTTP/SSE server dependencies installed for MCP transport layer
- [ ] JSON-RPC client library installed for Drupal API communication
- [ ] All development dependencies installed and configured
- [ ] Package versions are compatible and pinned appropriately
- [ ] Dependencies support the target Node.js version (v18+)

Use your internal TODO tool to track these and keep on track.

## Technical Requirements
- **MCP Server Core**: `@modelcontextprotocol/sdk` (latest stable version)
- **Authentication**: OAuth 2.0 client libraries compatible with Drupal Simple OAuth
- **Database**: `pg` for PostgreSQL with connection pooling capabilities
- **Transport Layer**: HTTP server with Server-Sent Events support
- **API Integration**: JSON-RPC client for Drupal communication
- **Type Safety**: Corresponding TypeScript definition packages
- **Development Tools**: Build tools, testing utilities, type checking

## Input Dependencies
- Completed project foundation from Task 1
- `package.json` configured and ready for dependency installation
- TypeScript configuration established

## Output Artifacts
- Updated `package.json` with all production and development dependencies
- `package-lock.json` with locked dependency versions
- Node.js modules installed in `node_modules/`
- TypeScript types available for all major dependencies
- Compatibility matrix documented for dependency versions

## Implementation Notes
- Install MCP SDK first as it's the core dependency
- Choose OAuth 2.0 client compatible with Authorization Code Grant flow
- Use `pg` with connection pooling configuration options
- Select HTTP server framework that supports SSE (Server-Sent Events)
- Install JSON-RPC client that supports async/await patterns
- Pin major versions to avoid unexpected breaking changes
- Include @types packages for all dependencies lacking built-in TypeScript support
- Consider using `npm ci` for reproducible installs in CI/CD environments