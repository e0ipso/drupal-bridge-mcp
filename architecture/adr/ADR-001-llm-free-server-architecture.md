# ADR-001: LLM-Free Server Architecture

## Status

**Accepted** - 2024-01-15

## Context

The initial architecture considered having the MCP server make its own connections to LLM providers
(OpenAI, Anthropic, etc.) for query parsing and content processing. However, this introduces several
complications:

- Additional API keys and costs for LLM access
- Duplicate LLM connections (user already connected via MCP client)
- Complex configuration and credential management
- Potential conflicts between server and client LLM interactions

The user explicitly stated: _"I don't want the mcp server to require an LLM key to connect. Since
the mcp is going to be interacting with an LLM already, I would like it to just ask back the
questions that it needs instead of creating a new connection to an LLM provider."_

## Decision

The MCP server will NOT maintain its own LLM connections. Instead, it will leverage the existing LLM
client connected via the MCP protocol for any intelligent processing needs.

## Rationale

### Benefits of LLM-Free Architecture

1. **Cost Efficiency**: Zero additional LLM API costs
2. **Simplified Configuration**: No API keys or provider setup required
3. **Better MCP Alignment**: Uses MCP protocol as intended (resources and tools)
4. **Context Preservation**: Connected LLM maintains full conversation context
5. **Reduced Dependencies**: Fewer external service dependencies
6. **User Control**: User's LLM handles all intelligent processing with their preferences

### Implementation Approach

- **Interactive Clarification**: Server asks connected LLM for query clarification
- **Resource-Based Content**: Expose structured content as MCP resources
- **Tool-Based Search**: Provide search tools that return raw data for LLM processing
- **Conversational Flow**: Enable back-and-forth refinement through MCP protocol

## Consequences

### Positive Consequences

- **Simplified Deployment**: No LLM configuration required
- **Zero Additional Costs**: No LLM API charges
- **Protocol Native**: Proper use of MCP resources and tools
- **Enhanced UX**: More natural conversational flow
- **Better Context**: LLM maintains full conversation history

### Negative Consequences

- **Interactive Dependencies**: Some operations require LLM client interaction
- **Limited Autonomous Processing**: Server cannot process content independently
- **Response Complexity**: May require multiple round-trips for complex queries

### Mitigation Strategies

- **Structured Responses**: Provide rich metadata to minimize round-trips
- **Intelligent Defaults**: Offer sensible default parameters for common use cases
- **Batch Operations**: Support multiple operations in single requests where possible

## Alternatives Considered

### Alternative 1: Server-Side LLM Integration

**Description**: MCP server maintains own LLM connections **Rejected Because**:

- Requires API keys and additional costs
- Duplicates existing LLM connection
- Violates user's explicit requirement
- Adds unnecessary complexity

### Alternative 2: Hybrid Approach

**Description**: Optional LLM integration for advanced features **Rejected Because**:

- Still requires API key configuration
- Creates two different operation modes
- Adds conditional complexity to codebase

### Alternative 3: Pre-Computed Intelligence

**Description**: Pre-process content with offline LLM processing **Rejected Because**:

- Requires batch processing infrastructure
- Cannot adapt to user-specific queries
- Loses real-time context and personalization

## Implementation Notes

### MCP Tool Pattern

```javascript
const searchTool = {
  name: 'search_content',
  description: 'Search tutorials with optional clarification',
  // Returns structured data for LLM processing
};
```

### Resource Pattern

```javascript
const contentResource = {
  uri: 'drupalize://tutorial/12345',
  // Exposes raw content for LLM context
};
```

### Interactive Pattern

```javascript
// Server can ask for clarification
if (queryAmbiguous) {
  return {
    clarification_needed: true,
    options: [...],
    message: "Please specify..."
  };
}
```

## Related ADRs

- [ADR-004: Resource-Based Content Access](./ADR-004-resource-based-content-access.md)
- [ADR-005: Interactive Query Refinement](./ADR-005-interactive-query-refinement.md)
