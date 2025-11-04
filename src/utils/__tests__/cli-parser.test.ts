import { describe, it, expect } from '@jest/globals';
import { parseCliArgs } from '../cli-parser.js';
import type { ParsedCliArgs } from '../cli-parser.js';

describe('CLI Parser', () => {
  describe('parseCliArgs', () => {
    describe('drupal-url argument', () => {
      it('should parse drupal-url with equals syntax', () => {
        const result = parseCliArgs(['--drupal-url=https://example.com']);
        expect(result.drupalUrl).toBe('https://example.com');
      });

      it('should parse drupal-url with space syntax', () => {
        const result = parseCliArgs(['--drupal-url', 'https://example.com']);
        expect(result.drupalUrl).toBe('https://example.com');
      });

      it('should parse drupal-base-url as alternative', () => {
        const result = parseCliArgs(['--drupal-base-url=https://example.com']);
        expect(result.drupalBaseUrl).toBe('https://example.com');
      });

      it('should handle URL with port and path', () => {
        const result = parseCliArgs([
          '--drupal-url=https://example.com:8080/subdir',
        ]);
        expect(result.drupalUrl).toBe('https://example.com:8080/subdir');
      });
    });

    describe('auth boolean flag', () => {
      it('should parse --auth as true', () => {
        const result = parseCliArgs(['--auth']);
        expect(result.auth).toBe(true);
      });

      it('should parse --no-auth as false', () => {
        const result = parseCliArgs(['--no-auth']);
        expect(result.auth).toBe(false);
      });

      it('should return false as default when auth not provided', () => {
        const result = parseCliArgs([]);
        // minimist returns false for boolean flags even with default: undefined
        expect(result.auth).toBe(false);
      });
    });

    describe('port argument', () => {
      it('should parse port as number with equals syntax', () => {
        const result = parseCliArgs(['--port=3000']);
        expect(result.port).toBe(3000);
        expect(typeof result.port).toBe('number');
      });

      it('should parse port as number with space syntax', () => {
        const result = parseCliArgs(['--port', '4000']);
        expect(result.port).toBe(4000);
        expect(typeof result.port).toBe('number');
      });

      it('should handle port value 1 (minimum)', () => {
        const result = parseCliArgs(['--port=1']);
        expect(result.port).toBe(1);
      });

      it('should handle port value 65535 (maximum)', () => {
        const result = parseCliArgs(['--port=65535']);
        expect(result.port).toBe(65535);
      });

      it('should return undefined when port not provided', () => {
        const result = parseCliArgs([]);
        expect(result.port).toBeUndefined();
      });
    });

    describe('log-level argument', () => {
      it('should parse log-level with equals syntax', () => {
        const result = parseCliArgs(['--log-level=debug']);
        expect(result.logLevel).toBe('debug');
      });

      it('should parse log-level with space syntax', () => {
        const result = parseCliArgs(['--log-level', 'warn']);
        expect(result.logLevel).toBe('warn');
      });

      it('should preserve case in log-level', () => {
        const result = parseCliArgs(['--log-level=DEBUG']);
        expect(result.logLevel).toBe('DEBUG');
      });
    });

    describe('oauth-scopes argument', () => {
      it('should parse oauth-scopes', () => {
        const result = parseCliArgs([
          '--oauth-scopes=read:content write:content',
        ]);
        expect(result.oauthScopes).toBe('read:content write:content');
      });

      it('should parse oauth-additional-scopes', () => {
        const result = parseCliArgs(['--oauth-additional-scopes=admin:users']);
        expect(result.oauthAdditionalScopes).toBe('admin:users');
      });
    });

    describe('oauth-resource-server-url argument', () => {
      it('should parse oauth-resource-server-url', () => {
        const result = parseCliArgs([
          '--oauth-resource-server-url=https://resource.example.com',
        ]);
        expect(result.oauthResourceServerUrl).toBe(
          'https://resource.example.com'
        );
      });
    });

    describe('drupal-jsonrpc-method argument', () => {
      it('should parse drupal-jsonrpc-method', () => {
        const result = parseCliArgs(['--drupal-jsonrpc-method=POST']);
        expect(result.drupalJsonrpcMethod).toBe('POST');
      });

      it('should preserve case in method value', () => {
        const result = parseCliArgs(['--drupal-jsonrpc-method=get']);
        expect(result.drupalJsonrpcMethod).toBe('get');
      });
    });

    describe('help and version flags', () => {
      it('should parse --help flag', () => {
        const result = parseCliArgs(['--help']);
        expect(result.help).toBe(true);
      });

      it('should parse -h shorthand as help', () => {
        const result = parseCliArgs(['-h']);
        expect(result.help).toBe(true);
      });

      it('should parse --version flag', () => {
        const result = parseCliArgs(['--version']);
        expect(result.version).toBe(true);
      });

      it('should parse -v shorthand as version', () => {
        const result = parseCliArgs(['-v']);
        expect(result.version).toBe(true);
      });
    });

    describe('multiple arguments', () => {
      it('should parse multiple arguments with equals syntax', () => {
        const result = parseCliArgs([
          '--drupal-url=https://example.com',
          '--port=3000',
          '--log-level=debug',
          '--no-auth',
        ]);

        expect(result.drupalUrl).toBe('https://example.com');
        expect(result.port).toBe(3000);
        expect(result.logLevel).toBe('debug');
        expect(result.auth).toBe(false);
      });

      it('should parse multiple arguments with space syntax', () => {
        const result = parseCliArgs([
          '--drupal-url',
          'https://example.com',
          '--port',
          '4000',
          '--log-level',
          'warn',
          '--auth',
        ]);

        expect(result.drupalUrl).toBe('https://example.com');
        expect(result.port).toBe(4000);
        expect(result.logLevel).toBe('warn');
        expect(result.auth).toBe(true);
      });

      it('should parse all supported arguments together', () => {
        const result = parseCliArgs([
          '--drupal-url=https://example.com',
          '--auth',
          '--port=5000',
          '--log-level=info',
          '--oauth-scopes=read write',
          '--oauth-additional-scopes=admin',
          '--oauth-resource-server-url=https://resource.example.com',
          '--drupal-jsonrpc-method=POST',
        ]);

        expect(result.drupalUrl).toBe('https://example.com');
        expect(result.auth).toBe(true);
        expect(result.port).toBe(5000);
        expect(result.logLevel).toBe('info');
        expect(result.oauthScopes).toBe('read write');
        expect(result.oauthAdditionalScopes).toBe('admin');
        expect(result.oauthResourceServerUrl).toBe(
          'https://resource.example.com'
        );
        expect(result.drupalJsonrpcMethod).toBe('POST');
      });
    });

    describe('empty and undefined arguments', () => {
      it('should return all undefined when no arguments provided', () => {
        const result = parseCliArgs([]);

        expect(result.drupalUrl).toBeUndefined();
        expect(result.drupalBaseUrl).toBeUndefined();
        // minimist returns false for boolean flags even with default: undefined
        expect(result.auth).toBe(false);
        expect(result.port).toBeUndefined();
        expect(result.logLevel).toBeUndefined();
        expect(result.oauthScopes).toBeUndefined();
        expect(result.oauthAdditionalScopes).toBeUndefined();
        expect(result.oauthResourceServerUrl).toBeUndefined();
        expect(result.drupalJsonrpcMethod).toBeUndefined();
        // minimist returns false for boolean flags even with default: undefined
        expect(result.help).toBe(false);
        expect(result.version).toBe(false);
      });

      it('should return undefined for unprovided arguments in partial set', () => {
        const result = parseCliArgs(['--port=3000']);

        expect(result.port).toBe(3000);
        expect(result.drupalUrl).toBeUndefined();
        // minimist returns false for boolean flags even with default: undefined
        expect(result.auth).toBe(false);
      });
    });

    describe('result type structure', () => {
      it('should return object with all expected properties', () => {
        const result: ParsedCliArgs = parseCliArgs([]);

        expect(result).toHaveProperty('drupalUrl');
        expect(result).toHaveProperty('drupalBaseUrl');
        expect(result).toHaveProperty('auth');
        expect(result).toHaveProperty('port');
        expect(result).toHaveProperty('logLevel');
        expect(result).toHaveProperty('oauthScopes');
        expect(result).toHaveProperty('oauthAdditionalScopes');
        expect(result).toHaveProperty('oauthResourceServerUrl');
        expect(result).toHaveProperty('drupalJsonrpcMethod');
        expect(result).toHaveProperty('help');
        expect(result).toHaveProperty('version');
      });

      it('should return object with correct types', () => {
        const result = parseCliArgs([
          '--drupal-url=https://example.com',
          '--auth',
          '--port=3000',
          '--log-level=debug',
        ]);

        expect(typeof result.drupalUrl).toBe('string');
        expect(typeof result.auth).toBe('boolean');
        expect(typeof result.port).toBe('number');
        expect(typeof result.logLevel).toBe('string');
      });
    });
  });
});
