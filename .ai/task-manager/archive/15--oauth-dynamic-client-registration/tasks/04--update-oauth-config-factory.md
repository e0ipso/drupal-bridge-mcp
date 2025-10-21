---
id: 4
group: oauth-config-refactor
dependencies:
  - 3
status: completed
created: '2025-10-15'
skills:
  - typescript
---

# Update OAuth Config Factory Function

## Objective

Remove client credential validation and assignment from `createOAuthConfigFromEnv()` function to
allow OAuth initialization without pre-configured credentials.

## Skills Required

- typescript: Function refactoring, environment variable handling

## Acceptance Criteria

- [ ] Remove `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` environment variable reads
- [ ] Remove credential validation (the two `throw new Error` statements)
- [ ] Return config object without `clientId` and `clientSecret` properties
- [ ] Function successfully creates config with only Drupal URL and scopes
- [ ] File compiles without errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

File location: `src/oauth/config.ts`

Update the `createOAuthConfigFromEnv()` function around lines 147-183 based on the plan's
specification.

## Input Dependencies

- Task 3: Updated `OAuthConfig` interface

## Output Artifacts

- Updated `createOAuthConfigFromEnv()` function in `src/oauth/config.ts`

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Locate the function**: Find `createOAuthConfigFromEnv()` in `src/oauth/config.ts` (around
   line 147)

2. **Current implementation** (to be removed):

   ```typescript
   export function createOAuthConfigFromEnv(): OAuthConfig {
     const clientId = process.env.OAUTH_CLIENT_ID;
     const clientSecret = process.env.OAUTH_CLIENT_SECRET;

     if (!clientId) {
       throw new Error('OAUTH_CLIENT_ID environment variable is required');
     }

     if (!clientSecret) {
       throw new Error('OAUTH_CLIENT_SECRET environment variable is required');
     }

     return {
       drupalUrl,
       clientId,
       clientSecret,
       scopes,
       resourceServerUrl,
     };
   }
   ```

3. **New implementation**:

   ```typescript
   export function createOAuthConfigFromEnv(): OAuthConfig {
     return {
       drupalUrl,
       scopes,
       resourceServerUrl,
     };
   }
   ```

4. **Note**: The `drupalUrl`, `scopes`, and `resourceServerUrl` variables should already be defined
   earlier in the file from other environment variables. Don't modify those.

5. **Verification**: After this change, the OAuth initialization should succeed even without
   `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` in `.env`.

</details>
