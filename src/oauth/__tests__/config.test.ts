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

  it('should create valid config with only drupalUrl', () => {
    delete process.env.DRUPAL_URL; // Ensure clean state
    process.env.DRUPAL_BASE_URL = 'https://example.com';

    const config = createOAuthConfigFromEnv();

    expect(config.drupalUrl).toBe('https://example.com');
    expect(Object.keys(config)).toEqual(['drupalUrl']);
  });
});
