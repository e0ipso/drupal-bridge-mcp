/**
 * Configuration management for the MCP server
 */

import { DrupalClientConfig, McpServerInfo } from '@/types/index.js';

/**
 * Application configuration interface
 */
export interface AppConfig {
  readonly drupal: DrupalClientConfig;
  readonly mcp: McpServerInfo;
  readonly server: {
    readonly port: number;
    readonly host: string;
  };
  readonly logging: {
    readonly level: 'error' | 'warn' | 'info' | 'debug';
  };
  readonly environment: 'development' | 'test' | 'production';
}

/**
 * Environment variables with defaults
 */
const getEnvConfig = (): AppConfig => {
  const drupalBaseUrl = process.env.DRUPAL_BASE_URL ?? 'http://localhost/drupal';
  const drupalEndpoint = process.env.DRUPAL_JSON_RPC_ENDPOINT ?? '/jsonrpc';
  
  return {
    drupal: {
      baseUrl: drupalBaseUrl,
      endpoint: drupalEndpoint,
      timeout: parseInt(process.env.DRUPAL_TIMEOUT ?? '10000', 10),
      retries: parseInt(process.env.DRUPAL_RETRIES ?? '3', 10),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    },
    mcp: {
      name: process.env.MCP_SERVER_NAME ?? 'drupalizeme-mcp-server',
      version: process.env.MCP_SERVER_VERSION ?? '1.0.0',
      protocolVersion: '2024-11-05',
      capabilities: {
        resources: {
          subscribe: true,
          listChanged: true,
        },
        tools: {
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
      },
    },
    server: {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
    },
    logging: {
      level: (process.env.LOG_LEVEL as AppConfig['logging']['level']) ?? 'info',
    },
    environment: (process.env.NODE_ENV as AppConfig['environment']) ?? 'development',
  };
};

/**
 * Validate configuration
 */
const validateConfig = (config: AppConfig): void => {
  if (!config.drupal.baseUrl) {
    throw new Error('DRUPAL_BASE_URL is required');
  }
  
  if (!config.drupal.endpoint) {
    throw new Error('DRUPAL_JSON_RPC_ENDPOINT is required');
  }
  
  if (!config.mcp.name) {
    throw new Error('MCP_SERVER_NAME is required');
  }
  
  if (!config.mcp.version) {
    throw new Error('MCP_SERVER_VERSION is required');
  }
  
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
};

/**
 * Load and validate configuration
 */
export const loadConfig = async (): Promise<AppConfig> => {
  try {
    // Try to load .env file in development
    if (process.env.NODE_ENV !== 'production') {
      await import('dotenv/config');
    }
  } catch {
    // dotenv is optional, continue without it
  }
  
  const config = getEnvConfig();
  validateConfig(config);
  
  return config;
};

/**
 * Get full Drupal JSON-RPC URL
 */
export const getDrupalJsonRpcUrl = (config: AppConfig): string => {
  const { baseUrl, endpoint } = config.drupal;
  return new URL(endpoint, baseUrl).toString();
};