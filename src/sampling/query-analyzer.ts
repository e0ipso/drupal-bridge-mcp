import { z } from 'zod';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

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
 * System prompt for query analysis
 */
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

/**
 * Analyzes a natural language query using MCP sampling
 * Returns null on any failure to signal fallback to basic search
 */
export async function analyzeQuery(
  query: string,
  context: QueryAnalysisContext,
  timeout = 5000
): Promise<EnhancedSearchParams | null> {
  try {
    // Create sampling request
    const samplingRequest = {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
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
      context.server.createMessage(samplingRequest),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);

    // Extract text from response
    const aiResponse =
      response.content.type === 'text' ? response.content.text : null;

    if (!aiResponse) {
      console.warn('No text content in AI response');
      return null;
    }

    // Parse JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
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
