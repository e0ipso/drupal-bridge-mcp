/**
 * Tests for main module
 */

import { loadConfig, DrupalClient } from './index.js';

describe('Main module', () => {
  test('config loads with defaults', async () => {
    const config = await loadConfig();
    
    expect(config.mcp.name).toBe('drupalizeme-mcp-server');
    expect(config.mcp.version).toBe('1.0.0');
    expect(config.drupal.baseUrl).toBe('http://localhost/drupal');
    expect(config.drupal.endpoint).toBe('/jsonrpc');
  });

  test('DrupalClient can be instantiated', () => {
    const clientConfig = {
      baseUrl: 'http://localhost/drupal',
      endpoint: '/jsonrpc',
      timeout: 5000,
      retries: 2,
      headers: { 'Content-Type': 'application/json' },
    };

    const client = new DrupalClient(clientConfig);
    expect(client).toBeInstanceOf(DrupalClient);
    expect(client.getConfig()).toEqual(clientConfig);
  });

  test('environment variable override works', async () => {
    const originalEnv = process.env.DRUPAL_BASE_URL;
    process.env.DRUPAL_BASE_URL = 'https://example.com/drupal';
    
    const config = await loadConfig();
    expect(config.drupal.baseUrl).toBe('https://example.com/drupal');
    
    if (originalEnv !== undefined) {
      process.env.DRUPAL_BASE_URL = originalEnv;
    } else {
      delete process.env.DRUPAL_BASE_URL;
    }
  });
});
