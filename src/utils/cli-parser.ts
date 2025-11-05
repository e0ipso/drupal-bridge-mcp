/**
 * CLI Argument Parser Module
 *
 * Type-safe command-line argument parser using minimist.
 * Parses CLI arguments and returns a structured configuration object.
 *
 * Supported arguments:
 * - --drupal-base-url=<url>: Drupal site URL
 * - --no-auth: Disable OAuth authentication (enabled by default)
 * - --port=<number>: Server port
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
   * OAuth authentication mode: 'enabled' or 'disabled'
   * Use --auth=enabled or --auth=disabled
   * Defaults to 'enabled' if not specified
   */
  auth?: string;

  /**
   * Server port number
   */
  port?: number;

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
      'auth',
      'port', // Parse as string first, then convert to number
    ],
    // Boolean flags
    boolean: ['help', 'version'],
    // Shorthand aliases
    alias: {
      h: 'help',
      v: 'version',
    },
  });

  // Convert kebab-case to camelCase and handle type conversions
  return {
    drupalUrl: parsed['drupal-url'],
    drupalBaseUrl: parsed['drupal-base-url'],
    auth: parsed.auth,
    // Convert port from string to number (if provided)
    port: parsed.port ? parseInt(parsed.port, 10) : undefined,
    help: parsed.help,
    version: parsed.version,
  };
}
