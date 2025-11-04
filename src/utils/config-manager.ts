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
 * - log-level: One of trace, debug, info, warn, error, fatal
 * - drupal-jsonrpc-method: One of GET, POST
 * - auth: Boolean (true/false)
 */

import type { ParsedCliArgs } from './cli-parser.js';

/**
 * Valid log levels for the application
 */
const VALID_LOG_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
] as const;

/**
 * Valid JSON-RPC HTTP methods
 */
const VALID_JSONRPC_METHODS = ['GET', 'POST'] as const;

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
 * Validate if a string is a valid log level
 *
 * @param level - Log level to validate
 * @returns true if level is valid, false otherwise
 */
export function isValidLogLevel(level: string): boolean {
  return VALID_LOG_LEVELS.includes(
    level.toLowerCase() as (typeof VALID_LOG_LEVELS)[number]
  );
}

/**
 * Validate if a string is a valid JSON-RPC HTTP method
 *
 * @param method - HTTP method to validate
 * @returns true if method is valid, false otherwise
 */
export function isValidJsonRpcMethod(method: string): boolean {
  return VALID_JSONRPC_METHODS.includes(
    method.toUpperCase() as (typeof VALID_JSONRPC_METHODS)[number]
  );
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

  // Auth (convert boolean to string for process.env)
  if (args.auth !== undefined) {
    process.env.AUTH_ENABLED = args.auth.toString();
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

  // Log level
  if (args.logLevel !== undefined) {
    if (!isValidLogLevel(args.logLevel)) {
      throw new Error(
        `Invalid --log-level: '${args.logLevel}'. Must be one of: trace, debug, info, warn, error, fatal`
      );
    }
    process.env.LOG_LEVEL = args.logLevel;
  }

  // OAuth scopes
  if (args.oauthScopes !== undefined) {
    process.env.OAUTH_SCOPES = args.oauthScopes;
  }

  // OAuth additional scopes
  if (args.oauthAdditionalScopes !== undefined) {
    process.env.OAUTH_ADDITIONAL_SCOPES = args.oauthAdditionalScopes;
  }

  // OAuth resource server URL
  if (args.oauthResourceServerUrl !== undefined) {
    if (!isValidUrl(args.oauthResourceServerUrl)) {
      throw new Error(
        `Invalid --oauth-resource-server-url: '${args.oauthResourceServerUrl}'. Must be a valid HTTP/HTTPS URL. Example: https://example.com`
      );
    }
    process.env.OAUTH_RESOURCE_SERVER_URL = args.oauthResourceServerUrl;
  }

  // JSON-RPC method (normalize to uppercase)
  if (args.drupalJsonrpcMethod !== undefined) {
    if (!isValidJsonRpcMethod(args.drupalJsonrpcMethod)) {
      throw new Error(
        `Invalid --drupal-jsonrpc-method: '${args.drupalJsonrpcMethod}'. Must be one of: GET, POST`
      );
    }
    process.env.DRUPAL_JSONRPC_METHOD = args.drupalJsonrpcMethod.toUpperCase();
  }
}
