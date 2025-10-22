---
id: 2
group: "documentation"
dependencies: [1]
status: "completed"
created: "2025-01-22"
skills:
  - documentation
---
# Update .env.example with MCP_SERVER_NAME documentation

## Objective
Document the `MCP_SERVER_NAME` environment variable in `.env.example` so operators know they can customize the server identifier for OAuth client registration.

## Skills Required
- **documentation**: Update environment variable documentation file

## Acceptance Criteria
- [ ] `.env.example` file updated with `MCP_SERVER_NAME` documentation
- [ ] Documentation explains purpose (software ID for OAuth client registration)
- [ ] Documentation includes default value (`com.mateuaguilo.drupal-bridge-mcp`)
- [ ] Documentation follows existing `.env.example` format and style
- [ ] Optional: Include `MCP_SERVER_VERSION` variable for completeness

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

<details>
<summary>Click to expand detailed implementation instructions</summary>

### Location
File: `.env.example` (root of repository)

### Required Changes

Add the following section to `.env.example`. Based on the existing structure, add it near the top after any existing server configuration variables, or create a new "MCP Server Configuration" section:

```bash
# MCP Server Configuration
# Software identification for OAuth client registration metadata
MCP_SERVER_NAME=dme-mcp  # Server identifier (default: com.mateuaguilo.drupal-bridge-mcp)
# MCP_SERVER_VERSION=1.10.0  # Optional: Override package.json version

```

**Formatting guidelines**:
- Match existing comment style in `.env.example`
- Use clear, concise descriptions
- Include default values in comments
- Group related variables together

**Context for documentation**:
- `MCP_SERVER_NAME`: Identifies this MCP server instance in OAuth metadata
- Used in `software_id` field of OAuth Authorization Server Metadata
- Useful for multi-server deployments (e.g., "dme-mcp-prod", "dme-mcp-staging")
- Falls back to `"com.mateuaguilo.drupal-bridge-mcp"` if not set

</details>

## Input Dependencies
- Task 1 must be completed (implements the feature being documented)
- Existing `.env.example` file structure and format

## Output Artifacts
- Updated `.env.example` file with MCP_SERVER_NAME documentation

## Implementation Notes

**Placement recommendations**:
1. If `.env.example` has a "Server Configuration" section, add there
2. If it has MCP-specific variables grouped together, add near those
3. Otherwise, add near the top after any critical variables (like DATABASE_URL, etc.)

**Don't include**:
- Actual sensitive values (this is `.env.example`, not `.env`)
- Values that change per environment (use placeholder text)

**Verification**:
- Read the updated `.env.example` to ensure documentation is clear
- Verify formatting matches existing style (comment characters, spacing, etc.)
