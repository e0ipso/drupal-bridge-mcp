/**
 * Configuration management for the MCP server
 *
 * Centralizes all configuration options with type safety and validation
 */

import type { LogLevel } from '@/types/logger.js';

/**
 * Server configuration interface
 */
export interface ServerConfig {
  readonly environment: 'development' | 'production' | 'test';
  readonly port: number;
  readonly logging: {
    readonly level: LogLevel;
    readonly format: 'json' | 'pretty';
  };
  readonly drupal: {
    readonly baseUrl: string;
    readonly jsonRpcEndpoint: string;
    readonly timeout: number;
  };
  readonly oauth: {
    readonly clientId: string;
    readonly clientSecret: string;
    readonly redirectUri: string;
    readonly authUrl: string;
    readonly tokenUrl: string;
  };
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly user: string;
    readonly password: string;
    readonly ssl: boolean;
  };
}

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): ServerConfig {
  const env = process.env.NODE_ENV || 'development';

  return {
    environment: env as 'development' | 'production' | 'test',
    port: parseInt(process.env.PORT || '3000', 10),
    logging: {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      format: env === 'production' ? 'json' : 'pretty',
    },
    drupal: {
      baseUrl: process.env.DRUPAL_BASE_URL || 'https://drupalize.me',
      jsonRpcEndpoint: process.env.DRUPAL_JSONRPC_ENDPOINT || '/jsonrpc',
      timeout: parseInt(process.env.DRUPAL_TIMEOUT || '10000', 10),
    },
    oauth: {
      clientId: process.env.OAUTH_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_CLIENT_SECRET || '',
      redirectUri: process.env.OAUTH_REDIRECT_URI || '',
      authUrl: process.env.OAUTH_AUTH_URL || '',
      tokenUrl: process.env.OAUTH_TOKEN_URL || '',
    },
    database: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      name: process.env.DB_NAME || 'mcp_server',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
    },
  };
}

/**
 * Global configuration instance
 */
export const config: ServerConfig = loadConfig();
