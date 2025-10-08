#!/usr/bin/env node

import main, { handleError } from './index.js';

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
