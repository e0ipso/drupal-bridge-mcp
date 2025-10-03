---
id: 1
group: 'session-architecture'
dependencies: []
status: 'completed'
created: '2025-10-03'
skills:
  - 'typescript'
  - 'express'
---

# Refactor DrupalMCPHttpServer Class Architecture for Per-Session Transport

## Objective

Replace the single Server and Transport instance pattern with a session-based map architecture that
supports multiple concurrent client connections.

## Skills Required

- **TypeScript**: Refactoring class properties and type definitions
- **Express**: Understanding of HTTP server architecture and session management

## Acceptance Criteria

- [ ] Remove `private server: Server` property from class
- [ ] Remove `private transport?: StreamableHTTPServerTransport` property from class
- [ ] Add
      `private transports: Map<string, { server: Server, transport: StreamableHTTPServerTransport }>`
      property
- [ ] Update constructor to initialize empty transports map
- [ ] Preserve existing `userTokens`, `sessionToUser`, and `sessionCapabilities` maps (Plan 8
      architecture)
- [ ] Code compiles without TypeScript errors
- [ ] No references to removed `this.server` or `this.transport` remain (except in methods to be
      updated in later tasks)

## Technical Requirements

**Current Class Structure (to be removed):**

```typescript
private server: Server;
private transport?: StreamableHTTPServerTransport;
```

**Target Class Structure (to be added):**

```typescript
private transports: Map<string, {
  server: Server,
  transport: StreamableHTTPServerTransport
}>;
```

**Preserved Plan 8 Architecture:**

```typescript
private userTokens: Map<string, TokenResponse>;
private sessionToUser: Map<string, string>;
private sessionCapabilities: Map<string, ClientCapabilities>;
```

**File Location**: `src/index.ts` **Lines to modify**: Class properties section (~lines 78-98)

## Input Dependencies

- Existing `DrupalMCPHttpServer` class in `src/index.ts`
- Plan 8 token storage architecture (must be preserved)

## Output Artifacts

- Updated class with session map architecture
- TypeScript type definitions for transport map
- Basis for subsequent session routing implementation

<details>
<summary>Implementation Notes</summary>

### Step-by-Step Instructions

1. **Locate Class Properties** (lines 78-98 in `src/index.ts`):
   - Find `private server: Server;`
   - Find `private transport?: StreamableHTTPServerTransport;`

2. **Remove Single Instance Properties**:

   ```typescript
   // DELETE these lines:
   private server: Server;
   private transport?: StreamableHTTPServerTransport;
   ```

3. **Add Session Map Property**:

   ```typescript
   // ADD this line (after class declaration, before userTokens):
   private transports: Map<string, {
     server: Server,
     transport: StreamableHTTPServerTransport
   }>;
   ```

4. **Update Constructor** (line ~99):
   - Remove initialization of `this.server`
   - Add initialization of transports map:

   ```typescript
   constructor(config: HttpServerConfig = DEFAULT_HTTP_CONFIG) {
     this.config = config;
     // REMOVE: this.server = new Server(...);

     // ADD: Initialize transports map
     this.transports = new Map();

     this.app = express();
     this.setupMiddleware();
     this.setupHandlers();

     console.log(
       'Transport map initialized for per-session Server+Transport instances'
     );
   }
   ```

5. **Verify Compilation**:
   - Run `npm run build` to check for TypeScript errors
   - Expect errors in `setupMcpEndpoint()` and `stop()` methods (these will be fixed in later tasks)
   - Errors are expected and acceptable for this task

6. **Important Notes**:
   - Do NOT modify `setupMcpEndpoint()` method (Task 2)
   - Do NOT modify `stop()` method (Task 5)
   - Do NOT modify `setupHandlers()` method (no changes needed)
   - Preserve ALL existing maps: `userTokens`, `sessionToUser`, `sessionCapabilities`

### Expected State After Task

- Class has `transports` map instead of single `server`/`transport`
- Constructor initializes empty map
- TypeScript errors in other methods (to be resolved in Tasks 2 and 5)
- Plan 8 token storage architecture remains unchanged

</details>
