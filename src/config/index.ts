/**
 * Configuration management for the MCP server
 */

import type { DrupalClientConfig, McpServerInfo } from '@/types/index.js';
import type { OAuthConfig } from '@/auth/index.js';
import type { DiscoveryConfig } from '@/auth/types.js';
import { discoverOAuthEndpoints } from '@/auth/endpoint-discovery.js';

/**
 * Application configuration interface
 */
export interface AppConfig {
  readonly drupal: DrupalClientConfig;
  readonly mcp: McpServerInfo;
  readonly oauth: OAuthConfig;
  readonly auth: {
    readonly enabled: boolean;
    readonly requiredScopes: string[];
    readonly skipAuth: boolean;
  };
  readonly server: {
    readonly port: number;
    readonly host: string;
  };
  readonly logging: {
    readonly level: 'error' | 'warn' | 'info' | 'debug';
  };
  readonly environment: 'development' | 'test' | 'production';
  readonly discovery: DiscoveryConfig;
}

/**
 * Environment variables with defaults
 */
const getEnvConfig = (): AppConfig => {
  const drupalBaseUrl =
    process.env.DRUPAL_BASE_URL ?? 'http://localhost/drupal';
  const drupalEndpoint = process.env.DRUPAL_JSON_RPC_ENDPOINT ?? '/jsonrpc';

  return {
    drupal: {
      baseUrl: drupalBaseUrl,
      endpoint: drupalEndpoint,
      timeout: parseInt(process.env.DRUPAL_TIMEOUT ?? '10000', 10),
      retries: parseInt(process.env.DRUPAL_RETRIES ?? '3', 10),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
    oauth: {
      clientId: process.env.OAUTH_CLIENT_ID ?? '',
      // These will be populated by endpoint discovery or fallback to these defaults
      authorizationEndpoint: `${drupalBaseUrl}/oauth/authorize`,
      tokenEndpoint: `${drupalBaseUrl}/oauth/token`,
      redirectUri:
        process.env.OAUTH_REDIRECT_URI ?? 'urn:ietf:wg:oauth:2.0:oob',
      scopes: (
        process.env.OAUTH_SCOPES ?? 'tutorial:read user:profile tutorial:search'
      ).split(' '),
    },
    auth: {
      enabled: process.env.AUTH_ENABLED !== 'false',
      requiredScopes: (
        process.env.AUTH_REQUIRED_SCOPES ?? 'tutorial:read'
      ).split(' '),
      skipAuth:
        process.env.AUTH_SKIP === 'true' ||
        process.env.NODE_ENV === 'development',
    },
    mcp: {
      name: process.env.MCP_SERVER_NAME ?? 'drupal-bridge-mcp',
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
    environment:
      (process.env.NODE_ENV as AppConfig['environment']) ?? 'development',
    discovery: {
      baseUrl: drupalBaseUrl,
      timeout: parseInt(process.env.OAUTH_DISCOVERY_TIMEOUT ?? '5000', 10),
      retries: parseInt(process.env.OAUTH_DISCOVERY_RETRIES ?? '2', 10),
      cacheTtl: parseInt(
        process.env.OAUTH_DISCOVERY_CACHE_TTL ?? '3600000',
        10
      ), // 1 hour
      validateHttps: process.env.OAUTH_DISCOVERY_VALIDATE_HTTPS !== 'false',
      debug: process.env.OAUTH_DISCOVERY_DEBUG === 'true',
    },
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

  if (config.auth.enabled && !config.oauth.clientId) {
    throw new Error(
      'OAUTH_CLIENT_ID is required when authentication is enabled'
    );
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
};

/**
 * Load and validate configuration with OAuth endpoint discovery
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

  // Perform OAuth endpoint discovery if authentication is enabled
  if (config.auth.enabled && !process.env.OAUTH_SKIP_DISCOVERY) {
    try {
      const discoveredEndpoints = await discoverOAuthEndpoints(
        config.discovery
      );

      // Update OAuth config with discovered endpoints
      (config as { oauth: OAuthConfig }).oauth = {
        ...config.oauth,
        authorizationEndpoint: discoveredEndpoints.authorizationEndpoint,
        tokenEndpoint: discoveredEndpoints.tokenEndpoint,
      };

      if (config.discovery.debug) {
        console.log('[Config] OAuth endpoints discovered:', {
          authorization: discoveredEndpoints.authorizationEndpoint,
          token: discoveredEndpoints.tokenEndpoint,
          isFallback: discoveredEndpoints.isFallback,
        });
      }
    } catch (error) {
      if (config.discovery.debug) {
        console.warn(
          '[Config] OAuth endpoint discovery failed, using defaults:',
          error
        );
      }
      // Continue with default endpoints from getEnvConfig
    }
  }

  return config;
};

/**
 * Get full Drupal JSON-RPC URL
 */
export const getDrupalJsonRpcUrl = (config: AppConfig): string => {
  const { baseUrl, endpoint } = config.drupal;
  return new URL(endpoint, baseUrl).toString();
};
