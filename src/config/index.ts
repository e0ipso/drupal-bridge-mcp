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
  readonly environment: 'development' | 'production' | 'test' | 'staging';
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
    readonly scopes: string;
    readonly tokenRefreshBuffer: number;
  };
  readonly database: {
    readonly host: string;
    readonly port: number;
    readonly name: string;
    readonly user: string;
    readonly password: string;
    readonly ssl: boolean;
    readonly sslMode?: 'require' | 'prefer' | 'disable';
    readonly poolMin: number;
    readonly poolMax: number;
    readonly connectionTimeout: number;
    readonly idleTimeout: number;
  };
  readonly security: {
    readonly httpsOnly: boolean;
    readonly cors: {
      readonly enabled: boolean;
      readonly origins: string[];
    };
    readonly headers: {
      readonly enabled: boolean;
      readonly hsts: boolean;
      readonly contentSecurityPolicy: boolean;
      readonly xssProtection: boolean;
      readonly noSniff: boolean;
      readonly referrerPolicy: string;
    };
    readonly rateLimit: {
      readonly enabled: boolean;
      readonly max: number;
      readonly windowMs: number;
    };
    readonly sessionSecret: string;
    readonly token: {
      readonly bcryptSaltRounds: number;
      readonly encryptionKey: string;
      readonly refreshThreshold: number; // Percentage of token lifetime
      readonly maxRefreshRetries: number;
      readonly refreshRetryDelayMs: number;
      readonly cleanupIntervalMs: number;
    };
  };
  readonly health: {
    readonly enabled: boolean;
    readonly path: string;
  };
}

/**
 * Parse database configuration from environment variables
 * Supports both individual env vars and DATABASE_URL with enhanced security
 */
