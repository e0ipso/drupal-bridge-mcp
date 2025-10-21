---
id: 3
group: oauth-config-refactor
dependencies: []
status: completed
created: '2025-10-15'
skills:
  - typescript
---

# Update OAuthConfig Interface to Remove Client Credentials

## Objective

Remove `clientId` and `clientSecret` properties from the `OAuthConfig` interface since the MCP
server is a resource server, not an OAuth client.

## Skills Required

- typescript: Interface refactoring, type system

## Acceptance Criteria

- [ ] `OAuthConfig` interface removes `clientId` and `clientSecret` properties
- [ ] Interface retains `drupalUrl`, `scopes`, and `resourceServerUrl` properties
- [ ] Add JSDoc comment explaining resource server architecture
- [ ] File compiles without errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

File location: `src/oauth/config.ts`

Update the interface definition around line 120-130 based on the plan's specification.

## Input Dependencies

None - this is an independent refactoring task

## Output Artifacts

- Updated `OAuthConfig` interface in `src/oauth/config.ts`

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Locate the interface**: Find `OAuthConfig` interface in `src/oauth/config.ts`

2. **Update the interface**:

   ```typescript
   /**
    * OAuth configuration for the MCP resource server.
    * Note: This server acts as a resource server only, not an OAuth client.
    * Token verification is performed via JWT signature validation using Drupal's JWKS.
    */
   export interface OAuthConfig {
     drupalUrl: string;
     scopes: string[];
     resourceServerUrl?: string;
     // clientId and clientSecret removed - not needed for resource server
   }
   ```

3. **What NOT to change**:
   - Do not modify the `createOAuthConfigFromEnv()` function yet (that's in task 4)
   - Do not remove the environment variable reads yet
   - This task only updates the TypeScript interface

4. **Expected compiler errors**: After this change, you may see TypeScript errors in code that
   references `config.clientId` or `config.clientSecret`. These will be fixed in subsequent tasks.
   That's expected and acceptable for this atomic task.

</details>
