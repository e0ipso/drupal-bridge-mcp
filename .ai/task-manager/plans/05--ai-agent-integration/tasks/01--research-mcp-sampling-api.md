---
id: 1
group: 'foundation'
dependencies: []
status: 'completed'
created: '2025-10-01'
completed: '2025-10-02'
skills:
  - typescript
  - mcp-protocol
---

# Research MCP SDK Sampling API

## Objective

Investigate the MCP SDK's sampling API to understand the exact methods, types, and patterns for
server-side sampling requests, ensuring the implementation uses the correct SDK version (1.17.5)
APIs.

## Skills Required

- **typescript**: Understanding TypeScript types and interfaces in the MCP SDK
- **mcp-protocol**: Knowledge of MCP protocol specifications and SDK usage patterns

## Acceptance Criteria

- [ ] Identify the correct method for servers to request sampling (e.g., `server.createMessage()` or
      equivalent)
- [ ] Document the exact TypeScript interface for sampling requests including all required and
      optional parameters
- [ ] Determine how client capabilities are accessed after transport connection
- [ ] Verify sampling API compatibility with `StreamableHTTPServerTransport`
- [ ] Document any version-specific considerations for SDK 1.17.5

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand implementation details</summary>

### SDK Investigation Steps

1. **Examine MCP SDK Source Code**
   - Navigate to `node_modules/@modelcontextprotocol/sdk`
   - Look for sampling-related exports in `server/index.ts`
   - Check for methods like `createMessage`, `requestSampling`, or similar
   - Review TypeScript type definitions for sampling request structure

2. **Review SDK Documentation**
   - Check SDK README and TypeScript doc comments
   - Look for examples in SDK test files or examples directory
   - Search for "sampling" keyword in SDK source

3. **Capability Negotiation Research**
   - Find where client capabilities are stored after `server.connect(transport)`
   - Determine if capabilities are per-session or global
   - Identify TypeScript interfaces for capability objects

4. **Transport Compatibility**
   - Verify `StreamableHTTPServerTransport` supports sampling
   - Check if any special configuration is needed for HTTP transport
   - Review transport event handlers for capability updates

### Documentation Format

Create a research document (can be temporary notes) with:

```typescript
// Example: Document the exact API signatures found

// Sampling request method
interface SamplingRequest {
  messages: Message[];
  systemPrompt?: string;
  modelPreferences?: ModelPreferences;
  maxTokens?: number;
  // ... other fields
}

// How to call it
server.someMethod(samplingRequest): Promise<SamplingResponse>

// How to access capabilities
server.clientCapabilities // or transport.capabilities?
```

### Key Questions to Answer

1. What is the exact method name for requesting sampling?
2. What TypeScript interfaces define the request structure?
3. How are client capabilities accessed from tool handlers?
4. Does the SDK handle timeout/retry, or must we implement it?
5. What error types can be thrown from sampling requests?

</details>

## Input Dependencies

- Existing MCP SDK installation (`@modelcontextprotocol/sdk` v1.17.5)
- Access to SDK source code and type definitions

## Output Artifacts

- Research notes documenting:
  - Exact API method signatures for sampling requests
  - TypeScript interfaces for request/response structures
  - Capability access patterns
  - Transport compatibility notes
  - Any version-specific gotchas or considerations

## Implementation Notes

This is a research task, not a coding task. The goal is to gather definitive information from the
SDK source and documentation to guide implementation in subsequent tasks. Consider creating a
temporary markdown file with findings, or documenting in task comments.

The plan notes that the official MCP specification URL returned 404, so rely primarily on SDK source
code and TypeScript types as the source of truth.

## Execution Notes

**Completed**: 2025-10-02

**Noteworthy Events**:

- SDK version installed is v1.18.2 (slightly newer than v1.17.5 mentioned in plan)
- Successfully identified `server.createMessage()` as the sampling request method
- Confirmed `server.getClientCapabilities()` for capability detection
- Verified HTTP transport compatibility with sampling
- Created comprehensive research document at
  `.ai/task-manager/plans/05--ai-agent-integration/research-notes-task-01.md`

**Key Discoveries**:

1. Sampling API is stable and well-defined in SDK v1.18.2
2. No timeout/retry handling in SDK - must implement manually
3. Client capabilities available after initialization via `server.oninitialized` callback
4. `CreateMessageRequest` uses structured params with messages, systemPrompt, modelPreferences,
   maxTokens
5. Response is `CreateMessageResult` with model, content, stopReason

**Next Steps**: All acceptance criteria met. Ready for Task 02 (Capability Detection)
implementation.
