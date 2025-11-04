---
id: 4
group: 'cli-parsing'
dependencies: []
status: 'completed'
created: '2025-11-04'
skills:
  - 'typescript'
  - 'node-cli'
---

# Implement Help and Version Display Utilities

## Objective

Create utilities to display formatted help text and version information when users run the CLI with
`--help` or `--version` flags, providing clear usage examples and current version number.

## Skills Required

- typescript: Module creation with clean interfaces
- node-cli: CLI output formatting and user-friendly help text

## Acceptance Criteria

- [ ] New file `src/utils/cli-help.ts` created with displayHelp and displayVersion functions
- [ ] Help text includes all supported arguments with descriptions
- [ ] Help text includes practical usage examples
- [ ] Version display reads from package.json
- [ ] Output is clear, well-formatted, and easy to read
- [ ] Type checking passes without errors

Use your internal Todo tool to track these and keep on track.

## Technical Requirements

**Functions to implement**:

- `displayHelp(): void` - Print help text to stdout
- `displayVersion(): string` - Return version string from package.json

**Help Text Format**:

```
Drupal Bridge MCP Server v{version}

Usage: drupal-bridge-mcp [options]

Required:
  --drupal-url <url>              Drupal site URL (e.g., https://example.com)

Optional:
  --auth / --no-auth              Enable/disable OAuth authentication (default: true)
  --port <number>                 Server port (default: 3000)
  --log-level <level>             Logging verbosity (default: info)
  --oauth-scopes <scopes>         OAuth scopes (comma/space separated)
  --oauth-additional-scopes <s>   Additional OAuth scopes
  --oauth-resource-server-url     OAuth resource server URL
  --drupal-jsonrpc-method <m>     HTTP method for tool invocation (GET|POST, default: GET)
  --help, -h                      Show this help message
  --version, -v                   Show version number

Examples:
  drupal-bridge-mcp --drupal-url=https://example.com
  drupal-bridge-mcp --drupal-url=https://example.com --no-auth
  drupal-bridge-mcp --drupal-url=https://example.com --port=4000 --log-level=debug

Environment Variables:
  All options can also be set via environment variables (CLI args take precedence):
  DRUPAL_BASE_URL, AUTH_ENABLED, PORT, LOG_LEVEL, etc.
```

## Input Dependencies

None - this module is independent and can be developed in parallel with tasks 1-3.

## Output Artifacts

- `src/utils/cli-help.ts` with:
  - `displayHelp(): void` function
  - `displayVersion(): string` function
  - Help text template (as string constant or function)

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

1. **Create file structure**:

   ```bash
   touch src/utils/cli-help.ts
   ```

2. **Import dependencies**:

   ```typescript
   import { readFileSync } from 'node:fs';
   import { fileURLToPath } from 'node:url';
   import { dirname, join } from 'node:path';
   ```

3. **Implement displayVersion function**:

   ```typescript
   export function displayVersion(): string {
     const __filename = fileURLToPath(import.meta.url);
     const __dirname = dirname(__filename);
     const packageJson = JSON.parse(
       readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')
     );
     return packageJson.version;
   }
   ```

4. **Implement displayHelp function**:
   ```typescript
   export function displayHelp(): void {
     const version = displayVersion();
     const helpText = `
   Drupal Bridge MCP Server v${version}
   ```

Usage: drupal-bridge-mcp [options]

Required: --drupal-url <url> Drupal site URL (e.g., https://example.com)

Optional: --auth / --no-auth Enable/disable OAuth authentication (default: true) --port <number>
Server port (default: 3000) --log-level <level> Logging verbosity (default: info) Options: trace,
debug, info, warn, error, fatal --oauth-scopes <scopes> OAuth scopes (comma/space separated)
--oauth-additional-scopes <s> Additional OAuth scopes beyond tool requirements
--oauth-resource-server-url OAuth resource server URL (if different from Drupal URL)
--drupal-jsonrpc-method <m> HTTP method for tool invocation (GET|POST, default: GET) --help, -h Show
this help message --version, -v Show version number

Examples: drupal-bridge-mcp --drupal-url=https://example.com drupal-bridge-mcp
--drupal-url=https://example.com --no-auth drupal-bridge-mcp --drupal-url=https://example.com
--port=4000 --log-level=debug drupal-bridge-mcp --drupal-url=https://example.com
--oauth-scopes="profile tutorial_read"

Environment Variables: All options can also be set via environment variables (CLI args take
precedence): DRUPAL_BASE_URL, AUTH_ENABLED, PORT, LOG_LEVEL, OAUTH_SCOPES, etc.

Documentation: https://github.com/e0ipso/drupal-bridge-mcp#readme `;

     console.log(helpText.trim());

}

````

5. **Path calculation**:
- Use `import.meta.url` to get current file path
- Navigate up to project root to find package.json
- From `src/utils/cli-help.ts`, package.json is at `../../package.json`

6. **Formatting considerations**:
- Use consistent indentation (2 spaces for option descriptions)
- Align descriptions at column 40 for readability
- Include line breaks between sections
- Trim final output to avoid leading/trailing whitespace

7. **Test manually**:
```bash
npm run build
# Create test file to call displayHelp() and displayVersion()
````

**Design Decisions**:

- Use console.log (not console.error) for help - this is informational output
- Read package.json directly rather than importing - avoids build complexity
- Include environment variable note to clarify precedence rules
- Keep examples simple and progressively more complex

</details>
