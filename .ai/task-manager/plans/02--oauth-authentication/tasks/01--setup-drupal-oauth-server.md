---
id: 1
group: 'oauth-server-setup'
dependencies: []
status: 'pending'
created: '2025-09-29'
skills: ['drupal-backend', 'oauth']
---

# Setup Drupal OAuth Server and Client Configuration

## Objective

Install and configure Drupal Simple OAuth 2.1 ecosystem with all required modules and create OAuth
clients for MCP server authentication.

## Skills Required

- **drupal-backend**: Drupal module installation, configuration, and admin interface usage
- **oauth**: OAuth 2.1 concepts, client configuration, and security settings

## Acceptance Criteria

- [ ] Simple OAuth 2.1 ecosystem installed via Composer
- [ ] All 6 RFC implementation modules enabled and configured
- [ ] OAuth client created for MCP server with proper grants and scopes
- [ ] Device flow configured with appropriate security settings
- [ ] OAuth discovery endpoints accessible and returning valid metadata
- [ ] OAuth 2.1 compliance dashboard shows green status

## Technical Requirements

- Composer package: `e0ipso/simple_oauth_21`
- Required modules: `simple_oauth_21`, `simple_oauth_device_flow`, `simple_oauth_pkce`,
  `simple_oauth_server_metadata`
- Client grants: `authorization_code`, `refresh_token`, `device_code`
- Required scopes: `read:tutorials`, `write:tutorials`, `profile`
- PKCE enforcement: Mandatory (S256 only)

## Input Dependencies

- Existing Drupal installation
- Admin access to Drupal site

## Output Artifacts

- OAuth client ID and secret for MCP server
- OAuth discovery metadata endpoint: `/.well-known/oauth-authorization-server`
- Device authorization endpoint: `/oauth/device_authorization`
- Authorization endpoint: `/oauth/authorize`
- Token endpoint: `/oauth/token`

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Install Simple OAuth 2.1 Ecosystem

```bash
# Install the complete OAuth 2.1 package
composer require e0ipso/simple_oauth_21

# Enable all required modules for full OAuth 2.1 compliance
drush pm:enable simple_oauth_21 \
  simple_oauth_device_flow \
  simple_oauth_pkce \
  simple_oauth_server_metadata \
  simple_oauth_client_registration \
  simple_oauth_native_apps

# Clear cache
drush cr
```

### Step 2: Configure OAuth Settings

```bash
# Set token lifetimes
drush config:set simple_oauth.settings token_expire 3600
drush config:set simple_oauth.settings refresh_token_expire 2592000

# Enforce PKCE (mandatory for OAuth 2.1)
drush config:set simple_oauth_pkce.settings enforcement_level mandatory

# Configure device flow settings
drush config:set simple_oauth_device_flow.settings device_code_lifetime 1800
drush config:set simple_oauth_device_flow.settings polling_interval 5
drush config:set simple_oauth_device_flow.settings user_code_length 8
```

### Step 3: Create OAuth Client for MCP Server

1. Navigate to `/admin/config/services/consumer`
2. Click "Add Consumer"
3. Configure client settings:
   - **Label**: "MCP Server Client"
   - **Client ID**: `mcp-server-client` (or auto-generate)
   - **Grant Types**: Select `authorization_code`, `refresh_token`, and
     `urn:ietf:params:oauth:grant-type:device_code`
   - **Scopes**: Add `read:tutorials`, `write:tutorials`, `profile`
   - **Redirect URIs**: Add `http://localhost:3000/callback` and
     `https://mcp-server.example.com/callback`
   - **PKCE**: Set to "Required"
4. Save and record the generated client secret securely

### Step 4: Verify OAuth 2.1 Compliance

1. Visit `/admin/config/people/simple_oauth/oauth-21`
2. Check that all RFC implementations show green status
3. Verify no critical security issues are reported
4. Test discovery endpoint: `GET /.well-known/oauth-authorization-server`

### Step 5: Validate Endpoints

Test that the following endpoints return valid responses:

- `/.well-known/oauth-authorization-server` - OAuth metadata
- `/oauth/authorize` - Authorization endpoint (browser flow)
- `/oauth/token` - Token exchange endpoint
- `/oauth/device_authorization` - Device authorization endpoint
- `/oauth/device` - Device verification page

### Security Configurations

- Ensure HTTPS is configured for production
- Verify PKCE enforcement is mandatory
- Check that device codes use non-ambiguous character set
- Confirm token rotation is enabled
</details>
