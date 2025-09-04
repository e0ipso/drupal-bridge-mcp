# Contributing to Drupalize.me MCP Server

Thank you for your interest in contributing to the Drupalize.me MCP Server! This document provides comprehensive guidelines for contributing to the project.

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow. By participating, you are expected to uphold this code. Please report unacceptable behavior to the project maintainers.

## Getting Started

### Prerequisites

Before contributing, ensure you have:
- **Node.js** 18.0.0 or higher
- **npm** (comes with Node.js)
- **Git** for version control
- **PostgreSQL** for testing (optional, can use Docker)
- A **GitHub account** for submitting contributions

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mcp-server.git
   cd mcp-server
   ```

3. **Add upstream remote**:
   ```bash
   git remote add upstream https://github.com/drupalize/mcp-server.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Set up environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

6. **Run tests** to ensure everything works:
   ```bash
   npm test
   ```

7. **Start development server**:
   ```bash
   npm run dev
   ```

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `chore/` - Maintenance tasks

Examples:
- `feature/oauth-token-refresh`
- `fix/authentication-error-handling`
- `docs/api-examples`

### Commit Messages

This project uses **Conventional Commits** for standardized commit messages and automated releases.

#### Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

#### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes
- `build`: Build system changes

#### Examples

```bash
feat(auth): add OAuth token refresh functionality

Implements automatic token refresh when access tokens expire.
Includes retry logic and proper error handling.

Closes #123
```

```bash
fix(database): resolve connection pool exhaustion

- Implement proper connection cleanup
- Add connection pool monitoring
- Update error handling for pool limits

Fixes #456
```

```bash
docs: add API usage examples

- Add authentication flow examples
- Include error handling patterns
- Update README with new endpoints
```

### Code Quality Standards

#### TypeScript

- Use strict TypeScript configuration
- Define proper types for all functions and variables
- Avoid `any` type unless absolutely necessary
- Use interfaces for object structures
- Export types for public APIs

#### Code Style

- Follow ESLint configuration
- Use Prettier for code formatting
- Maximum line length: 100 characters
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

#### Error Handling

- Use proper error types and classes
- Include relevant context in error messages
- Log errors appropriately
- Handle async operations properly
- Provide meaningful error responses

#### Testing

- Write unit tests for all new functionality
- Include integration tests for API endpoints
- Test error conditions and edge cases
- Maintain high test coverage (aim for 90%+)
- Use descriptive test names

### Running Quality Checks

Before submitting a PR, run these checks:

```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Formatting
npm run format:check

# All quality checks
npm run quality:check

# Fix issues automatically
npm run quality:fix

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Contribution Types

### Bug Reports

When reporting bugs:
1. Use the bug report template
2. Include reproduction steps
3. Provide environment details
4. Include relevant logs and screenshots
5. Check for existing issues first

### Feature Requests

When requesting features:
1. Use the feature request template
2. Explain the problem you're solving
3. Describe your proposed solution
4. Consider alternative approaches
5. Discuss the impact and use cases

### Code Contributions

#### Small Changes

For small changes (typos, minor fixes):
1. Fork and create a branch
2. Make your changes
3. Submit a pull request

#### Larger Changes

For significant changes:
1. Open an issue to discuss the change
2. Get feedback from maintainers
3. Fork and create a feature branch
4. Implement with tests and documentation
5. Submit a pull request

### Pull Request Process

1. **Update your fork**:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make your changes**:
   - Write code following our standards
   - Add tests for new functionality
   - Update documentation as needed

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request**:
   - Use the PR template
   - Link related issues
   - Provide clear description
   - Mark the PR as draft if work in progress

### Review Process

1. **Automated Checks**: All PRs run automated tests and quality checks
2. **Code Review**: At least one maintainer will review your code
3. **Testing**: Ensure all tests pass and coverage is maintained
4. **Documentation**: Verify documentation is updated if needed
5. **Approval**: Once approved, maintainers will merge the PR

## Architecture Guidelines

### Project Structure

```
src/
├── auth/           # OAuth 2.0 authentication
├── config/         # Configuration management
├── database/       # Database models and operations
├── handlers/       # MCP request handlers
├── services/       # Business logic services
├── transport/      # MCP transport implementations
├── types/          # TypeScript type definitions
└── utils/          # Utility functions
```

### Design Principles

- **Single Responsibility**: Each module has one clear purpose
- **Dependency Injection**: Use DI for testability
- **Error First**: Handle errors explicitly
- **Type Safety**: Leverage TypeScript fully
- **Async/Await**: Use modern async patterns
- **Configuration**: Use environment-based config

### Performance Considerations

- Use connection pooling for database
- Implement proper caching strategies
- Monitor memory usage
- Use streaming for large data
- Implement proper pagination

## Security Guidelines

### Security Best Practices

- **Input Validation**: Validate all inputs
- **SQL Injection**: Use parameterized queries
- **Authentication**: Secure token handling
- **Authorization**: Proper permission checks
- **Secrets Management**: Never commit secrets
- **HTTPS**: Use secure connections
- **Rate Limiting**: Implement proper limits

### Reporting Security Issues

For security vulnerabilities:
1. **DO NOT** open a public issue
2. Use GitHub's security advisory feature
3. Contact maintainers directly
4. Provide detailed information
5. Wait for acknowledgment before disclosure

## Documentation

### Types of Documentation

1. **Code Documentation**: JSDoc comments
2. **API Documentation**: Endpoint descriptions
3. **Architecture Documentation**: System design
4. **User Documentation**: Setup and usage
5. **Contributing Documentation**: This document

### Documentation Standards

- Use clear, concise language
- Include examples where helpful
- Keep documentation updated with code changes
- Use proper Markdown formatting
- Link to related documentation

## Release Process

The project uses automated releases with semantic-release:

1. **Commits**: Use conventional commit format
2. **PRs**: Merge to main branch
3. **Release**: Automatic based on commit types
4. **Versioning**: Follows semantic versioning
5. **Changelog**: Auto-generated from commits

### Version Bumps

- `fix:` commits create patch releases (1.0.0 → 1.0.1)
- `feat:` commits create minor releases (1.0.0 → 1.1.0)
- `BREAKING CHANGE:` creates major releases (1.0.0 → 2.0.0)

## Getting Help

### Resources

- **Documentation**: Check `/architecture/` directory
- **Issues**: Search existing GitHub issues
- **Discussions**: Use GitHub discussions for questions
- **Examples**: Look at existing code patterns

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Questions and general discussion
- **Pull Requests**: Code review and feedback

### Maintainer Response Times

- **Issues**: We aim to respond within 48 hours
- **PRs**: Initial review within 72 hours
- **Security Issues**: Within 24 hours

## Recognition

Contributors will be recognized in:
- CHANGELOG.md for significant contributions
- GitHub contributors list
- Release notes for major features

Thank you for contributing to the Drupalize.me MCP Server! Your contributions help make educational content more accessible through AI integration.