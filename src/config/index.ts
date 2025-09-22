/**
 * Configuration management for the MCP server
 */

import type { DrupalClientConfig, McpServerInfo } from '@/types/index.js';
import type { DiscoveryConfig, OAuthEndpoints } from '@/auth/types.js';
import { discoverOAuthEndpoints } from '@/auth/endpoint-discovery.js';
import {
  McpOAuthProvider,
  type McpOAuthConfig,
} from '@/auth/oauth-provider.js';
import { createLogger } from '@/utils/logger.js';
import createDebug from 'debug';

const debug = createDebug('mcp:config');

/**
 * Simplified OAuth configuration interface
 * Supports both legacy static configuration and new discovery-based configuration
 */
export interface SimplifiedOAuthConfig {
  readonly clientId: string;
  readonly authorizationEndpoint?: string; // Optional for discovery
  readonly tokenEndpoint?: string; // Optional for discovery
  readonly redirectUri: string;
  readonly scopes: string[];
  readonly serverUrl: string; // Base URL for MCP OAuth provider
  readonly discoveredEndpoints?: OAuthEndpoints; // Populated during configuration loading
}

/**
 * Application configuration interface
 */
export interface AppConfig {
  readonly drupal: DrupalClientConfig;
  readonly mcp: McpServerInfo;
  readonly oauth: SimplifiedOAuthConfig;
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
      // Support legacy static configuration for backward compatibility
      authorizationEndpoint: process.env.OAUTH_AUTHORIZATION_ENDPOINT,
      tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT,
      redirectUri:
        process.env.OAUTH_REDIRECT_URI ?? 'urn:ietf:wg:oauth:2.0:oob',
      scopes: (
        process.env.OAUTH_SCOPES ?? 'tutorial:read user:profile tutorial:search'
      ).split(' '),
      serverUrl: drupalBaseUrl,
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

