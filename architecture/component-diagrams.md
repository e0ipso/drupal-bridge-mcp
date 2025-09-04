# Architecture Component Diagrams

## 1. High-Level System Context

```mermaid
C4Context
    title System Context - MCP Server for Drupalize.me RAG

    Person(user, "Developer", "Uses Claude Code with MCP")
    System(claude, "Claude Code/LLM Client", "AI Assistant with MCP support")
    System(mcp_server, "MCP Server", "Connects to Drupal for content retrieval")
    System(drupal, "Drupalize.me Drupal", "Content management system")

    Rel(user, claude, "Asks questions about Drupal")
    Rel(claude, mcp_server, "JSON-RPC over stdio/SSE")
    Rel(mcp_server, drupal, "HTTPS with OAuth 2.0")
```

## 2. Authentication Flow

```mermaid
sequenceDiagram
    participant MCP as MCP Server
    participant TokenMgr as Token Manager
    participant OAuth as Simple OAuth
    participant Drupal as Drupal Backend

    Note over MCP,Drupal: Initial Authentication
    MCP->>TokenMgr: Request access token
    TokenMgr->>OAuth: OAuth 2.0 authorization code flow
    OAuth->>TokenMgr: Access token + refresh token
    TokenMgr->>MCP: Cached access token

    Note over MCP,Drupal: Ongoing Operations
    MCP->>Drupal: API request with bearer token
    alt Token Valid
        Drupal->>MCP: Successful response
    else Token Expired
        Drupal->>MCP: 401 Unauthorized
        MCP->>TokenMgr: Refresh token request
        TokenMgr->>OAuth: Refresh token exchange
        OAuth->>TokenMgr: New access token
        TokenMgr->>MCP: Updated token
        MCP->>Drupal: Retry with new token
    end
```

## 3. Discovery and Tool Registration Flow

```mermaid
flowchart TD
    Start([MCP Server Startup]) --> Discovery[Method Discovery Service]
    
    Discovery --> Cache{Methods Cached?}
    Cache -->|No/Expired| Fetch[GET /jsonrpc/methods]
    Cache -->|Yes| Registry[Tool Registry]
    
    Fetch --> Auth[Apply OAuth Token]
    Auth --> Request[HTTP Request to Drupal]
    Request --> Response[JSON-RPC Methods List]
    
    Response --> Filter[Security Filter]
    Filter --> Transform[Schema Translation]
    Transform --> Registry[Tool Registry]
    
    Registry --> MCPTools[MCP Tool Definitions]
    MCPTools --> Client[Notify MCP Client]
    
    Client --> Monitor[Change Monitor]
    Monitor -->|Module Changes| Discovery
```

## 4. Search Query Processing Flow

```mermaid
sequenceDiagram
    participant Client as MCP Client
    participant MCP as MCP Server  
    participant LLM as Query Parser LLM
    participant JSONRPC as JSON-RPC Endpoint
    participant Solr as Solr Search Index

    Client->>MCP: search_content("How to create custom blocks?")
    
    Note over MCP,LLM: Query Intelligence Layer
    MCP->>LLM: Parse query context and extract keywords
    LLM->>MCP: Structured search parameters
    
    Note over MCP,Solr: Search Execution
    MCP->>JSONRPC: content.search(keywords, filters)
    JSONRPC->>Solr: Execute search query
    Solr->>JSONRPC: Search results with scores
    JSONRPC->>MCP: JSON response with content IDs
    
    Note over MCP,Client: Response Processing  
    MCP->>MCP: Rank and filter results
    MCP->>Client: Relevant content list
```

## 5. Content Transformation Flow

```mermaid
flowchart LR
    subgraph "Content Retrieval"
        A[Content IDs] --> B[JSON:API Request]
        B --> C[Drupal Content Response]
    end
    
    subgraph "Transformation Engine"
        C --> D[JSON Structure Parser]
        D --> E[Content Type Analyzer]
        E --> F[Semantic Processor]
        F --> G[Markdown Generator]
    end
    
    subgraph "Output Processing"
        G --> H[Content Chunking]
        H --> I[Metadata Extraction]
        I --> J[Formatted Output]
    end
    
    subgraph "Complex Content Handling"
        K[Code Examples] --> L[Syntax Highlighting]
        M[Media Files] --> N[Reference Links]
        O[Embedded Content] --> P[Structured Blocks]
    end
    
    E --> K
    E --> M  
    E --> O
    L --> G
    N --> G
    P --> G
```

## 6. MCP Protocol Communication Flow

```mermaid
sequenceDiagram
    participant Client as MCP Client (Claude)
    participant Transport as Transport Layer
    participant Protocol as MCP Protocol Handler
    participant Tools as Tool Executor
    participant Resources as Resource Manager

    Note over Client,Resources: Tool Discovery
    Client->>Transport: tools/list request
    Transport->>Protocol: Parse JSON-RPC request
    Protocol->>Tools: Get available tools
    Tools->>Protocol: Tool definitions with schemas
    Protocol->>Transport: JSON-RPC response
    Transport->>Client: Available tools list

    Note over Client,Resources: Tool Execution
    Client->>Transport: tools/call request
    Transport->>Protocol: Parse and validate
    Protocol->>Tools: Execute tool with params
    Tools->>Resources: Access content/search
    Resources->>Tools: Processed results
    Tools->>Protocol: Tool execution result
    Protocol->>Transport: JSON-RPC response
    Transport->>Client: Tool output
```

## 7. Error Handling and Recovery Flow

```mermaid
flowchart TD
    Error[Error Occurs] --> Type{Error Type?}
    
    Type -->|Auth| Auth[Authentication Error]
    Type -->|Network| Network[Network Error] 
    Type -->|Validation| Validation[Parameter Error]
    Type -->|System| System[System Error]
    
    Auth --> TokenRefresh[Attempt Token Refresh]
    TokenRefresh --> Retry[Retry Operation]
    
    Network --> Backoff[Exponential Backoff]
    Backoff --> Retry
    
    Validation --> Sanitize[Sanitize Parameters]
    Sanitize --> Retry
    
    System --> Fallback[Use Cached Data]
    Fallback --> Notify[Notify Client of Degradation]
    
    Retry --> Success{Success?}
    Success -->|Yes| Complete[Operation Complete]
    Success -->|No| Limit{Max Retries?}
    
    Limit -->|Reached| Fail[Operation Failed]
    Limit -->|Continue| Retry
    
    Fail --> Log[Log Error Details]
    Log --> ClientError[Return Error to Client]
```

These focused diagrams make the architecture much clearer by separating concerns and showing specific interaction patterns within each component.