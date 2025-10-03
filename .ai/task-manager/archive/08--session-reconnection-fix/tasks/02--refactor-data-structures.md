---
id: 2
group: 'token-management'
dependencies: [1]
status: 'completed'
created: '2025-10-02'
skills:
  - typescript
---

# Refactor Token Storage Data Structures

## Objective

Replace session-based token storage with user-level token storage and session-to-user mapping in
`DrupalMCPHttpServer` class, enabling token persistence across reconnections.

## Skills Required

- **TypeScript**: Class refactoring, Map data structures, type definitions

## Acceptance Criteria

- [ ] `userTokens` Map added for user-level token storage
- [ ] `sessionToUser` Map added for session-to-user mapping
- [ ] Old `sessionTokens` Map removed
- [ ] TypeScript types updated for new structures
- [ ] All references to `sessionTokens` updated to use new dual-Map pattern

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary><strong>Implementation Details</strong></summary>

### File Location

`src/index.ts` - `DrupalMCPHttpServer` class (lines 77-86)

### Current Code (Broken)

```typescript
export class DrupalMCPHttpServer {
  private sessionTokens: Map<string, TokenResponse> = new Map();
  private sessionCapabilities: Map<string, ClientCapabilities> = new Map();
  // ...
}
```

### New Code (Fixed)

```typescript
export class DrupalMCPHttpServer {
  // User-level token storage (persistent across reconnections)
  private userTokens: Map<string, TokenResponse> = new Map();
  // userId → { access_token, refresh_token, expires_in }

  // Session-to-user mapping (ephemeral)
  private sessionToUser: Map<string, string> = new Map();
  // sessionId → userId

  // Session capabilities (ephemeral)
  private sessionCapabilities: Map<string, ClientCapabilities> = new Map();
  // sessionId → capabilities
  // ...
}
```

### Type Definitions

Ensure `TokenResponse` type is imported from `oauth/device-flow-types.ts`:

```typescript
import type { TokenResponse } from './oauth/device-flow-types.js';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
```

### Changes Required

1. **Update class properties** (index.ts:85-86)
   - Replace `sessionTokens: Map<string, TokenResponse>` with
     `userTokens: Map<string, TokenResponse>`
   - Add `sessionToUser: Map<string, string>`
   - Keep `sessionCapabilities` unchanged

2. **Update all references**
   - Search for `this.sessionTokens` throughout `index.ts`
   - Update to use new dual-Map lookup pattern
   - Document any complex migration logic

3. **Add initialization logging**
   ```typescript
   constructor(config: HttpServerConfig = DEFAULT_HTTP_CONFIG) {
     // ... existing code ...
     console.log('Token storage initialized: user-level tokens + session-to-user mapping');
   }
   ```

</details>

## Input Dependencies

- JWT decoder utility from Task 1 (`oauth/jwt-decoder.ts`)

## Output Artifacts

- Updated `DrupalMCPHttpServer` class with new data structures
- Removed `sessionTokens` Map
- Updated type imports and definitions

## Implementation Notes

This is a structural change only - no business logic modifications yet. The dual-Map pattern
(userTokens + sessionToUser) separates concerns: user authentication (persistent) from session
lifecycle (ephemeral). Subsequent tasks will update the logic to use these new structures.
