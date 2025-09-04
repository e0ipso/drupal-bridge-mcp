# Content Transformation Options Analysis

## Option 1: JSON-RPC Returns HTML → MCP Server Transforms to Markdown

```mermaid
flowchart LR
    Search[Search Request] --> JSONRPC[JSON-RPC]
    JSONRPC --> HTML[HTML Content]
    HTML --> MCP[MCP Server]
    MCP --> Parser[HTML Parser]
    Parser --> Markdown[Markdown Generator]
    Markdown --> LLM[Connected LLM]
```

### Pros
- **Flexible Formatting**: MCP server controls final Markdown format
- **LLM Optimization**: Can tailor Markdown specifically for RAG consumption
- **Separation of Concerns**: Drupal handles data, MCP handles presentation format
- **Caching Opportunities**: Can cache transformed content separately

### Cons
- **Complexity**: Requires robust HTML parsing and Markdown generation
- **Error Handling**: Two transformation points = more failure modes
- **Performance**: Additional processing step adds latency
- **Maintenance**: HTML parsing logic needs updates when Drupal output changes

## Option 2: JSON-RPC Transforms to Markdown Directly ⭐ RECOMMENDED

```mermaid
flowchart LR
    Search[Search Request] --> JSONRPC[JSON-RPC + Formatter]
    JSONRPC --> Markdown[Optimized Markdown]
    Markdown --> MCP[MCP Server Cache]
    MCP --> LLM[Connected LLM]
```

### Pros
- **Simplest MCP Server**: Minimal transformation logic required
- **Leverage Drupal's Strengths**: Uses Drupal's content rendering pipeline
- **Single Transformation**: One conversion step reduces error potential
- **Context Awareness**: Drupal has full content context for optimal formatting
- **Drupal Text Format System**: Can create custom "RAG Markdown" format
- **Performance**: Fastest option with minimal MCP server processing

### Cons
- **Drupal Module Complexity**: Requires custom JSON-RPC method or text formatter
- **Less MCP Control**: Format changes require Drupal-side updates
- **Drupal Expertise Required**: Team needs Drupal development knowledge

## Option 3: Current Approach (JSON:API Structured Data)

```mermaid
flowchart LR
    Search[Search Request] --> JSONAPI[JSON:API]
    JSONAPI --> Structured[Structured Data]
    Structured --> MCP[MCP Transform Engine]
    MCP --> Complex[Complex Processing]
    Complex --> Markdown[Markdown Output]
    Markdown --> LLM[Connected LLM]
```

### Pros
- **Maximum Flexibility**: Full control over all transformation aspects
- **Rich Metadata**: Preserves all relationships and structured data
- **Extensible**: Easy to add new content types and formats

### Cons
- **Highest Complexity**: Most error-prone approach
- **Drupal Expertise**: Requires deep understanding of Drupal's data model
- **Performance Impact**: Most processing-intensive option
- **Maintenance Burden**: Complex codebase to maintain

## Recommended Approach: Option 2

### Implementation Strategy

#### 1. Custom JSON-RPC Method
```php
<?php
// Drupal custom JSON-RPC method
class ContentFormatMethod extends JsonRpcMethodBase {
  
  public function execute(ParameterBag $params) {
    $content_id = $params->get('content_id');
    $format = $params->get('format', 'rag_markdown');
    
    $node = Node::load($content_id);
    if (!$node) {
      throw new InvalidParameterException('Content not found');
    }
    
    // Use custom text format for RAG optimization
    $formatted_content = $this->formatForRag($node, $format);
    
    return [
      'content_id' => $content_id,
      'title' => $node->getTitle(),
      'content' => $formatted_content,
      'metadata' => $this->extractMetadata($node),
      'last_updated' => $node->getChangedTime()
    ];
  }
  
  private function formatForRag(NodeInterface $node, $format) {
    // Apply custom RAG-optimized text format
    $build = $node->body->view([
      'type' => 'text_format',
      'settings' => ['format' => $format]
    ]);
    
    return $this->renderer->renderPlain($build);
  }
}
```

#### 2. RAG-Optimized Text Format
```php
<?php
// Custom text format for RAG Markdown
class RagMarkdownFilter extends FilterBase {
  
  public function process($text, $langcode) {
    // Convert HTML to clean Markdown optimized for LLM consumption
    $markdown = $this->htmlToRagMarkdown($text);
    
    return new FilterProcessResult($markdown);
  }
  
  private function htmlToRagMarkdown($html) {
    // Custom HTML to Markdown with:
    // - Clean code block formatting
    // - Semantic heading structure  
    // - Optimized list formatting
    // - Preserved link context
    // - Step-by-step instruction formatting
    
    return $this->markdownConverter->convert($html, [
      'code_block_style' => 'fenced',
      'heading_style' => 'atx',
      'list_marker' => '-',
      'preserve_comments' => false,
      'optimize_for_llm' => true
    ]);
  }
}
```

### Architecture Benefits

#### Simplified MCP Server
```javascript
// Simplified MCP server implementation
class SimplifiedMCPServer {
  
  async handleContentSearch(query, filters = {}) {
    // Direct pass-through to Drupal with minimal processing
    const response = await this.drupalClient.call('content.search', {
      query,
      filters,
      format: 'rag_markdown'  // Request pre-formatted content
    });
    
    // Simple caching and return
    await this.cache.set(`search:${this.hashQuery(query)}`, response, 300);
    return response;
  }
  
  async searchContent(query, filters = {}) {
    // Search for content directly
    const results = await this.drupalClient.call('content.search', {
      query,
      drupal_version: filters.drupal_version,
      tags: filters.tags,
      format: 'rag_markdown'
    });
    
    // Return complete search results with full content
    return results;
  }
}
```

### Performance Comparison

| Approach | MCP Processing | Network Calls | Cacheability | Complexity |
|----------|---------------|---------------|--------------|------------|
| Option 1 | High | 1 | Medium | High |
| Option 2 | Minimal | 1 | High | Low |
| Option 3 | Very High | Multiple | Low | Very High |

## Final Recommendation

**Choose Option 2**: JSON-RPC transforms to Markdown directly

### Implementation Steps
1. **Create Custom Text Format**: "RAG Markdown" format in Drupal
2. **Extend JSON-RPC Module**: Add content formatting methods
3. **Optimize for LLM**: Fine-tune Markdown output for RAG consumption
4. **Simplify MCP Server**: Reduce to authentication, caching, and pass-through
5. **Performance Optimization**: Cache formatted content with appropriate TTL

This approach provides the best balance of simplicity, performance, and maintainability while leveraging Drupal's strengths in content management and rendering.