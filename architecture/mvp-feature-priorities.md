# MVP vs Full Feature Set Priorities

## 🎯 MVP (Minimum Viable Product) - Weeks 1-4

### Core Functionality (Must-Have)
- **Per-User OAuth Authentication**: Complete OAuth 2.0 flow with Simple OAuth
- **Basic Search Tool**: Single `search_content` MCP tool with parameters:
  - `query` (string, required)
  - `drupal_version` (enum: ["9", "10", "11"], optional)
  - `tags` (array of strings, optional)
- **Content Retrieval Tool**: Single `get_content` MCP tool for specific tutorial access
- **SSE Transport**: HTTP-based MCP server with `/mcp/sse` endpoint
- **Basic Error Handling**: Simplified error messages (non-debug mode)
- **Token Management**: Automatic OAuth token refresh
- **Direct Pass-through**: No caching - direct API calls to understand performance baseline

### Drupal-Side MVP
- **Custom JSON-RPC Methods**:
  - `tutorial.search` - Returns pre-formatted Markdown
  - `tutorial.get` - Returns single tutorial as Markdown
- **RAG Markdown Text Format**: Basic HTML to Markdown conversion optimized for LLMs
- **OAuth Client Setup**: Service account configuration

### Success Criteria for MVP
✅ User can authenticate and search tutorials
✅ Search returns relevant results in clean Markdown
✅ Individual tutorials can be retrieved
✅ System handles token expiration gracefully
✅ Basic error scenarios are handled

## 🚀 Phase 2 Enhancements - Weeks 5-6

### Enhanced Search Intelligence
- **Interactive Query Refinement**: MCP server asks LLM for clarification when searches are ambiguous
- **Search Result Metadata**: Include relevance scores, content type, difficulty level
- **Advanced Filtering**: Additional parameters like difficulty level, content type
- **Search Suggestions**: "Did you mean..." functionality for typos/similar queries

### Caching & Performance Optimizations  
- **Smart Caching Strategy**: Multi-layer cache with query normalization
- **Connection Pooling**: Reuse HTTP connections to Drupal
- **Request Batching**: Combine multiple content requests

### Monitoring & Observability
- **Structured Logging**: JSON logs with request correlation IDs
- **Basic Metrics**: Request count, response time, error rate
- **Health Checks**: `/health` endpoint for deployment monitoring

## 🎨 Phase 3 Advanced Features - Weeks 7-8

### Dynamic Tool Discovery
- **Method Discovery**: Automatic registration of available JSON-RPC methods as MCP tools
- **Schema Translation**: JSON-RPC parameter schemas → MCP tool schemas
- **Real-time Updates**: Notify MCP clients when available tools change

### Content Enhancement  
- **Rich Metadata**: Include tutorial series, prerequisites, related content
- **Content Validation**: Ensure Markdown quality and completeness
- **Media URL Validation**: Verify embedded media links are accessible

### Advanced Authentication
- **User Context Preservation**: Remember user preferences and subscription level
- **Permission-Aware Responses**: Filter results based on user access level
- **Session Management**: Handle multiple concurrent sessions per user

## 🔧 Phase 4 Production Hardening - Weeks 9-10

### Comprehensive Error Handling
- **Debug Mode**: Verbose error messages for development
- **Error Recovery**: Automatic retry with exponential backoff
- **Circuit Breaker**: Disable failing services temporarily
- **Graceful Degradation**: Serve cached content when Drupal is unavailable

### Security & Compliance
- **Request Rate Limiting**: Prevent API abuse
- **Security Headers**: CORS, CSP, security headers
- **Audit Logging**: Track all authentication and content access
- **Input Validation**: Comprehensive parameter validation and sanitization

### Monitoring & Alerting
- **Sentry Integration**: Error tracking and performance monitoring
- **Custom Dashboards**: Key metrics visualization
- **Alerting Rules**: Notify on high error rates or performance degradation
- **Log Aggregation**: Centralized logging with search capabilities

## 🎯 Recommended MVP Scope

**Focus on these 4 core capabilities for MVP**:

1. **Authentication Flow**: OAuth setup and token management
2. **Basic Search**: Simple keyword search with basic filtering  
3. **Content Retrieval**: Get individual tutorials as Markdown
4. **Error Handling**: Basic error scenarios with simple messages

**Defer to later phases**:
- Dynamic tool discovery (use static tool definitions initially)
- Interactive query refinement (start with simple search)
- Advanced caching (start with in-memory cache)
- Comprehensive monitoring (start with basic logging)

## Implementation Strategy

### Week 1-2: Foundation
```javascript
// MVP Tool Definitions (Static)
const mcpTools = [
  {
    name: "search_tutorials",
    description: "Search Drupalize.me tutorials",
    inputSchema: {
      type: "object", 
      properties: {
        query: { type: "string" },
        drupal_version: { type: "string", enum: ["9", "10", "11"] },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["query"]
    }
  },
];
```

### Week 3-4: Core Functionality
```php
<?php
// Drupal JSON-RPC Methods (MVP)
class TutorialSearchMethod extends JsonRpcMethodBase {
  public function execute(ParameterBag $params) {
    $results = $this->searchTutorials(
      $params->get('query'),
      $params->get('drupal_version'),
      $params->get('tags', [])
    );
    
    return array_map([$this, 'formatTutorialForRAG'], $results);
  }
}
```

This phased approach ensures you get a working system quickly while building toward a production-ready solution.