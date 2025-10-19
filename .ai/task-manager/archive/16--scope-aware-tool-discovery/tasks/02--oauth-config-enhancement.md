---
id: 2
group: 'oauth-config'
dependencies: []
status: 'completed'
created: '2025-10-19'
skills:
  - typescript
  - oauth
---

# Enhance OAuth Configuration with Additional Scopes Support

## Objective

Extend OAuth configuration to support additional scopes from environment variables and enable
post-discovery scope updates, allowing dynamic scope management.

## Skills Required

**typescript**: Type system and class method implementation **oauth**: Understanding of OAuth scope
management and configuration patterns

## Acceptance Criteria

- [ ] `additionalScopes` field added to `OAuthConfig` interface
- [ ] `createOAuthConfigFromEnv()` parses `OAUTH_ADDITIONAL_SCOPES` environment variable
- [ ] Space-separated and comma-separated scope formats both supported
- [ ] `updateScopes()` method added to `OAuthConfigManager` class
- [ ] Metadata cache cleared when scopes updated
- [ ] TypeScript compilation passes with no errors
- [ ] Code follows existing codebase patterns

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**File**: `src/oauth/config.ts`

**Interface Updates:**

- Add `additionalScopes: string[]` to `OAuthConfig`

**Environment Parsing:**

- Parse `OAUTH_ADDITIONAL_SCOPES` from env (space or comma-separated)
- Default to empty array if not set

**OAuthConfigManager Methods:**

- `updateScopes(scopes: string[]): void` - Update config scopes and clear cache
- Validation: scopes must be non-empty array

## Input Dependencies

None - OAuth configuration is independent of tool discovery types (though they'll be used together
later).

## Output Artifacts

- Updated `src/oauth/config.ts` with:
  - Extended `OAuthConfig` interface
  - Enhanced `createOAuthConfigFromEnv()` function
  - New `updateScopes()` method in `OAuthConfigManager`

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Update OAuthConfig Interface

Modify the `OAuthConfig` interface to add the new field:

```typescript
export interface OAuthConfig {
  drupalUrl: string;
  scopes: string[];
  resourceServerUrl?: string;
  additionalScopes: string[]; // ADD THIS
}
```

### Step 2: Update createOAuthConfigFromEnv()

Enhance the function to parse `OAUTH_ADDITIONAL_SCOPES`:

```typescript
/**
 * Creates an OAuth configuration from environment variables.
 * Scopes are always discovered from tools, with optional additional scopes.
 *
 * @returns {OAuthConfig} OAuth configuration
 * @throws {Error} If required environment variables are missing
 */
export function createOAuthConfigFromEnv(): OAuthConfig {
  const drupalUrl = process.env.DRUPAL_URL || process.env.DRUPAL_BASE_URL;
  const scopesString = process.env.OAUTH_SCOPES;
  const additionalScopesString = process.env.OAUTH_ADDITIONAL_SCOPES;
  const resourceServerUrl = process.env.OAUTH_RESOURCE_SERVER_URL;

  if (!drupalUrl) {
    throw new Error('DRUPAL_URL or DRUPAL_BASE_URL environment variable is required');
  }

  // Parse scopes from space or comma-separated string
  const scopes = scopesString
    ? scopesString
        .split(/[\s,]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
    : ['profile'];

  // Parse additional scopes from environment (optional)
  const additionalScopes = additionalScopesString
    ? additionalScopesString
        .split(/[\s,]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
    : [];

  return {
    drupalUrl,
    scopes,
    resourceServerUrl,
    additionalScopes,
  };
}
```

### Step 3: Add updateScopes() Method to OAuthConfigManager

Add this method to the `OAuthConfigManager` class:

```typescript
/**
 * Updates the scopes in the configuration.
 * Used after tool discovery to set required scopes.
 *
 * @param scopes - Array of scope strings from tool discovery
 */
updateScopes(scopes: string[]): void {
  if (!Array.isArray(scopes) || scopes.length === 0) {
    throw new Error('Scopes must be a non-empty array');
  }

  this.config.scopes = scopes;

  // Clear metadata cache to force re-fetch with new scopes
  this.clearCache();
}
```

### Step 4: Verify TypeScript Compilation

Run type checking:

```bash
npm run type-check
```

### Notes

- The `OAUTH_SCOPES` environment variable is kept for backward compatibility but will be deprecated
- The split regex `/[\s,]+/` handles both space and comma-separated values
- `additionalScopes` defaults to empty array, not `['profile']` - profile is always added by
  `extractRequiredScopes()`

</details>
