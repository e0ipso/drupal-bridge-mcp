---
id: 3
group: 'validation'
dependencies: [1, 2]
status: 'blocked'
created: '2025-10-03'
skills:
  - testing
  - oauth
---

# Manual Testing with MCP Inspector OAuth Flow

## Objective

Validate the OAuth token extraction implementation by executing the documented test methodology from
`.ai/testing/oauth-flow-test-methodology.md`, verifying that authenticated tool execution works
after OAuth authorization in MCP Inspector.

## Skills Required

- **Testing**: Execute manual test procedures, verify expected behaviors, analyze logs and error
  messages
- **OAuth**: Understand OAuth 2.1 browser-based authorization code flow, token exchange, and
  authenticated API calls

## Acceptance Criteria

- [ ] Server compiles successfully with `npm run build`
- [ ] Server starts with `AUTH_ENABLED=true npm start`
- [ ] OAuth flow completes: Inspector redirects to Drupal, user approves, returns to Inspector
- [ ] Server logs show: `Token extracted and stored for session <id> → user <userId>`
- [ ] Tool execution succeeds: `examples.contentTypes.list` returns data (not 403)
- [ ] Server logs show: `Token lookup success: session <id> → user <userId>` during tool execution
- [ ] Inspector displays tool results without MCP error -32603
- [ ] Unauthenticated requests (without Authorization header) still work
- [ ] No TypeScript compilation errors
- [ ] No runtime crashes or unhandled exceptions

## Technical Requirements

**Test Environment**:

- Drupal backend OAuth server running at `https://drupal-contrib.ddev.site`
- MCP Inspector accessible in browser
- Server configuration: `AUTH_ENABLED=true` in `.env`
- OAuth client credentials configured

**Test Methodology**: Follow documented procedures in `.ai/testing/oauth-flow-test-methodology.md`

**Expected Log Output**:

```
# During OAuth reconnection:
POST /mcp
Creating new session: <session-id>
Token extracted and stored for session <session-id> → user <user-id>
Active users: 1, Active sessions: 1

# During tool execution:
POST /mcp
Token lookup success: session <session-id> → user <user-id>
```

## Input Dependencies

- Task 1: `extractAndStoreTokenFromRequest()` method implemented
- Task 2: Token extraction integrated in `/mcp` endpoint handler
- Compiled TypeScript code in `dist/` directory

## Output Artifacts

- Test execution report documenting:
  - OAuth flow completion status
  - Log output verification
  - Tool execution results
  - Any errors or unexpected behaviors
- Confirmation that implementation meets success criteria from plan

## Implementation Notes

<details>
<summary>Detailed Testing Guide</summary>

### Pre-Test Setup

1. **Ensure Drupal Backend is Running**:

   ```bash
   # Verify Drupal is accessible
   curl -s https://drupal-contrib.ddev.site/mcp/tools/list | head
   ```

   - Should return JSON tool definitions
   - If fails, start Drupal backend first

2. **Build TypeScript**:

   ```bash
   npm run build
   ```

   - Must complete without errors
   - Creates/updates `dist/index.js`

3. **Start MCP Server**:

   ```bash
   AUTH_ENABLED=true npm start
   ```

   - Verify startup banner shows `Auth Enabled: Yes`
   - Note the server URL (typically `http://localhost:6200`)

### Test Procedure (From Test Methodology)

**Step 1: Initial Connection**

1. Open MCP Inspector in browser
2. Configure connection:
   - URL: `http://localhost:6200/mcp`
   - Transport: `StreamableHTTP`
3. Click "Connect"
4. Verify connection succeeds and tools are listed

**Step 2: Clear OAuth State**

1. Click "Authentication settings" → "Clear OAuth State"
2. Verify no server logs appear (client-side only)

**Step 3: Execute OAuth Flow**

1. Click "Quick OAuth Flow" button
2. **Expected**: Browser redirects to Drupal authorization page
3. Review permissions and click "Allow"
4. **Expected**: Browser redirects back to MCP Inspector
5. **Note**: Connection may drop during redirect (this is normal)

