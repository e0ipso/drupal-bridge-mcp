#!/usr/bin/env node

import { spawn } from 'child_process';

// Run ESLint with the provided arguments (using flat config)
const eslintArgs = ['--fix', ...process.argv.slice(2)];
const eslint = spawn('npx', ['eslint', ...eslintArgs], {
  stdio: 'inherit',
  env: process.env,
});

eslint.on('close', code => {
  process.exit(code);
});
