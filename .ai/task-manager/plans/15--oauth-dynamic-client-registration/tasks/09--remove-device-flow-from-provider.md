---
id: 9
group: 'oauth-client-removal'
dependencies: [7, 8]
status: 'pending'
created: '2025-10-15'
skills:
  - 'typescript'
---

# Remove Device Flow Methods from OAuth Provider

## Objective

Remove `authenticateDeviceFlow()` method and related device flow code from `DrupalOAuthProvider`
class.

## Skills Required

- typescript: Class refactoring, method removal, import cleanup

## Acceptance Criteria

- [ ] Remove `authenticateDeviceFlow()` method from provider
- [ ] Remove device flow related imports
- [ ] Remove any device flow related private methods or properties
- [ ] File compiles without errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

File location: `src/oauth/drupal-oauth-provider.ts` (or similar)

Remove:

- Public method `authenticateDeviceFlow()`
- Any imports from deleted device flow modules
- Any device flow related helper methods

## Input Dependencies

- Task 7: Device flow files deleted
- Task 8: auth_login tool removed (may have called this method)

## Output Artifacts

- `DrupalOAuthProvider` without device flow functionality

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Open the provider file**: `src/oauth/drupal-oauth-provider.ts`

2. **Find device flow imports**: Look for imports like:

   ```typescript
   import { ... } from './device-flow.js';
   import { ... } from './device-flow-handler.js';
   // etc.
   ```

   Remove these import statements.

3. **Find and remove `authenticateDeviceFlow()` method**:
   - Search for `authenticateDeviceFlow`
   - Delete the entire method including JSDoc
   - This method was likely used by the auth_login tool

4. **Check for helper methods**: Look for any private methods that were only used by device flow:
   - Methods with "device" in the name
   - Methods that reference device flow types
   - Remove these if they exist

5. **Verify no other references**: Search the file for:
   - `device` (case insensitive)
   - Any references to removed device flow modules

6. **Run type check**: `npm run type-check` to ensure no broken imports

7. **Expected result**: The provider class should now only handle:
   - Token verification (via JWT)
   - Metadata fetching
   - Resource server operations

</details>