**Step 4: Reconnect After OAuth**

1. If disconnected, click "Connect" button
2. **Expected Server Logs**:
   ```
   POST /mcp
   Creating new session: <session-id>
   Token extracted and stored for session <session-id> → user <user-id>
   Active users: 1, Active sessions: 1
   ```
3. **Verify**:
   - ✅ Session created
   - ✅ Token extracted message appears
   - ✅ User ID shown in logs

**Step 5: List Tools**

1. Click "Tools" → "List Tools" in Inspector
2. **Expected**: 3 tools displayed:
   - `examples.contentTypes.list`
   - `examples.article.toMarkdown`
   - `examples.articles.list`

**Step 6: Execute Authenticated Tool**

1. Select tool: `examples.contentTypes.list`
2. Click "Execute" (no parameters required)
3. **Expected Server Logs**:
   ```
   POST /mcp
   Token lookup success: session <session-id> → user <user-id>
   ```
4. **Expected Inspector Output**:
   - JSON response with Drupal content types
   - No error messages
   - No "403 Forbidden" errors

**Step 7: Verify Unauthenticated Requests**

1. Open new browser tab
2. Send unauthenticated request:
   ```bash
   curl -X POST http://localhost:6200/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```
3. **Expected**: Tools list returned successfully
4. **Expected Logs**: No token extraction (no Authorization header)

### Success Criteria Validation

**✅ OAuth Flow Completes**:

- User can authorize on Drupal
- Inspector receives tokens
- No OAuth errors in browser console

**✅ Token Extraction Works**:

- Server logs show "Token extracted and stored"
- User ID successfully decoded from JWT
- Session-to-user mapping created

**✅ Tool Execution Succeeds**:

- `examples.contentTypes.list` returns data
- No 403 Forbidden errors
- Server logs show "Token lookup success"

**✅ No Regressions**:

- Unauthenticated requests still work
- Server remains stable (no crashes)
- Session management works normally

### Troubleshooting

**Problem**: OAuth redirect doesn't return to Inspector

- **Check**: Browser popup blocker settings
- **Solution**: Allow popups from localhost

**Problem**: "Token lookup failed: session <id> not mapped to user"

- **Check**: Server logs for "Token extracted and stored" message
- **Cause**: Token extraction not being called or failing
- **Debug**: Add console.log in `extractAndStoreTokenFromRequest()`

**Problem**: 403 Forbidden during tool execution

- **Check**: Token extraction logs show user ID
- **Check**: `getSession()` returns valid token
- **Debug**: Verify Authorization header is being sent by Inspector

**Problem**: TypeScript compilation errors

- **Check**: Task 1 and 2 implementation match specifications
- **Fix**: Resolve type errors, ensure all imports exist

### Test Report Template

```markdown
## OAuth Token Extraction Test Report

**Date**: YYYY-MM-DD **Tester**: [Name]

### Environment

- Drupal Backend: [Status - Running/Not Running]
- MCP Server: [Version]
- MCP Inspector: [Browser/Version]

### Test Results

#### OAuth Flow

- [ ] Authorization page displayed
- [ ] User approval succeeded
- [ ] Redirect back to Inspector worked
- [ ] Tokens received by Inspector

#### Token Extraction

- [ ] Server logs show "Token extracted and stored"
- [ ] User ID appears in logs: [user-id]
- [ ] Session ID appears in logs: [session-id]

#### Tool Execution

- [ ] examples.contentTypes.list executed
- [ ] Response contains data (not error)
- [ ] No 403 Forbidden errors
- [ ] Server logs show "Token lookup success"

#### Regressions

- [ ] Unauthenticated requests work
- [ ] Server remains stable
- [ ] No TypeScript errors

### Issues Found

[List any problems encountered]

### Conclusion

[PASS/FAIL with summary]
```

</details>
