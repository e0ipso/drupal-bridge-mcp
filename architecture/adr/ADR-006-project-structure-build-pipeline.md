# ADR-006: Project Structure and Build Pipeline Design

## Status

**Accepted** - 2025-09-04

## Context

The Drupalize.me MCP Server requires a well-organized project structure and efficient build pipeline
to support:

- **TypeScript Compilation**: Source transformation for production deployment
- **Development Workflow**: Hot reloading and watch mode for rapid iteration
- **Testing Integration**: Clear separation of test files and utilities
- **Deployment Preparation**: Optimized builds for cloud platforms (Railway)
- **Module Organization**: Logical grouping of MCP protocol, OAuth, and database components
- **Configuration Management**: Environment-specific settings and secrets
- **Asset Management**: Static files, schemas, and documentation

Building on the [Technology Stack Selection (ADR-004)](./ADR-004-technology-stack-selection.md) and
[Development Tooling Choices (ADR-005)](./ADR-005-development-tooling-choices.md), the structure
must accommodate Node.js/TypeScript with ESLint, Prettier, and Jest integration.

## Decision

**Project Structure: Domain-Driven Component Organization**

### Directory Structure

```
/
├── src/                          # TypeScript source code
│   ├── index.ts                 # Application entry point
│   ├── server.ts                # Express server setup
│   ├── mcp/                     # MCP protocol implementation
│   │   ├── server.ts           # MCP server logic
│   │   ├── tools/              # MCP tool implementations
│   │   ├── resources/          # MCP resource handlers
│   │   └── transport/          # SSE transport layer
│   ├── auth/                    # OAuth authentication
│   │   ├── manager.ts          # OAuth flow management
│   │   ├── tokens.ts           # Token handling utilities
│   │   └── middleware.ts       # Express middleware
│   ├── drupal/                  # Drupal JSON-RPC integration
│   │   ├── client.ts           # JSON-RPC client
│   │   └── types.ts            # Drupal API type definitions
│   ├── database/                # PostgreSQL integration
│   │   ├── connection.ts       # Database connection
│   │   ├── models/             # Data models
│   │   └── migrations/         # Database schema management
│   ├── config/                  # Configuration management
│   │   ├── environment.ts      # Environment variable handling
│   │   └── constants.ts        # Application constants
│   ├── utils/                   # Shared utilities
│   │   ├── logger.ts           # Logging configuration
│   │   ├── errors.ts           # Custom error classes
│   │   └── validation.ts       # Input validation helpers
│   └── types/                   # TypeScript type definitions
│       ├── mcp.ts              # MCP protocol types
│       ├── auth.ts             # Authentication types
│       └── global.ts           # Global type definitions
├── tests/                       # Test files
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   ├── fixtures/               # Test data
│   └── helpers/                # Test utilities
├── dist/                        # Compiled JavaScript (git ignored)
├── docs/                        # Project documentation
├── scripts/                     # Build and utility scripts
├── .husky/                      # Git hooks
├── config files                 # Root-level configuration
└── deployment files             # Docker, Railway, etc.
```

### Build Pipeline: Multi-Stage Development and Production

**Development Pipeline**

```bash
npm run dev
├── TypeScript compilation (watch mode)
├── Nodemon process monitoring
├── ESLint real-time checking
└── Jest test runner (optional watch)
```

**Production Pipeline**

```bash
npm run build && npm start
├── TypeScript compilation (optimized)
├── Asset bundling and minification
├── Environment validation
└── Production server startup
```

## Rationale

### Why Domain-Driven Structure?

1. **Clear Separation of Concerns**: Each directory has a single responsibility
2. **MCP Protocol Organization**: Dedicated namespace for protocol-specific logic
3. **Authentication Isolation**: OAuth flows separated from core business logic
4. **Database Abstraction**: Clean data layer separation
5. **Testing Alignment**: Test structure mirrors source organization
6. **Scalability**: Easy to add new domains without restructuring

### Why Multi-Stage Build Pipeline?

1. **Development Efficiency**: Watch mode enables rapid iteration
2. **Production Optimization**: Separate optimized builds for deployment
3. **Error Detection**: Multiple stages catch different classes of issues
4. **Deployment Flexibility**: Different targets (Railway, Docker, local)
5. **Debugging Support**: Source maps and development tooling integration

### Why TypeScript Module Resolution Strategy?

1. **Absolute Imports**: Reduces relative path complexity (`../../../`)
2. **Barrel Exports**: Clean public APIs for each module
3. **Type Safety**: Compile-time verification of module boundaries
4. **Refactoring Support**: Safe module reorganization with TypeScript
5. **IDE Integration**: Better autocomplete and navigation

## Consequences

### Positive Consequences

**Developer Experience**

- Clear mental model of codebase organization
- Fast development cycles with hot reloading
- Predictable file locations for debugging
- Consistent import patterns across modules
- Easy onboarding for new contributors

**Maintenance Benefits**

- Isolated changes reduce merge conflicts
- Clear ownership boundaries for code review
- Easy to locate bugs within specific domains
- Safe refactoring with TypeScript compilation checks
- Modular testing enables focused debugging

**Deployment Advantages**

