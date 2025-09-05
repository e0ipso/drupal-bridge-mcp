import { greet, config } from './index';

describe('Main module', () => {
  test('greet function returns correct message', () => {
    expect(greet('World')).toBe('Hello, World!');
  });

  test('config has correct structure', () => {
    expect(config.name).toBe('@e0ipso/drupalizeme-mcp-server');
    expect(config.version).toBe('1.0.0');
  });
});
