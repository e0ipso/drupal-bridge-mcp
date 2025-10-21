---
id: 4
group: 'server-initialization'
dependencies: [1, 2]
status: 'completed'
created: '2025-10-19'
skills:
  - typescript
  - oauth
---

# Reorder Server Initialization Sequence

## Objective

Restructure server startup to discover tools before OAuth initialization, extract scopes from tool
metadata, and validate requested scopes against OAuth server capabilities.

## Skills Required

**typescript**: Async/await flow control and complex initialization sequences **oauth**: OAuth
metadata discovery and scope validation

## Acceptance Criteria

- [ ] Server startup reordered: tool discovery → scope extraction → OAuth initialization
- [ ] `discoverTools()` called without authentication token (before OAuth)
- [ ] `extractRequiredScopes()` called with tools and `config.additionalScopes`
- [ ] `configManager.updateScopes()` called with discovered scopes
- [ ] Scope validation against `metadata.scopes_supported` implemented
- [ ] Startup logs show discovered scopes transparently
- [ ] Warnings logged for unsupported scopes (non-blocking)
- [ ] TypeScript compilation passes with no errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File**: `src/index.ts`

**New Startup Sequence:**

1. Create initial OAuth config from environment
2. **Discover tools** from Drupal (no auth token)
3. **Extract scopes** from tool metadata + additional scopes
4. **Log scope information** for transparency
5. **Update OAuth config** with discovered scopes
6. Initialize OAuth provider
7. Fetch OAuth metadata
8. **Validate scopes** against `metadata.scopes_supported`
9. Continue with normal initialization

**Imports Needed:**

- `discoverTools` from `./discovery/tool-discovery.js`
- `extractRequiredScopes` from `./discovery/tool-discovery.js`

## Input Dependencies

- Task 1: `extractRequiredScopes()` function
- Task 2: `updateScopes()` method and `additionalScopes` field

## Output Artifacts

- Updated `src/index.ts` with new initialization sequence
- Startup logs showing discovered scopes
- Scope validation with warnings for unsupported scopes

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Locate Server Start Method

Find the `start()` method in `DrupalMCPHttpServer` class in `src/index.ts`.

### Step 2: Reorder Initialization Sequence

Replace the existing initialization sequence with:

```typescript
async start(): Promise<void> {
  try {
    // Step 1: Create initial OAuth config
    printInfo('Initializing OAuth configuration...', 1);
    const oauthConfig = createOAuthConfigFromEnv();
    const configManager = new OAuthConfigManager(oauthConfig);

    // Step 2: Discover tools BEFORE OAuth initialization
    printInfo('Discovering MCP tools...', 1);
    this.discoveredTools = await discoverTools(
      oauthConfig.drupalUrl,
      undefined // No token for initial discovery
    );

    printSuccess(
      `Discovered ${this.discoveredTools.length} tools from Drupal`
    );

    // Step 3: Extract scopes from discovered tools + additional scopes
    const discoveredScopes = extractRequiredScopes(
      this.discoveredTools,
      oauthConfig.additionalScopes
    );

    printInfo(
      `Extracted ${discoveredScopes.length} scopes from tool definitions`,
      2
    );

    if (oauthConfig.additionalScopes.length > 0) {
      printInfo(
        `Additional scopes: ${oauthConfig.additionalScopes.join(', ')}`,
        2
      );
    }

    printInfo(`Total scopes: ${discoveredScopes.join(', ')}`, 2);

    // Step 4: Update config with discovered + additional scopes
    configManager.updateScopes(discoveredScopes);

    // Step 5: Initialize OAuth with correct scopes
    printInfo('Initializing OAuth provider...', 1);
    const oauthProvider = createDrupalOAuthProvider(configManager);
    this.oauthProvider = oauthProvider;

    // Step 6: Fetch OAuth metadata
    const metadata = await configManager.fetchMetadata();

    // Step 7: Validate scopes against server's supported scopes
    if (metadata.scopes_supported) {
      this.validateScopes(
        configManager.getConfig().scopes,
        metadata.scopes_supported
      );
    }

    // ... rest of initialization (continue with existing code)
  } catch (error) {
    printError('Failed to start MCP server');
    printError(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
```

### Step 3: Add validateScopes() Private Method

Add this private method to the `DrupalMCPHttpServer` class:

```typescript
/**
 * Validates that requested scopes are supported by the OAuth server.
 */
private validateScopes(
  requestedScopes: string[],
  supportedScopes: string[]
): void {
  const unsupportedScopes = requestedScopes.filter(
    scope => !supportedScopes.includes(scope)
  );

  if (unsupportedScopes.length > 0) {
    printWarning(
      `Some requested scopes are not supported by the OAuth server:`
    );
    printWarning(`  Unsupported: ${unsupportedScopes.join(', ')}`, 2);
    printWarning(`  Supported: ${supportedScopes.join(', ')}`, 2);
    printWarning(
      `  These scopes will be ignored during authentication.`,
      2
    );
  }
}
```

### Step 4: Add discoveredTools Property

Ensure the class has a property to store discovered tools:

```typescript
export class DrupalMCPHttpServer {
  private discoveredTools: ToolDefinition[] = [];
  // ... other properties
}
```

### Step 5: Update Imports

At the top of `src/index.ts`, add:

```typescript
import {
  discoverTools,
  extractRequiredScopes,
  type ToolDefinition,
} from './discovery/tool-discovery.js';
```

### Step 6: Verify Logging Output

When you run the server, startup logs should show:

```
✓ Discovered 15 tools from Drupal
  Extracted 8 scopes from tool definitions
  Additional scopes: admin:access
  Total scopes: admin:access, content:read, content:write, content_type:read, profile, ...
```

### Step 7: Test Startup Sequence

Run the development server to verify the new sequence:

```bash
npm run dev
```

### Important Notes

- **Public Endpoint**: Initial tool discovery assumes `/mcp/tools/list` is publicly accessible. If
  it's protected, this will fail gracefully (tools with no auth metadata will still work).
- **No Auth Token**: The `discoverTools()` call uses `undefined` for the access token parameter.
- **Non-Blocking Warnings**: Unsupported scopes generate warnings but don't block startup. The OAuth
  server will simply ignore them.

</details>
