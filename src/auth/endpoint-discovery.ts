/**
 * RFC8414-compliant OAuth 2.0 Authorization Server Metadata discovery
 *
 * This module implements the OAuth 2.0 Authorization Server Metadata specification
 * (RFC 8414) to dynamically discover OAuth endpoints from the .well-known metadata
 * endpoint. OAuth discovery is mandatory and proper server configuration is required.
 */

import type {
  OAuthServerMetadata,
  OAuthEndpoints,
  DiscoveryConfig,
  CacheEntry,
} from './types.js';
import { DiscoveryError, DiscoveryErrorType } from './types.js';
import { isLoggerInitialized, getLogger } from '@/utils/logger.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<DiscoveryConfig, 'baseUrl'>> = {
  timeout: 5000,
  retries: 2,
  cacheTtl: 3600000, // 1 hour
  validateHttps: true,
  debug: false,
};

/**
 * In-memory cache for discovered metadata
 */
class MetadataCache {
  private cache = new Map<string, CacheEntry>();

  /**
   * Get cached endpoints if valid
   */
  get(baseUrl: string): OAuthEndpoints | null {
    const entry = this.cache.get(baseUrl);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(baseUrl);
      return null;
    }

    return entry.endpoints;
  }

  /**
   * Store endpoints in cache
   */
  set(baseUrl: string, endpoints: OAuthEndpoints, ttl: number): void {
    this.cache.set(baseUrl, {
      endpoints,
      expiresAt: Date.now() + ttl,
    });
  }

  /**
   * Clear expired entries
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Global metadata cache instance
 */
const metadataCache = new MetadataCache();

/**
 * Helper function to log discovery messages respecting debug flag and logger availability
 */
function logDiscovery(
  level: 'info' | 'warn' | 'debug',
  message: string,
  extra?: any
): void {
  if (isLoggerInitialized()) {
    const logger = getLogger().child({ component: 'discovery' });
    if (extra) {
      logger[level]({ extra }, message);
    } else {
      logger[level](message);
    }
  } else {
    // Use console when logger not available
    const consoleLevel = level === 'debug' ? 'log' : level;
    if (extra) {
      console[consoleLevel](`[Discovery] ${message}`, extra);
    } else {
      console[consoleLevel](`[Discovery] ${message}`);
    }
  }
}

/**
 * Create a fetch function with timeout support
 */
async function fetchWithTimeout(
  url: string,
  timeout: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    // In development environments, we may need to handle self-signed certificates
    const isDevelopment =
      process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

    // Use native fetch with proper agent configuration for HTTPS in development
    let fetchOptions: RequestInit = {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Drupal-MCP-Bridge/1.0.0',
      },
    };

    // For development environments with self-signed certificates
    if (isDevelopment && url.startsWith('https:')) {
      // Use node-fetch with custom agent to handle self-signed certificates
      const { default: fetch } = await import('node-fetch');
      const https = await import('https');

      const agent = new https.Agent({
        rejectUnauthorized: false, // Accept self-signed certificates in development
      });

      fetchOptions = {
        ...fetchOptions,
        agent,
      } as any;

      const response = await fetch(url, fetchOptions);
      return response as Response;
    }

    // Use standard fetch for production or HTTP URLs
    const fetch = globalThis.fetch || (await import('node-fetch')).default;
    const response = await fetch(url, fetchOptions);
    return response as Response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Validate required fields in OAuth server metadata
 */
function validateMetadata(metadata: unknown): OAuthServerMetadata {
  if (!metadata || typeof metadata !== 'object') {
    throw new DiscoveryError(
      'Invalid metadata: response is not a JSON object',
      DiscoveryErrorType.INVALID_JSON
    );
  }

  const requiredFields = ['issuer', 'authorization_endpoint', 'token_endpoint'];
  const missingFields = requiredFields.filter(
    field => !(metadata as Record<string, unknown>)[field]
  );

  if (missingFields.length > 0) {
    throw new DiscoveryError(
      `Missing required metadata fields: ${missingFields.join(', ')}`,
      DiscoveryErrorType.MISSING_REQUIRED_FIELDS
    );
  }

  // Validate URL format for required endpoints
  const metadataRecord = metadata as Record<string, unknown>;
  try {
    new URL(metadataRecord.authorization_endpoint as string);
    new URL(metadataRecord.token_endpoint as string);
  } catch (error) {
    throw new DiscoveryError(
      'Invalid endpoint URL format in metadata',
      DiscoveryErrorType.INVALID_URL,
      error as Error
    );
  }

  return metadata as OAuthServerMetadata;
}

/**
 * Fetch and parse OAuth server metadata with retries
 */
