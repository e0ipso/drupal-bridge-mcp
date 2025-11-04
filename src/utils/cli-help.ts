/**
 * CLI Help and Version Display Utilities
 *
 * Provides formatted help text and version information for the CLI interface.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Gets the package version from package.json
 * @returns {string} The current package version
 */
export function displayVersion(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')
  );
  return packageJson.version;
}

/**
 * Displays formatted help text for the CLI
 */
export function displayHelp(): void {
  const version = displayVersion();
  const helpText = `
Drupal Bridge MCP Server v${version}

Usage: drupal-bridge-mcp [options]

Required:
  --drupal-url <url>              Drupal site URL (e.g., https://example.com)

Optional:
  --auth / --no-auth              Enable/disable OAuth authentication (default: true)
  --port <number>                 Server port (default: 3000)
  --log-level <level>             Logging verbosity (default: info)
                                  Options: trace, debug, info, warn, error, fatal
  --oauth-scopes <scopes>         OAuth scopes (comma/space separated)
  --oauth-additional-scopes <s>   Additional OAuth scopes beyond tool requirements
  --oauth-resource-server-url     OAuth resource server URL (if different from Drupal URL)
  --drupal-jsonrpc-method <m>     HTTP method for tool invocation (GET|POST, default: GET)
  --help, -h                      Show this help message
  --version, -v                   Show version number

Examples:
  drupal-bridge-mcp --drupal-url=https://example.com
  drupal-bridge-mcp --drupal-url=https://example.com --no-auth
  drupal-bridge-mcp --drupal-url=https://example.com --port=4000 --log-level=debug
  drupal-bridge-mcp --drupal-url=https://example.com --oauth-scopes="profile tutorial_read"

Environment Variables:
  All options can also be set via environment variables (CLI args take precedence):
  DRUPAL_BASE_URL, AUTH_ENABLED, PORT, LOG_LEVEL, OAUTH_SCOPES, etc.

Documentation: https://github.com/e0ipso/drupal-bridge-mcp#readme
`;

  console.log(helpText.trim());
}
