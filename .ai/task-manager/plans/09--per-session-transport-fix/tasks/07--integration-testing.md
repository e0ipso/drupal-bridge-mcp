---
id: 7
group: 'testing'
dependencies: [1, 2, 3, 4, 5, 6]
status: 'pending'
created: '2025-10-03'
skills:
  - 'testing'
---

# Integration Testing for Multi-Client Session Management

## Objective

Validate the complete per-session transport architecture through integration testing covering
multi-client scenarios, reconnection flows, session cleanup, and Plan 8 compatibility.

## Skills Required

- **Testing**: Integration test design, manual testing procedures, scenario validation

## Acceptance Criteria

- [ ] Test: Single client connect/disconnect/reconnect cycle succeeds
- [ ] Test: Multiple clients connect concurrently without errors
- [ ] Test: "Server already initialized" error no longer occurs
- [ ] Test: Session cleanup removes transports from map
- [ ] Test: User tokens persist after disconnect (Plan 8 compatibility)
- [ ] Test: CORS headers allow browser-based clients to read session IDs
- [ ] Test: Memory stability after repeated connect/disconnect cycles
- [ ] Test: Health endpoints show accurate session/transport counts
- [ ] All success criteria from plan are validated

## Technical Requirements

**Testing Strategy** (from plan instructions):

> **Meaningful Test Strategy Guidelines**
>
> Your critical mantra for test generation is: "write a few tests, mostly integration".
>
> Focus on:
>
> - Custom business logic and algorithms
> - Critical user workflows and data transformations
> - Integration points between different system components

**Test Scenarios** (from Plan success criteria):

1. **Multiple clients can connect concurrently without "Server already initialized" errors**
   - Connect MCP Inspector, disconnect, reconnect
   - Connect two MCP Inspector instances simultaneously
   - Validation: Both clients receive unique session IDs and can make tool calls

2. **Existing authentication and token storage continue to function**
   - Authenticate with device flow, disconnect, reconnect
   - Tool calls succeed after reconnection using cached tokens
   - Validation: `/health` endpoint shows correct user/session counts

3. **Session cleanup occurs properly on disconnect**
   - Connect client, check `/debug/sessions`, disconnect, check again
   - Validation: Session removed from transport map and session-to-user map
   - Validation: User tokens persist (visible in `/health` endpoint)

**Quality Assurance Metrics** (from Plan):

1. **Memory Stability**: Connect/disconnect 10 times, verify map size returns to 0
2. **Logging Completeness**: Session lifecycle events logged with session ID
3. **CORS Functionality**: `mcp-session-id` header visible in browser DevTools

## Input Dependencies

- All implementation tasks completed (Tasks 1-6)
- Server builds and starts without errors
- MCP Inspector available for testing

## Output Artifacts

- Validation that all plan success criteria are met
- Documentation of test results
- Confirmation that "Server already initialized" error is resolved
- Confidence in Plan 8 compatibility

<details>
<summary>Implementation Notes</summary>

### Test Execution Guide

#### Preparation

1. **Build and Start Server**:

   ```bash
   npm run build
   npm run dev
   ```

2. **Verify Server Startup**:
   - Check logs for "MCP Server started successfully"
   - Verify no errors during initialization
   - Note: Tool discovery should succeed

3. **Prepare Testing Tools**:
   - MCP Inspector (for GUI testing)
   - curl (for API testing)
   - Browser DevTools (for CORS validation)

---

#### Test Suite

**Test 1: Single Client Reconnection**

**Objective**: Verify client can disconnect and reconnect without "Server already initialized" error

**Steps**:

1. Start server, open MCP Inspector
2. Connect to `http://localhost:6200/mcp`
3. Note session ID in logs: `"Creating new session: abc-123"`
4. Execute a tool call (e.g., auth_status)
5. Disconnect MCP Inspector
6. Check logs: `"Session closed: abc-123"`
7. Reconnect MCP Inspector
8. Note new session ID: `"Creating new session: def-456"`
9. Execute another tool call

