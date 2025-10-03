---
id: 4
group: 'configuration'
dependencies: []
status: 'completed'
created: '2025-10-03'
skills:
  - 'express'
---

# Update CORS Headers for mcp-session-id Support

## Objective

Add `mcp-session-id` to CORS headers to enable browser-based clients (like MCP Inspector) to send
and read session IDs.

## Skills Required

- **Express**: CORS middleware configuration and HTTP header management

## Acceptance Criteria

- [ ] Add `mcp-session-id` to `Access-Control-Allow-Headers`
- [ ] Add `mcp-session-id` to `Access-Control-Expose-Headers`
- [ ] Preserve existing CORS headers (Content-Type, Authorization, Last-Event-ID)
- [ ] Browser-based clients can send requests with mcp-session-id header
- [ ] Browser-based clients can read mcp-session-id from response headers
- [ ] CORS preflight OPTIONS requests succeed

## Technical Requirements

**Current CORS Configuration** (lines 125-165 in `src/index.ts`):

```typescript
res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Last-Event-ID');
```

**Updated CORS Configuration**:

```typescript
res.setHeader(
  'Access-Control-Allow-Headers',
  'Content-Type, Authorization, Last-Event-ID, mcp-session-id'
);

res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
```

**Why This Matters** (from Plan):

- Without `Access-Control-Allow-Headers`: Browsers block requests containing `mcp-session-id`
- Without `Access-Control-Expose-Headers`: Browsers hide the session ID from client JavaScript
- Reference: [MCP SDK Issue #412](https://github.com/modelcontextprotocol/typescript-sdk/issues/412)

**File Location**: `src/index.ts` **Method to modify**: `setupMiddleware()` (lines 125-172)

## Input Dependencies

None - this task is independent and can be done in parallel with architecture refactoring.

## Output Artifacts

- Browser-based MCP clients can successfully send and receive session IDs
- CORS configuration supports MCP session management
- No CORS-related errors in browser DevTools

<details>
<summary>Implementation Notes</summary>

### Step-by-Step Instructions

1. **Locate CORS Middleware** (lines 125-172 in `src/index.ts`):

   Find the `setupMiddleware()` method and the section that sets CORS headers.

2. **Update Access-Control-Allow-Headers**:

   Find this line:

   ```typescript
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Last-Event-ID');
   ```

   Update to:

   ```typescript
   res.setHeader(
     'Access-Control-Allow-Headers',
     'Content-Type, Authorization, Last-Event-ID, mcp-session-id'
   );
   ```

3. **Add Access-Control-Expose-Headers**:

   After the `Access-Control-Allow-Headers` line, add:

   ```typescript
   res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
   ```

   The complete CORS section should look like:

   ```typescript
   if (origin && allowedOrigins.includes(origin)) {
     res.setHeader('Access-Control-Allow-Origin', origin);
     res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
     res.setHeader(
       'Access-Control-Allow-Headers',
       'Content-Type, Authorization, Last-Event-ID, mcp-session-id'
     );
     res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
     res.setHeader('Access-Control-Allow-Credentials', 'true');
   }
   ```

4. **Testing CORS Configuration**:

   **Option A: Using Browser DevTools**

   ```bash
   npm run build
   npm run dev
   # Open MCP Inspector in browser
   # Open DevTools → Network tab
   # Connect to server
   # Look for /mcp request
   # Check Response Headers for "mcp-session-id"
   # Verify no CORS errors in Console
   ```

   **Option B: Using curl**

   ```bash
   # Test preflight request
   curl -X OPTIONS http://localhost:6200/mcp \
     -H "Origin: http://localhost:5173" \
     -H "Access-Control-Request-Method: POST" \
     -H "Access-Control-Request-Headers: mcp-session-id" \
     -v

   # Expected: 204 response with Access-Control-Allow-Headers including mcp-session-id
   ```

5. **Common Issues and Solutions**:

   **Issue**: Browser still blocks mcp-session-id header
   - **Solution**: Check that origin is in allowedOrigins list
   - **Solution**: Verify CORS headers are set before the preflight OPTIONS check

   **Issue**: Session ID not visible in JavaScript
   - **Solution**: Ensure `Access-Control-Expose-Headers` includes `mcp-session-id`
   - **Solution**: Check that response actually includes the header

6. **Verification Checklist**:
   - [ ] Preflight OPTIONS request returns 204
   - [ ] Response includes `Access-Control-Allow-Headers: ... mcp-session-id`
   - [ ] Response includes `Access-Control-Expose-Headers: mcp-session-id`
   - [ ] No CORS errors in browser console
   - [ ] MCP Inspector can read session ID from response

### CORS Headers Explained

**Access-Control-Allow-Headers**:

- Tells browser which headers the client is allowed to SEND
- Affects request headers from client to server
- Required for browser to include `mcp-session-id` in requests

**Access-Control-Expose-Headers**:

- Tells browser which headers the client is allowed to READ
- Affects response headers from server to client
- Required for JavaScript to access `mcp-session-id` from response

**Both are required** for bidirectional session ID communication.

### Reference

- [MCP SDK Issue #412](https://github.com/modelcontextprotocol/typescript-sdk/issues/412) -
  Documents this exact CORS configuration requirement
- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) - General CORS documentation

</details>