function parseDatabaseConfig(): ServerConfig['database'] {
  const databaseUrl = process.env.DATABASE_URL;
  const environment = process.env.NODE_ENV ?? 'development';

  // Default SSL mode based on environment
  const defaultSslMode = environment === 'production' ? 'require' : 'prefer';
  const defaultSsl = environment === 'production';

  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      const sslMode = url.searchParams.get('sslmode') as
        | 'require'
        | 'prefer'
        | 'disable'
        | null;

      // Validate SSL configuration for production
      if (environment === 'production' && sslMode === 'disable') {
        throw new Error('SSL cannot be disabled in production environment');
      }

      return {
        host: url.hostname,
        port: parseInt(url.port || '5432', 10),
        name: url.pathname.slice(1), // Remove leading slash
        user: url.username,
        password: url.password,
        ssl:
          sslMode === 'require' ||
          process.env.DATABASE_SSL === 'true' ||
          defaultSsl,
        sslMode: sslMode ?? defaultSslMode,
        poolMin: parseInt(process.env.DATABASE_POOL_MIN ?? '2', 10),
        poolMax: parseInt(process.env.DATABASE_POOL_MAX ?? '20', 10),
        connectionTimeout: parseInt(
          process.env.DATABASE_CONNECTION_TIMEOUT ?? '10000',
          10
        ),
        idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT ?? '30000', 10),
      };
    } catch (error) {
      throw new Error(
        `Invalid DATABASE_URL: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Fall back to individual environment variables
  const ssl = process.env.DATABASE_SSL === 'true' || defaultSsl;
  const sslMode =
    (process.env.DATABASE_SSL_MODE as 'require' | 'prefer' | 'disable') ??
    defaultSslMode;

  // Validate SSL configuration for production
  if (environment === 'production' && (!ssl || sslMode === 'disable')) {
    throw new Error('SSL must be enabled in production environment');
  }

  return {
    host: process.env.DATABASE_HOST ?? process.env.DB_HOST ?? 'localhost',
    port: parseInt(
      process.env.DATABASE_PORT ?? process.env.DB_PORT ?? '5432',
      10
    ),
    name: process.env.DATABASE_NAME ?? process.env.DB_NAME ?? 'mcp_server',
    user: process.env.DATABASE_USER ?? process.env.DB_USER ?? 'postgres',
    password: process.env.DATABASE_PASSWORD ?? process.env.DB_PASSWORD ?? '',
    ssl,
    sslMode,
    poolMin: parseInt(process.env.DATABASE_POOL_MIN ?? '2', 10),
    poolMax: parseInt(process.env.DATABASE_POOL_MAX ?? '20', 10),
    connectionTimeout: parseInt(
      process.env.DATABASE_CONNECTION_TIMEOUT ?? '10000',
      10
    ),
    idleTimeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT ?? '30000', 10),
  };
}

/**
 * Parse CORS origins from environment variable
 */
function parseCorsOrigins(): string[] {
  const corsOrigins =
    process.env.CORS_ORIGINS ?? process.env.CORS_ALLOWED_ORIGINS;
  if (!corsOrigins) {
    return process.env.NODE_ENV === 'development'
      ? ['http://localhost:3000']
      : [];
  }

  return corsOrigins
    .split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0);
}

/**
 * Validate required secrets in production
 */
function validateSecrets(
  environment: string,
  oauth: ServerConfig['oauth'],
  sessionSecret: string
): void {
  if (environment === 'production') {
    if (!oauth.clientId || !oauth.clientSecret) {
      throw new Error('OAuth client credentials are required in production');
    }

    if (!sessionSecret || sessionSecret.length < 32) {
      throw new Error(
        'Session secret must be at least 32 characters in production'
      );
    }

    if (oauth.redirectUri.startsWith('http://')) {
      throw new Error('OAuth redirect URI must use HTTPS in production');
    }
  }
}

/**
 * Load and validate configuration from environment variables
 */
function loadConfig(): ServerConfig {
  const env = process.env.NODE_ENV ?? 'development';

  // Parse OAuth configuration
  const oauth = {
    clientId: process.env.OAUTH_CLIENT_ID ?? '',
    clientSecret: process.env.OAUTH_CLIENT_SECRET ?? '',
    redirectUri: process.env.OAUTH_REDIRECT_URI ?? '',
    authUrl:
      process.env.OAUTH_AUTHORIZATION_URL ?? process.env.OAUTH_AUTH_URL ?? '',
    tokenUrl: process.env.OAUTH_TOKEN_URL ?? '',
    scopes: process.env.OAUTH_SCOPES ?? 'content:read user:read',
    tokenRefreshBuffer: parseInt(
      process.env.OAUTH_TOKEN_REFRESH_BUFFER ?? '300',
      10
    ),
  };

  // Parse session secret (generate random one for development)
  const sessionSecret =
    process.env.SESSION_SECRET ??
    (env === 'development' ? 'dev-secret-key-at-least-32-chars-long' : '');

  // Validate required secrets for production
  validateSecrets(env, oauth, sessionSecret);

  // Parse CORS origins
  const corsOrigins = parseCorsOrigins();

  // Determine HTTPS enforcement
  const httpsOnly = env === 'production' || process.env.HTTPS_ONLY === 'true';

  // Parse token security configuration
  const tokenEncryptionKey =
    process.env.TOKEN_ENCRYPTION_KEY ??
    (env === 'development' ? 'dev-encryption-key-32-chars-long!!' : '');

  if (
    env === 'production' &&
    (!tokenEncryptionKey || tokenEncryptionKey.length < 32)
  ) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be at least 32 characters in production'
    );
  }

  const config: ServerConfig = {
    environment: env as 'development' | 'production' | 'test' | 'staging',
    port: parseInt(process.env.PORT ?? '3000', 10),
    logging: {
      level:
        (process.env.LOG_LEVEL as LogLevel) ??
        (env === 'production' ? 'info' : 'debug'),
      format: env === 'production' ? 'json' : 'pretty',
    },
    drupal: {
      baseUrl: process.env.DRUPAL_BASE_URL ?? 'https://drupalize.me',
      jsonRpcEndpoint: process.env.DRUPAL_JSONRPC_ENDPOINT ?? '/jsonrpc',
      timeout: parseInt(
        process.env.DRUPAL_TIMEOUT ?? process.env.REQUEST_TIMEOUT ?? '30000',
        10
      ),
    },
    oauth,
    database: parseDatabaseConfig(),
    security: {
      httpsOnly,
      cors: {
        enabled: process.env.CORS_ENABLED !== 'false',
        origins: corsOrigins,
      },
      headers: {
        enabled: process.env.SECURITY_HEADERS_ENABLED !== 'false',
        hsts: httpsOnly,
        contentSecurityPolicy: process.env.CSP_ENABLED !== 'false',
        xssProtection: process.env.XSS_PROTECTION_ENABLED !== 'false',
        noSniff: process.env.NO_SNIFF_ENABLED !== 'false',
        referrerPolicy:
          process.env.REFERRER_POLICY ?? 'strict-origin-when-cross-origin',
      },
      rateLimit: {
        enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
        max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW ?? '900000', 10), // 15 minutes
      },
      sessionSecret,
      token: {
        bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '12', 10),
        encryptionKey: tokenEncryptionKey,
        refreshThreshold: parseFloat(
          process.env.TOKEN_REFRESH_THRESHOLD ?? '0.9'
        ), // 90% of lifetime
        maxRefreshRetries: parseInt(
          process.env.TOKEN_REFRESH_MAX_RETRIES ?? '3',
          10
        ),
        refreshRetryDelayMs: parseInt(
          process.env.TOKEN_REFRESH_RETRY_DELAY ?? '5000',
          10
        ), // 5 seconds
        cleanupIntervalMs: parseInt(
          process.env.TOKEN_CLEANUP_INTERVAL ?? '300000',
          10
        ), // 5 minutes
      },
    },
    health: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
      path: process.env.HEALTH_CHECK_PATH ?? '/health',
    },
  };

  return config;
}

/**
 * Global configuration instance
 */
export const config: ServerConfig = loadConfig();
