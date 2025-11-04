#!/usr/bin/env node

import { parseCliArgs } from './utils/cli-parser.js';
import { applyArgsToEnv } from './utils/config-manager.js';
import { displayHelp, displayVersion } from './utils/cli-help.js';

// Parse CLI arguments
const args = parseCliArgs(process.argv.slice(2));

// Handle --help flag
if (args.help) {
  displayHelp();
  process.exit(0);
}

// Handle --version flag
if (args.version) {
  console.log(displayVersion());
  process.exit(0);
}

// Apply CLI arguments to environment (validation happens here)
try {
  applyArgsToEnv(args);
} catch (error) {
  if (error instanceof Error) {
    console.error(`Configuration error: ${error.message}`);
    console.error('Run with --help for usage information.');
  }
  process.exit(1);
}

// Now import main (after env vars are set)
const { default: main, handleError } = await import('./index.js');

// Set up error handlers
process.on('uncaughtException', handleError);
process.on('unhandledRejection', reason => {
  handleError(new Error(`Unhandled rejection: ${reason}`));
});

// Set up shutdown handlers
process.on('SIGINT', () => {
  process.exit(0);
});
process.on('SIGTERM', () => {
  process.exit(0);
});

// Execute main
main().catch(handleError);
