# Final Technical Specifications

## System Architecture Overview

```mermaid
graph TB
    subgraph "User Environment"
        User[Developer]
        Claude[Claude Code/LLM Client]
    end

    subgraph "MCP Server (SSE)"
        Auth[OAuth Manager]
        Tools[Tool Handler]
        Protocol[MCP Protocol Handler]
    end

    subgraph "Drupalize.me Drupal"
        OAuth[Simple OAuth 5.x]
        JSONRPC[JSON-RPC 2.x Methods]
        Content[Tutorial Content]
    end

    User -->|Asks questions| Claude
    Claude <-->|SSE HTTP| Protocol

    Protocol --> Auth
    Protocol --> Tools

    Auth <-->|Authorization Code Grant| OAuth
    Tools <-->|content.search| JSONRPC

    JSONRPC --> Content
    Content -->|Pre-formatted Markdown| JSONRPC

    classDef user fill:#e1f5fe
    classDef mcp fill:#f3e5f5
    classDef drupal fill:#e8f5e8

    class User,Claude user
    class Auth,Tools,Protocol mcp
    class OAuth,JSONRPC,Content drupal
```

## Core Components

### 1. MCP Server (Node.js/TypeScript)

#### Transport & Protocol

```typescript
// SSE-based MCP server
interface MCPServerConfig {
  port: number;
  host: string;
  endpoints: {
    sse: '/mcp/sse';
    health: '/health';
    oauth_callback: '/oauth/callback';
  };
}

// MCP Tool exposed to clients (single tool for MVP)
const mcpTool = {
  name: 'search_tutorials',
  description: 'Search Drupalize.me tutorials with complete content',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search terms' },
      drupal_version: {
        type: 'string',
        enum: ['9', '10', '11'],
        description: 'Filter by Drupal version',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by content tags',
      },
    },
    required: ['query'],
  },
};
```

#### OAuth Flow Implementation

```typescript
// Authorization Code Grant flow
class OAuthManager {
  async initializeUserAuth(userId: string): Promise<string> {
    const state = this.generateSecureState();
    const authUrl = this.buildAuthorizationUrl(state);

    await this.storeAuthState(userId, state);
    return authUrl; // Return URL for user to visit
  }

  async handleCallback(code: string, state: string): Promise<TokenSet> {
    const tokenResponse = await this.exchangeCodeForTokens(code);
    await this.storeUserTokens(tokenResponse);
    return tokenResponse;
  }

  private buildAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'content:read content:search',
      state: state,
    });

    return `${this.drupalBaseUrl}/oauth/authorize?${params.toString()}`;
  }
}
```

### 2. Drupal-Side Implementation

#### Custom JSON-RPC Methods

```php
<?php
// src/Plugin/jsonrpc/Method/ContentSearch.php

/**
 * @JsonRpcMethod(
 *   id = "content.search",
 *   usage = @Translation("Search tutorials and guides"),
 *   access = {"access content"},
 *   params = {
 *     "query" = @JsonRpcParameterDefinition(type="string", required=TRUE),
 *     "drupal_version" = @JsonRpcParameterDefinition(type="string", required=FALSE),
 *     "tags" = @JsonRpcParameterDefinition(type="array", required=FALSE)
 *   }
 * )
 */
class ContentSearch extends JsonRpcMethodBase {

  public function execute(ParameterBag $params) {
    $query = $params->get('query');
    $version_filter = $params->get('drupal_version');
    $tag_filter = $params->get('tags', []);

    // Execute search using Drupal's search capabilities
    $results = $this->searchService->search([
      'query' => $query,
      'filters' => [
        'drupal_version' => $version_filter,
        'tags' => $tag_filter,
        'published' => TRUE,
        'access_check' => TRUE // Respects user permissions
      ]
    ]);

    // Format results for RAG consumption
    return array_map([$this, 'formatTutorialResult'], $results);
  }

  private function formatTutorialResult($node) {
    return [
      'id' => $node->id(),
      'title' => $node->getTitle(),
      'summary' => $this->extractSummary($node),
      'content' => $this->convertToRagMarkdown($node),
      'metadata' => [
        'drupal_version' => $node->get('field_drupal_version')->value,
        'difficulty' => $node->get('field_difficulty')->value,
        'tags' => $this->extractTags($node),
        'url' => $node->toUrl('canonical', ['absolute' => TRUE])->toString(),
        'updated' => $node->getChangedTime()
      ]
    ];
  }

  private function convertToRagMarkdown($node) {
    // Use custom text format for RAG optimization
    $build = $node->body->view([
      'type' => 'text_default',
      'settings' => ['format' => 'rag_markdown']
    ]);

    return $this->renderer->renderPlain($build);
  }
}
```

#### Custom Text Format for RAG

````php
<?php
// src/Plugin/Filter/RagMarkdownFilter.php

