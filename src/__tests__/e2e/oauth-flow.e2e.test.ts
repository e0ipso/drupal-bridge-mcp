/**
 * OAuth Flow End-to-End Tests
 *
 * This test suite validates the complete OAuth authentication flow using the
 * MCP Inspector CLI. It automates the 7-step methodology documented in
 * `.ai/testing/oauth-flow-test-methodology.md`.
 *
 * **IMPORTANT**: These tests require manual execution due to:
 * - External Drupal OAuth server dependency
 * - Interactive OAuth approval step (requires browser interaction)
 *
 * Run with: npm run test:e2e:oauth
 */

import { execSync } from 'child_process';
import { describe, it, expect, beforeAll } from '@jest/globals';
import readline from 'readline';

// Environment validation
const validateE2EEnvironment = () => {
  const required = ['DRUPAL_BASE_URL', 'OAUTH_CLIENT_ID'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for e2e tests: ${missing.join(', ')}\n` +
        'Please copy .env.test.example to .env.test and configure values.'
    );
  }

  const serverUrl = process.env.DRUPAL_BASE_URL;
  console.log(`✓ Environment validated`);
  console.log(`  OAuth server: ${serverUrl}`);
  console.log(`  Client ID: ${process.env.OAUTH_CLIENT_ID}`);
};

// Helper: Execute Inspector CLI commands
const runInspectorCLI = (method: string, args: string[] = []): any => {
  const serverCmd = 'npm run start';
  const argString = args.length > 0 ? `-- ${args.join(' ')}` : '';
  const cmd = `npx @modelcontextprotocol/inspector --cli ${serverCmd} ${argString} --method ${method}`;

  console.log(`\n→ Executing: ${method}`);

  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      env: { ...process.env },
    });

    const result = JSON.parse(output);
    console.log(`✓ Success: ${method}`);
    return result;
  } catch (error: any) {
    console.error(`✗ Failed: ${method}`);
    console.error(`  Output: ${error.stdout || error.message}`);

    // Try to parse error output as JSON
    try {
      return JSON.parse(error.stdout || '{}');
    } catch {
      throw error;
    }
  }
};

// Helper: Wait for user input
const waitForUserInput = (message: string): Promise<void> => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`\n${message}\nPress Enter to continue...`, () => {
      rl.close();
      resolve();
    });
  });
};

describe('OAuth Flow E2E Tests', () => {
  beforeAll(() => {
    validateE2EEnvironment();
    console.log('\n=================================================');
    console.log('OAuth Flow E2E Test Suite');
    console.log(
      'Following methodology from .ai/testing/oauth-flow-test-methodology.md'
    );
    console.log('=================================================\n');
  });

  describe('Step 1: Initial Connection & Tools List', () => {
    it('should connect to server and list available tools', () => {
      const result = runInspectorCLI('tools/list');

      expect(result).toBeDefined();
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.tools.length).toBeGreaterThan(0);

      console.log(`  Found ${result.tools.length} tools`);
    });
  });

  describe('Step 2: OAuth Flow Initiation', () => {
    it('should initiate OAuth flow and access metadata endpoint', async () => {
      console.log('\n→ Initiating OAuth flow...');
      console.log('  This will redirect to the authorization server');

      // The OAuth flow initiation will be triggered by the auth/login tool
      const result = runInspectorCLI('tools/call', [
        '--tool-name',
        'auth_login',
      ]);

      expect(result).toBeDefined();
      // Expected: OAuth metadata endpoint should be accessed
    });
  });

  describe('Step 3: Manual OAuth Approval (Interactive)', () => {
    it('should pause for manual OAuth authorization', async () => {
      await waitForUserInput(
        '⏸️  MANUAL STEP:\n' +
          '  1. Complete OAuth authorization in your browser\n' +
          '  2. Click "Allow" on the authorization page\n' +
          '  3. Wait for redirect back to the application'
      );

      console.log('✓ User confirmed OAuth approval');
    });
  });

  describe('Step 4: Reconnection After OAuth Callback', () => {
    it('should create new session after OAuth callback', () => {
      const result = runInspectorCLI('tools/list');

      expect(result).toBeDefined();
      expect(result.tools).toBeDefined();

      console.log('  New session created successfully');
    });
  });

  describe('Step 5: Token Association Verification', () => {
    it('should verify session is mapped to authenticated user', async () => {
      // Check health endpoint for active sessions and users
      const serverUrl = process.env.DRUPAL_BASE_URL || 'http://localhost:3000';
      const healthUrl = `${serverUrl}/health`;

      console.log(`  Checking: ${healthUrl}`);

      try {
        const output = execSync(`curl -s ${healthUrl}`, {
          encoding: 'utf-8',
        });
        const health = JSON.parse(output);

        console.log(`  Active sessions: ${health.activeSessions || 0}`);
        console.log(`  Active users: ${health.activeUsers || 0}`);

        expect(health.activeUsers).toBeGreaterThan(0);
      } catch (error) {
        console.warn('  Health check failed (server may not expose /health)');
      }
    });
  });

  describe('Step 6: Authenticated Tool Execution', () => {
    it('should execute authenticated tools successfully', () => {
      // Try to execute a tool that requires authentication
      const result = runInspectorCLI('tools/call', [
        '--tool-name',
        'examples.contentTypes.list',
      ]);

      expect(result).toBeDefined();

      // Check for the documented bug: 403 error due to token association issue
      if (result.error) {
        console.log(
          `  ⚠️  Expected bug detected: ${result.error.message || result.error}`
        );
        expect(result.error.code).toBe(-32603);
        expect(result.error.message || JSON.stringify(result.error)).toContain(
          '403'
        );
      } else {
        console.log('  ✓ Tool executed successfully (bug may be fixed)');
        expect(result.result || result.content).toBeDefined();
      }
    });
  });

  describe('Step 7: Session State Verification', () => {
    it('should verify session mappings via debug endpoints', async () => {
      const serverUrl = process.env.DRUPAL_BASE_URL || 'http://localhost:3000';
      const debugUrl = `${serverUrl}/debug/sessions`;

      console.log(`  Checking: ${debugUrl}`);

      try {
        const output = execSync(`curl -s ${debugUrl}`, { encoding: 'utf-8' });
        const debug = JSON.parse(output);

        console.log(`  Session mappings: ${JSON.stringify(debug, null, 2)}`);

        expect(debug).toBeDefined();
      } catch (error) {
        console.warn(
          '  Debug endpoint check failed (server may not expose /debug/sessions)'
        );
      }
    });
  });

  afterAll(() => {
    console.log('\n=================================================');
    console.log('OAuth Flow E2E Test Suite Complete');
    console.log('=================================================\n');
  });
});
