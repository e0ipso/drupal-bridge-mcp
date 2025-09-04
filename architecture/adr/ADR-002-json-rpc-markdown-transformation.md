# ADR-002: JSON-RPC Direct Markdown Transformation

## Status
**Accepted** - 2024-01-15

## Context

The content transformation pipeline requires converting Drupalize.me tutorial content into Markdown format optimized for LLM consumption in a RAG system. Three approaches were considered:

1. **JSON-RPC returns HTML** → MCP server transforms to Markdown
2. **JSON-RPC transforms to Markdown directly** ← **Selected**  
3. **JSON:API structured data** → Complex MCP transformation engine

The user feedback emphasized: *"Perhaps it would be simpler that the JSON-RPC just returns HTML back to the MCP server for the content transformation. Another possibility is that the JSON-RPC is in charge of transforming the response into markdown already."*

## Decision

The JSON-RPC module will be extended to transform content directly into RAG-optimized Markdown format before returning to the MCP server.

## Rationale

### Why JSON-RPC Direct Transformation

1. **Simplest MCP Server**: Reduces MCP server to authentication, caching, and pass-through
2. **Leverage Drupal's Strengths**: Uses Drupal's content rendering pipeline and context
3. **Single Transformation Point**: Eliminates complex HTML parsing in MCP server
4. **Performance Optimization**: One conversion step vs. multiple processing stages
5. **Context Awareness**: Drupal has full content structure knowledge for optimal formatting
6. **Drupal Text Format System**: Can leverage existing text format infrastructure

### Implementation Strategy

#### Custom JSON-RPC Method
```php
// Single JSON-RPC method for MVP
$method = [
  'content.search' => 'Search tutorials and return complete RAG-optimized Markdown content'
];
```

#### RAG-Optimized Text Format
- Create custom Drupal text format: "RAG Markdown"
- Optimize for LLM consumption:
  - Clean code block formatting
  - Semantic heading structure
  - Step-by-step instruction formatting
  - Preserved contextual information

## Consequences

### Positive Consequences
- **Dramatically Simplified MCP Server**: Minimal transformation logic
- **Better Performance**: Single conversion step with Drupal's optimized rendering
- **Consistent Output**: Drupal ensures consistent formatting across all content
- **Leverage Existing Infrastructure**: Uses Drupal's text format and rendering systems
- **Easier Maintenance**: Content formatting updates happen in one place (Drupal)
- **Domain Expertise**: Drupal developers handle content formatting (their expertise)

### Negative Consequences
- **Drupal Module Complexity**: Requires custom JSON-RPC method development
- **Less MCP Control**: Markdown format changes require Drupal-side updates  
- **Drupal Dependency**: Team needs Drupal development expertise
- **Format Lock-in**: MCP server less flexible for different output formats

### Trade-off Analysis
| Aspect | MCP Transform | JSON-RPC Transform | Impact |
|---------|---------------|-------------------|---------|
| MCP Server Complexity | High | Minimal | 🔥 Major Simplification |
| Drupal Complexity | Low | Medium | ⚠️ Manageable Increase |
| Performance | Poor | Excellent | ⚡ Significant Improvement |
| Maintainability | Poor | Good | ✅ Better Long-term |
| Flexibility | High | Medium | ⚖️ Acceptable Trade-off |

## Implementation Plan

### Phase 1: Extend JSON-RPC Module
```php
<?php
class ContentMarkdownMethod extends JsonRpcMethodBase {
  public function execute(ParameterBag $params) {
    $node = Node::load($params->get('content_id'));
    
    // Apply RAG-optimized formatting
    $markdown = $this->formatContentForRag($node);
    
    return [
      'id' => $node->id(),
      'title' => $node->getTitle(),
      'content' => $markdown,
      'metadata' => $this->extractRAGMetadata($node),
      'last_updated' => $node->getChangedTime()
    ];
  }
}
```

### Phase 2: Create RAG Text Format
```php
<?php
class RagMarkdownFilter extends FilterBase {
  public function process($text, $langcode) {
    // Convert HTML to LLM-optimized Markdown
    return new FilterProcessResult(
      $this->htmlToRagMarkdown($text)
    );
  }
}
```

### Phase 3: Simplify MCP Server
```javascript
// Dramatically simplified MCP server
class SimplifiedMCPServer {
  async searchContent(query, filters = {}) {
    // Direct pass-through to Drupal
    const response = await this.drupal.call('content.search', {
      query, 
      filters,
      format: 'rag_markdown'
    });
    
    // Simple caching and return
    this.cache.set(query, response);
    return response;
  }
}
```

## Alternatives Considered

### Alternative 1: HTML → MCP Markdown Transform
**Pros**: More MCP server control over format
**Cons**: Complex HTML parsing, performance overhead, error-prone
**Rejected**: Unnecessarily complex when Drupal can handle this better

### Alternative 2: JSON:API → Complex MCP Transform  
**Pros**: Maximum flexibility, rich structured data
**Cons**: Highest complexity, performance impact, deep Drupal knowledge required
**Rejected**: Over-engineered solution for the problem domain

### Alternative 3: Hybrid Approach
**Pros**: Flexibility for different use cases
**Cons**: Increased complexity, multiple code paths to maintain
**Rejected**: Violates KISS principle, premature optimization

## Success Metrics

### Performance Targets
- Content retrieval: < 200ms (95th percentile)
- Markdown transformation: < 50ms  
- Total response time: < 300ms
- Cache hit ratio: > 80%

### Quality Metrics
- Markdown structure validation: 100% pass rate
- Code block preservation: 100% accuracy
- Link integrity: > 99% valid links
- LLM readability score: > 8/10

## Related ADRs
- [ADR-001: LLM-Free Server Architecture](./ADR-001-llm-free-server-architecture.md)
- [ADR-003: JSON-RPC Dynamic Tool Discovery](./ADR-003-json-rpc-dynamic-discovery.md)