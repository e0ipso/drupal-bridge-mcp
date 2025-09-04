# MCP Server Architecture Documentation

## 📋 Reading Order Guide

Follow this order to understand the complete architecture:

### 🎯 Start Here: Core Overview

1. **[Project Summary](./project-summary.md)** - Complete project overview with 10-week roadmap
2. **[Simplified MVP Architecture](./simplified-mvp-architecture.md)** - Clean MVP design without
   complexity

### 🏗️ Technical Implementation

3. **[Final Technical Specifications](./final-technical-specifications.md)** - Complete
   implementation guide with code examples
4. **[Component Diagrams](./component-diagrams.md)** - Detailed system interaction flows

### 🔍 Deep Dive Analysis

5. **[Authentication Analysis](./authentication-analysis.md)** - OAuth 2.0 integration deep dive
6. **[Content Transformation Options](./content-transformation-options.md)** - Why Drupal handles
   transformation
7. **[Critical Integration Challenges](./critical-integration-challenges.md)** - Technical
   challenges and solutions

### 📈 Implementation Planning

8. **[MVP Feature Priorities](./mvp-feature-priorities.md)** - 4-week focused delivery plan
9. **[Debug Mode Architecture](./debug-mode-architecture.md)** - Development vs production error
   handling

### 📚 Decision Documentation

10. **[Architecture Decision Records (ADRs)](./adr/)** - Formal architecture decisions

---

## 🚀 Quick Start for Developers

**For Implementers**: Read items 1-4 above **For Drupal Developers**: Focus on items 3, 5, and 6
**For DevOps/Deployment**: Focus on items 1, 3, and 9

## 🎯 Key Architecture Decisions

### MVP Approach (4 weeks)

- **No Caching**: Direct API calls to establish performance baseline
- **LLM-Free**: Leverage connected LLM via MCP protocol
- **Drupal Processing**: JSON-RPC methods return pre-formatted Markdown
- **Per-User OAuth**: Individual Authorization Code Grant flow

### Technology Stack

- **Transport**: Server-Sent Events (SSE) over HTTP
- **Authentication**: Simple OAuth 5.x module with Authorization Code Grant
- **Content**: JSON-RPC 2.x method (`content.search`)
- **Database**: PostgreSQL for user sessions
- **Deployment**: Railway or Render cloud platform

## 🔧 Core Integration Points

1. **MCP Client** ← SSE HTTP → **MCP Server** ← OAuth → **Drupal**
2. **Single MCP Tool**: `search_tutorials` (returns complete content)
3. **Single JSON-RPC Method**: `content.search` (returns RAG-optimized Markdown)
4. **Zero Content Processing**: Server is authenticated proxy

## 📊 Success Metrics

- **Authentication Flow**: Working OAuth with token refresh
- **Content Retrieval**: Markdown tutorials via JSON-RPC
- **Error Handling**: Graceful failures with debug mode
- **Performance Baseline**: <500ms total response time

## 🔄 Phase 2 Enhancements (Future)

- Smart caching strategy
- Dynamic tool discovery
- Interactive query refinement
- Advanced error recovery

---

## 📝 Document Status

| Document           | Status     | Last Updated                     |
| ------------------ | ---------- | -------------------------------- |
| All Core Documents | ✅ Current | Reflects all user clarifications |
| All ADRs           | ✅ Current | MVP-focused decisions            |
| Technical Specs    | ✅ Current | No stale caching references      |

**Ready for Implementation**: All documents reflect the simplified MVP approach with per-user OAuth
and Drupal-side content processing.
