---
id: 1
group: "oauth-metadata"
dependencies: []
status: "completed"
created: "2025-01-22"
skills:
  - typescript
  - oauth
---
# Add software identification to OAuth metadata

## Objective
Inject `software_id` and `software_version` fields into OAuth Authorization Server Metadata to identify the MCP server instance in client registrations.

## Skills Required
- **typescript**: Modify server initialization code in src/index.ts
- **oauth**: Understanding of RFC 8414 (Authorization Server Metadata) and custom extensions

## Acceptance Criteria
- [ ] OAuth metadata object enhanced with `software_id` and `software_version` before passing to `mcpAuthMetadataRouter`
- [ ] `software_id` uses `process.env.MCP_SERVER_NAME` if set, otherwise falls back to `"com.mateuaguilo.drupal-bridge-mcp"`
- [ ] `software_version` uses `PKG_VERSION` constant (already available, line 56)
- [ ] Comprehensive code comments explain the custom OAuth extension
- [ ] Startup logs display the configured `software_id` and `software_version` values
- [ ] TypeScript compilation succeeds (`npm run type-check`)

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand detailed implementation instructions</summary>

### Location
File: `src/index.ts`, in the `DrupalMCPHttpServer.start()` method, around lines 800-850

### Current Code (lines 807-846)
```typescript
// Step 8: Fetch OAuth metadata
const metadata = await configManager.fetchMetadata();

printSuccess('OAuth metadata discovered successfully');
// ... logging ...

// Set up OAuth metadata router
this.app.use(
  mcpAuthMetadataRouter({
    oauthMetadata: metadata,  // ← Currently unmodified
    resourceServerUrl,
    scopesSupported: configManager.getConfig().scopes,
    resourceName: this.config.name,
  })
);
```

### Required Changes

**Step 1: Enhance metadata object (after line 807)**

Add this code block after `const metadata = await configManager.fetchMetadata();`:

```typescript
// Enhance OAuth metadata with MCP server identification (custom extension per RFC 8414)
// Per RFC 7591, software_id and software_version normally identify the CLIENT software.
// Here, we repurpose them to identify the MCP SERVER (resource server) that clients
// connect to. This enables:
// - Audit trails: which MCP server is this client connecting to?
// - Version tracking: correlate issues with specific MCP server versions
// - Server-specific policies: Drupal can apply rules based on MCP server identity
//
// Note: Full functionality requires:
// 1. Claude Code (MCP client) to read these fields and include in client registration
// 2. Drupal Simple OAuth to extract and store these values in client records
//
// RFC 8414 explicitly allows custom metadata fields, which standard OAuth clients
// will ignore per specification.
const enhancedMetadata = {
  ...metadata,
  software_id: process.env.MCP_SERVER_NAME || "com.mateuaguilo.drupal-bridge-mcp",
  software_version: PKG_VERSION,
};
```

**Step 2: Update mcpAuthMetadataRouter call (line 839)**

Change:
```typescript
mcpAuthMetadataRouter({
  oauthMetadata: metadata,  // ← OLD
```

To:
```typescript
mcpAuthMetadataRouter({
  oauthMetadata: enhancedMetadata,  // ← NEW
```

**Step 3: Add logging (after line 829, in the logging section)**

After the existing log lines:
```typescript
printInfo(`Expected well-known endpoints:`, 2);
const rsPath = resourceServerUrl.pathname;
const wellKnownPath = `/.well-known/oauth-protected-resource${rsPath === '/' ? '' : rsPath}`;
printInfo(`- ${resourceServerUrl.origin}${wellKnownPath}`, 4);
printInfo(`- ${resourceServerUrl.origin}/.well-known/oauth-authorization-server`, 4);
```

Add:
```typescript
printInfo(`Server identification:`, 2);
printInfo(`  software_id: ${enhancedMetadata.software_id}`, 4);
printInfo(`  software_version: ${enhancedMetadata.software_version}`, 4);
```

</details>

## Input Dependencies
- `PKG_VERSION` constant (already defined at line 56 in src/index.ts)
- `process.env.MCP_SERVER_NAME` environment variable (optional, has fallback)
- `configManager.fetchMetadata()` result (existing code, line 807)

## Output Artifacts
- Enhanced OAuth metadata object with `software_id` and `software_version` fields
- Startup logs showing configured server identification
- Modified `src/index.ts` file

## Implementation Notes

**Testing verification**:
1. Run `npm run type-check` to ensure TypeScript compilation succeeds
2. Start server with `npm run dev` and verify startup logs show:
   ```
   Server identification:
     software_id: dme-mcp  (or com.mateuaguilo.drupal-bridge-mcp if MCP_SERVER_NAME not set)
     software_version: 1.10.0
   ```
3. Use curl or MCP Inspector to fetch `http://localhost:6200/.well-known/oauth-authorization-server` and verify response includes:
   ```json
   {
     "software_id": "dme-mcp",
     "software_version": "1.10.0",
     // ... other OAuth metadata fields
   }
   ```

**Environment variable handling**:
- `MCP_SERVER_NAME` is optional (already used in DEFAULT_HTTP_CONFIG at line 90)
- If not set, fallback to `"com.mateuaguilo.drupal-bridge-mcp"` (reverse domain notation)
- `PKG_VERSION` is already available (read from package.json at startup)

**Code style**:
- Match existing code formatting (2-space indentation, existing comment style)
- Use existing logging utilities: `printInfo(message, indentLevel)`
- Follow TypeScript patterns in the file (ES6 imports, async/await, etc.)
