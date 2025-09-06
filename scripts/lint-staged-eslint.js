#!/usr/bin/env node

import { spawn } from 'child_process';

// Set the environment variable and run ESLint with the provided arguments
process.env.ESLINT_USE_FLAT_CONFIG = 'false';

const eslintArgs = ['--fix', ...process.argv.slice(2)];
const eslint = spawn('npx', ['eslint', ...eslintArgs], {
  stdio: 'inherit',
  env: process.env,
});

eslint.on('close', code => {
  process.exit(code);
});
