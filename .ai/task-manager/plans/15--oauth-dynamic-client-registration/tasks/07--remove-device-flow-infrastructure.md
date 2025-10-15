---
id: 7
group: 'oauth-client-removal'
dependencies: []
status: 'completed'
created: '2025-10-15'
skills:
  - 'typescript'
  - 'file-management'
---

# Remove Device Flow Infrastructure

## Objective

Delete all device flow related files and code since the MCP server should be a pure resource server,
not an OAuth client.

## Skills Required

- typescript: Understanding code dependencies
- file-management: Deleting files and directories

## Acceptance Criteria

- [x] Delete `src/oauth/device-flow.ts`
- [x] Delete `src/oauth/device-flow-handler.ts`
- [x] Delete `src/oauth/device-flow-detector.ts`
- [x] Delete `src/oauth/device-flow-types.ts`
- [x] Delete `src/oauth/device-token-poller.ts`
- [x] Delete `src/oauth/device-flow-ui.ts`
- [x] Remove device flow tests if they exist

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

Files to delete (from the plan):

- `src/oauth/device-flow.ts`
- `src/oauth/device-flow-handler.ts`
- `src/oauth/device-flow-detector.ts`
- `src/oauth/device-flow-types.ts`
- `src/oauth/device-token-poller.ts`
- `src/oauth/device-flow-ui.ts`

Also check for and remove:

- Tests in `src/oauth/__tests__/` or `tests/` directories related to device flow

## Input Dependencies

None - this is independent cleanup

## Output Artifacts

- Device flow files deleted from repository

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Verify files exist**: Before deleting, check which files actually exist:

   ```bash
   ls -la src/oauth/device-*.ts
   ```

2. **Delete device flow files**:

   ```bash
   rm -f src/oauth/device-flow.ts
   rm -f src/oauth/device-flow-handler.ts
   rm -f src/oauth/device-flow-detector.ts
   rm -f src/oauth/device-flow-types.ts
   rm -f src/oauth/device-token-poller.ts
   rm -f src/oauth/device-flow-ui.ts
   ```

3. **Find and remove device flow tests**:

   ```bash
   find src tests -name "*device-flow*.test.ts" -type f
   # If any found, delete them
   ```

4. **Don't modify imports yet**: If other files import these modules, TypeScript will show errors.
   Those imports will be cleaned up in subsequent tasks.

5. **Rationale**: Device flow is an OAuth client feature. Claude Code provides OAuth client
   functionality, so the MCP server doesn't need this code.

</details>
