---
id: 1
group: 'foundation-types'
dependencies: []
status: 'completed'
created: '2025-10-19'
skills:
  - typescript
---

# Add Authentication Metadata Types and Helper Functions

## Objective

Establish TypeScript interfaces and helper functions for structured authentication requirements in
tool definitions, enabling intelligent scope inference and validation.

## Skills Required

**typescript**: Type system expertise for creating interfaces with optional fields and intelligent
type inference logic.

## Acceptance Criteria

- [ ] `ToolAuthMetadata` interface added with optional `level`, `scopes`, and `description` fields
- [ ] `ToolDefinition.annotations` updated to include optional `auth?: ToolAuthMetadata`
- [ ] `getAuthLevel()` function implemented with correct inference logic
- [ ] `extractRequiredScopes()` function implemented to collect unique scopes from tools
- [ ] `validateToolAccess()` function implemented to enforce scope requirements
- [ ] All functions properly typed with TypeScript strict mode
- [ ] Code follows existing codebase patterns (ES modules, .js imports)

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File**: `src/discovery/tool-discovery.ts`

**Type Definitions:**

- `ToolAuthMetadata` interface with:
  - `level?: 'none' | 'optional' | 'required'`
  - `scopes?: string[]`
  - `description?: string`
- Update `ToolDefinition.annotations` type to support `auth?: ToolAuthMetadata`

**Helper Functions:**

1. `getAuthLevel(authMetadata?: ToolAuthMetadata): 'none' | 'optional' | 'required'`
   - Returns 'none' if authMetadata undefined
   - Returns explicit level if defined
   - Returns 'required' if scopes present but level undefined
   - Returns 'none' otherwise

2. `extractRequiredScopes(tools: ToolDefinition[], additionalScopes: string[] = []): string[]`
   - Always includes 'profile' scope
   - Extracts scopes from tools with auth level != 'none'
   - Merges with additionalScopes
   - Returns sorted array of unique scopes

3. `validateToolAccess(tool: ToolDefinition, sessionScopes: string[]): void`
   - Allows access for auth level 'none' or 'optional'
   - For 'required' level: throws Error if sessionScopes empty or missing required scopes
   - Error message format: multi-line with Required/Missing/Current scopes

## Input Dependencies

None - this is the foundation task.

## Output Artifacts

- Updated `src/discovery/tool-discovery.ts` with new types and exported functions
- TypeScript definitions usable by OAuth config, server initialization, and runtime validation

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Add ToolAuthMetadata Interface

Add after the existing `JSONSchema` interface:

```typescript
export interface ToolAuthMetadata {
  /**
   * Authentication requirement level (optional - inferred from scopes)
   * - If scopes present but level undefined: defaults to 'required'
   * - If no scopes and no level: defaults to 'none'
   * - Explicit value overrides inference
   */
  level?: 'none' | 'optional' | 'required';
  /** OAuth 2.1 scopes required to invoke this tool */
  scopes?: string[];
  /** Human-readable description of auth requirements */
  description?: string;
}
```

### Step 2: Update ToolDefinition Interface

Update the `annotations` field in `ToolDefinition`:

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema?: JSONSchema;
  title?: string;
  annotations?: {
    category?: string;
    returns?: string;
    supports_pagination?: boolean;
    auth?: ToolAuthMetadata; // ADD THIS
    [key: string]: unknown;
  };
}
```

### Step 3: Implement getAuthLevel()

Add this export function after `discoverTools()`:

```typescript
/**
 * Gets the authentication level for a tool, with inference from scopes.
 *
 * @param authMetadata - The tool's auth metadata (optional)
 * @returns Authentication level: 'none', 'optional', or 'required'
 */
export function getAuthLevel(authMetadata?: ToolAuthMetadata): 'none' | 'optional' | 'required' {
  // No auth metadata at all
  if (!authMetadata) {
    return 'none';
  }

  // Explicit level overrides inference
  if (authMetadata.level !== undefined) {
    return authMetadata.level;
  }

  // Infer from scopes: if scopes present, default to 'required'
  if (authMetadata.scopes && authMetadata.scopes.length > 0) {
    return 'required';
  }

  // No scopes, no explicit level
  return 'none';
}
```

### Step 4: Implement extractRequiredScopes()

```typescript
/**
 * Extracts all required OAuth scopes from discovered tools.
 *
 * @param tools - Array of tool definitions
 * @param additionalScopes - Optional additional scopes to include
 * @returns Array of unique scope strings, always includes 'profile'
 */
export function extractRequiredScopes(
  tools: ToolDefinition[],
  additionalScopes: string[] = []
): string[] {
  const scopes = new Set<string>(['profile']); // Always include profile

  // Add scopes from tool definitions
  for (const tool of tools) {
    const authMetadata = tool.annotations?.auth;
    const authLevel = getAuthLevel(authMetadata);

    // Skip tools that don't use authentication
    if (authLevel === 'none') {
      continue;
    }

    // Add tool's required scopes (for both 'optional' and 'required' auth)
    if (authMetadata?.scopes) {
      authMetadata.scopes.forEach(scope => scopes.add(scope));
    }
  }

  // Add additional scopes from environment
  additionalScopes.forEach(scope => scopes.add(scope));

  return Array.from(scopes).sort();
}
```

### Step 5: Implement validateToolAccess()

```typescript
/**
 * Validates if a session has required scopes to invoke a tool.
 *
 * @param tool - The tool definition
 * @param sessionScopes - OAuth scopes granted to the session
 * @throws Error if access is denied
 */
export function validateToolAccess(tool: ToolDefinition, sessionScopes: string[]): void {
  const authMetadata = tool.annotations?.auth;
  const authLevel = getAuthLevel(authMetadata);

  // Allow access if auth level is 'none'
  if (authLevel === 'none') {
    return;
  }

  // For 'optional' auth, allow access even without authentication
  // but scopes will be used if available
  if (authLevel === 'optional') {
    return;
  }

  // For 'required' auth, enforce authentication and scopes
  if (authLevel === 'required') {
    // Require authentication
    if (!sessionScopes || sessionScopes.length === 0) {
      throw new Error(`Tool "${tool.name}" requires authentication. Please authenticate first.`);
    }

    // Check required scopes
    const requiredScopes = authMetadata?.scopes || [];
    const missingScopes = requiredScopes.filter(scope => !sessionScopes.includes(scope));

    if (missingScopes.length > 0) {
      const message = [
        `Insufficient OAuth scopes for tool "${tool.name}".`,
        `Required: ${requiredScopes.join(', ')}`,
        `Missing: ${missingScopes.join(', ')}`,
        `Current: ${sessionScopes.join(', ')}`,
      ].join('\n');

      throw new Error(message);
    }
  }
}
```

### Step 6: Verify TypeScript Compilation

Run type checking to ensure no errors:

```bash
npm run type-check
```

</details>
