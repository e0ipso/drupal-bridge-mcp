---
id: 4
group: 'core-functionality'
dependencies: [2, 3]
status: 'completed'
created: '2025-10-01'
completed: '2025-10-02'
skills:
  - typescript
---

# Integrate AI Enhancement with Search Tool

## Objective

Enhance the `searchTutorial()` function in `src/tools/content/search.ts` to conditionally use
AI-powered query analysis when sampling is available, while maintaining backward compatibility and
providing transparent feedback about AI enhancement status.

## Skills Required

- **typescript**: Modifying existing async functions with conditional logic and error handling

## Acceptance Criteria

- [ ] Modify `searchTutorial()` to check for sampling capability availability
- [ ] Call `analyzeQuery()` when sampling is supported
- [ ] Transform AI-enhanced parameters into Drupal JSON-RPC compatible format
- [ ] Fall back to keyword search when sampling unavailable or analysis returns null
- [ ] Add `aiEnhanced` metadata field to search response
- [ ] Maintain backward compatibility (no breaking changes to tool signature or response format)

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand implementation details</summary>

### Implementation Location

Modify `src/tools/content/search.ts`, specifically the `searchTutorial()` function.

### Updated Context Interface

First, update the context interface to include the server instance and capabilities:

```typescript
export interface SearchTutorialContext {
  sessionId: string;
  oauthProvider: DrupalOAuthProvider;
  drupalConnector: DrupalConnector;
  samplingCapabilities?: ClientCapabilities; // Added in Task 2
  server?: Server; // Add this for query analyzer
}
```

### Import Query Analyzer

Add import at the top of the file:

```typescript
import { analyzeQuery, type EnhancedSearchParams } from '../sampling/query-analyzer.js';
```

### Enhanced Search Function

Modify the `searchTutorial()` function:

```typescript
export async function searchTutorial(
  params: z.infer<typeof searchTutorialSchema>,
  context: SearchTutorialContext
) {
  const { sessionId, oauthProvider, drupalConnector, samplingCapabilities, server } = context;
  const { query, limit } = params;

  // Step 1: Retrieve OAuth token from session
  const token = await oauthProvider.getToken(sessionId);

  if (!token) {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Authentication required. Please login first using auth_login tool.'
    );
  }

  // Step 2: Attempt AI enhancement if available
  let enhancedParams: EnhancedSearchParams | null = null;
  let aiEnhanced = false;

  const canUseSampling = samplingCapabilities?.sampling?.supported && server;

  if (canUseSampling) {
    try {
      enhancedParams = await analyzeQuery(query, { server, sessionId });
      if (enhancedParams) {
        aiEnhanced = true;
      }
    } catch (error) {
      // analyzeQuery should never throw, but handle defensively
      console.warn('AI analysis unexpected error:', error);
    }
  }

  // Step 3: Build search parameters
  // For now, use optimized keywords if available, otherwise use original query
  const searchQuery = enhancedParams?.optimizedKeywords.join(' ') || query;

  // Step 4: Call DrupalConnector with token
  try {
    const searchResponse = await drupalConnector.searchTutorial(searchQuery, token, limit);

    // Step 5: Format results with AI enhancement metadata
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...searchResponse,
              metadata: {
                aiEnhanced,
                ...(aiEnhanced && enhancedParams
                  ? {
                      intent: enhancedParams.intent,
                      contentTypes: enhancedParams.contentTypes,
                      drupalVersions: enhancedParams.drupalVersions,
                    }
                  : {}),
              },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Tutorial search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
```

### Update Context in Main Server

In `src/index.ts`, update the `CallToolRequestSchema` handler to pass the server instance:

```typescript
this.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const sessionId = extra?.sessionId || 'default-session';

  // ... existing code ...

  const contentContext = {
    sessionId,
    oauthProvider: this.oauthProvider,
    drupalConnector: this.drupalConnector,
    samplingCapabilities: this.sessionCapabilities.get(sessionId),
    server: this.server, // Add this
  };

  // ... rest of handler
});
```

### Parameter Transformation Notes

For the initial implementation, we're only using `optimizedKeywords` to replace the query string.
Future enhancements could:

- Map `contentTypes` to Drupal content type filters
- Map `drupalVersions` to taxonomy term filters
- Use `filters` for advanced Drupal JSON-RPC parameters

Keep it simple for now - just optimize the keyword string.

### Backward Compatibility

The changes are fully backward compatible:

- Tool signature unchanged (still accepts `query` and `limit`)
- Response format unchanged (JSON string with search results)
- Additional metadata is additive (new `metadata` field)
- Clients without sampling see `"aiEnhanced": false`

### Testing Approach

Manual testing:

1. **Without sampling client**: Should work exactly as before
2. **With sampling client**: Should see enhanced metadata in response
3. **Sampling timeout**: Should gracefully fall back to keyword search
4. **Invalid JSON from AI**: Should handle gracefully and use keyword search

</details>

## Input Dependencies

- Task 2: Capability detection infrastructure and context interface updates
- Task 3: `analyzeQuery()` function from query-analyzer module
- Existing `searchTutorial()` function in `src/tools/content/search.ts`

## Output Artifacts

- Modified `src/tools/content/search.ts` with AI-enhanced search logic
- Updated context passing in `src/index.ts` to include server instance
- Search responses now include `metadata.aiEnhanced` field

## Implementation Notes

This task integrates all previous work. The key is maintaining simplicity - don't over-engineer the
parameter transformation. Start with just using optimized keywords, and document where future
enhancements could be added.

The function should remain readable and maintainable. The AI enhancement is an optional layer that
doesn't complicate the core search logic.

Consider adding a debug log when AI enhancement is used:
`console.log('Using AI-enhanced search parameters')` to help with troubleshooting.
