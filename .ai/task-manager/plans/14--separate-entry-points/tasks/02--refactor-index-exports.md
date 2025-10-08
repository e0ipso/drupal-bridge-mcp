---
id: 2
group: 'entry-point-separation'
dependencies: [1]
status: 'completed'
created: '2025-10-08'
skills:
  - typescript
---

# Refactor Index to Pure Module Exports

## Objective

Clean up `src/index.ts` to be a pure module export file by removing all execution logic, keeping
only the class definitions, type exports, and utility function exports.

## Skills Required

- **typescript**: TypeScript module exports, interface definitions, and ES module patterns

## Acceptance Criteria

- [ ] Shebang line removed from `src/index.ts`
- [ ] Conditional execution block removed (lines 1078-1080: `if (import.meta.url === ...)`)
- [ ] All existing exports remain intact: `DrupalMCPHttpServer`, `HttpServerConfig`, `main`,
      `handleError`
- [ ] `main()` and `handleError()` functions remain exported (needed by `src/server.ts`)
- [ ] File has no side effects when imported
- [ ] Type checking passes: `npm run type-check`

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

- Preserve all existing exports to maintain API compatibility
- Ensure `main` is exported as default export and also as named export `handleError`
- Remove only the execution-related code, not the function definitions
- Keep all class definitions, interfaces, types, and utility functions unchanged

## Input Dependencies

- Task 1 completed: `src/server.ts` exists and imports from `src/index.ts`
- Current `src/index.ts` structure (lines 1-1085)

## Output Artifacts

- Modified `src/index.ts` with pure module exports
- No breaking changes to the exported API

## Implementation Notes

<details>
<summary>Detailed Implementation Instructions</summary>

### Step 1: Remove Shebang Line

Delete line 1 of `src/index.ts`:

```typescript
#!/usr/bin/env node
```

### Step 2: Remove Conditional Execution Block

Delete lines 1078-1080:

```typescript
// Start the server if this module is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(handleError);
}
```

### Step 3: Verify Exports

Ensure these exports remain at the end of the file (lines 1082-1084):

```typescript
// Export for programmatic use
export { type HttpServerConfig };
export default main;
```

### Step 4: Ensure handleError is Exported

The `handleError` function (defined around line 1035) should be exported. Add it to the exports if
not already present:

```typescript
export { type HttpServerConfig, handleError };
export default main;
```

### Step 5: Verify No Side Effects

After changes, importing the module should:

- Not start the server automatically
- Not execute any code beyond definitions
- Allow programmatic use of exported classes and functions

### Step 6: Type Check

Run `npm run type-check` to ensure no TypeScript errors were introduced.

### What NOT to Change

- **Do not modify**: Class definitions (`DrupalMCPHttpServer`)
- **Do not modify**: Interface definitions (`HttpServerConfig`)
- **Do not modify**: Function definitions (`main`, `handleError`, `handleShutdown`)
- **Do not modify**: Import statements
- **Do not modify**: Any middleware setup or configuration

### Expected Final State

The file should:

- End with clean export statements
- Have no execution code (no `if` blocks checking for direct execution)
- Have no shebang line
- Still export everything needed for programmatic use

</details>
