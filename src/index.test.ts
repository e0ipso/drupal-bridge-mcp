/**
 * Tests for main module
 */

import { loadConfig, DrupalClient } from './index.js';

describe('Main module', () => {
  test('config loads with defaults', async () => {
    // Disable authentication to prevent OAuth discovery
    process.env.AUTH_ENABLED = 'false';

    const config = await loadConfig();

    expect(config.mcp.name).toBe('drupal-bridge-mcp');
    expect(config.mcp.version).toBe('1.0.0');
    expect(config.drupal.baseUrl).toBe('http://localhost/drupal');
    expect(config.drupal.endpoint).toBe('/jsonrpc');

    // Test HTTP configuration defaults
    expect(config.http.port).toBe(3000);
    expect(config.http.host).toBe('localhost');
    expect(config.http.timeout).toBe(30000);
    expect(config.http.enableSSE).toBe(true);
    expect(Array.isArray(config.http.corsOrigins)).toBe(true);
    expect(config.http.corsOrigins).toContain('http://localhost:3000');

    // Clean up
    delete process.env.AUTH_ENABLED;
  });

  test('config loads with custom HTTP environment variables', async () => {
    // Set custom HTTP environment variables
    process.env.AUTH_ENABLED = 'false';
    process.env.HTTP_PORT = '8080';
    process.env.HTTP_HOST = '0.0.0.0';
    process.env.HTTP_CORS_ORIGINS =
      'http://example.com,https://app.example.com';
    process.env.HTTP_TIMEOUT = '60000';
    process.env.HTTP_ENABLE_SSE = 'false';

    const config = await loadConfig();

    expect(config.http.port).toBe(8080);
    expect(config.http.host).toBe('0.0.0.0');
    expect(config.http.corsOrigins).toEqual([
      'http://example.com',
      'https://app.example.com',
    ]);
    expect(config.http.timeout).toBe(60000);
    expect(config.http.enableSSE).toBe(false);

    // Clean up
    delete process.env.AUTH_ENABLED;
    delete process.env.HTTP_PORT;
    delete process.env.HTTP_HOST;
    delete process.env.HTTP_CORS_ORIGINS;
    delete process.env.HTTP_TIMEOUT;
    delete process.env.HTTP_ENABLE_SSE;
  });

  test('config validation fails with invalid HTTP settings', async () => {
    process.env.AUTH_ENABLED = 'false';
    process.env.HTTP_PORT = '99999'; // Invalid port

    await expect(loadConfig()).rejects.toThrow(
      'HTTP_PORT must be between 1 and 65535'
    );

    // Clean up
    delete process.env.AUTH_ENABLED;
    delete process.env.HTTP_PORT;
  });

  test('config validation fails with invalid CORS origins', async () => {
    process.env.AUTH_ENABLED = 'false';
    process.env.HTTP_CORS_ORIGINS = 'invalid-url,https://valid.com';

    await expect(loadConfig()).rejects.toThrow(
      'Invalid CORS origin URL: invalid-url'
    );

    // Clean up
    delete process.env.AUTH_ENABLED;
    delete process.env.HTTP_CORS_ORIGINS;
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
});
