---
id: 8
group: "documentation"
dependencies: [7]
status: "pending"
created: "2025-11-04"
skills:
  - "markdown"
  - "technical-writing"
---

# Update Documentation with CLI Usage Examples

## Objective

Update the README.md and .env.example files to document CLI argument support with clear examples, ensuring users can discover and understand how to use the new feature effectively.

## Skills Required

- markdown: Documentation formatting and structure
- technical-writing: Clear, user-friendly explanations and examples

## Acceptance Criteria

- [ ] README.md updated with CLI usage section
- [ ] Quick Start section includes npx example
- [ ] "Without Installation" section added showcasing CLI arguments
- [ ] .env.example includes note about CLI alternatives
- [ ] All examples are tested and work correctly
- [ ] Documentation maintains existing tone and style
- [ ] Links and formatting are correct

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**README.md Updates**:

1. **Update Quick Start section** - Add npx example at the beginning:
   ```markdown
   ### Quick Start with npx (No Installation)

   ```bash
   # Run directly without installation
   npx @e0ipso/drupal-bridge-mcp --drupal-url=https://your-drupal-site.com

   # Disable auth for testing
   npx @e0ipso/drupal-bridge-mcp --drupal-url=https://your-drupal-site.com --no-auth
   ```

2. **Add CLI Arguments section** after Quick Start:
   ```markdown
   ### CLI Arguments

   All configuration options can be passed as command-line arguments:

   ```bash
   drupal-bridge-mcp [options]
   ```

   **Required:**
   - `--drupal-url <url>` - Drupal site URL

   **Optional:**
   - `--auth` / `--no-auth` - Enable/disable OAuth (default: true)
   - `--port <number>` - Server port (default: 3000)
   - `--log-level <level>` - Logging verbosity (default: info)
   - `--oauth-scopes <scopes>` - OAuth scopes
   - `--help` / `-h` - Show help message
   - `--version` / `-v` - Show version

   **Examples:**
   ```bash
   # Basic usage
   npx @e0ipso/drupal-bridge-mcp --drupal-url=https://example.com

   # Custom port and debug logging
   npx @e0ipso/drupal-bridge-mcp \
     --drupal-url=https://example.com \
     --port=4000 \
     --log-level=debug

   # Disable auth for local testing
   npx @e0ipso/drupal-bridge-mcp \
     --drupal-url=http://localhost:8080 \
     --no-auth
   ```

   **Precedence:** CLI arguments override environment variables, which override defaults.
   ```

3. **Update Configuration section** - Add note about CLI vs env:
   ```markdown
   ### Configuration

   Configuration can be provided via:
   1. **CLI arguments** (highest precedence)
   2. **Environment variables** (medium precedence)
   3. **Default values** (lowest precedence)

   **Using CLI arguments:**
   ```bash
   drupal-bridge-mcp --drupal-url=https://example.com --port=4000
   ```

   **Using environment variables:**
   Create a `.env` file:
   ```env
   DRUPAL_BASE_URL=https://your-drupal-site.com
   AUTH_ENABLED=true
   ```
   ```

**.env.example Updates**:

Add header note about CLI alternatives:
```env
# ============================================
# Configuration Options
# ============================================
#
# All options can be set via:
# 1. CLI arguments: --drupal-url=https://example.com
# 2. Environment variables (this file)
# 3. Default values
#
# CLI arguments take precedence over environment variables.
# Run 'npx @e0ipso/drupal-bridge-mcp --help' for CLI usage.
#

# ============================================
# Drupal Connection Configuration
# ============================================
...
```

## Input Dependencies

- Integration testing completed and verified (task 7)
- CLI help text finalized (from task 4)

## Output Artifacts

- Updated README.md with CLI documentation
- Updated .env.example with CLI notes
- All examples verified to work

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Read current README.md**:
   ```bash
   cat README.md
   ```

   Identify sections to update:
   - Quick Start (around line 23-54)
   - Configuration section (around line 36-43)
   - Available Tools section (keep as-is)

2. **Update Quick Start section**:
   - Add "Quick Start with npx" subsection at top
   - Keep existing "Installation" subsection
   - Add "Usage" subsection with both methods

   Example structure:
   ```markdown
   ## 🚀 Quick Start

   ### Without Installation (npx)
   [npx examples here]

   ### With Installation
   [existing installation steps]

   ### Configuration
   [CLI vs env vars explanation]
   ```

3. **Add new CLI Arguments section**:
   - Place after Quick Start, before Available Tools
   - Include all arguments from help text
   - Provide practical examples (basic, advanced, testing scenarios)
   - Explain precedence rules clearly

4. **Update .env.example**:
   - Add comment header about CLI alternatives
   - Reference --help for CLI usage
   - Keep existing variable documentation
   - Add note that CLI takes precedence

5. **Verify all examples work**:
   ```bash
   # Test each example from README
   npx . --drupal-url=https://drupal-contrib.ddev.site --no-auth
   npx . --drupal-url=https://drupal-contrib.ddev.site --port=4000 --log-level=debug
   # etc.
   ```

6. **Check formatting**:
   - Markdown renders correctly (preview in editor)
   - Code blocks have correct syntax highlighting
   - Links work (if any added)
   - Consistent heading levels

7. **Review for consistency**:
   - Match existing documentation tone
   - Use same terminology (e.g., "Drupal site URL" not "Drupal URL")
   - Follow existing example patterns
   - Maintain emoji usage style (🚀, ✨, etc.)

**Tone Guidelines**:
- Clear and concise
- Practical examples over theory
- Show most common use cases first
- Mention advanced options but don't overwhelm

**Example Priorities**:
1. Basic usage (most important)
2. Disable auth for testing (common during development)
3. Custom port/logging (occasional need)
4. Advanced options (reference to --help)

**What NOT to Add**:
- Exhaustive list of all env vars (keep in .env.example)
- Implementation details (save for code comments)
- Troubleshooting section (unless critical)
- Historical context about why CLI was added

**Testing Documentation**:
- Copy examples to shell and execute
- Verify each one works as documented
- Check that error scenarios mentioned are accurate
- Confirm help text matches documentation

</details>
