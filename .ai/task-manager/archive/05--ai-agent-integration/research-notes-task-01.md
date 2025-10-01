# Task 01: MCP SDK Sampling API Research Notes

## Executive Summary

Researched MCP SDK v1.18.2 (current installed version) sampling API for server-side AI assistance
requests. The SDK provides a well-defined `server.createMessage()` method for servers to request AI
sampling from connected clients.

## SDK Version

- **Installed**: `@modelcontextprotocol/sdk@1.18.2`
- **Plan mentioned**: v1.17.5
- **Status**: Version is compatible, API should be stable

## Key Findings

### 1. Sampling Request Method

**Method name**: `server.createMessage()`

**Location**: `Server` class in `@modelcontextprotocol/sdk/server/index.js`

**Type signature** (from `dist/esm/server/index.d.ts` line 77):

```typescript
createMessage(
  params: CreateMessageRequest["params"],
  options?: RequestOptions
): Promise<CreateMessageResult>
```

### 2. Request Structure

**CreateMessageRequest Parameters** (from types.d.ts):

The request uses a `params` object with the following structure:

```typescript
interface CreateMessageRequestParams {
  // Message history
  messages: SamplingMessage[];

  // Optional system prompt
  systemPrompt?: string;

  // Model preferences
  modelPreferences?: {
    hints?: Array<{ name: string }>;
    costPriority?: number;
    speedPriority?: number;
    intelligencePriority?: number;
  };

  // Token limit
  maxTokens?: number;

  // Metadata (optional)
  _meta?: {
    progressToken?: string | number;
  };
}
```

**SamplingMessage Structure**:

```typescript
interface SamplingMessage {
  role: 'user' | 'assistant';
  content: TextContent | ImageContent | AudioContent;
}

interface TextContent {
  type: 'text';
  text: string;
  _meta?: Record<string, unknown>;
}
```

### 3. Response Structure

**CreateMessageResult** (from types.d.ts):

```typescript
interface CreateMessageResult {
  model: string;
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | string;
  role: 'user' | 'assistant';
  content: TextContent | ImageContent | AudioContent;
  _meta?: Record<string, unknown>;
}
```

The AI response will be in the `content` field, typically as a `TextContent` with `type: "text"` and
`text: string`.

### 4. Client Capability Detection

**Method**: `server.getClientCapabilities()`

**Location**: `Server` class (line 68 of server/index.d.ts)

**Type signature**:

```typescript
getClientCapabilities(): ClientCapabilities | undefined
```

**ClientCapabilities Structure** (from types.d.ts):

```typescript
interface ClientCapabilities {
  experimental?: Record<string, unknown>;
  sampling?: Record<string, unknown>; // Present if client supports sampling
  elicitation?: Record<string, unknown>;
  roots?: {
    listChanged?: boolean;
  };
}
```

**Usage pattern**:

```typescript
const capabilities = server.getClientCapabilities();
const samplingSupported = capabilities?.sampling !== undefined;
```

**Important timing note**: `getClientCapabilities()` returns `undefined` until the client completes
initialization. Check availability using the `oninitialized` callback or verify in request handlers.

### 5. Transport Compatibility

**Current transport**: `StreamableHTTPServerTransport`

**Sampling compatibility**: ✅ Yes, sampling works with HTTP transport

The transport negotiates capabilities during the connection phase. The `Server.connect(transport)`
method establishes the connection and capability negotiation happens automatically through the MCP
protocol handshake.

### 6. Example Usage Pattern

Based on SDK structure, here's the recommended usage pattern:

