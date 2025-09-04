# ADR-005: Development Tooling Choices

## Status
**Accepted** - 2025-09-04

## Context

The Drupalize.me MCP Server requires a comprehensive development tooling stack to ensure code quality, consistency, and maintainability across the development lifecycle. Key requirements include:

- **Code Quality**: Static analysis and formatting for TypeScript/Node.js codebase
- **Git Workflow**: Pre-commit hooks to prevent broken code from entering repository
- **Testing Framework**: Unit and integration testing for MCP protocol implementation
- **Build Process**: TypeScript compilation with watch mode for development
- **Security**: Dependency vulnerability scanning and secret detection
- **Team Collaboration**: Consistent code style and automated formatting

The project follows the [Technology Stack Selection (ADR-004)](./ADR-004-technology-stack-selection.md) using Node.js/TypeScript, requiring tooling optimized for this environment.

## Decision

**Core Development Tooling Stack**

### Code Quality & Formatting
- **ESLint**: TypeScript linting with @typescript-eslint ruleset
- **Prettier**: Code formatting with consistent style rules
- **@typescript-eslint/eslint-plugin**: TypeScript-specific linting rules
- **eslint-config-prettier**: Prettier integration with ESLint

### Git Workflow Automation
- **Husky**: Git hooks management for pre-commit automation
- **lint-staged**: Run linters only on staged files for performance
- **commitizen**: Standardized commit message format
- **@commitlint/config-conventional**: Conventional commit validation

### Testing Framework
- **Jest**: Testing framework with TypeScript support
- **@types/jest**: TypeScript definitions for Jest
- **ts-jest**: TypeScript preprocessor for Jest
- **supertest**: HTTP assertion testing for MCP endpoints

### Build & Development
- **tsx**: TypeScript execution for development (replaces ts-node)
- **nodemon**: File watching for automatic restarts
- **concurrently**: Run multiple npm scripts in parallel

## Rationale

### Why ESLint + @typescript-eslint?

1. **TypeScript-Native**: Purpose-built for TypeScript codebases
2. **MCP Protocol Safety**: Catch type errors in message handling
3. **OAuth Flow Protection**: Validate security-sensitive authentication code
4. **Extensible Rules**: Custom rules for project-specific patterns
5. **IDE Integration**: Real-time error detection during development
6. **Team Standards**: Enforced coding standards across contributors

### Why Prettier?

1. **Zero Configuration**: Opinionated formatting reduces bike-shedding
2. **Editor Integration**: Automatic formatting on save
3. **Team Consistency**: Eliminates style-related code review comments
4. **TypeScript Support**: Properly handles TypeScript syntax formatting
5. **Git Diff Clarity**: Consistent formatting improves code review process

### Why Husky + lint-staged?

1. **Quality Gate**: Prevents broken code from entering repository
2. **Performance**: Only processes changed files for speed
3. **Automation**: Reduces manual steps in development workflow  
4. **Security**: Pre-commit secret scanning and vulnerability checks
5. **Team Compliance**: Ensures all contributors follow quality standards

### Why Jest?

1. **TypeScript Native**: Excellent TypeScript support with ts-jest
2. **MCP Testing**: Built-in mocking perfect for protocol testing
3. **Async Support**: Handles OAuth flows and database operations well
4. **Snapshot Testing**: Useful for API response validation
5. **Coverage Reports**: Built-in code coverage analysis
6. **Ecosystem**: Large plugin ecosystem for specialized testing needs

## Consequences

### Positive Consequences

**Code Quality Improvements**
- Consistent code style across entire codebase
- Early detection of TypeScript type errors
- Automated security vulnerability scanning
- Standardized commit message format for better changelog generation

**Development Velocity**
- Automatic code formatting eliminates manual styling
- Pre-commit automation catches issues before CI/CD
- Hot reload during development with tsx and nodemon
- Parallel script execution speeds up build processes

**Team Collaboration**
- Reduced code review time on style-related issues
- Consistent development environment across contributors
- Automated enforcement of project standards
- Clear contribution guidelines through tooling

### Negative Consequences

