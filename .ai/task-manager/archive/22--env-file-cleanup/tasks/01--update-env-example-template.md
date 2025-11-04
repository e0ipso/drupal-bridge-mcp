---
id: 1
group: 'environment-configuration'
dependencies: []
status: 'completed'
created: 2025-11-03
skills:
  - configuration
---

# Update .env.example Template with Complete Variable Documentation

## Objective

Comprehensively update .env.example to include all actively-used environment variables, remove
obsolete migration notes, improve documentation clarity, and organize variables into logical groups.

## Skills Required

- **configuration**: Environment variable configuration and documentation

## Acceptance Criteria

- [ ] All obsolete content removed (DRUPAL_JSONRPC_ENDPOINT migration notes, PR #3 references)
- [ ] Missing variables added (OAUTH_SCOPES, OAUTH_RESOURCE_SERVER_URL)
- [ ] Variables organized into logical groups with clear section headers
- [ ] Each variable has clear, helpful comment explaining purpose and format
- [ ] Dual-variable support (DRUPAL_URL/DRUPAL_BASE_URL) documented with preference noted
- [ ] OAUTH_ADDITIONAL_SCOPES documentation clarifies it supplements tool-discovered scopes
- [ ] File structure is clean and easy to navigate for new users

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Variables to Add:**

1. **OAUTH_SCOPES** (optional):

   ```bash
   # OAUTH_SCOPES: Space or comma-separated list of OAuth scopes
   #   Default: Automatically discovered from tool definitions at startup
   #   Use this to override auto-discovered scopes if needed
   #OAUTH_SCOPES="profile tutorial_read user_read"
   ```

2. **OAUTH_RESOURCE_SERVER_URL** (optional):
   ```bash
   # OAUTH_RESOURCE_SERVER_URL: Override OAuth resource server URL
   #   Default: Uses DRUPAL_BASE_URL if not specified
   #   Use this when resource server differs from main Drupal URL
   #OAUTH_RESOURCE_SERVER_URL=https://your-drupal-site.com
   ```

**Content to Remove:**

1. Migration note section:

   ```
   # Migration Note (Breaking Change):
   # The DRUPAL_JSONRPC_ENDPOINT variable has been removed.
   # All tools now use per-tool URLs (/mcp/tools/{tool_name}).
   # Requires Drupal backend with PR #3 changes (per-tool routing).
   ```

2. Tool invocation configuration comment referencing removed endpoint

**Documentation Improvements:**

1. Add note about DRUPAL_URL/DRUPAL_BASE_URL dual support:

   ```bash
   # Drupal Base URL (required)
   # Note: DRUPAL_URL is also supported for backward compatibility,
   # but DRUPAL_BASE_URL is the preferred variable name
   DRUPAL_BASE_URL=https://your-drupal-site.com
   ```

2. Clarify OAUTH_ADDITIONAL_SCOPES purpose:
   ```bash
   # OAUTH_ADDITIONAL_SCOPES: Additional OAuth scopes beyond tool requirements
   #   Scopes are automatically discovered from tool definitions at startup.
   #   Use this to add extra permissions not tied to specific tools.
   #   Format: Space-separated or comma-separated list
   ```

**Organization Structure:**

Group variables into sections:

1. Drupal Connection Configuration
2. Tool Invocation Configuration
3. Authentication Configuration
4. Logging Configuration
5. Server Configuration (optional)

## Input Dependencies

None - this is the first task in the cleanup process.

## Output Artifacts

- Updated .env.example file with complete, organized variable documentation
- Template suitable for new users to configure the server without additional reference

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Read Current .env.example

Read the current .env.example file to understand its structure.

### Step 2: Remove Obsolete Content

Remove the following sections:

- Lines containing "Migration Note (Breaking Change)"
- Lines containing "DRUPAL_JSONRPC_ENDPOINT variable has been removed"
- Lines containing "PR #3 changes"
- Old "Tool Invocation Configuration" comment that mentions removed endpoint

### Step 3: Add Missing Variables

Add OAUTH_SCOPES and OAUTH_RESOURCE_SERVER_URL with clear comments explaining:

- Purpose of each variable
- Default behavior if not specified
- Format expected (for scopes: space or comma-separated)
- When to use the variable (use cases)

Place OAUTH_SCOPES in the Authentication Configuration section. Place OAUTH_RESOURCE_SERVER_URL
after OAUTH_SCOPES.

### Step 4: Improve Existing Documentation

Update the following sections:

1. **DRUPAL_BASE_URL comment**: Add backward compatibility note
2. **OAUTH_ADDITIONAL_SCOPES comment**: Clarify relationship to auto-discovered scopes
3. **DRUPAL_JSONRPC_METHOD comment**: Ensure it clearly explains GET vs POST behavior

### Step 5: Organize into Logical Groups

Restructure the file with clear section headers:

```bash
# ============================================
# Drupal Connection Configuration
# ============================================

# ============================================
# Tool Invocation Configuration
# ============================================

# ============================================
# Authentication Configuration
# ============================================

# ============================================
# Logging Configuration
# ============================================
```

Ensure variables are grouped logically under appropriate sections.

### Step 6: Validate Format and Clarity

- Ensure all comments use consistent formatting (# prefix, proper spacing)
- Verify each variable has example value or placeholder
- Check that optional variables are commented out with #
- Confirm required variables have clear "required" indicator in comments

### Step 7: Cross-Reference with Code

Verify that the variables in .env.example match what's actually used in:

- src/oauth/config.ts (OAuth configuration)
- src/index.ts (Server configuration)
- src/utils/logger.ts (Logging configuration)

Ensure no process.env accesses are undocumented.

</details>

**Reference Files:**

- Current .env.example: /workspace/.env.example
- OAuth config code: /workspace/src/oauth/config.ts (lines 160-194)
- Project documentation: /workspace/AGENTS.md (lines 38-44)

## Execution Notes

### Completed Actions

✅ **Obsolete Content Removed:**

- Removed "Migration Note (Breaking Change)" section referencing DRUPAL_JSONRPC_ENDPOINT removal
- Removed references to "PR #3 changes"

✅ **Missing Variables Added:**

- Added OAUTH_SCOPES with comprehensive documentation including default behavior, format, and usage
  examples
- Added OAUTH_RESOURCE_SERVER_URL with clear explanation of when to use it

✅ **Documentation Improvements:**

- Added backward compatibility note for DRUPAL_URL/DRUPAL_BASE_URL dual support
- Clarified OAUTH_ADDITIONAL_SCOPES supplements auto-discovered scopes
- Enhanced DRUPAL_JSONRPC_METHOD documentation with GET/POST behavior details

✅ **File Organization:**

- Structured file into 5 logical sections with clear headers:
  1. Drupal Connection Configuration
  2. Tool Invocation Configuration
  3. Authentication Configuration
  4. Logging Configuration
  5. Server Configuration
- Ensured consistent comment formatting throughout
- Verified all optional variables are properly commented out

✅ **Code Cross-Reference:**

- Verified all OAuth-related environment variables in src/oauth/config.ts are documented
- Confirmed AUTH_ENABLED, DRUPAL_BASE_URL, DRUPAL_JSONRPC_METHOD, and LOG_LEVEL are properly
  documented
- All OAuth configuration variables match code usage

### Notes

- All acceptance criteria have been met
- The .env.example file now serves as a complete, self-documenting template for new users
- File structure is clean, organized, and easy to navigate
