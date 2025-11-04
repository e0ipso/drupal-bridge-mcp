/**
 * CLI Bootstrap Module
 *
 * Handles all CLI initialization logic including argument parsing,
 * help/version display, and configuration validation.
 *
 * This module provides a clean separation of concerns by isolating
 * all CLI-related logic from the main server entry point.
 */

import { parseCliArgs } from './cli-parser.js';
import { applyArgsToEnv } from './config-manager.js';
import { displayHelp, displayVersion } from './cli-help.js';

/**
 * Bootstrap the application with CLI argument processing
 *
 * This function:
 * 1. Parses CLI arguments
 * 2. Handles --help and --version flags (exits early)
 * 3. Validates and applies CLI arguments to environment
 * 4. Exits with appropriate error code on validation failure
 *
 * @param argv - Command-line arguments (typically process.argv.slice(2))
 *
 * @example
 * ```typescript
 * // In server.ts
 * import { bootstrap } from './utils/cli-bootstrap.js';
 *
 * bootstrap(process.argv.slice(2));
 * // Environment is now configured, ready to start server
 * ```
 */
export function bootstrap(argv: string[]): void {
  // Parse CLI arguments
  const args = parseCliArgs(argv);

  // Handle --help flag (early exit)
  if (args.help) {
    displayHelp();
    process.exit(0);
  }

  // Handle --version flag (early exit)
  if (args.version) {
    console.log(displayVersion());
    process.exit(0);
  }

  // Apply and validate CLI arguments
  try {
    applyArgsToEnv(args);
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Configuration error: ${error.message}`);
      console.error('Run with --help for usage information.');
    }
    process.exit(1);
  }
}