**Initial Setup Complexity**
- Multiple configuration files to maintain
- Learning curve for contributors unfamiliar with tools
- Potential conflicts between ESLint and Prettier rules
- Pre-commit hook failures can block quick fixes

**Development Overhead**
- Pre-commit hooks add time to commit process
- Linting errors can interrupt development flow
- Additional dependencies increase project complexity
- Tool updates may require configuration changes

### Mitigation Strategies

- **Configuration Management**: Use shared configs to reduce boilerplate
- **Documentation**: Clear setup instructions and troubleshooting guides
- **Gradual Adoption**: Introduce tools incrementally during development
- **Override Mechanisms**: Provide escape hatches for urgent fixes
- **Tool Updates**: Regular maintenance schedule for dependency updates

## Alternatives Considered

### Alternative 1: Standard.js
**Description**: Zero-configuration JavaScript/TypeScript linting
**Rejected Because**: 
- Less flexibility for project-specific rules needed for MCP protocol
- Limited TypeScript support compared to @typescript-eslint
- Cannot customize rules for OAuth security requirements
- Team preference for explicit configuration over conventions

### Alternative 2: Biome
**Description**: All-in-one formatter and linter
**Rejected Because**:
- Less mature ecosystem compared to ESLint + Prettier combination
- Limited plugin ecosystem for specialized MCP/OAuth linting
- TypeScript support still evolving
- Team familiarity with ESLint/Prettier provides better velocity

### Alternative 3: TSLint (Deprecated)
**Description**: TypeScript-specific linter (now deprecated)
**Rejected Because**:
- Officially deprecated in favor of ESLint + @typescript-eslint
- No longer maintained or updated
- Migration path leads to current chosen solution
- Security and compatibility concerns with unmaintained tools

### Alternative 4: Mocha + Chai
**Description**: Alternative testing framework combination
**Rejected Because**:
- More configuration required compared to Jest's batteries-included approach
- Less integrated TypeScript support
- Additional assertion library dependency (Chai)
- Jest's mocking capabilities better suited for MCP protocol testing

### Alternative 5: Simple Git Hooks
**Description**: Basic pre-commit hooks without Husky
**Rejected Because**:
- Manual setup required for each contributor
- No cross-platform compatibility guarantees  
- Difficult to maintain and update across team
- Missing integration with package.json workflow

## Implementation Notes

### ESLint Configuration
```json
{
  "extends": [
    "@typescript-eslint/recommended",
    "@typescript-eslint/recommended-requiring-type-checking",
    "prettier"
  ],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module",
    "project": "./tsconfig.json"
  },
  "rules": {
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "warn",
    "prefer-const": "error"
  }
}
```

### Prettier Configuration
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

### Husky + lint-staged Setup
```json
{
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md}": [
      "prettier --write"
    ]
  }
}
```

### Jest Configuration
```json
{
  "preset": "ts-jest",
  "testEnvironment": "node",
  "roots": ["<rootDir>/src", "<rootDir>/tests"],
  "testMatch": [
    "**/__tests__/**/*.ts",
    "**/?(*.)+(spec|test).ts"
  ],
  "collectCoverageFrom": [
    "src/**/*.ts",
    "!src/**/*.d.ts"
  ]
}
```

### Package.json Scripts
```json
{
  "scripts": {
    "dev": "concurrently \"tsc -w\" \"nodemon dist/index.js\"",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "jest",
    "test:watch": "jest --watch",
    "lint": "eslint src/**/*.ts",
    "lint:fix": "eslint src/**/*.ts --fix",
    "format": "prettier --write src/**/*.ts",
    "prepare": "husky install"
  }
}
```

## Related ADRs
- [ADR-004: Technology Stack Selection](./ADR-004-technology-stack-selection.md) - Provides Node.js/TypeScript foundation
- [ADR-006: Project Structure and Build Pipeline Design](./ADR-006-project-structure-build-pipeline.md) - Build process integration
- [ADR-001: LLM-Free Server Architecture](./ADR-001-llm-free-server-architecture.md) - Influences testing strategies for protocol interactions