/**
 * OAuth Configuration Module
 *
 * Handles OAuth metadata discovery and configuration validation
 * for Drupal OAuth 2.1 integration.
 */

import {
  OAuthMetadata,
  OAuthMetadataSchema,
} from '@modelcontextprotocol/sdk/shared/auth.js';

/**
 * OAuth configuration for the MCP resource server.
 * Note: This server acts as a resource server only, not an OAuth client.
 * Token verification is performed via JWT signature validation using Drupal's JWKS.
 */
export interface OAuthConfig {
  drupalUrl: string;
  scopes: string[];
  resourceServerUrl?: string;
  // clientId and clientSecret removed - not needed for resource server
}

/**
 * Cached OAuth metadata with expiration
 */
interface CachedMetadata {
  metadata: OAuthMetadata;
  expiresAt: number;
}

/**
 * OAuth configuration manager with metadata discovery
 */
export class OAuthConfigManager {
  private readonly config: OAuthConfig;
  private metadataCache: CachedMetadata | null = null;
  private readonly cacheTTL: number;

  constructor(config: OAuthConfig, cacheTTL: number = 3600000) {
    this.config = config;
    this.cacheTTL = cacheTTL;
    this.validateConfig();
  }

  /**
   * Validates the OAuth configuration
   * @throws {Error} If configuration is invalid
   */
  private validateConfig(): void {
    if (!this.config.drupalUrl) {
      throw new Error('DRUPAL_URL is required');
    }

    try {
      new URL(this.config.drupalUrl);
    } catch {
      throw new Error('DRUPAL_URL must be a valid URL');
    }

    if (!Array.isArray(this.config.scopes) || this.config.scopes.length === 0) {
      throw new Error('OAUTH_SCOPES must be a non-empty array');
    }
  }

  /**
   * Gets the OAuth discovery endpoint URL
   */
  private getDiscoveryUrl(): string {
    return `${this.config.drupalUrl}/.well-known/oauth-authorization-server`;
  }

  /**
   * Fetches and validates OAuth metadata from Drupal
   * @returns {Promise<OAuthMetadata>} Validated OAuth metadata
   * @throws {Error} If discovery fails or metadata is invalid
   */
  async fetchMetadata(): Promise<OAuthMetadata> {
    // Return cached metadata if still valid
    if (this.metadataCache && Date.now() < this.metadataCache.expiresAt) {
      return this.metadataCache.metadata;
    }

    const discoveryUrl = this.getDiscoveryUrl();

    try {
      const response = await fetch(discoveryUrl, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(
          `OAuth discovery failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      // Validate metadata against schema
      const metadata = OAuthMetadataSchema.parse(data);

      // Cache the validated metadata
      this.metadataCache = {
        metadata,
        expiresAt: Date.now() + this.cacheTTL,
      };

      return metadata;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to discover OAuth metadata: ${error.message}`);
      }
      throw new Error('Failed to discover OAuth metadata: Unknown error');
    }
  }

  /**
   * Gets the OAuth configuration
   */
  getConfig(): OAuthConfig {
    return { ...this.config };
  }

  /**
   * Clears the metadata cache
   */
  clearCache(): void {
    this.metadataCache = null;
  }
}

/**
 * Creates an OAuth configuration from environment variables
 * @returns {OAuthConfig} OAuth configuration
 * @throws {Error} If required environment variables are missing
 */
export function createOAuthConfigFromEnv(): OAuthConfig {
  const drupalUrl = process.env.DRUPAL_URL || process.env.DRUPAL_BASE_URL;
  const scopesString = process.env.OAUTH_SCOPES;
  const resourceServerUrl = process.env.OAUTH_RESOURCE_SERVER_URL;

  if (!drupalUrl) {
    throw new Error(
      'DRUPAL_URL or DRUPAL_BASE_URL environment variable is required'
    );
  }

  // Parse scopes from space or comma-separated string
  const scopes = scopesString
    ? scopesString
        .split(/[\s,]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
    : ['profile'];

  return {
    drupalUrl,
    scopes,
    resourceServerUrl,
  };
}