**Expected Results**:

- ✅ First connection succeeds
- ✅ Tool call succeeds
- ✅ Disconnect logs session closure
- ✅ Reconnection creates NEW session ID
- ✅ No "Server already initialized" error
- ✅ Second tool call succeeds

**Validation**:

```bash
# Check health endpoint
curl http://localhost:6200/health | jq '.activeTransports'
# After disconnect: 0
# After reconnect: 1
```

---

**Test 2: Multiple Concurrent Clients**

**Objective**: Verify multiple clients can connect simultaneously

**Steps**:

1. Start server
2. Open MCP Inspector instance #1 → Connect
3. Check logs: `"Creating new session: session-1"`
4. Open MCP Inspector instance #2 → Connect
5. Check logs: `"Creating new session: session-2"`
6. Execute tool call from instance #1
7. Execute tool call from instance #2
8. Check health endpoint

**Expected Results**:

- ✅ Instance #1 connects with unique session ID
- ✅ Instance #2 connects with different session ID
- ✅ Both instances can execute tool calls
- ✅ No "Server already initialized" error
- ✅ Health endpoint shows `activeTransports: 2`

**Validation**:

```bash
curl http://localhost:6200/debug/sessions | jq '.transports'
# Expected: ["session-1", "session-2"]
```

---

**Test 3: Session Cleanup Verification**

**Objective**: Verify Server+Transport cleanup when client disconnects

**Steps**:

1. Start server
2. Connect MCP Inspector
3. Check debug endpoint:
   ```bash
   curl http://localhost:6200/debug/sessions | jq
   ```
4. Note `totalTransports: 1`
5. Disconnect MCP Inspector
6. Wait 2 seconds
7. Check debug endpoint again

**Expected Results**:

- ✅ Before disconnect: `totalTransports: 1`
- ✅ After disconnect: `totalTransports: 0`
- ✅ Session removed from `transports` array
- ✅ Logs show: "Transport closed for session X"
- ✅ Logs show: "Server closed for session X"

---

**Test 4: Token Persistence (Plan 8 Compatibility)**

**Objective**: Verify user tokens persist after disconnect

**Steps**:

1. Start server
2. Connect MCP Inspector
3. Authenticate using device flow (if AUTH_ENABLED=true)
4. Check health endpoint:
   ```bash
   curl http://localhost:6200/health | jq
   ```
5. Note `activeUsers: 1`, `activeSessions: 1`
6. Disconnect MCP Inspector
7. Check health endpoint again

**Expected Results**:

- ✅ After disconnect: `activeUsers: 1` (token persists)
- ✅ After disconnect: `activeSessions: 0` (session cleaned)
- ✅ After disconnect: `activeTransports: 0` (transport cleaned)
- ✅ Reconnect succeeds and reuses token (if same user)

**Plan 8 Validation**:

- User tokens NOT deleted on disconnect
- Token reuse on reconnection (same user)

---

**Test 5: CORS Functionality**

**Objective**: Verify browser clients can read/send session IDs

**Steps**:

1. Start server
2. Open MCP Inspector in browser (not Electron app)
3. Open Browser DevTools → Network tab
4. Connect to server
5. Inspect `/mcp` request
6. Check Response Headers

**Expected Results**:

- ✅ Response includes `mcp-session-id` header
- ✅ Response includes `Access-Control-Expose-Headers: mcp-session-id`
- ✅ No CORS errors in Console
- ✅ JavaScript can read session ID

**Validation**:

```bash
# Test with curl
curl -X POST http://localhost:6200/mcp \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:5173" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' \
  -v | grep -i mcp-session-id

# Expected: mcp-session-id header in response
```

---

**Test 6: Memory Stability**

**Objective**: Verify no memory leaks after repeated connections

**Steps**:

1. Start server
2. For i=1 to 10:
   - Connect MCP Inspector
   - Execute tool call
   - Disconnect
   - Wait 1 second
