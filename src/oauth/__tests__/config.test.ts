/**
 * Tests for OAuth Configuration
 *
 * Covers additional scopes parsing, scope updates, and configuration management.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  createOAuthConfigFromEnv,
  OAuthConfigManager,
  type OAuthConfig,
} from '../config.js';

describe('OAuth Config - Additional Scopes', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    process.env.DRUPAL_BASE_URL = 'https://example.com';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should parse space-separated additional scopes from environment', () => {
    process.env.OAUTH_ADDITIONAL_SCOPES = 'admin:access experimental:features';
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual([
      'admin:access',
      'experimental:features',
    ]);
  });

  it('should parse comma-separated additional scopes from environment', () => {
    process.env.OAUTH_ADDITIONAL_SCOPES =
      'admin:access, experimental:features, debug:mode';
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual([
      'admin:access',
      'experimental:features',
      'debug:mode',
    ]);
  });

  it('should parse mixed comma and space-separated additional scopes', () => {
    process.env.OAUTH_ADDITIONAL_SCOPES =
      'admin:access, experimental:features  debug:mode';
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual([
      'admin:access',
      'experimental:features',
      'debug:mode',
    ]);
  });

  it('should handle empty additional scopes', () => {
    delete process.env.OAUTH_ADDITIONAL_SCOPES;
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual([]);
  });

  it('should handle whitespace-only additional scopes', () => {
    process.env.OAUTH_ADDITIONAL_SCOPES = '   ';
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual([]);
  });

  it('should trim whitespace from additional scopes', () => {
    process.env.OAUTH_ADDITIONAL_SCOPES = '  admin:access  ,  debug:mode  ';
    const config = createOAuthConfigFromEnv();

    expect(config.additionalScopes).toEqual(['admin:access', 'debug:mode']);
  });
});

describe('OAuth Config Manager - Scope Updates', () => {
  const baseConfig: OAuthConfig = {
    drupalUrl: 'https://example.com',
    scopes: ['profile'],
    additionalScopes: [],
  };

  it('should allow updating scopes after tool discovery', () => {
    const manager = new OAuthConfigManager(baseConfig);

    const newScopes = ['profile', 'content:read', 'content:write'];
    manager.updateScopes(newScopes);

    expect(manager.getConfig().scopes).toEqual(newScopes);
  });

  it('should throw error when updating with empty scopes array', () => {
    const manager = new OAuthConfigManager(baseConfig);

    expect(() => {
      manager.updateScopes([]);
    }).toThrow(/non-empty array/);
  });

  it('should clear metadata cache when scopes updated', () => {
    const manager = new OAuthConfigManager(baseConfig);

    // Cache should be null initially
    expect((manager as any).metadataCache).toBeNull();

    // Simulate cached metadata
    (manager as any).metadataCache = {
      metadata: { issuer: 'test' },
      expiresAt: Date.now() + 10000,
    };

    expect((manager as any).metadataCache).not.toBeNull();

    // Update scopes should clear cache
    manager.updateScopes(['profile', 'content:read']);

    expect((manager as any).metadataCache).toBeNull();
  });

  it('should preserve additionalScopes when updating scopes', () => {
    const configWithAdditional: OAuthConfig = {
      drupalUrl: 'https://example.com',
      scopes: ['profile'],
      additionalScopes: ['admin:access'],
    };

    const manager = new OAuthConfigManager(configWithAdditional);
    manager.updateScopes(['profile', 'content:read']);

    expect(manager.getConfig().additionalScopes).toEqual(['admin:access']);
  });
});

describe('OAuth Config - Environment Parsing', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use DRUPAL_BASE_URL when set', () => {
    delete process.env.DRUPAL_URL; // DRUPAL_URL has priority, so remove it
    process.env.DRUPAL_BASE_URL = 'https://test-specific-url.com';
    const config = createOAuthConfigFromEnv();

    expect(config.drupalUrl).toBe('https://test-specific-url.com');
  });

  it('should fall back to DRUPAL_URL if DRUPAL_BASE_URL not set', () => {
    delete process.env.DRUPAL_BASE_URL;
    process.env.DRUPAL_URL = 'https://fallback.com';
    const config = createOAuthConfigFromEnv();

    expect(config.drupalUrl).toBe('https://fallback.com');
  });

  it('should throw error when neither DRUPAL_URL nor DRUPAL_BASE_URL is set', () => {
    delete process.env.DRUPAL_BASE_URL;
    delete process.env.DRUPAL_URL;

    expect(() => {
      createOAuthConfigFromEnv();
    }).toThrow(/DRUPAL_URL or DRUPAL_BASE_URL.*required/);
  });

  it('should default to profile scope when OAUTH_SCOPES not set', () => {
    process.env.DRUPAL_BASE_URL = 'https://example.com';
    delete process.env.OAUTH_SCOPES;

    const config = createOAuthConfigFromEnv();

    expect(config.scopes).toEqual(['profile']);
  });
});