  if (config.auth.enabled) {
    if (!config.oauth.clientId) {
      throw new Error(
        'OAUTH_CLIENT_ID is required when authentication is enabled'
      );
    }

    // For simplified configuration, only DRUPAL_BASE_URL and OAUTH_CLIENT_ID are required
    // Endpoints will be discovered or fallback to defaults
    if (!config.drupal.baseUrl) {
      throw new Error(
        'DRUPAL_BASE_URL is required for OAuth endpoint discovery'
      );
    }
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
};

/**
 * Load and validate configuration with OAuth endpoint discovery
 */
export const loadConfig = async (): Promise<AppConfig> => {
  debug('Loading environment configuration...');
  console.info('[Config] Loading environment configuration...');

  try {
    // Try to load .env file in development
    if (process.env.NODE_ENV !== 'production') {
      debug('Development mode detected, attempting to load .env file...');
      await import('dotenv/config');
      debug('✓ .env file loaded successfully');
    }
  } catch {
    // dotenv is optional, continue without it
    debug('⚠ .env file not found or failed to load (this is optional)');
    console.warn(
      '[Config] ⚠ .env file not found or failed to load (this is optional)'
    );
  }

  debug('Parsing environment variables...');
  const config = getEnvConfig();

  debug('Environment variables loaded:');
  debug(`- DRUPAL_BASE_URL: ${config.drupal.baseUrl}`);
  debug(`- DRUPAL_JSON_RPC_ENDPOINT: ${config.drupal.endpoint}`);
  debug(`- NODE_ENV: ${config.environment}`);
  debug(`- LOG_LEVEL: ${config.logging.level}`);
  debug(`- AUTH_ENABLED: ${config.auth.enabled}`);
  debug(`- AUTH_SKIP: ${config.auth.skipAuth}`);
  debug(
    `- OAUTH_CLIENT_ID: ${config.oauth.clientId ? '***set***' : 'NOT SET'}`
  );

  debug('Validating configuration...');
  console.info('[Config] Validating configuration...');
  validateConfig(config);
  debug('✓ Configuration validation passed');
  console.info('[Config] ✓ Configuration validation passed');

  // Initialize logger now that basic config is available
  const logger = createLogger(config);
  const configLogger = logger.child({ component: 'config' });

  // Perform OAuth endpoint discovery if authentication is enabled and endpoints are not explicitly configured
  if (config.auth.enabled && !process.env.OAUTH_SKIP_DISCOVERY) {
    debug('Authentication enabled, checking OAuth configuration...');
    configLogger.info(
      'Authentication enabled, checking OAuth configuration...'
    );

    // Only discover endpoints if legacy static configuration is not provided
    const hasStaticConfig =
      config.oauth.authorizationEndpoint && config.oauth.tokenEndpoint;

    if (!hasStaticConfig) {
      debug('No static OAuth endpoints found, starting endpoint discovery...');
      configLogger.info(
        'No static OAuth endpoints found, starting endpoint discovery...'
      );
      debug(`Discovery target: ${config.discovery.baseUrl}`);
      debug(`Discovery timeout: ${config.discovery.timeout}ms`);
      debug(`Discovery retries: ${config.discovery.retries}`);

      const discoveryStartTime = Date.now();
      try {
        const discoveredEndpoints = await discoverOAuthEndpoints(
          config.discovery
        );
        const discoveryTime = Date.now() - discoveryStartTime;

        // Update OAuth config with discovered endpoints and store discovery result
        (config as { oauth: SimplifiedOAuthConfig }).oauth = {
          ...config.oauth,
          authorizationEndpoint: discoveredEndpoints.authorizationEndpoint,
          tokenEndpoint: discoveredEndpoints.tokenEndpoint,
          discoveredEndpoints,
        };

        debug(`✓ OAuth endpoints discovered successfully (${discoveryTime}ms)`);
        configLogger.info(
          `✓ OAuth endpoints discovered successfully (${discoveryTime}ms)`
        );
        debug(`- Authorization: ${discoveredEndpoints.authorizationEndpoint}`);
        debug(`- Token: ${discoveredEndpoints.tokenEndpoint}`);
        debug(
          `- Using fallback: ${discoveredEndpoints.isFallback ? 'YES' : 'NO'}`
        );

        if (config.discovery.debug) {
          configLogger.debug(
            {
              authorization: discoveredEndpoints.authorizationEndpoint,
              token: discoveredEndpoints.tokenEndpoint,
              isFallback: discoveredEndpoints.isFallback,
            },
            'OAuth endpoints discovered'
          );
        }
      } catch (error) {
        const discoveryTime = Date.now() - discoveryStartTime;
        debug(
          `⚠ OAuth endpoint discovery failed (${discoveryTime}ms), using fallback endpoints`
        );
        configLogger.warn(
          `⚠ OAuth endpoint discovery failed (${discoveryTime}ms), using fallback endpoints`
        );
        debug(
          `Discovery error: ${error instanceof Error ? error.message : String(error)}`
        );
        configLogger.error(
          { err: error },
          `Discovery error: ${error instanceof Error ? error.message : String(error)}`
        );

        if (config.discovery.debug) {
          configLogger.warn(
            { err: error },
            'OAuth endpoint discovery failed, using fallback endpoints:'
          );
        }

        // Use fallback endpoints when discovery fails
        const fallbackAuthEndpoint = `${config.drupal.baseUrl}/oauth/authorize`;
        const fallbackTokenEndpoint = `${config.drupal.baseUrl}/oauth/token`;

        debug(`- Fallback Authorization: ${fallbackAuthEndpoint}`);
        debug(`- Fallback Token: ${fallbackTokenEndpoint}`);

        (config as { oauth: SimplifiedOAuthConfig }).oauth = {
          ...config.oauth,
          authorizationEndpoint: fallbackAuthEndpoint,
          tokenEndpoint: fallbackTokenEndpoint,
        };
      }
    } else {
      debug('✓ Using static OAuth endpoint configuration');
      configLogger.info('✓ Using static OAuth endpoint configuration');
      debug(`- Authorization: ${config.oauth.authorizationEndpoint}`);
      debug(`- Token: ${config.oauth.tokenEndpoint}`);

      if (config.discovery.debug) {
        configLogger.debug('Using static OAuth endpoint configuration');
      }
    }
  } else if (!config.auth.enabled) {
    debug('✓ Authentication disabled, skipping OAuth configuration');
    configLogger.info(
      '✓ Authentication disabled, skipping OAuth configuration'
    );
  } else {
    debug('✓ OAuth discovery skipped (OAUTH_SKIP_DISCOVERY=true)');
    configLogger.info('✓ OAuth discovery skipped (OAUTH_SKIP_DISCOVERY=true)');
  }

  debug('✓ Configuration loading completed successfully');
  configLogger.info('✓ Configuration loading completed successfully');
  debug('Final configuration summary:');
  debug(`- Environment: ${config.environment}`);
  debug(`- Drupal URL: ${config.drupal.baseUrl}${config.drupal.endpoint}`);
  debug(`- MCP Server: ${config.mcp.name} v${config.mcp.version}`);
  debug(`- Auth enabled: ${config.auth.enabled}`);
  if (config.auth.enabled) {
    debug(
      `- OAuth configured: ${config.oauth.authorizationEndpoint ? 'YES' : 'NO'}`
    );
    debug(`- Required scopes: ${config.auth.requiredScopes.join(', ')}`);
  }
  debug(`- Debug logging: ${process.env.DEBUG || 'not set'}`);

  return config;
};

/**
 * Get full Drupal JSON-RPC URL
 */
export const getDrupalJsonRpcUrl = (config: AppConfig): string => {
  const { baseUrl, endpoint } = config.drupal;
  return new URL(endpoint, baseUrl).toString();
};

/**
 * Create McpOAuthProvider from simplified configuration
 */
export const createOAuthProvider = (
  config: AppConfig,
  userId = 'default'
): McpOAuthProvider => {
  const oauthConfig: McpOAuthConfig = {
    clientId: config.oauth.clientId,
    authorizationEndpoint:
      config.oauth.authorizationEndpoint ||
      `${config.oauth.serverUrl}/oauth/authorize`,
    redirectUri: config.oauth.redirectUri,
    scopes: config.oauth.scopes,
    serverUrl: config.oauth.serverUrl,
  };

  return new McpOAuthProvider(oauthConfig, userId);
};