3. Check health endpoint
4. Check debug endpoint

**Expected Results**:

- ✅ After 10 cycles: `activeTransports: 0`
- ✅ After 10 cycles: `activeSessions: 0`
- ✅ Transports map is empty (no leaks)
- ✅ Server memory usage stable (monitor with `ps` or similar)

**Automated Version**:

```bash
# Pseudo-code for automation
for i in {1..10}; do
  # Connect, call tool, disconnect
  curl -X POST http://localhost:6200/mcp ... # initialize
  sleep 0.5
  curl -X POST http://localhost:6200/mcp ... # call tool
  sleep 0.5
  # Disconnect (close connection)
  sleep 1
done

# Verify cleanup
curl http://localhost:6200/health | jq '.activeTransports'
# Expected: 0
```

---

**Test 7: Plan 8 Regression**

**Objective**: Ensure existing tests from Plan 8 still pass

**Steps**:

1. Run existing session reconnection tests:
   ```bash
   npm test -- session-reconnection.test.ts
   ```
2. Verify all tests pass
3. Check that token storage logic unchanged

**Expected Results**:

- ✅ All Plan 8 tests pass
- ✅ JWT user ID extraction works
- ✅ Token reuse logic works
- ✅ Multi-user token isolation works

---

#### Success Criteria Validation

**From Plan Document:**

1. **Multiple clients can connect concurrently** → Tests 1, 2
2. **Authentication and token storage continue to function** → Test 4, 7
3. **Session cleanup occurs properly** → Test 3, 6

**Quality Assurance Metrics:**

1. **Memory Stability** → Test 6
2. **Logging Completeness** → Check logs during all tests
3. **CORS Functionality** → Test 5

---

#### Logging Validation

**Expected Log Sequence for Connect/Disconnect:**

```
Creating new session: abc-123-def-456
Server+Transport created for session abc-123-def-456
Session abc-123-def-456 created. Active sessions: 1
[... tool calls ...]
Session closed: abc-123-def-456 (user: user-id or unauthenticated)
Transport closed for session abc-123-def-456
Server closed for session abc-123-def-456
Active sessions: 0, Active users: 1
```

**Verify in logs:**

- [ ] Session creation logged
- [ ] Session ID visible in all events
- [ ] User ID included in closure log
- [ ] Transport/Server closure logged
- [ ] Active counts accurate

---

#### Troubleshooting Guide

**Issue**: "Server already initialized" still appears

**Diagnosis**:

- Check if Task 2 was implemented correctly
- Verify `createSessionInstance()` is called for new sessions
- Check if `server.connect(transport)` is called per session

**Solution**: Review Task 2 implementation

---

**Issue**: Transports not cleaned up (memory leak)

**Diagnosis**:

- Check `onsessionclosed` callback (Task 3)
- Verify `transport.close()` is called
- Check if map deletion occurs

**Solution**: Review Task 3 implementation

---

**Issue**: CORS errors in browser

**Diagnosis**:

- Check CORS headers (Task 4)
- Verify `mcp-session-id` in both Allow and Expose headers
- Check origin in allowed list

**Solution**: Review Task 4 implementation

---

**Issue**: Token storage broken

**Diagnosis**:

- Check if `userTokens.delete()` was added (should NOT be)
- Verify Plan 8 maps unchanged

**Solution**: Ensure Plan 8 architecture preserved

---

### Final Validation Checklist

- [ ] Single client reconnection works
- [ ] Multiple concurrent clients work
- [ ] No "Server already initialized" errors
- [ ] Session cleanup verified (transport map empty)
- [ ] User tokens persist after disconnect
- [ ] CORS headers allow browser access
- [ ] Memory stable after 10 connect/disconnect cycles
- [ ] Health endpoints show accurate counts
- [ ] Plan 8 tests still pass
- [ ] All logs contain session IDs

**If all checked**: Plan 9 is successfully implemented! 🎉

</details>
