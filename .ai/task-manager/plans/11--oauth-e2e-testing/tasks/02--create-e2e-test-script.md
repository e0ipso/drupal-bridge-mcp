---
id: 2
group: 'test-implementation'
dependencies: [1]
status: 'pending'
created: '2025-10-03'
skills:
  - 'typescript'
  - 'e2e-testing'
---

# Create OAuth Flow E2E Test Script

## Objective

Develop the core e2e test script that automates the 7-step OAuth flow using the MCP Inspector CLI to
validate session management and token persistence.

## Skills Required

- **typescript**: Test script development with proper typing
- **e2e-testing**: End-to-end test patterns with child process execution and assertions

## Acceptance Criteria

- [ ] Test file created at `src/__tests__/e2e/oauth-flow.e2e.test.ts`
- [ ] All 7 steps from the methodology are implemented as test cases
- [ ] Inspector CLI commands are executed via child process
- [ ] JSON responses are parsed and validated with assertions
- [ ] Interactive prompts guide user through manual OAuth approval
- [ ] Test can detect the documented 403 error on reconnection

## Technical Requirements

- Use Node.js `child_process.execSync` or `spawn` to run Inspector CLI commands
- Parse JSON output from Inspector CLI (use `--cli` flag for JSON format)
- Implement the 7 test steps:
  1. Connection test (tools/list)
  2. OAuth initiation
  3. Manual OAuth approval (interactive pause)
  4. Reconnection validation
  5. Token association check
  6. Authenticated tool execution
  7. Session state verification via /health and /debug endpoints
- Use Jest assertions (expect) to validate responses
- Handle both success and failure scenarios

## Input Dependencies

- Installed `@modelcontextprotocol/inspector` package (Task 1)
- OAuth flow methodology document (`.ai/testing/oauth-flow-test-methodology.md`)
- Existing session reconnection test patterns (`src/__tests__/session-reconnection.test.ts`)

## Output Artifacts

- `src/__tests__/e2e/oauth-flow.e2e.test.ts` - Main test file
- Test helper utilities for Inspector CLI execution

## Implementation Notes

<details>
<summary>Click to expand implementation details</summary>

### Test Structure

```typescript
import { execSync } from 'child_process';
import { describe, it, expect } from '@jest/globals';

describe('OAuth Flow E2E Tests', () => {
  // Helper function to execute Inspector CLI
  const runInspectorCLI = (method: string, args: string[] = []): any => {
    const cmd = `npx @modelcontextprotocol/inspector --cli npm run start -- ${args.join(' ')} --method ${method}`;
    const output = execSync(cmd, { encoding: 'utf-8' });
    return JSON.parse(output);
  };

  it('Step 1: Initial connection and tools list', async () => {
    const result = runInspectorCLI('tools/list');
    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBeGreaterThan(0);
  });

  // Add remaining 6 steps...
});
```

### Interactive Prompts

For step 3 (manual OAuth approval), use readline or prompts package:

```typescript
import readline from 'readline';

const waitForUserInput = (message: string): Promise<void> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(message, () => {
      rl.close();
      resolve();
    });
  });
};

// In test:
await waitForUserInput('Please complete OAuth authorization in browser, then press Enter...');
```

### Error Detection

The test should validate that the documented bug occurs:

```typescript
it('Step 7: Authenticated tool execution (should fail with 403)', async () => {
  const result = runInspectorCLI('tools/call', ['--tool-name', 'examples.contentTypes.list']);

  // Expect 403 error due to token association bug
  expect(result.error).toBeDefined();
  expect(result.error.code).toBe(-32603);
  expect(result.error.message).toContain('403');
});
```

### Test Configuration

- Set test timeout to 120s to allow for manual interaction
- Use environment variables for server configuration
- Log raw Inspector output for debugging when assertions fail
</details>
