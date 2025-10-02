---
id: 2
group: 'discovery-layer'
dependencies: [1]
status: 'completed'
created: '2025-10-02'
skills: ['typescript', 'http-client']
---

# Implement Tool Discovery Service

## Objective

Create `src/discovery/tool-discovery.ts` to query the Drupal `/mcp/tools/list` endpoint at startup
and parse tool definitions with proper error handling.

**Drupal Backend**: The endpoint is implemented by the `jsonrpc_mcp` Drupal module:
https://github.com/e0ipso/jsonrpc_mcp

## Skills Required

- **typescript**: Type definitions, interfaces, async/await
- **http-client**: Fetch API, HTTP request handling, timeout logic

## Acceptance Criteria

- [ ] `src/discovery/tool-discovery.ts` file created with exported `discoverTools` function
- [ ] TypeScript interfaces defined for `ToolDefinition` and `ToolDiscoveryResponse`
- [ ] HTTP fetch to `/mcp/tools/list` endpoint with optional OAuth token
- [ ] 5-second timeout implemented for discovery request
- [ ] Fail-fast error handling: HTTP errors throw exceptions with clear messages
- [ ] Invalid JSON throws exception with response body details
- [ ] Missing required fields throw exception with validation details
- [ ] Function returns `Promise<ToolDefinition[]>`

## Technical Requirements

**File Location**: `src/discovery/tool-discovery.ts`

**Type Definitions**:

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema; // Will need to import or define JSONSchema type
  endpoint: string;
  method: string;
  requiresAuth: boolean;
}

export interface ToolDiscoveryResponse {
  tools: ToolDefinition[];
}

// JSON Schema type (simplified for Draft 2020-12)
export interface JSONSchema {
  $schema?: string;
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
  [key: string]: any; // Allow additional schema fields
}
```

**Core Function Signature**:

```typescript
export async function discoverTools(
  drupalBaseUrl: string,
  accessToken?: string
): Promise<ToolDefinition[]>;
```

**Error Handling Requirements**:

- **HTTP Errors**: Throw with status code and message
- **Timeouts**: Throw after 5 seconds with timeout message
- **Invalid JSON**: Throw with parse error and response text
- **Missing Fields**: Validate each tool has all required fields, throw if missing
- **Empty Response**: Throw if `tools` array is empty or missing

**Performance**:

- 5-second timeout on fetch request
- No retry logic (fail fast for startup)

## Input Dependencies

- Environment variable `DRUPAL_BASE_URL` or passed as parameter
- Optional OAuth access token for authenticated discovery
- Network access to Drupal server

## Output Artifacts

- `src/discovery/tool-discovery.ts` with exported function and types
- Tool definitions array ready for dynamic handler registration

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Create Directory and File

```bash
mkdir -p src/discovery
touch src/discovery/tool-discovery.ts
```

### Step 2: Implement Type Definitions

Start the file with TypeScript interfaces:

```typescript
/**
 * Tool Discovery Service
 *
 * Queries the Drupal /mcp/tools/list endpoint to discover available tools
 * at server startup. Follows the emerging A2A (agent-to-agent) community
 * standard for dynamic tool registration.
 *
 * @see https://www.devturtleblog.com/agentic-a2a-framework-mcp/
 * @see https://github.com/e0ipso/jsonrpc_mcp - Drupal backend implementation
 */

export interface JSONSchema {
  $schema?: string;
  type?: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
  description?: string;
  [key: string]: any;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  endpoint: string;
  method: string;
  requiresAuth: boolean;
}

