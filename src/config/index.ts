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
 * Supports both static configuration and discovery-based configuration
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
 * HTTP transport configuration interface
 */
export interface HttpTransportConfig {
  readonly port: number;
  readonly host: string;
  readonly corsOrigins: string[];
  readonly timeout: number;
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
  };
  readonly server: {
    readonly port: number;
    readonly host: string;
  };
  readonly http: HttpTransportConfig;
  readonly logging: {
    readonly level: 'error' | 'warn' | 'info' | 'debug';
  };
  readonly environment: 'development' | 'test' | 'production';
  readonly discovery: DiscoveryConfig;
}

/**
 * Get HTTP transport configuration with environment-specific defaults
 */
const getHttpTransportConfig = (
  environment: 'development' | 'test' | 'production'
): HttpTransportConfig => {
  const port = parseInt(process.env.HTTP_PORT ?? '3000', 10);
  const host = process.env.HTTP_HOST ?? 'localhost';
  const timeout = parseInt(process.env.HTTP_TIMEOUT ?? '30000', 10);

  // Parse CORS origins from comma-separated string
  const corsOriginsEnv = process.env.HTTP_CORS_ORIGINS;
  let corsOrigins: string[];

  if (corsOriginsEnv) {
    corsOrigins = corsOriginsEnv
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean);
  } else {
    // Environment-specific defaults
    switch (environment) {
      case 'development':
        corsOrigins = [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
        ];
        break;
      case 'test':
        corsOrigins = ['http://localhost:3000'];
        break;
      case 'production':
        corsOrigins = []; // No default CORS origins in production - must be explicitly configured
        break;
      default:
        corsOrigins = ['http://localhost:3000'];
    }
  }

  return {
    port,
    host,
    corsOrigins,
    timeout,
  };
};

/**
 * Environment variables with defaults
 */
const getEnvConfig = (): AppConfig => {
  const drupalBaseUrl =
    process.env.DRUPAL_BASE_URL ?? 'http://localhost/drupal';
  const drupalEndpoint = process.env.DRUPAL_JSON_RPC_ENDPOINT ?? '/jsonrpc';
  const environment =
    (process.env.NODE_ENV as AppConfig['environment']) ?? 'development';

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
      // Support static configuration
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
    http: getHttpTransportConfig(environment),
    logging: {
      level: (process.env.LOG_LEVEL as AppConfig['logging']['level']) ?? 'info',
    },
    environment,
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
 * Validate HTTP transport configuration
 */
const validateHttpConfig = (httpConfig: HttpTransportConfig): void => {
  // Validate port range
  if (httpConfig.port < 1 || httpConfig.port > 65535) {
    throw new Error('HTTP_PORT must be between 1 and 65535');
  }

  // Validate host format (basic check for valid hostname/IP)
  if (!httpConfig.host || httpConfig.host.trim().length === 0) {
    throw new Error('HTTP_HOST cannot be empty');
  }

  // Validate timeout
  if (httpConfig.timeout <= 0) {
    throw new Error('HTTP_TIMEOUT must be a positive number');
  }

  // Validate CORS origins format
  for (const origin of httpConfig.corsOrigins) {
    try {
      new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin URL: ${origin}`);
    }
  }
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
    // Endpoints will be discovered from OAuth server metadata
    if (!config.drupal.baseUrl) {
      throw new Error(
        'DRUPAL_BASE_URL is required for OAuth endpoint discovery'
      );
    }
  }

  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  // Validate HTTP transport configuration
  validateHttpConfig(config.http);
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
  debug(
    `- OAUTH_CLIENT_ID: ${config.oauth.clientId ? '***set***' : 'NOT SET'}`
  );
  debug(`- HTTP_PORT: ${config.http.port}`);
  debug(`- HTTP_HOST: ${config.http.host}`);
  debug(`- HTTP_CORS_ORIGINS: ${config.http.corsOrigins.length} origin(s)`);
  debug(`- HTTP_TIMEOUT: ${config.http.timeout}ms`);

  debug('Validating configuration...');
  console.info('[Config] Validating configuration...');
  validateConfig(config);
  debug('✓ Configuration validation passed');
  console.info('[Config] ✓ Configuration validation passed');

  // Initialize logger now that basic config is available
  const logger = createLogger(config);
  const configLogger = logger.child({ component: 'config' });

  // Perform OAuth endpoint discovery if authentication is enabled
  if (config.auth.enabled) {
    debug('Authentication enabled, checking OAuth configuration...');
    configLogger.info(
      'Authentication enabled, checking OAuth configuration...'
    );

    // Only discover endpoints if static configuration is not provided
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

        if (config.discovery.debug) {
          configLogger.debug(
            {
              authorization: discoveredEndpoints.authorizationEndpoint,
              token: discoveredEndpoints.tokenEndpoint,
            },
            'OAuth endpoints discovered'
          );
        }
      } catch (error) {
        const discoveryTime = Date.now() - discoveryStartTime;
        debug(
          `⚠ OAuth endpoint discovery failed (${discoveryTime}ms). OAuth configuration is required.`
        );
        configLogger.error(
          `⚠ OAuth endpoint discovery failed (${discoveryTime}ms). OAuth configuration is required.`
        );
        debug(
          `Discovery error: ${error instanceof Error ? error.message : String(error)}`
        );
        configLogger.error(
          { err: error },
          `Discovery error: ${error instanceof Error ? error.message : String(error)}`
        );

        if (config.discovery.debug) {
          configLogger.error(
            { err: error },
            'OAuth endpoint discovery failed. Ensure the OAuth server provides RFC 8414 discovery metadata.'
          );
        }

        // OAuth discovery is mandatory - throw error instead of using fallbacks
        throw new Error(
          `OAuth endpoint discovery failed. Ensure the OAuth server at ${config.drupal.baseUrl} provides RFC 8414 discovery metadata at /.well-known/oauth-authorization-server. Error: ${error instanceof Error ? error.message : String(error)}`
        );
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
  }

  debug('✓ Configuration loading completed successfully');
  configLogger.info('✓ Configuration loading completed successfully');
  debug('Final configuration summary:');
  debug(`- Environment: ${config.environment}`);
  debug(`- Drupal URL: ${config.drupal.baseUrl}${config.drupal.endpoint}`);
  debug(`- MCP Server: ${config.mcp.name} v${config.mcp.version}`);
  debug(`- HTTP Transport: ${config.http.host}:${config.http.port}`);
  debug(
    `- CORS Origins: ${config.http.corsOrigins.length > 0 ? config.http.corsOrigins.join(', ') : 'none configured'}`
  );
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
 * Returns null when authentication is disabled
 */
export const createOAuthProvider = (
  config: AppConfig,
  userId = 'default'
): McpOAuthProvider | null => {
  if (!config.auth.enabled) {
    debug('Authentication disabled, skipping OAuth provider creation');
    return null;
  }

  debug('Authentication enabled, creating OAuth provider');
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
