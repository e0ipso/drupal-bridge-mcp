---
id: 4
group: 'server-integration'
dependencies: [1, 2, 3]
status: 'pending'
created: '2025-09-30'
skills:
  - typescript
  - mcp-server
---

# Register Tools with MCP Server and Wire Session Context

## Objective

Integrate all five tools (auth_login, auth_logout, auth_status, search_tutorial, get_tutorial) into
the HTTP MCP server in index.ts, ensuring proper session ID propagation and shared singleton
instances for OAuthProvider and DrupalConnector.

## Skills Required

- **TypeScript**: Module imports, dependency injection, request handler patterns
- **MCP Server**: Tool registration, ListToolsRequest/CallToolRequest handlers, session management

## Acceptance Criteria

- [ ] All five tools registered in `src/index.ts`
- [ ] Shared singleton instances created for `OAuthProvider` and `DrupalConnector`
- [ ] Session ID extracted from MCP transport context (`extra.sessionId`)
- [ ] Tool context passed to all handler functions with sessionId and providers
- [ ] `ListToolsRequestSchema` handler returns all five tool schemas
- [ ] `CallToolRequestSchema` handler routes to appropriate tool functions
- [ ] Tool input schemas properly defined with Zod descriptions
- [ ] Zero TypeScript compilation errors
- [ ] Server starts without errors: `npm run dev`

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Dependencies:**

- All tool modules from Tasks 1, 2, and 3
- Existing `src/server-http.ts` from Plan 02
- `@modelcontextprotocol/sdk/server/index.js` - Server, ListToolsRequestSchema,
  CallToolRequestSchema

**Tool Schemas to Register:**

1. `auth_login` - No parameters
2. `auth_logout` - No parameters
3. `auth_status` - No parameters
4. `search_tutorial` - `{ query: string, limit?: number }`
5. `get_tutorial` - `{ id: string }`

## Input Dependencies

- `src/oauth/provider.ts` - OAuthProvider class
- `src/drupal/connector.ts` - DrupalConnector class
- `src/tools/auth/` - Authentication tool handlers
- `src/tools/content/` - Content tool handlers
- Existing `src/index.ts` with HTTP transport

## Output Artifacts

- Updated `src/index.ts` with all five tools registered
- Shared provider instances initialized at server startup
- Complete MCP server ready for testing

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Update Imports in `src/index.ts`

Add imports for all tools and providers:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Provider imports
import { OAuthProvider } from './oauth/provider.js';
import { DrupalConnector } from './drupal/connector.js';

// Tool imports
import {
  authLogin,
  authLoginSchema,
  authLogout,
  authLogoutSchema,
  authStatus,
  authStatusSchema,
} from './tools/auth/index.js';

import {
  searchTutorial,
  searchTutorialSchema,
  getTutorial,
  getTutorialSchema,
} from './tools/content/index.js';
```

### Step 2: Initialize Shared Provider Instances

Create singleton instances at module level:

```typescript
// Initialize shared providers
const oauthProvider = new OAuthProvider();
const drupalConnector = new DrupalConnector();
```

### Step 3: Register Tools in ListToolsRequestSchema Handler

Update the tool list handler to include all five tools:

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'auth_login',
        description: 'Authenticate with Drupal using OAuth device flow',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'auth_logout',
        description: 'Log out and clear OAuth session',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'auth_status',
        description: 'Check current authentication status',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'search_tutorial',
        description: 'Search Drupal tutorials by keyword',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search keywords',
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 10)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_tutorial',
        description: 'Retrieve a specific tutorial by ID',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Tutorial ID',
            },
          },
          required: ['id'],
        },
      },
    ],
  };
});
```

### Step 4: Implement Tool Call Router

Update the CallToolRequestSchema handler to route to appropriate tools:

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  // Extract session ID from MCP transport context
  const sessionId = extra?.sessionId || 'default-session';

  const toolName = request.params.name;
  const args = request.params.arguments || {};

  // Create shared context for all tools
  const authContext = {
    sessionId,
    oauthProvider,
  };

  const contentContext = {
    sessionId,
    oauthProvider,
    drupalConnector,
  };

  // Route to appropriate tool handler
  switch (toolName) {
    case 'auth_login':
      return authLogin(authLoginSchema.parse(args), authContext);

    case 'auth_logout':
      return authLogout(authLogoutSchema.parse(args), authContext);

    case 'auth_status':
      return authStatus(authStatusSchema.parse(args), authContext);

    case 'search_tutorial':
      return searchTutorial(searchTutorialSchema.parse(args), contentContext);

    case 'get_tutorial':
      return getTutorial(getTutorialSchema.parse(args), contentContext);

    default:
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
  }
});
```

### Step 5: Validation

Run the following checks:

```bash
# Type check
npm run type-check

# Build
npm run build

# Start server (should run without errors)
npm run dev
```

### Step 6: Test with MCP Inspector

```bash
npm run inspect
```

Verify all five tools appear in the tool list and have correct schemas.

### Session ID Propagation

The `extra` parameter from CallToolRequestSchema contains the session ID:

- For HTTP transport: `extra.sessionId` from StreamableHTTP
- Fallback to 'default-session' if not provided
- Session ID used to retrieve tokens from OAuthProvider

### Error Handling

All tools should:

1. Validate input with Zod schemas (throws on invalid input)
2. Check authentication before calling Drupal
3. Return MCP-compliant errors for all failure cases
4. Properly propagate errors from DrupalConnector

</details>