```typescript
// In DrupalMCPHttpServer class
export class DrupalMCPHttpServer {
  private server: Server;
  private sessionCapabilities: Map<string, ClientCapabilities> = new Map();

  // During connection setup
  async setupMcpEndpoint() {
    this.transport = new StreamableHTTPServerTransport({...});
    await this.server.connect(this.transport);

    // Capabilities available after initialization
    this.server.oninitialized = () => {
      const capabilities = this.server.getClientCapabilities();
      console.log('Client capabilities:', capabilities);
    };
  }

  // In tool handlers
  async handleSearchTool(params, extra) {
    const capabilities = this.server.getClientCapabilities();

    if (capabilities?.sampling) {
      try {
        const result = await this.server.createMessage({
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Analyze: ${params.query}`
              }
            }
          ],
          systemPrompt: "You are a search parameter optimizer...",
          modelPreferences: {
            hints: [{ name: "claude-3-5-sonnet-20241022" }],
            costPriority: 0.5,
            speedPriority: 0.3,
            intelligencePriority: 0.2
          },
          maxTokens: 500
        });

        // Extract text from response
        const aiResponse = result.content.type === "text"
          ? result.content.text
          : null;

        // Parse and use AI response
      } catch (error) {
        // Handle sampling errors gracefully
        console.warn('Sampling failed:', error);
      }
    }
  }
}
```

### 7. Error Handling Considerations

**Possible error scenarios**:

1. Client doesn't support sampling (capabilities.sampling is undefined)
2. Client rejects sampling request (user denies approval)
3. Sampling timeout (long-running AI request)
4. Network errors during sampling
5. Invalid response format

**Recommended approach**: Always wrap `createMessage()` in try-catch and provide fallback logic.

### 8. Version-Specific Considerations

**SDK v1.18.2 notes**:

- `createMessage()` method is stable and well-defined
- Client capabilities are accessed via `getClientCapabilities()`
- HTTP transport fully supports sampling
- No deprecated APIs detected in sampling feature

**Differences from v1.17.5**: Likely minimal, both versions should support the same sampling API
structure.

## Questions Answered

### 1. What is the exact method name for requesting sampling?

✅ `server.createMessage(params, options?)`

### 2. What TypeScript interfaces define the request structure?

✅ `CreateMessageRequest["params"]` with:

- `messages: SamplingMessage[]`
- `systemPrompt?: string`
- `modelPreferences?: { hints, costPriority, speedPriority, intelligencePriority }`
- `maxTokens?: number`

### 3. How are client capabilities accessed from tool handlers?

✅ `server.getClientCapabilities()` returns `ClientCapabilities | undefined`

- Check `capabilities?.sampling` for sampling support
- Available after initialization completes
- Can be checked in any request handler via `this.server.getClientCapabilities()`

### 4. Does the SDK handle timeout/retry, or must we implement it?

⚠️ **SDK does NOT handle timeouts automatically**

- Must implement timeout using `Promise.race()` pattern
- Must implement retry logic if desired
- SDK throws errors on failure, but doesn't auto-retry

### 5. What error types can be thrown from sampling requests?

✅ Standard MCP errors:

- `McpError` from `@modelcontextprotocol/sdk/types.js`
- Network errors (transport failures)
- User rejection errors (client denies sampling)
- Timeout errors (if implemented via Promise.race)

## Implementation Recommendations

### For Task 02 (Capability Detection):

1. Add `sessionCapabilities: Map<string, ClientCapabilities>` to DrupalMCPHttpServer
2. Capture capabilities using `server.getClientCapabilities()` after initialization
3. Make available to tool handlers via context
4. Clean up capabilities on session close

### For Task 03 (Query Analyzer):

1. Accept `Server` instance in context
2. Call `server.createMessage()` with structured prompt
3. Implement 5-second timeout using `Promise.race()`
4. Parse JSON from `result.content.text`
5. Always return null on any error (never throw)

### For Task 04 (Search Tool Integration):

1. Check `capabilities?.sampling` before attempting AI enhancement
2. Pass `server` instance through context
3. Handle null response from analyzer gracefully
4. Add `aiEnhanced` metadata to search results

## Additional Notes

- The plan mentioned that the MCP specification URL returned 404. SDK source code and TypeScript
  types serve as the authoritative reference.
- The `StreamableHTTPServerTransport` fully supports sampling - no special configuration needed.
- Session-based capability tracking is recommended since different clients may have different
  capabilities.
- The SDK does not provide built-in caching or rate limiting for sampling requests.

## Acceptance Criteria Status

- [x] Identify the correct method for servers to request sampling
- [x] Document the exact TypeScript interface for sampling requests
- [x] Determine how client capabilities are accessed after transport connection
- [x] Verify sampling API compatibility with StreamableHTTPServerTransport
- [x] Document any version-specific considerations for SDK 1.18.2

## Next Steps

Proceed with Task 02 (Implement Capability Detection) using the findings above.
