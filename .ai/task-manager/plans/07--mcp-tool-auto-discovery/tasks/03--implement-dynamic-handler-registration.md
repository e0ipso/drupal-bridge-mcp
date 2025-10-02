---
id: 3
group: 'handler-registration'
dependencies: [1, 2]
status: 'completed'
created: '2025-10-02'
skills: ['typescript', 'mcp-protocol']
---

# Implement Dynamic Handler Registration

## Objective

Create `src/discovery/dynamic-handlers.ts` to register MCP tool handlers dynamically for discovered
tools using `convertJsonSchemaToZod` and `setRequestHandler`.

## Skills Required

- **typescript**: Generic types, Maps, error handling
- **mcp-protocol**: Understanding MCP SDK `Server`, `CallToolRequestSchema`, request/response
  formats

## Acceptance Criteria

- [ ] `src/discovery/dynamic-handlers.ts` created with exported `registerDynamicTools` function
- [ ] Import `convertJsonSchemaToZod` from `zod-from-json-schema`
- [ ] Convert each tool's inputSchema to Zod schema at registration time
- [ ] Skip tools with invalid schemas, log warnings, continue with valid tools
- [ ] Register single `CallToolRequestSchema` handler with dynamic routing by tool name
- [ ] Validate request parameters with Zod before proxying to Drupal
- [ ] Handle OAuth token propagation for tools with `requiresAuth: true`
- [ ] Proxy validated requests to Drupal JSON-RPC via `DrupalConnector`
- [ ] Format responses as MCP text content
- [ ] Log successful registration with tool count

## Technical Requirements

**File Location**: `src/discovery/dynamic-handlers.ts`

