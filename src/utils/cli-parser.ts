/**
 * CLI Argument Parser Module
 *
 * Type-safe command-line argument parser using minimist.
 * Parses CLI arguments and returns a structured configuration object.
 *
 * Supported arguments:
 * - --drupal-url=<url> or --drupal-base-url=<url>: Drupal site URL
 * - --auth / --no-auth: Enable/disable OAuth authentication
 * - --port=<number>: Server port
 * - --log-level=<level>: Logging verbosity
 * - --oauth-scopes=<scopes>: OAuth scopes (comma or space separated)
 * - --oauth-additional-scopes=<scopes>: Additional OAuth scopes
 * - --oauth-resource-server-url=<url>: OAuth resource server URL
 * - --drupal-jsonrpc-method=<method>: JSON-RPC HTTP method (GET|POST)
 * - --help / -h: Show help message
 * - --version / -v: Show version
 */

import minimist from 'minimist';

/**
 * Parsed CLI arguments interface
 *
 * All properties are optional to allow environment variables
 * to take precedence when CLI arguments are not provided.
 */
export interface ParsedCliArgs {
  /**
   * Drupal site URL (alternative property name)
   */
  drupalUrl?: string;

  /**
   * Drupal site base URL
   */
  drupalBaseUrl?: string;

  /**
   * Enable/disable OAuth authentication
   */
  auth?: boolean;

  /**
   * Server port number
   */
  port?: number;

  /**
   * Logging verbosity level (trace|debug|info|warn|error|fatal)
   */
  logLevel?: string;

  /**
   * OAuth scopes (comma or space separated)
   */
  oauthScopes?: string;

  /**
   * Additional OAuth scopes
   */
  oauthAdditionalScopes?: string;

  /**
   * OAuth resource server URL
   */
  oauthResourceServerUrl?: string;

  /**
   * JSON-RPC HTTP method (GET|POST)
   */
  drupalJsonrpcMethod?: string;

  /**
   * Show help message
   */
  help?: boolean;

  /**
   * Show version information
   */
  version?: boolean;
}

/**
 * Parse command-line arguments into structured configuration object
 *
 * @param argv - Command-line arguments (typically process.argv.slice(2))
 * @returns Parsed CLI arguments with camelCase property names
 *
 * @example
 * ```typescript
 * const args = parseCliArgs(['--drupal-url=https://example.com', '--port=3000']);
 * console.log(args.drupalUrl); // 'https://example.com'
 * console.log(args.port); // 3000
 * ```
 */
export function parseCliArgs(argv: string[]): ParsedCliArgs {
  // Configure minimist with argument types and aliases
  const parsed = minimist(argv, {
    // String arguments (no type coercion)
    string: [
      'drupal-url',
      'drupal-base-url',
      'log-level',
      'oauth-scopes',
      'oauth-additional-scopes',
      'oauth-resource-server-url',
      'drupal-jsonrpc-method',
      'port', // Parse as string first, then convert to number
    ],
    // Boolean flags (including negation support via --no-auth)
    boolean: ['auth', 'help', 'version'],
    // Shorthand aliases
    alias: {
      h: 'help',
      v: 'version',
    },
    // Default values (undefined = let env vars take precedence)
    default: {
      auth: undefined,
    },
  });

  // Convert kebab-case to camelCase and handle type conversions
  return {
    drupalUrl: parsed['drupal-url'],
    drupalBaseUrl: parsed['drupal-base-url'],
    auth: parsed.auth,
    // Convert port from string to number (if provided)
    port: parsed.port ? parseInt(parsed.port, 10) : undefined,
    logLevel: parsed['log-level'],
    oauthScopes: parsed['oauth-scopes'],
    oauthAdditionalScopes: parsed['oauth-additional-scopes'],
    oauthResourceServerUrl: parsed['oauth-resource-server-url'],
    drupalJsonrpcMethod: parsed['drupal-jsonrpc-method'],
    help: parsed.help,
    version: parsed.version,
  };
}