/**
 * @Filter(
 *   id = "rag_markdown",
 *   title = @Translation("RAG Markdown Converter"),
 *   description = @Translation("Converts HTML to LLM-optimized Markdown"),
 *   type = Drupal\filter\Plugin\FilterInterface::TYPE_TRANSFORM_IRREVERSIBLE,
 * )
 */
class RagMarkdownFilter extends FilterBase {

  public function process($text, $langcode) {
    $markdown = $this->htmlToRagMarkdown($text);
    return new FilterProcessResult($markdown);
  }

  private function htmlToRagMarkdown($html) {
    $converter = new HtmlToMarkdownConverter([
      'header_style' => 'atx', // # headers
      'code_block_style' => 'fenced', // ``` code blocks
      'emphasis_style' => 'asterisk', // *emphasis*
      'list_item_style' => '-', // - list items
      'preserve_comments' => FALSE, // Remove HTML comments
      'strip_tags' => ['script', 'style'], // Remove unwanted tags

      // RAG-specific optimizations
      'optimize_code_blocks' => TRUE,
      'preserve_drupal_snippets' => TRUE,
      'convert_media_to_urls' => TRUE,
      'add_heading_anchors' => FALSE
    ]);

    return $converter->convert($html);
  }
}
````

### 3. PostgreSQL Database Schema

```sql
-- User authentication and sessions
CREATE TABLE user_sessions (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  access_token_hash VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT[] DEFAULT '{}',
  subscription_level VARCHAR(50) DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Request logging for analytics (optional for MVP)
CREATE TABLE request_logs (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255),
  method VARCHAR(100) NOT NULL,
  parameters JSONB,
  response_size INTEGER,
  duration_ms INTEGER,
  status VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_request_logs_user_created ON request_logs(user_id, created_at);

-- Cleanup function for expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
  DELETE FROM user_sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;
```

## Authentication Flow Specification

### Authorization Code Grant Implementation

```typescript
// Complete OAuth flow for individual users
class UserAuthFlow {
  // Step 1: MCP client requests user authorization
  async initiateAuth(userId: string) {
    const authUrl = await this.oauthManager.initializeUserAuth(userId);

    return {
      type: 'authorization_required',
      message: 'Please authorize access to your Drupalize.me account',
      authorization_url: authUrl,
      instructions: [
        '1. Visit the authorization URL',
        '2. Sign in to your Drupalize.me account',
        '3. Grant permissions to the MCP server',
        '4. You will be redirected back automatically',
      ],
    };
  }

  // Step 2: Handle OAuth callback
  async handleAuthCallback(code: string, state: string) {
    const tokens = await this.oauthManager.handleCallback(code, state);
    const userInfo = await this.fetchUserInfo(tokens.access_token);

    await this.storeUserSession({
      user_id: userInfo.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      subscription_level: userInfo.subscription_level,
    });

    return {
      type: 'authorization_complete',
      message: 'Successfully connected to Drupalize.me',
      user: {
        name: userInfo.name,
        subscription: userInfo.subscription_level,
      },
    };
  }
}
```

## Performance Considerations (MVP)

### Direct API Approach

The MVP uses direct API calls to establish baseline performance:

```typescript
class SimpleMCPServer {
  async handleSearchRequest(query: string, filters: any) {
    // Direct pass-through to Drupal - no caching
    const token = await this.auth.getValidToken(this.currentUser);

    const response = await this.drupalClient.call(
      'content.search',
      {
        query,
        drupal_version: filters.drupal_version,
        tags: filters.tags,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    // Returns complete tutorial content as RAG-optimized Markdown
    return response;
  }
}
```

### Performance Monitoring

Track these metrics for future optimization decisions:

- OAuth token exchange: Expected ~100-200ms
- Drupal search requests: Expected ~200-800ms
- Content retrieval: Expected ~150-400ms
- Total response time: Expected ~300-1000ms

## Deployment Configuration

### Railway Configuration

```toml
# railway.toml
[build]
builder = "dockerfile"

[deploy]
healthcheckPath = "/health"
restartPolicyType = "on-failure"
healthcheckTimeout = 30
startCommand = "npm start"

[environments.production]
variables = { NODE_ENV = "production" }

[environments.staging]
variables = { NODE_ENV = "staging", MCP_DEBUG_MODE = "true" }
```

### Environment Variables

```bash
# Core configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/mcp_server

# Drupal integration
DRUPAL_BASE_URL=https://drupalize.me
OAUTH_CLIENT_ID=mcp-rag-client
OAUTH_CLIENT_SECRET=your-secure-secret
OAUTH_REDIRECT_URI=https://your-mcp-server.railway.app/oauth/callback

# Performance tracking (optional)
REQUEST_TIMEOUT=5000
MAX_CONCURRENT_REQUESTS=50

# Monitoring
SENTRY_DSN=your-sentry-dsn
MCP_DEBUG_MODE=false
LOG_LEVEL=info
```

This specification provides everything needed for a clean implementation start! 🚀
