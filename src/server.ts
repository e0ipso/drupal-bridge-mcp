#!/usr/bin/env node

import { bootstrap } from './utils/cli-bootstrap.js';

// Bootstrap CLI configuration (parses args, validates, sets env)
bootstrap(process.argv.slice(2));

// Import main after environment is configured
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
