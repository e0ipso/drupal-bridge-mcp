---
id: 5
group: 'integration'
dependencies: [2, 3, 4]
status: 'completed'
created: '2025-11-04'
skills:
  - 'typescript'
  - 'node-cli'
---

# Integrate CLI Parser into Server Entry Point

## Objective

Modify the server entry point (`src/server.ts`) to parse CLI arguments, handle help/version flags,
apply configuration overrides, and then start the main server with the merged configuration.

## Skills Required

- typescript: Module integration and async/await flow
- node-cli: Entry point orchestration, exit codes, early exit handling

## Acceptance Criteria

- [ ] `src/server.ts` modified to parse CLI arguments before loading main
- [ ] `--help` flag displays help and exits with code 0
- [ ] `--version` flag displays version and exits with code 0
- [ ] CLI arguments override environment variables via applyArgsToEnv
- [ ] Main server starts normally when no help/version flags present
- [ ] Error handling preserves existing behavior
- [ ] Type checking passes without errors
- [ ] Build succeeds and produces working dist/server.js

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Entry Point Flow**:

1. Parse CLI arguments from `process.argv.slice(2)`
2. If `--help`: Display help and exit(0)
3. If `--version`: Display version and exit(0)
4. Apply CLI args to process.env via applyArgsToEnv
5. Import main dynamically (after env override)
6. Execute main() and handle errors as before

**Exit Codes**:

- 0: Success (help/version display, or normal shutdown)
- 1: Error (invalid arguments, server error)

**Backward Compatibility**:

- When no CLI args provided, behavior unchanged
- Existing error handlers still work
- SIGINT/SIGTERM handlers preserved

## Input Dependencies

- parseCliArgs function from cli-parser.ts (task 2)
- applyArgsToEnv function from config-manager.ts (task 3)
- displayHelp and displayVersion from cli-help.ts (task 4)

## Output Artifacts

- Modified `src/server.ts` with CLI argument handling
- Compiled `dist/server.js` executable via build process

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Review current src/server.ts structure**:

   ```typescript
   // Current structure (lines 1-21):
   #!/usr/bin/env node
   import main, { handleError } from './index.js';
   // ... error handlers ...
   // ... shutdown handlers ...
   main().catch(handleError);
   ```

2. **Replace with new implementation**:

   ```typescript
   #!/usr/bin/env node

   import { parseCliArgs } from './utils/cli-parser.js';
   import { applyArgsToEnv } from './utils/config-manager.js';
   import { displayHelp, displayVersion } from './utils/cli-help.js';

   // Parse CLI arguments
   const args = parseCliArgs(process.argv.slice(2));

   // Handle --help flag
   if (args.help) {
     displayHelp();
     process.exit(0);
   }

   // Handle --version flag
   if (args.version) {
     console.log(displayVersion());
     process.exit(0);
   }

   // Apply CLI arguments to environment (validation happens here)
   try {
     applyArgsToEnv(args);
   } catch (error) {
     if (error instanceof Error) {
       console.error(`Configuration error: ${error.message}`);
       console.error('Run with --help for usage information.');
     }
     process.exit(1);
   }

   // Now import main (after env vars are set)
   const { default: main, handleError } = await import('./index.js');

   // Set up error handlers
   process.on('uncaughtException', handleError);
   process.on('unhandledRejection', reason => {
     handleError(new Error(`Unhandled rejection: ${reason}`));
   });

   // Set up shutdown handlers
   process.on('SIGINT', () => {
     process.exit(0);
   });
   process.on('SIGTERM', () => {
     process.exit(0);
   });

   // Execute main
   main().catch(handleError);
   ```

3. **Key implementation details**:
   - **Top-level await**: Use `await import('./index.js')` to dynamically load main after env
     override
   - **Error handling**: Wrap applyArgsToEnv in try-catch to show helpful error messages
   - **Exit codes**: Use process.exit(0) for help/version, exit(1) for errors
   - **Shebang**: Keep `#!/usr/bin/env node` at line 1 for Unix executability

4. **Testing checklist**:

   ```bash
   # Build
   npm run build

   # Test help
   node dist/server.js --help

   # Test version
   node dist/server.js --version

   # Test with valid args
   node dist/server.js --drupal-url=https://example.com --no-auth

   # Test with invalid args
   node dist/server.js --drupal-url=invalid --should-show-error

   # Test without args (should use env vars as before)
   DRUPAL_BASE_URL=https://example.com node dist/server.js
   ```

5. **Verify backward compatibility**:
   - Run existing npm scripts: `npm start`, `npm run dev`
   - Confirm .env files still work
   - Check that existing error handlers trigger correctly

**Design Decisions**:

- Dynamic import of main after env override ensures configuration precedence
- Error output includes suggestion to run --help
- Process.exit() calls are explicit (not implicit) for clarity
- Original error handlers preserved to maintain existing behavior

**Potential Issues**:

- Top-level await requires Node.js 14.8+ (we require 20+, so safe)
- If applyArgsToEnv throws, we catch and show helpful error
- Help/version exit early (don't load main), keeping startup fast

</details>
