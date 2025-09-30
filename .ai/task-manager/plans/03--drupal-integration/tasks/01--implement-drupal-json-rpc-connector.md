---
id: 1
group: 'drupal-integration'
dependencies: []
status: 'pending'
created: '2025-09-30'
skills:
  - typescript
  - json-rpc
---

# Implement Drupal JSON-RPC Connector

## Objective

Create a reusable Drupal API client (`DrupalConnector`) that handles JSON-RPC 2.0 communication with
OAuth Bearer token authentication, providing type-safe methods for tutorial search and retrieval
operations.

## Skills Required

- **TypeScript**: Strong typing, class design, async/await patterns
- **JSON-RPC**: JSON-RPC 2.0 protocol, error handling, request/response formatting

## Acceptance Criteria

- [ ] `src/drupal/connector.ts` created with `DrupalConnector` class
- [ ] Accepts OAuth token as parameter for each request (stateless design)
- [ ] Provides `searchTutorial(query, token)` and `getTutorial(id, token)` methods
- [ ] Maps JSON-RPC errors (401, 403, 404) to MCP error codes
- [ ] Uses Zod schemas to validate Drupal API responses
- [ ] Base URL configured from `process.env.DRUPAL_BASE_URL`
- [ ] Zero TypeScript compilation errors
- [ ] `npm install json-rpc-2.0` dependency added to package.json

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Dependencies:**

- `json-rpc-2.0` - Standard JSON-RPC client library
- `zod` - Response validation (already installed)
- `@modelcontextprotocol/sdk/types.js` - McpError, ErrorCode types

**Drupal JSON-RPC Methods:**

- `tutorial.search` - Params: `{ query: string, limit?: number }`
- `tutorial.get` - Params: `{ id: string }`

**Error Mapping:** | HTTP Status | MCP Error Code | Message |
|-------------|----------------|---------| | 401 | `ErrorCode.Unauthorized` | "Authentication
required" | | 403 | `ErrorCode.Forbidden` | "Insufficient permissions" | | 404 |
`ErrorCode.InvalidRequest` | "Tutorial not found: {id}" | | Network | `ErrorCode.InternalError` |
"Drupal communication failed" |

**Environment Variables:**

```bash
DRUPAL_BASE_URL=https://drupal-contrib.ddev.site
DRUPAL_JSONRPC_ENDPOINT=/jsonrpc  # Optional, defaults to /jsonrpc
```

## Input Dependencies

- Existing OAuth infrastructure from Plan 02 (no code dependencies, contextual understanding only)
- MCP SDK types for error handling

## Output Artifacts

- `src/drupal/connector.ts` - DrupalConnector class
- `src/drupal/types.ts` - TypeScript interfaces and Zod schemas for Tutorial type
- Updated `package.json` with `json-rpc-2.0` dependency

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### File Structure

Create two files:

1. `src/drupal/types.ts` - Type definitions
2. `src/drupal/connector.ts` - Connector implementation

### Step 1: Install Dependency

```bash
npm install json-rpc-2.0
```

Update `package.json` to include the dependency.

### Step 2: Define Types (`src/drupal/types.ts`)

```typescript
import { z } from 'zod';

// Zod schema for tutorial response validation
export const TutorialSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string().optional(),
  body: z.string().optional(),
  url: z.string().url().optional(),
  author: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  tags: z.array(z.string()).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

export type Tutorial = z.infer<typeof TutorialSchema>;

// Search response schema
export const SearchResponseSchema = z.object({
  results: z.array(TutorialSchema),
  total: z.number(),
  limit: z.number().optional(),
});

export type SearchResponse = z.infer<typeof SearchResponseSchema>;
```

### Step 3: Implement Connector (`src/drupal/connector.ts`)

```typescript
import { JSONRPCClient, JSONRPCRequest } from 'json-rpc-2.0';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { Tutorial, TutorialSchema, SearchResponse, SearchResponseSchema } from './types.js';

export class DrupalConnector {
  private baseUrl: string;
  private jsonrpcEndpoint: string;

  constructor() {
    this.baseUrl = process.env.DRUPAL_BASE_URL || '';
    this.jsonrpcEndpoint = process.env.DRUPAL_JSONRPC_ENDPOINT || '/jsonrpc';

    if (!this.baseUrl) {
      throw new Error('DRUPAL_BASE_URL environment variable is required');
    }
  }

  /**
   * Create authenticated JSON-RPC client for a single request
   */
  private createClient(token: string): JSONRPCClient {
    return new JSONRPCClient((request: JSONRPCRequest) =>
      this.makeAuthenticatedRequest(request, token)
    );
  }

  /**
   * Make authenticated fetch request to Drupal JSON-RPC endpoint
   */
  private async makeAuthenticatedRequest(request: JSONRPCRequest, token: string): Promise<unknown> {
    const url = `${this.baseUrl}${this.jsonrpcEndpoint}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(request),
      });

      // Map HTTP errors to MCP errors
      if (!response.ok) {
        throw this.mapHttpErrorToMcpError(response.status);
      }

      return await response.json();
    } catch (error) {
      // Network or fetch errors
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Drupal communication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Map HTTP status codes to MCP error codes
   */
  private mapHttpErrorToMcpError(status: number): McpError {
    switch (status) {
      case 401:
        return new McpError(ErrorCode.Unauthorized, 'Authentication required');
      case 403:
        return new McpError(
          ErrorCode.Forbidden,
          'Insufficient permissions to access this resource'
        );
      case 404:
        return new McpError(ErrorCode.InvalidRequest, 'Resource not found');
      default:
        return new McpError(ErrorCode.InternalError, `Drupal API error: HTTP ${status}`);
    }
  }

  /**
   * Search tutorials with keyword query
   */
  async searchTutorial(query: string, token: string, limit = 10): Promise<SearchResponse> {
    const client = this.createClient(token);

    try {
      const result = await client.request('tutorial.search', {
        query,
        limit,
      });

      // Validate response with Zod
      return SearchResponseSchema.parse(result);
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

  /**
   * Retrieve tutorial by ID
   */
  async getTutorial(id: string, token: string): Promise<Tutorial> {
    const client = this.createClient(token);

    try {
      const result = await client.request('tutorial.get', { id });

      // Validate response with Zod
      return TutorialSchema.parse(result);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InvalidRequest, `Tutorial not found: ${id}`);
    }
  }
}
```

### Step 4: Validation

- Run `npm run type-check` to ensure zero TypeScript errors
- Verify environment variable handling
- Ensure error mapping is comprehensive

### Key Design Patterns

1. **Stateless Design**: Token passed as parameter, no internal state
2. **Error Translation**: All errors mapped to MCP-compliant types
3. **Type Safety**: Zod schemas validate all Drupal responses
4. **Single Responsibility**: Connector only handles JSON-RPC communication

</details>
