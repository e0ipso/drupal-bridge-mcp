---
id: 3
group: 'core-functionality'
dependencies: [1]
status: 'completed'
created: '2025-10-01'
completed: '2025-10-02'
skills:
  - typescript
  - prompt-engineering
---

# Create Query Analyzer Module with Sampling

## Objective

Build a standalone query analyzer module (`src/sampling/query-analyzer.ts`) that uses MCP sampling
to convert natural language search queries into structured Drupal search parameters, with robust
error handling and timeout protection.

## Skills Required

- **typescript**: Implementing async/await patterns, error handling, and timeout logic
- **prompt-engineering**: Crafting effective system prompts for structured JSON output

## Acceptance Criteria

- [ ] Create `src/sampling/query-analyzer.ts` module with exported `analyzeQuery()` function
- [ ] Implement sampling request using MCP SDK API (from Task 1 research)
- [ ] Design system prompt that extracts intent, content types, versions, and optimized keywords
- [ ] Parse AI response into `EnhancedSearchParams` interface with Zod validation
- [ ] Implement 5-second timeout with graceful fallback
- [ ] Handle errors (timeout, parsing failure, sampling unavailable) by returning null

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand implementation details</summary>

### Module Structure

Create `src/sampling/query-analyzer.ts`:

```typescript
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

/**
 * Enhanced search parameters extracted from AI analysis
 */
export const EnhancedSearchParamsSchema = z.object({
  optimizedKeywords: z.array(z.string()),
  contentTypes: z.array(z.string()).optional(),
  drupalVersions: z.array(z.string()).optional(),
  filters: z.record(z.any()).optional(),
  intent: z.string(),
});

export type EnhancedSearchParams = z.infer<typeof EnhancedSearchParamsSchema>;

/**
 * Context needed for query analysis
 */
export interface QueryAnalysisContext {
  server: Server;
  sessionId: string;
}

/**
 * Analyzes a natural language query using MCP sampling
 * Returns null on any failure to signal fallback to basic search
 */
export async function analyzeQuery(
  query: string,
  context: QueryAnalysisContext,
  timeout = 5000
): Promise<EnhancedSearchParams | null> {
  // Implementation here
}
```

### System Prompt Design

The system prompt is critical for structured output:

```typescript
const SYSTEM_PROMPT = `You are a Drupal search parameter optimizer. Analyze the user's search query and extract structured information.

Return a JSON object with this exact structure:
{
  "optimizedKeywords": ["keyword1", "keyword2"],
  "contentTypes": ["tutorial", "course"],
  "drupalVersions": ["10", "11"],
  "filters": {},
  "intent": "Brief description of user intent"
}

Rules:
- optimizedKeywords: Extract 1-5 key search terms, remove filler words
- contentTypes: Only include if explicitly mentioned (tutorial, course, article, documentation)
- drupalVersions: Only include if version numbers mentioned (9, 10, 11)
- filters: Leave empty for now (future expansion)
- intent: One sentence describing what the user is looking for

Examples:
Query: "How do I create views in Drupal 10"
{
  "optimizedKeywords": ["create", "views"],
  "contentTypes": ["tutorial"],
  "drupalVersions": ["10"],
  "filters": {},
  "intent": "User wants to learn how to create Views in Drupal 10"
}

Query: "authentication best practices"
{
  "optimizedKeywords": ["authentication", "best practices"],
  "contentTypes": [],
  "drupalVersions": [],
  "filters": {},
  "intent": "User seeks best practices for authentication implementation"
}

Return ONLY valid JSON, no additional text.`;
```

### Sampling Request Implementation

Based on Task 1 research findings, implement the sampling request:

```typescript
async function analyzeQuery(
  query: string,
  context: QueryAnalysisContext,
  timeout = 5000
): Promise<EnhancedSearchParams | null> {
  try {
    // Create sampling request
    const samplingRequest = {
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Analyze this search query: "${query}"`,
          },
        },
      ],
      systemPrompt: SYSTEM_PROMPT,
      modelPreferences: {
        hints: [{ name: 'claude-3-5-sonnet-20241022' }],
        costPriority: 0.5,
        speedPriority: 0.3,
        intelligencePriority: 0.2,
      },
      maxTokens: 500,
    };

    // Execute with timeout
    const response = await Promise.race([
      context.server.createMessage(samplingRequest), // Adjust based on Task 1 API
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);

    // Parse and validate response
    const jsonMatch = response.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in AI response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return EnhancedSearchParamsSchema.parse(parsed);
  } catch (error) {
    // Any error returns null to signal fallback
    console.warn(
      'Query analysis failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    return null;
  }
}
```

### Error Handling Strategy

The function must NEVER throw - always return null on failure:

- **Timeout**: Return null after 5 seconds
- **Parsing Error**: Catch JSON.parse errors, return null
- **Zod Validation Error**: Catch validation errors, return null
- **Sampling API Error**: Catch any SDK errors, return null

This ensures the search tool can always fall back to basic keyword search.

### Key Implementation Considerations

1. **Timeout**: Use `Promise.race()` with setTimeout
2. **JSON Extraction**: Use regex to find JSON in response (AI might add explanatory text)
3. **Validation**: Use Zod schema to ensure type safety
4. **Logging**: Use `console.warn()` for failures (not errors, since fallback handles it)
5. **Return Type**: `null` signals fallback, not throwing errors

</details>

## Input Dependencies

- Task 1 research findings (exact sampling API method and types)
- MCP SDK Server instance passed via context
- Zod for schema validation (already in dependencies)

## Output Artifacts

- New file: `src/sampling/query-analyzer.ts`
- Exported `analyzeQuery()` function
- Exported `EnhancedSearchParams` type and Zod schema
- Exported `QueryAnalysisContext` interface

## Implementation Notes

Keep this module simple and focused. The function should be ~80-100 lines including the system
prompt. Avoid over-engineering - the goal is to get structured parameters from AI with robust error
handling.

The system prompt is the most critical part - it must produce consistent JSON output. Include clear
examples in the prompt to guide the AI model.

Consider logging analysis duration for performance monitoring, but this is optional for the initial
implementation.
