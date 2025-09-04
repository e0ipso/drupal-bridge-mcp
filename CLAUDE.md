# CLAUDE.md

## Project Overview
This repository contains the architecture and implementation specifications for an MCP (Model Context Protocol) server that connects to Drupalize.me's Drupal installation for RAG (Retrieval Augmented Generation) system enhancement.

## Architecture Documentation
Comprehensive architecture specifications are available in the `/architecture/` directory:

### Core Architecture
- [`/architecture/project-summary.md`](./architecture/project-summary.md) - Complete project overview with roadmap
- [`/architecture/simplified-mvp-architecture.md`](./architecture/simplified-mvp-architecture.md) - MVP architecture without caching complexity  
- [`/architecture/final-technical-specifications.md`](./architecture/final-technical-specifications.md) - Complete technical implementation guide
- [`/architecture/component-diagrams.md`](./architecture/component-diagrams.md) - Detailed system interaction diagrams

### Technical Analysis
- [`/architecture/authentication-analysis.md`](./architecture/authentication-analysis.md) - OAuth 2.0 integration with Simple OAuth module
- [`/architecture/jsonrpc-discovery-analysis.md`](./architecture/jsonrpc-discovery-analysis.md) - Dynamic tool discovery from Drupal JSON-RPC
- [`/architecture/content-transformation-options.md`](./architecture/content-transformation-options.md) - Content processing strategy analysis
- [`/architecture/critical-integration-challenges.md`](./architecture/critical-integration-challenges.md) - Key technical challenges and solutions

### Implementation Planning
- [`/architecture/mvp-feature-priorities.md`](./architecture/mvp-feature-priorities.md) - MVP vs full feature roadmap
- [`/architecture/debug-mode-architecture.md`](./architecture/debug-mode-architecture.md) - Error handling and debugging strategy

### Architecture Decision Records
- [`/architecture/adr/`](./architecture/adr/) - Formal architecture decision documentation

## Key Architectural Decisions
- **LLM-Free Server**: Leverages connected LLM via MCP protocol instead of separate API connections
- **JSON-RPC Direct Transformation**: Drupal converts content to RAG-optimized Markdown before sending
- **Per-User OAuth**: Individual Authorization Code Grant flow for subscription-level content access
- **SSE Transport**: Server-Sent Events for MCP communication
- **PostgreSQL**: Unified database for user sessions and future caching

## Available Agents
The repository includes specialized Claude Code agents in `.claude/agents/`:
- `code-reviewer`: Quality and security code reviews
- `debugger`: Error diagnosis and debugging
- `deployment-engineer`: CI/CD and infrastructure
- `javascript-developer`: Modern JS/TS development
- `typescript-expert`: Advanced TypeScript development
- `test-automator`: Test creation and automation
- `prompt-engineer`: AI prompt optimization