**Imports Needed**:

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { convertJsonSchemaToZod } from 'zod-from-json-schema';
import type { z } from 'zod';
import type { DrupalConnector } from '../drupal-connector.js';
import type { ToolDefinition } from './tool-discovery.js';
```

**Core Function Signature**:

```typescript
export function registerDynamicTools(
  server: Server,
  tools: ToolDefinition[],
  connector: DrupalConnector,
  getSession: (sessionId: string) => Promise<Session | null>
): void;
```

**Dynamic Tool Context**: Store tool metadata with converted Zod schemas:

```typescript
interface DynamicToolContext {
  tool: ToolDefinition;
  schema: z.ZodTypeAny;
  connector: DrupalConnector;
}
```

**OAuth Integration**:

- Check `tool.requiresAuth` flag
- Extract session ID from `extra?.meta?.sessionId`
- Retrieve session and access token via `getSession`
- Set token on `DrupalConnector` before request

## Input Dependencies

- `ToolDefinition[]` from discovery service
- MCP `Server` instance
- `DrupalConnector` instance for JSON-RPC requests
- Session manager function for OAuth token retrieval

## Output Artifacts

- `src/discovery/dynamic-handlers.ts` with handler registration logic
- Registered `CallToolRequestSchema` handler on MCP server
- Map of tool contexts for dynamic routing

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Create File and Import Dependencies

```typescript
/**
 * Dynamic Handler Registration
 *
 * Registers MCP tool handlers dynamically based on discovered tool definitions.
 * Converts JSON Schema to Zod for runtime validation and proxies requests to
 * Drupal JSON-RPC endpoints with OAuth authentication.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { convertJsonSchemaToZod } from 'zod-from-json-schema';
import type { z } from 'zod';
import type { DrupalConnector } from '../drupal-connector.js';
import type { ToolDefinition } from './tool-discovery.js';

// Session type (match existing session-manager.ts)
interface Session {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

interface DynamicToolContext {
  tool: ToolDefinition;
  schema: z.ZodTypeAny;
}
```

### Step 2: Implement Schema Conversion with Error Handling

```typescript
function convertToolSchemas(tools: ToolDefinition[]): Map<string, DynamicToolContext> {
  const toolContexts = new Map<string, DynamicToolContext>();

  for (const tool of tools) {
    try {
      // Convert JSON Schema to Zod schema using zod-from-json-schema
      const zodSchema = convertJsonSchemaToZod(tool.inputSchema);

      toolContexts.set(tool.name, {
        tool,
        schema: zodSchema,
      });

      console.log(`✓ Registered schema for tool: ${tool.name}`);
    } catch (error) {
      // Log warning but continue with other tools
      console.warn(
        `⚠ Skipping tool "${tool.name}": Schema conversion failed.`,
        error instanceof Error ? error.message : String(error)
      );
      console.warn(`  Input schema:`, JSON.stringify(tool.inputSchema, null, 2));
    }
  }

  return toolContexts;
}
```

### Step 3: Implement Main Registration Function

```typescript
export function registerDynamicTools(
  server: Server,
  tools: ToolDefinition[],
  connector: DrupalConnector,
  getSession: (sessionId: string) => Promise<Session | null>
): void {
  // Convert schemas and create tool contexts
  const toolContexts = convertToolSchemas(tools);

  if (toolContexts.size === 0) {
    throw new Error(
      'No valid tools after schema conversion. All tools had invalid JSON schemas. ' +
        'Cannot start MCP server without any tools.'
    );
  }

  // Register single CallToolRequest handler with dynamic routing
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const toolName = request.params.name;
    const context = toolContexts.get(toolName);

    // Handle unknown tool
    if (!context) {
      const availableTools = Array.from(toolContexts.keys()).join(', ');
      throw new Error(`Unknown tool: "${toolName}". Available tools: ${availableTools}`);
    }

    // Handle OAuth authentication if required
    if (context.tool.requiresAuth) {
      const sessionId = extra?.meta?.sessionId;

      if (!sessionId) {
        throw new Error(
          `Tool "${toolName}" requires authentication but no session ID provided. ` +
            `Use auth_login to authenticate first.`
        );
      }

      const session = await getSession(sessionId);

      if (!session?.accessToken) {
        throw new Error(
          `Tool "${toolName}" requires authentication. Session expired or invalid. ` +
            `Use auth_login to authenticate.`
        );
      }

      // Set access token on connector for this request
      connector.setAccessToken(session.accessToken);
    }

    // Validate parameters with Zod schema
    let validatedParams: unknown;
    try {
      validatedParams = context.schema.parse(request.params.arguments || {});
    } catch (zodError) {
      // Format Zod validation errors nicely
      throw new Error(
        `Invalid parameters for tool "${toolName}": ${zodError instanceof Error ? zodError.message : String(zodError)}`
      );
    }

    // Proxy request to Drupal JSON-RPC endpoint
    try {
      const result = await connector.request(context.tool.method, validatedParams);

      // Format response for MCP
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (drupalError) {
      // Add context to Drupal errors
      throw new Error(
        `Tool "${toolName}" execution failed: ${drupalError instanceof Error ? drupalError.message : String(drupalError)}`
      );
    }
  });

  console.log(`✓ Registered ${toolContexts.size} dynamic tool handlers`);
}
```

### Step 4: Add Export

```typescript
export type { DynamicToolContext };
```

### Step 5: Update Discovery Index

Add export to `src/discovery/index.ts`:

```typescript
export { registerDynamicTools } from './dynamic-handlers.js';
```

### Step 6: Type Check

```bash
npm run type-check
```

### Step 7: Review Integration Points

Ensure the following exist in the codebase:

- `src/drupal-connector.ts` exports `DrupalConnector` class
- `DrupalConnector` has `setAccessToken(token: string)` method
- `DrupalConnector` has `request(method: string, params: unknown)` method
- `src/session-manager.ts` exports session interface and `getSession` function

If any are missing, this task may need to wait or the integration code needs updates.

### Troubleshooting

**Issue: `convertJsonSchemaToZod` Type Errors**

- Verify `zod-from-json-schema` is installed correctly
- Check import path uses `.js` extension for ESM compatibility
- Ensure `tsconfig.json` has `"module": "NodeNext"` or `"ESNext"`

**Issue: `DrupalConnector` Type Not Found**

- Check `src/drupal-connector.ts` exists and exports the class
- Verify import path is correct (relative path with `.js`)
- May need to add `type` qualifier: `import type { DrupalConnector }`

**Issue: Zod Validation Errors Not User-Friendly**

- Consider using `zod.safeParse()` instead of `parse()` for better error formatting
- Extract error messages from Zod's error structure
- Add examples of valid parameters in error messages

</details>