- Optimized production builds for cloud platforms
- Environment-specific configuration management
- Clear separation of build artifacts from source
- Docker-friendly structure for containerization
- CI/CD pipeline integration points clearly defined

### Negative Consequences

**Initial Complexity**

- More directories to understand initially
- Additional configuration for module resolution
- Build pipeline adds development dependency overhead
- Multiple entry points for different environments

**Maintenance Overhead**

- Module boundaries need ongoing discipline
- Import paths require consistent management
- Build configuration updates affect multiple stages
- Testing structure must stay aligned with source structure

### Mitigation Strategies

- **Documentation**: Clear README with project structure explanation
- **Path Mapping**: TypeScript path mapping for clean imports
- **Linting Rules**: ESLint rules to enforce import patterns
- **Templates**: Code generation templates for new modules
- **CI/CD Validation**: Automated checks for structure compliance

## Alternatives Considered

### Alternative 1: Flat File Structure

**Description**: All source files in single `src/` directory **Rejected Because**:

- Becomes unwieldy as MCP server features expand
- Difficult to maintain module boundaries
- Testing organization becomes unclear
- No clear ownership for different domains (auth, MCP, database)

### Alternative 2: Feature-Based Structure

**Description**: Organize by features like `search/`, `auth/`, `content/` **Rejected Because**:

- MCP protocol spans multiple features creating confusion
- OAuth authentication is cross-cutting concern
- Database models serve multiple features
- Doesn't align well with MCP server architecture patterns

### Alternative 3: Layered Architecture

**Description**: Organize by technical layers like `controllers/`, `services/`, `repositories/`
**Rejected Because**:

- MCP server doesn't follow traditional web app patterns
- Protocol-specific logic doesn't fit layer model well
- Authentication flows cross multiple layers
- TypeScript modules work better with domain organization

### Alternative 4: Monorepo with Packages

**Description**: Separate npm packages for auth, MCP, database **Rejected Because**:

- Overkill for single MCP server application
- Adds deployment complexity
- TypeScript compilation becomes more complex
- Team size doesn't justify package overhead

### Alternative 5: Framework-Specific Structure

**Description**: Follow Express.js or Fastify conventions **Rejected Because**:

- MCP protocol is primary concern, not HTTP framework
- Authentication flows don't fit traditional web app structure
- Would obscure MCP-specific organization needs
- TypeScript benefits are reduced with framework conventions

## Implementation Notes

### TypeScript Path Mapping

```json
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/mcp/*": ["mcp/*"],
      "@/auth/*": ["auth/*"],
      "@/drupal/*": ["drupal/*"],
      "@/database/*": ["database/*"],
      "@/utils/*": ["utils/*"],
      "@/types/*": ["types/*"],
      "@/config/*": ["config/*"]
    }
  }
}
```

### Barrel Exports Pattern

```typescript
// src/mcp/index.ts
export { MCPServer } from './server';
export { SearchTool } from './tools/search';
export * from './types';

// src/auth/index.ts
export { OAuthManager } from './manager';
export { authMiddleware } from './middleware';
export * from './types';
```

### Build Scripts Configuration

```json
{
  "scripts": {
    "dev": "concurrently \"tsc -w\" \"nodemon dist/index.js\"",
    "build": "tsc --project tsconfig.prod.json",
    "build:dev": "tsc",
    "start": "node dist/index.js",
    "start:dev": "tsx src/index.ts",
    "clean": "rimraf dist",
    "prebuild": "npm run clean && npm run lint",
    "postbuild": "npm run test",
    "type-check": "tsc --noEmit"
  }
}
```

### Environment Configuration Structure

```typescript
// src/config/environment.ts
export const config = {
  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || '0.0.0.0',
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/mcp',
  },
  oauth: {
    clientId: process.env.OAUTH_CLIENT_ID!,
    clientSecret: process.env.OAUTH_CLIENT_SECRET!,
    redirectUri: process.env.OAUTH_REDIRECT_URI!,
  },
  drupal: {
    baseUrl: process.env.DRUPAL_BASE_URL || 'https://drupalize.me',
  },
};
```

### Test Structure Alignment

```
tests/
├── unit/
│   ├── mcp/           # Tests for src/mcp/
│   ├── auth/          # Tests for src/auth/
│   ├── drupal/        # Tests for src/drupal/
│   └── database/      # Tests for src/database/
├── integration/
│   ├── oauth-flow.test.ts
│   ├── mcp-protocol.test.ts
│   └── drupal-api.test.ts
└── fixtures/
    ├── mcp-messages.json
    ├── drupal-responses.json
    └── oauth-tokens.json
```

## Related ADRs

- [ADR-004: Technology Stack Selection](./ADR-004-technology-stack-selection.md) -
  TypeScript/Node.js foundation
- [ADR-005: Development Tooling Choices](./ADR-005-development-tooling-choices.md) - Build tool
  integration
- [ADR-001: LLM-Free Server Architecture](./ADR-001-llm-free-server-architecture.md) - Influences
  module organization
- [ADR-003: OAuth 2.0 Authentication Strategy](./ADR-003-oauth-authentication-strategy.md) -
  Authentication module structure