async function fetchMetadata(
  wellKnownUrl: string,
  config: Required<DiscoveryConfig>
): Promise<OAuthServerMetadata> {
  let lastError: Error | null = null;
  const maxAttempts = config.retries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (config.debug) {
        logDiscovery(
          'debug',
          `Attempt ${attempt}/${maxAttempts}: ${wellKnownUrl}`
        );
      }

      const response = await fetchWithTimeout(wellKnownUrl, config.timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new DiscoveryError(
          `Invalid content type: ${contentType}. Expected application/json`,
          DiscoveryErrorType.INVALID_JSON
        );
      }

      const metadata = await response.json();
      return validateMetadata(metadata);
    } catch (error) {
      lastError = error as Error;

      if (error instanceof DiscoveryError) {
        throw error; // Don't retry validation errors
      }

      if (attempt < maxAttempts) {
        // Exponential backoff: 1s, 2s, 4s...
        const delay = Math.pow(2, attempt - 1) * 1000;
        if (config.debug) {
          logDiscovery(
            'debug',
            `Retry ${attempt} after ${delay}ms due to:`,
            error
          );
        }
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  // Determine error type for the final failure
  const errorMessage = lastError?.message || 'Unknown error';
  let errorType = DiscoveryErrorType.NETWORK_ERROR;

  if (errorMessage.includes('timeout') || errorMessage.includes('aborted')) {
    errorType = DiscoveryErrorType.TIMEOUT_ERROR;
  } else if (errorMessage.includes('JSON') || errorMessage.includes('parse')) {
    errorType = DiscoveryErrorType.INVALID_JSON;
  }

  throw new DiscoveryError(
    `Failed to fetch metadata after ${maxAttempts} attempts: ${errorMessage}`,
    errorType,
    lastError || undefined
  );
}

/**
 * Discover OAuth endpoints using RFC8414 metadata discovery
 *
 * @param config Discovery configuration
 * @returns Promise resolving to OAuth endpoints
 */
export async function discoverOAuthEndpoints(
  config: DiscoveryConfig
): Promise<OAuthEndpoints> {
  // Merge with defaults
  const fullConfig: Required<DiscoveryConfig> = {
    ...DEFAULT_CONFIG,
    ...config,
  };

  // Validate base URL
  let baseUrl: URL;
  try {
    baseUrl = new URL(fullConfig.baseUrl);
  } catch (error) {
    throw new DiscoveryError(
      `Invalid base URL: ${fullConfig.baseUrl}`,
      DiscoveryErrorType.INVALID_URL,
      error as Error
    );
  }

  // Validate HTTPS in production
  if (
    fullConfig.validateHttps &&
    process.env.NODE_ENV === 'production' &&
    baseUrl.protocol !== 'https:'
  ) {
    throw new DiscoveryError(
      'HTTPS is required in production environments',
      DiscoveryErrorType.HTTPS_REQUIRED
    );
  }

  // Check cache first
  const cacheKey = fullConfig.baseUrl;
  const cachedEndpoints = metadataCache.get(cacheKey);
  if (cachedEndpoints) {
    if (fullConfig.debug) {
      logDiscovery('debug', 'Using cached endpoints');
    }
    return cachedEndpoints;
  }

  // Construct well-known metadata URL
  const normalizedBaseUrl = baseUrl.toString().endsWith('/')
    ? baseUrl.toString().slice(0, -1)
    : baseUrl.toString();
  const wellKnownUrl = `${normalizedBaseUrl}/.well-known/oauth-authorization-server`;

  try {
    if (fullConfig.debug) {
      logDiscovery(
        'debug',
        `Discovering OAuth endpoints from: ${wellKnownUrl}`
      );
    }

    // Fetch and validate metadata
    const metadata = await fetchMetadata(wellKnownUrl, fullConfig);

    // Create endpoints from metadata
    const endpoints: OAuthEndpoints = {
      authorizationEndpoint: metadata.authorization_endpoint,
      tokenEndpoint: metadata.token_endpoint,
      issuer: metadata.issuer,
      discoveredAt: new Date(),
      metadata,
    };

    // Cache the successful result
    metadataCache.set(cacheKey, endpoints, fullConfig.cacheTtl);

    if (fullConfig.debug) {
      logDiscovery('debug', 'Successfully discovered OAuth endpoints');
    }

    return endpoints;
  } catch (error) {
    if (fullConfig.debug) {
      logDiscovery('warn', 'OAuth endpoint discovery failed:', error);
    }

    // OAuth discovery is mandatory - throw descriptive error instead of using fallbacks
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new DiscoveryError(
      `OAuth endpoint discovery failed. Ensure the OAuth server provides RFC 8414 discovery metadata at ${wellKnownUrl}. Error: ${errorMessage}`,
      DiscoveryErrorType.DISCOVERY_FAILED,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Clear the metadata cache
 */
export function clearDiscoveryCache(): void {
  metadataCache.clear();
}

/**
 * Perform cache cleanup (remove expired entries)
 */
export function cleanupDiscoveryCache(): void {
  metadataCache.cleanup();
}

/**
 * Get current cache statistics (for debugging)
 */
export function getDiscoveryCacheStats(): { size: number; entries: string[] } {
  return {
    size: metadataCache['cache'].size,
    entries: Array.from(metadataCache['cache'].keys()),
  };
}
