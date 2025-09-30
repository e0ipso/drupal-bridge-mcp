---
id: 3
group: 'content-tools'
dependencies: [1]
status: 'pending'
created: '2025-09-30'
skills:
  - typescript
  - mcp-tools
---

# Implement Content Search and Retrieval Tools

## Objective

Create two MCP tools (`search_tutorial` and `get_tutorial`) that enable keyword-based tutorial
search and ID-based retrieval using the DrupalConnector with session-based OAuth authentication.

## Skills Required

- **TypeScript**: MCP tool handlers, async/await, type-safe interfaces
- **MCP Tools**: Tool registration patterns, input schema validation, error handling

## Acceptance Criteria

- [ ] Two tool files created: `src/tools/content/search.ts`, `get.ts`
- [ ] `search_tutorial` accepts query and optional limit parameters
- [ ] `get_tutorial` accepts tutorial ID parameter
- [ ] Both tools extract session ID from MCP context
- [ ] Both tools retrieve OAuth token via `OAuthProvider.getToken(sessionId)`
- [ ] Both tools call DrupalConnector methods with token
- [ ] Proper error handling for missing tokens (401 Unauthorized)
- [ ] Zod schemas validate input parameters
- [ ] Structured JSON responses match spec formats
- [ ] Zero TypeScript compilation errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Dependencies:**

- `DrupalConnector` from Task 1
- `OAuthProvider` from Plan 02
- `@modelcontextprotocol/sdk/types.js` - McpError, ErrorCode
- `zod` - Input validation

**Tool Specifications:**

1. **search_tutorial**
   - Input: `{ query: string, limit?: number }`
   - Output: `{ results: Tutorial[], total: number, limit: number }`
   - Default limit: 10

2. **get_tutorial**
   - Input: `{ id: string }`
   - Output: Full Tutorial object with all fields

## Input Dependencies

- `DrupalConnector` class from Task 1 (`src/drupal/connector.ts`)
- `OAuthProvider` with `getToken(sessionId)` method

## Output Artifacts

- `src/tools/content/search.ts` - search_tutorial tool
- `src/tools/content/get.ts` - get_tutorial tool
- `src/tools/content/index.ts` - Barrel export

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Implement search_tutorial (`src/tools/content/search.ts`)

```typescript
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { DrupalConnector } from '../../drupal/connector.js';
import { OAuthProvider } from '../../oauth/provider.js';

// Input schema
export const searchTutorialSchema = z.object({
  query: z.string().describe('Search keywords'),
  limit: z
    .number()
    .optional()
    .default(10)
    .describe('Maximum results (Drupal enforces server-side limits)'),
});

export interface SearchTutorialContext {
  sessionId: string;
  oauthProvider: OAuthProvider;
  drupalConnector: DrupalConnector;
}

export async function searchTutorial(
  params: z.infer<typeof searchTutorialSchema>,
  context: SearchTutorialContext
) {
  const { sessionId, oauthProvider, drupalConnector } = context;
  const { query, limit } = params;

  // Step 1: Retrieve OAuth token from session
  const token = await oauthProvider.getToken(sessionId);

  if (!token) {
    throw new McpError(
      ErrorCode.Unauthorized,
      'Authentication required. Please login first using auth_login tool.'
    );
  }

  // Step 2: Call DrupalConnector with token
  try {
    const searchResponse = await drupalConnector.searchTutorial(query, token, limit);

    // Step 3: Format results as MCP tool response
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(searchResponse, null, 2),
        },
      ],
    };
  } catch (error) {
    // DrupalConnector already throws MCP errors, re-throw them
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

### Step 2: Implement get_tutorial (`src/tools/content/get.ts`)

```typescript
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { DrupalConnector } from '../../drupal/connector.js';
import { OAuthProvider } from '../../oauth/provider.js';

// Input schema
export const getTutorialSchema = z.object({
  id: z.string().describe('Tutorial ID'),
});

export interface GetTutorialContext {
  sessionId: string;
  oauthProvider: OAuthProvider;
  drupalConnector: DrupalConnector;
}

export async function getTutorial(
  params: z.infer<typeof getTutorialSchema>,
  context: GetTutorialContext
) {
  const { sessionId, oauthProvider, drupalConnector } = context;
  const { id } = params;

  // Validate ID format (basic check)
  if (!id || id.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, 'Tutorial ID cannot be empty');
  }

  // Step 1: Retrieve OAuth token from session
  const token = await oauthProvider.getToken(sessionId);

  if (!token) {
    throw new McpError(
      ErrorCode.Unauthorized,
      'Authentication required. Please login first using auth_login tool.'
    );
  }

  // Step 2: Call DrupalConnector with token
  try {
    const tutorial = await drupalConnector.getTutorial(id, token);

    // Step 3: Return full tutorial data
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(tutorial, null, 2),
        },
      ],
    };
  } catch (error) {
    // DrupalConnector already throws MCP errors, re-throw them
    if (error instanceof McpError) {
      throw error;
    }

    throw new McpError(ErrorCode.InvalidRequest, `Tutorial not found: ${id}`);
  }
}
```

### Step 3: Create Barrel Export (`src/tools/content/index.ts`)

```typescript
export * from './search.js';
export * from './get.js';
```

### Step 4: Validation

- Run `npm run type-check` to ensure zero TypeScript errors
- Verify error handling for missing tokens
- Check input validation with Zod schemas
- Ensure proper error propagation from DrupalConnector

### Error Flow Examples

**Missing Authentication:**

```
User calls search_tutorial → No token in session → McpError(Unauthorized)
```

**Drupal API Error:**

```
User calls get_tutorial → Drupal returns 404 → DrupalConnector throws McpError(InvalidRequest) → Re-thrown
```

**Network Error:**

```
User calls search_tutorial → Network failure → DrupalConnector throws McpError(InternalError) → Re-thrown
```

### Integration Pattern

These tools will be registered in `index.ts` (Task 4):

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  const sessionId = extra.sessionId;
  const context = {
    sessionId,
    oauthProvider,
    drupalConnector,
  };

  switch (request.params.name) {
    case 'search_tutorial':
      return searchTutorial(request.params.arguments, context);
    case 'get_tutorial':
      return getTutorial(request.params.arguments, context);
  }
});
```

</details>
