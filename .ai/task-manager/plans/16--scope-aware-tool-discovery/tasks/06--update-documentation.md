---
id: 6
group: 'documentation'
dependencies: [4]
status: 'completed'
created: '2025-10-19'
skills:
  - documentation
---

# Update Environment and README Documentation

## Objective

Document the new OAuth scope management system in `.env.example` and `README.md`, providing clear
guidance on automatic scope discovery and additional scope configuration.

## Skills Required

**documentation**: Technical writing and clear examples for user guides

## Acceptance Criteria

- [ ] `.env.example` updated with `OAUTH_ADDITIONAL_SCOPES` variable and detailed comments
- [ ] `OAUTH_SCOPES` removed or marked as deprecated in `.env.example`
- [ ] README.md includes new "OAuth Scope Management" section
- [ ] Documentation explains automatic scope discovery process
- [ ] Examples show when and how to use `OAUTH_ADDITIONAL_SCOPES`
- [ ] Scope validation error examples included
- [ ] Startup log examples showing discovered scopes included
- [ ] Documentation is clear and accessible to users

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Files to Update:**

- `.env.example`: Add `OAUTH_ADDITIONAL_SCOPES` configuration
- `README.md`: Add comprehensive OAuth scope management section

**Documentation Must Include:**

- How automatic scope discovery works
- When to use `OAUTH_ADDITIONAL_SCOPES`
- Format examples (space-separated and comma-separated)
- Error message examples
- Startup log examples

## Input Dependencies

- Task 4: Implementation must be complete to accurately document behavior

## Output Artifacts

- Updated `.env.example` with new OAuth configuration
- Updated `README.md` with OAuth scope management section
- Clear user guidance for scope configuration

## Implementation Notes

<details>
<summary>Detailed Implementation Guide</summary>

### Step 1: Update .env.example

Replace or update the OAuth section in `.env.example`:

```bash
# Drupal Base URL (required)
DRUPAL_BASE_URL=https://your-drupal-site.com

# Authentication
# Set to false to disable OAuth authentication (not recommended for production)
AUTH_ENABLED=true

# OAuth 2.1 Scope Management
# Scopes are automatically discovered from tool definitions.
# Use OAUTH_ADDITIONAL_SCOPES to add extra permissions beyond tool-discovered scopes.
#
# Common use cases:
# - Administrative or debugging scopes not tied to specific tools
# - Experimental features in development
# - Cross-domain permissions
# - Future-proofing for upcoming features
#
# Format: Space-separated or comma-separated list of scope strings
# Examples:
#   OAUTH_ADDITIONAL_SCOPES="admin:access experimental:features"
#   OAUTH_ADDITIONAL_SCOPES="admin:access, experimental:features, debug:mode"
#
# Default: Empty (no additional scopes beyond tool requirements)
#OAUTH_ADDITIONAL_SCOPES=""

# Logging
# Options: trace, debug, info, warn, error, fatal
LOG_LEVEL=info

# Server Port (default: 6200)
# PORT=6200
```

### Step 2: Add OAuth Scope Management Section to README.md

Find an appropriate location in `README.md` (likely after the "Configuration" or "Authentication"
section) and add:

````markdown
## OAuth Scope Management

The MCP server automatically discovers required OAuth scopes from Drupal's tool definitions at
startup.

### How It Works

1. Server fetches tool definitions from `/mcp/tools/list`
2. Extracts required scopes from each tool's `annotations.auth.scopes`
3. Combines discovered scopes with any additional scopes from `OAUTH_ADDITIONAL_SCOPES`
4. Requests combined scope set during OAuth authentication

This eliminates manual scope configuration and automatically adapts to backend tool changes.

### Automatic Scope Discovery

Scopes are extracted from tool metadata:

```json
{
  "name": "examples.contentTypes.create",
  "annotations": {
    "auth": {
      "scopes": ["content_type:write"],
      "level": "required"
    }
  }
}
```

The server automatically requests the `content_type:write` scope during OAuth flow.

### Adding Extra Scopes

Use `OAUTH_ADDITIONAL_SCOPES` to request scopes beyond what tools declare:

```bash
# .env
OAUTH_ADDITIONAL_SCOPES="admin:access experimental:features"
```

**Common use cases:**

- Administrative or debugging scopes not tied to specific tools
- Experimental features in development
- Cross-domain permissions
- Future-proofing for upcoming features

**Supported formats:**

```bash
# Space-separated
OAUTH_ADDITIONAL_SCOPES="admin:access experimental:features"

# Comma-separated
OAUTH_ADDITIONAL_SCOPES="admin:access, experimental:features"
```

### Tool Access Validation

Before invoking a tool, the server validates:

1. **Authentication** - Tool requires auth and session is authenticated
2. **Scopes** - Session has all required OAuth scopes
3. **Permissions** - Drupal validates permissions server-side

**Error example:**

```
Insufficient OAuth scopes for tool "examples.contentTypes.create".
Required: content_type:write
Missing: content_type:write
Current: profile, content_type:read
```

This error means the OAuth access token doesn't include the `content_type:write` scope. To resolve:

1. Check that the Drupal OAuth server supports the required scope
2. Re-authenticate to obtain a new token with the correct scopes
3. Verify tool metadata correctly declares required scopes

### Scope Discovery Logs

Check server startup logs to see discovered scopes:

```
✓ Discovered 15 tools from Drupal
  Extracted 8 scopes from tool definitions
  Additional scopes: admin:access
  Total scopes: admin:access, content:read, content:write, content_type:read, profile, ...
```

This transparency helps debug scope-related issues and verify configuration.

### Authentication Levels

Tools can declare three authentication levels:

- **`none`**: Public tools, no authentication required
- **`optional`**: Enhanced functionality with auth, but works without
- **`required`**: Enforces authentication and scope validation

If a tool doesn't declare `annotations.auth`, it defaults to `level='none'` (public access).
````

### Step 3: Find Appropriate Placement in README

Look for existing sections like:

- "Configuration"
- "Authentication"
- "Environment Variables"
- "OAuth Setup"

Place the new section after these, or create a new top-level section if needed.

### Step 4: Verify Documentation Clarity

Read through the documentation as if you were a new user:

- Is the automatic discovery process clear?
- Are the use cases for additional scopes understandable?
- Do the examples cover common scenarios?
- Are error messages explained adequately?

### Step 5: Check Formatting

Ensure:

- Markdown formatting is correct
- Code blocks use appropriate syntax highlighting
- Lists are properly formatted
- Headings follow the document's existing structure

</details>
