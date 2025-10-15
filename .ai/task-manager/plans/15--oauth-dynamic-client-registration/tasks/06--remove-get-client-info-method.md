---
id: 6
group: 'oauth-provider-refactor'
dependencies: [5]
status: 'pending'
created: '2025-10-15'
skills:
  - 'typescript'
---

# Remove getClientInfo Method

## Objective

Remove the `getClientInfo()` method from `DrupalOAuthProvider` since it's no longer needed for
resource server operation.

## Skills Required

- typescript: Class refactoring, method removal

## Acceptance Criteria

- [ ] `getClientInfo()` method is completely removed from `DrupalOAuthProvider`
- [ ] Remove any calls to `getClientInfo()` within the class
- [ ] Remove related imports if no longer used
- [ ] File compiles without errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

File location: `src/oauth/drupal-oauth-provider.ts` (or similar)

This method was used for token introspection which is being replaced by JWT verification.

## Input Dependencies

- Task 5: Token verification now uses JWT, not introspection

## Output Artifacts

- `DrupalOAuthProvider` class without `getClientInfo()` method

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Search for the method**: Look for `getClientInfo` in the provider file

2. **Remove the method**: Delete the entire method definition including:
   - Method signature
   - Method body
   - JSDoc comments
   - All implementation code

3. **Check for references**: Search the same file for any calls to `this.getClientInfo()` or
   `getClientInfo()`
   - If found, remove or refactor those calls
   - Most likely there are no other references since token verification is now self-contained

4. **Verify compilation**: Run `npm run type-check` to ensure no broken references

5. **What this method did**: It used client credentials to call Drupal's token introspection
   endpoint. Since we're now using JWT verification (which is cryptographically secure and doesn't
   require client credentials), this method is obsolete.

</details>
