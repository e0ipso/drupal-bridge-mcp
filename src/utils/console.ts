/**
 * Pretty console output utilities with colors and emojis
 */

import chalk from 'chalk';

/**
 * Print a section header with emoji
 */
export function printSection(title: string, emoji = '📦'): void {
  console.log(`\n${emoji} ${chalk.bold.cyan(title)}`);
  console.log(chalk.dim('─'.repeat(60)));
}

/**
 * Print a success message
 */
export function printSuccess(message: string): void {
  console.log(`${chalk.green('✓')} ${message}`);
}

/**
 * Print an info message
 */
export function printInfo(message: string, indent = 0): void {
  console.log(' '.repeat(indent) + chalk.dim(`  ${message}`));
}

/**
 * Print an error message
 */
export function printError(message: string): void {
  console.log(`${chalk.red('✗')} ${message}`);
}

/**
 * Print a warning message
 */
export function printWarning(message: string): void {
  console.log(`${chalk.yellow('⚠')} ${message}`);
}

/**
 * Print startup banner
 */
export function printStartupBanner(config: {
  name: string;
  version: string;
  host: string;
  port: number;
  authEnabled: boolean;
  oauthServer?: string;
  oauthClient?: string;
  toolsCount: number;
}): void {
  const content = [
    chalk.bold.white(`${config.name} v${config.version}`),
    '',
    `${chalk.cyan('🌐 HTTP Server:')} ${chalk.white(`http://${config.host}:${config.port}`)}`,
    `${chalk.cyan('🔌 MCP Endpoint:')} ${chalk.white(`http://${config.host}:${config.port}/mcp`)}`,
    `${chalk.cyan('❤️ Health Check:')} ${chalk.white(`http://${config.host}:${config.port}/health`)}`,
    `${chalk.cyan('🔒 Auth Enabled:')} ${config.authEnabled ? chalk.green('Yes') : chalk.yellow('No')}`,
  ];

  if (config.authEnabled && config.oauthServer) {
    content.push(
      `${chalk.cyan('🔑 OAuth Server:')} ${chalk.white(config.oauthServer)}`
    );
  }

  if (config.authEnabled && config.oauthClient) {
    content.push(
      `${chalk.cyan('👤 OAuth Client:')} ${chalk.white(config.oauthClient)}`
    );
  }

  content.push(
    `${chalk.cyan('🛠️ Tools Available:')} ${chalk.bold.green(config.toolsCount.toString())}`
  );

  // Print header
  console.log('');
  console.log(chalk.bold.green('✨ MCP SERVER STARTED ✨'));
  console.log('');
  // Print content
  console.log(content.join('\n'));
  console.log('');
}
