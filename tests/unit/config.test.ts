/**
 * Configuration tests
 */

import { config } from '@/config/index.js';

describe('Configuration', () => {
  test('should load default configuration', () => {
    expect(config).toBeDefined();
    expect(config.environment).toBe('test');
    expect(config.logging).toBeDefined();
    expect(config.logging.level).toBeDefined();
  });

  test('should have required database configuration', () => {
    expect(config.database).toBeDefined();
    expect(config.database.host).toBeDefined();
    expect(config.database.port).toBeGreaterThan(0);
    expect(config.database.name).toBeDefined();
  });

  test('should have OAuth configuration structure', () => {
    expect(config.oauth).toBeDefined();
    expect(config.oauth.clientId).toBeDefined();
    expect(config.oauth.authUrl).toBeDefined();
    expect(config.oauth.tokenUrl).toBeDefined();
  });
});