export interface ToolDiscoveryResponse {
  tools: ToolDefinition[];
}
```

### Step 3: Implement Validation Helper

Create a helper to validate tool definitions:

```typescript
function validateToolDefinition(tool: any, index: number): asserts tool is ToolDefinition {
  const requiredFields = [
    'name',
    'description',
    'inputSchema',
    'endpoint',
    'method',
    'requiresAuth',
  ];

  for (const field of requiredFields) {
    if (!(field in tool) || tool[field] === undefined || tool[field] === null) {
      throw new Error(
        `Tool discovery failed: Tool at index ${index} missing required field "${field}". ` +
          `Tool data: ${JSON.stringify(tool)}`
      );
    }
  }

  // Additional type validation
  if (typeof tool.name !== 'string' || tool.name.trim() === '') {
    throw new Error(`Tool at index ${index} has invalid name: must be non-empty string`);
  }

  if (typeof tool.inputSchema !== 'object') {
    throw new Error(`Tool "${tool.name}" has invalid inputSchema: must be an object`);
  }

  if (typeof tool.requiresAuth !== 'boolean') {
    throw new Error(`Tool "${tool.name}" has invalid requiresAuth: must be boolean`);
  }
}
```

### Step 4: Implement Discovery Function with Timeout

Implement the main discovery function with AbortController for timeout:

```typescript
export async function discoverTools(
  drupalBaseUrl: string,
  accessToken?: string
): Promise<ToolDefinition[]> {
  const url = `${drupalBaseUrl}/mcp/tools/list`;

  // Create abort controller for 5-second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    console.log(`Discovering tools from ${url}...`);

    const response = await fetch(url, {
      method: 'GET',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle HTTP errors
    if (!response.ok) {
      throw new Error(
        `Tool discovery failed: HTTP ${response.status} ${response.statusText}. ` +
        `Endpoint: ${url}. ` +
        `Troubleshooting: Verify DRUPAL_BASE_URL is correct and /mcp/tools/list endpoint exists.`
      );
    }

    // Parse JSON response
    let data: unknown;
    try {
      data = await response.json();
    } catch (jsonError) {
      const responseText = await response.text().catch(() => '<unable to read response>');
      throw new Error(
        `Tool discovery failed: Invalid JSON response from ${url}. ` +
        `Error: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}. ` +
        `Response: ${responseText.substring(0, 500)}`
      );
    }

    // Validate response structure
    if (!data || typeof data !== 'object') {
      throw new Error(`Tool discovery failed: Response is not an object. Got: ${typeof data}`);
    }

    if (!('tools' in data) || !Array.isArray((data as any).tools)) {
      throw new Error(
        `Tool discovery failed: Response missing "tools" array. ` +
        `Response keys: ${Object.keys(data).join(', ')}`
      );
    }

    const response Data = data as ToolDiscoveryResponse;

    // Validate empty tools array
    if (responseData.tools.length === 0) {
      throw new Error(
        `Tool discovery failed: No tools returned from ${url}. ` +
        `The MCP server cannot start without any tools. ` +
        `Ensure Drupal backend has configured tools at /mcp/tools/list.`
      );
    }

    // Validate each tool definition
    responseData.tools.forEach((tool, index) => {
      validateToolDefinition(tool, index);
    });

    console.log(`✓ Successfully discovered ${responseData.tools.length} tools`);
    return responseData.tools;

  } catch (error) {
    clearTimeout(timeoutId);

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(
        `Tool discovery failed: Request to ${url} timed out after 5 seconds. ` +
        `Check network connectivity and Drupal server status.`
      );
    }

    // Re-throw other errors with context
    throw error;
  }
}
```

### Step 5: Add Export Statement

Ensure all necessary exports are at the top or bottom:

```typescript
export type { ToolDefinition, ToolDiscoveryResponse, JSONSchema };
```

### Step 6: Create Index File for Discovery Module

Create `src/discovery/index.ts` for clean imports:

```typescript
export {
  discoverTools,
  type ToolDefinition,
  type ToolDiscoveryResponse,
  type JSONSchema,
} from './tool-discovery.js';
```

### Step 7: Type Check

Run TypeScript compiler to verify no type errors:

```bash
npm run type-check
```

### Step 8: Manual Testing (Optional)

Create a test script to verify the function works:

```typescript
// test-discovery.ts
import { discoverTools } from './src/discovery/tool-discovery.js';

const DRUPAL_URL = process.env.DRUPAL_BASE_URL || 'https://drupal-contrib.ddev.site';

discoverTools(DRUPAL_URL)
  .then(tools => {
    console.log('Discovered tools:', tools);
  })
  .catch(error => {
    console.error('Discovery failed:', error.message);
    process.exit(1);
  });
```

Run with: `npx tsx test-discovery.ts`

### Troubleshooting

**Issue: TypeScript Cannot Find `fetch`**

- Ensure `tsconfig.json` has `"lib": ["ES2022"]` or includes `"DOM"`
- Node.js 18+ has built-in fetch, verify `engines.node` in package.json

**Issue: CORS Errors**

- Discovery endpoint should not have CORS issues (server-to-server request)
- If testing from browser, CORS headers needed on Drupal side

**Issue: Self-Signed Certificate Errors**

- For development, may need to disable SSL verification
- Production should use valid certificates

</details>
