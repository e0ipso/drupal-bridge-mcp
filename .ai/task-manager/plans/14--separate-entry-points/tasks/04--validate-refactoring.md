---
id: 4
group: 'entry-point-separation'
dependencies: [1, 2, 3]
status: 'completed'
created: '2025-10-08'
skills:
  - testing
  - typescript
---

# Validate Refactoring

## Objective

Verify that the refactoring works correctly by building the project, testing all execution modes,
and ensuring no regressions in functionality or tests.

## Skills Required

- **testing**: Manual testing, integration testing, and validation procedures
- **typescript**: TypeScript compilation and type checking

## Acceptance Criteria

- [ ] Build succeeds: `npm run build` completes without errors
- [ ] Both `dist/index.js` and `dist/server.js` exist after build
- [ ] Type checking passes: `npm run type-check` succeeds
- [ ] Development mode works: `npm run dev` starts the server
- [ ] Production mode works: `npm start` starts the server
- [ ] Debug mode works: `npm run start:debug` starts with debug logging
- [ ] Existing test suite passes: `npm test` succeeds
- [ ] Programmatic import works: Can import and use the module without side effects

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

- Build must produce both output files in `dist/` directory
- All npm scripts must execute without errors
- No breaking changes to the module API
- Server must start and respond to requests in all modes
- Test suite must pass without modifications

## Input Dependencies

- Task 1: `src/server.ts` created
- Task 2: `src/index.ts` refactored
- Task 3: `package.json` updated

## Output Artifacts

- Validated build output: `dist/index.js` and `dist/server.js`
- Confirmation that all acceptance criteria pass
- Documentation of any issues found and resolved

## Implementation Notes

<details>
<summary>Detailed Validation Instructions</summary>

### Phase 1: Build Validation

**Step 1: Clean and Build**

```bash
npm run build
```

Expected: Compilation succeeds with no errors.

**Step 2: Verify Output Files**

```bash
ls -la dist/
```

Expected: Both `dist/index.js` and `dist/server.js` exist.

**Step 3: Check Shebang in Compiled File**

```bash
head -n 1 dist/server.js
```

Expected: `#!/usr/bin/env node`

### Phase 2: Type Checking

**Step 4: Type Check**

```bash
npm run type-check
```

Expected: No TypeScript errors.

### Phase 3: Runtime Validation

**Step 5: Test Development Mode**

```bash
npm run dev
```

Expected:

- Server starts without errors
- Displays startup banner
- Listens on configured port (default 6200)
- Can be stopped with Ctrl+C (SIGINT handling works)

**Step 6: Test Production Mode**

```bash
npm start
```

Expected:

- Server starts from compiled `dist/server.js`
- Same behavior as dev mode
- No execution from `dist/index.js` when imported

**Step 7: Test Debug Mode**

```bash
npm run start:debug
```

Expected:

- Server starts with `DEBUG=mcp:*` output
- Debug logs visible in console

### Phase 4: Programmatic Import Test

**Step 8: Create Test Import Script** Create a temporary test file `test-import.mjs`:

```javascript
import { DrupalMCPHttpServer } from './dist/index.js';

console.log('Import successful, no side effects');
console.log('DrupalMCPHttpServer:', typeof DrupalMCPHttpServer);
```

**Step 9: Run Import Test**

```bash
node test-import.mjs
```

Expected:

- No server starts automatically
- Outputs: "Import successful, no side effects"
- Outputs: "DrupalMCPHttpServer: function"

**Step 10: Clean Up**

```bash
rm test-import.mjs
```

### Phase 5: Test Suite Validation

**Step 11: Run Existing Tests**

```bash
npm test
```

Expected:

- All existing tests pass
- No test modifications needed
- Coverage remains the same

### Phase 6: Manual Functional Testing

**Step 12: Start Server and Test Endpoints**

```bash
npm start
```

In another terminal:

```bash
# Test health endpoint
curl http://localhost:6200/health

# Test MCP endpoint (if OAuth disabled or with valid auth)
curl -X POST http://localhost:6200/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'
```

Expected: Endpoints respond correctly.

**Step 13: Test Signal Handling** Start server with `npm start`, then press Ctrl+C. Expected:
Graceful shutdown message appears.

### Troubleshooting Common Issues

**Issue: "Cannot find module './index.js'"**

- Solution: Ensure imports in `src/server.ts` use `.js` extension
- Run `npm run type-check` to catch import errors

**Issue: "dist/server.js not found"**

- Solution: Check `tsconfig.json` includes all `.ts` files in `src/`
- Rebuild with `npm run build`

**Issue: "Permission denied" on bin command**

- Solution: Shebang line must be first line in `dist/server.js`
- Check compiled output has correct shebang

**Issue: Tests fail after refactoring**

- Solution: Should not happen - if it does, verify exports in `src/index.ts`
- Ensure `main` and `handleError` are still exported

### Success Indicators

✅ Build produces both files ✅ No TypeScript errors ✅ All npm scripts work ✅ Import has no side
effects ✅ Tests pass unchanged ✅ Server functionality identical to before

### Failure Handling

If any validation step fails:

1. Document the specific failure
2. Review the related task's implementation
3. Fix the issue before proceeding
4. Re-run all validation steps

</details>
