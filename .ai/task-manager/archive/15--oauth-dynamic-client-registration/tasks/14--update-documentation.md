---
id: 14
group: documentation
dependencies:
  - 13
status: completed
created: '2025-10-15'
skills:
  - documentation
---

# Update Documentation for Resource Server Architecture

## Objective

Update README.md and .env.example to document the new resource server architecture and remove
references to required client credentials.

## Skills Required

- documentation: Technical writing, clarity, accuracy

## Acceptance Criteria

- [ ] Remove `OAUTH_CLIENT_ID` from .env.example
- [ ] Remove `OAUTH_CLIENT_SECRET` from .env.example
- [ ] Update README OAuth section to explain resource server architecture
- [ ] Document that authentication is done via Claude Code's "Authenticate" button
- [ ] Explain JWT verification approach
- [ ] Update environment variable documentation

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

Files to update:

- `.env.example` - Remove credential examples
- `README.md` - Update OAuth section

Key points to document:

- MCP server acts as OAuth 2.0 resource server
- No pre-configured client credentials needed
- Claude Code handles OAuth client operations
- Token validation via JWT signature verification
- Drupal provides authorization server (RFC 7591)

## Input Dependencies

- Task 13: Integration testing confirms architecture works

## Output Artifacts

- Updated `.env.example`
- Updated `README.md`

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Update .env.example**:

   **Remove these lines**:

   ```
   OAUTH_CLIENT_ID=your-client-id
   OAUTH_CLIENT_SECRET=your-client-secret
   ```

   **Keep/update these**:

   ```
   # OAuth Configuration
   AUTH_ENABLED=true
   DRUPAL_BASE_URL=https://your-drupal-site.com

   # Optional: OAuth scopes (space-separated)
   # OAUTH_SCOPES=read write
   ```

2. **Update README.md - OAuth section**:

   **Add/update architecture explanation**:

   ````markdown
   ## OAuth Architecture

   This MCP server implements the **OAuth 2.0 Resource Server** pattern:

   - **Authorization Server**: Drupal (via `simple_oauth_21` module)
   - **OAuth Client**: Claude Code (handles registration and user auth)
   - **Resource Server**: This MCP server (validates tokens, serves tools)

   ### Authentication Flow

   1. Claude Code discovers OAuth endpoints via metadata discovery
   2. Claude Code dynamically registers with Drupal using RFC 7591
   3. User authenticates through Drupal's OAuth flow
   4. Claude Code receives access token
   5. MCP server validates tokens using JWT signature verification

   ### Configuration

   No pre-configured client credentials are required. Simply set:

   ```bash
   AUTH_ENABLED=true
   DRUPAL_BASE_URL=https://your-drupal-site.com
   ```
   ````

   The server will:
   - Fetch Drupal's OAuth metadata on startup
   - Serve metadata to Claude Code at `/.well-known/oauth-authorization-server`
   - Validate incoming tokens using Drupal's public keys (JWKS)

   ### Token Verification

   The server uses JWT signature verification instead of token introspection:
   - More secure (cryptographic verification)
   - No client credentials needed
   - Better performance (no network roundtrip)
   - Standard OAuth 2.0 resource server pattern

   ```

   ```

3. **Update environment variable documentation**: Find the section listing environment variables and
   update:
   - Remove `OAUTH_CLIENT_ID` entry
   - Remove `OAUTH_CLIENT_SECRET` entry
   - Update `AUTH_ENABLED` description to mention resource server role

4. **Remove old authentication instructions**: If there are instructions about using the
   `auth_login` tool or device flow, remove them.

5. **Add troubleshooting section** (optional but helpful):

   ```markdown
   ### Troubleshooting OAuth

   **Server fails to start**: Verify `DRUPAL_BASE_URL` is accessible **Authentication fails**: Check
   Drupal's `simple_oauth_21` module is enabled **Token validation fails**: Verify Drupal's JWKS
   endpoint is accessible
   ```

6. **Review for consistency**: Ensure all OAuth-related documentation is consistent with the
   resource server architecture.

</details>
