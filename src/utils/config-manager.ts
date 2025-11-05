/**
 * Configuration Manager Module
 *
 * Applies CLI argument precedence over environment variables, validates
 * merged configuration, and provides helpful error messages for invalid values.
 *
 * Precedence order: CLI args > env vars > defaults
 *
 * Validation rules:
 * - drupal-url: Must be valid HTTP/HTTPS URL
 * - port: Integer between 1 and 65535
 * - auth: String ('enabled' or 'disabled', undefined = enabled by default)
 */

import type { ParsedCliArgs } from './cli-parser.js';

/**
 * Validate if a string is a valid HTTP/HTTPS URL
 *
 * @param url - URL string to validate
 * @returns true if URL is valid HTTP/HTTPS, false otherwise
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate if a number is a valid port (1-65535)
 *
 * @param port - Port number to validate
 * @returns true if port is valid integer in range, false otherwise
 */
export function isValidPort(port: number): boolean {
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

/**
 * Apply CLI arguments to environment variables with validation
 *
 * Precedence: CLI args > env vars > defaults
 *
 * This function mutates process.env to allow the rest of the codebase
 * to remain unchanged. Only arguments that are explicitly provided
 * (not undefined) will override environment variables.
 *
 * @param args - Parsed CLI arguments
 * @throws Error with helpful message if any argument is invalid
 *
 * @example
 * ```typescript
 * const args = parseCliArgs(['--drupal-url=https://example.com', '--port=3000']);
 * applyArgsToEnv(args);
 * // process.env.DRUPAL_BASE_URL is now 'https://example.com'
 * // process.env.PORT is now '3000'
 * ```
 */
export function applyArgsToEnv(args: ParsedCliArgs): void {
  // Drupal URL (prefer drupal-url over drupal-base-url)
  const drupalUrl = args.drupalUrl ?? args.drupalBaseUrl;
  if (drupalUrl !== undefined) {
    if (!isValidUrl(drupalUrl)) {
      throw new Error(
        `Invalid --drupal-url: '${drupalUrl}'. Must be a valid HTTP/HTTPS URL. Example: https://example.com`
      );
    }
    process.env.DRUPAL_BASE_URL = drupalUrl;
  }

  // Auth (validate and map string values to boolean env var)
  if (args.auth !== undefined) {
    const validValues = ['enabled', 'disabled'];
    if (!validValues.includes(args.auth)) {
      throw new Error(
        `Invalid --auth value: '${args.auth}'. Must be 'enabled' or 'disabled'. Example: --auth=disabled`
      );
    }
    process.env.AUTH_ENABLED = (args.auth === 'enabled').toString();
  } else {
    // Default to enabled if not provided
    if (process.env.AUTH_ENABLED === undefined) {
      process.env.AUTH_ENABLED = 'true';
    }
  }

  // Port
  if (args.port !== undefined) {
    if (!isValidPort(args.port)) {
      throw new Error(
        `Invalid --port: '${args.port}'. Must be between 1 and 65535.`
      );
    }
    process.env.PORT = args.port.toString();
  }
}
