---
id: 2
group: 'documentation-update'
dependencies: [1]
status: 'completed'
created: '2025-10-02'
skills:
  - technical-writing
  - markdown
---

# Update README with Accurate Documentation

## Objective

Comprehensively update README.md to reflect current v1.2.0 implementation including correct tool
names, AI-enhanced search feature, environment variables, updated architecture, and revised feature
list while maintaining conciseness.

## Skills Required

- **technical-writing**: Clear, concise documentation for end users
- **markdown**: Proper markdown formatting and structure

## Acceptance Criteria

- [ ] "Available Tools" section updated with all 5 correct tools and schemas
- [ ] New "AI-Enhanced Search" section added after Features
- [ ] "Configuration" section updated with all environment variables
- [ ] "Architecture" section updated to reflect HTTP transport and sampling
- [ ] "Features" section updated with AI capabilities and session management
- [ ] All outdated tool names and references removed
- [ ] README remains under 250 lines (conciseness maintained)
- [ ] All JSON examples valid and match actual Zod schemas

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand implementation details</summary>

### Section 1: Update "Features" Section (Lines ~14-20)

Replace current features list with:

```markdown
## ✨ Features

- 🔐 **OAuth 2.1 Authentication** - Device flow and client credentials with session management
- 🤖 **AI-Enhanced Search** - Automatic query optimization via MCP Sampling (when available)
- 📚 **Content Access** - Search tutorials and retrieve Drupal content
- 🔄 **HTTP Transport** - Streamable HTTP with session-based state management
- 🚀 **MCP Standard** - Full MCP protocol compliance with sampling support
- 📦 **Minimal Dependencies** - MCP SDK, Express, minimal overhead
- 🎯 **Graceful Degradation** - Works with or without AI capabilities
```

### Section 2: Add "AI-Enhanced Search" Section (After Features, Before Quick Start)

Insert new section:

```markdown
## 🤖 AI-Enhanced Search

When connected to MCP clients with sampling support (Claude Desktop, Cursor, etc.), the server
automatically enhances search queries using AI analysis:

- **Automatic Activation**: No configuration required - works when sampling is available
- **Query Optimization**: Extracts intent, optimizes keywords, identifies content types
- **Graceful Degradation**: Falls back to standard keyword search when sampling unavailable
- **Transparency**: Response metadata includes `aiEnhanced` flag indicating enhancement status
- **No External Dependencies**: Uses MCP Sampling protocol (server requests AI from client)
- **Performance**: 5-second timeout ensures responsive searches

Clients without sampling support continue to use standard keyword-based search with full backward
compatibility.
```

### Section 3: Update "Configuration" Section (Lines ~36-43)

Replace with comprehensive environment variables:

`````markdown
### Configuration

Create a `.env` file:

````env
# Required
DRUPAL_BASE_URL=https://your-drupal-site.com

# OAuth Configuration (required if AUTH_ENABLED=true)
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret  # Optional for public clients

# Server Configuration (optional)
HTTP_PORT=6200  # Default: 6200
HTTP_HOST=localhost  # Default: localhost
AUTH_ENABLED=true  # Default: false
MCP_SERVER_NAME=drupal-mcp-server  # Optional
MCP_SERVER_VERSION=1.0.0  # Optional

# CORS Configuration (optional)
HTTP_CORS_ORIGINS=http://localhost:5173,http://localhost:6200

# OAuth Flow Configuration (optional)
OAUTH_FORCE_DEVICE_FLOW=true  # Force device flow for headless environments
```\`\`\`
````
`````

`````

### Section 4: Update "Available Tools" Section (Lines ~56-92)

Replace entire section with accurate tool documentation:

````markdown
## 🛠️ Available Tools

### `auth_login`

Authenticate with Drupal using OAuth Device Flow

```json
{
  // No parameters required
}
```
`````

### `auth_logout`

Log out and clear current OAuth session

```json
{
  // No parameters required
}
```

### `auth_status`

Check current authentication status and session information

```json
{
  // No parameters required
}
```

### `search_tutorial`

Search Drupal tutorials with AI-enhanced query analysis (when sampling available)

```json
{
  "query": "views tutorial",
  "limit": 10 // Optional, default: 10
}
```

### `get_tutorial`

Retrieve a specific tutorial by ID

```json
{
  "id": "12345"
}
```

````

### Section 5: Update "Architecture" Section (Lines ~108-129)

Replace with current architecture:

```markdown
## 🏗️ Architecture

The server uses HTTP transport with MCP SDK integration:

**Core Components:**
- **DrupalMCPHttpServer** - Express-based HTTP server with MCP transport
- **OAuth Providers** - Device flow and client credentials authentication
- **DrupalConnector** - JSON-RPC client for Drupal communication
- **Query Analyzer** - AI-powered search optimization (via MCP Sampling)
- **Session Management** - Per-session token and capability tracking

**Transport:**
- StreamableHTTPServerTransport for MCP communication
- Session-based authentication with automatic cleanup
- Capability detection for AI-enhanced features

**Tools:**
- Authentication tools (login, logout, status)
- Content tools (search, get)
- AI enhancement (automatic when sampling available)
````

### Implementation Strategy

1. **Read audit findings** from Task 01 to verify all corrections
2. **Edit README.md** section by section using the Edit tool
3. **Verify line count** stays under 250 lines
4. **Check all JSON** examples for valid syntax
5. **Remove all deprecated references** (search_tutorials, load_node, create_node, test_connection)
6. **Maintain existing sections** that are still accurate (Installation, Usage, Development,
   License)

### Sections to Keep As-Is

- Title and transformation narrative (lines 1-12)
- Prerequisites (lines 24-27)
- Installation (lines 29-33)
- Usage (lines 45-54)
- Implementation Comparison table (lines 94-105) - still largely accurate
- Key Learnings (lines 131-143)
- Development (lines 145-159)
- Backup (lines 161-163)
- License and Author (lines 165-170)

### Quality Checks

Before completing:

- [ ] All 5 tools documented match implementation
- [ ] No references to deprecated tools
- [ ] Environment variables match DEFAULT_HTTP_CONFIG in src/index.ts
- [ ] AI enhancement explanation is user-friendly (not overly technical)
- [ ] Markdown formatting is consistent
- [ ] Code blocks have proper syntax highlighting
- [ ] Line count < 250

</details>

## Input Dependencies

- Audit findings from Task 01 with correct tool schemas
- Current README.md
- Source code references for verification (src/index.ts, src/tools/\*)

## Output Artifacts

- Updated README.md with accurate, comprehensive v1.2.0 documentation
- All outdated information removed
- New AI-enhanced search feature documented
- Complete environment variable reference

## Implementation Notes

Focus on surgical updates to specific sections rather than complete rewrites. The current README
structure is good - just needs content updates for accuracy.

Maintain the concise, user-focused style. Avoid implementation details users don't need. The goal is
to help users understand what the server does and how to configure it, not to document internal
architecture.

Use the Edit tool to replace specific sections. Work section by section to maintain control and
avoid introducing errors.
