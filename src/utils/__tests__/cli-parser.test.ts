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
      it('should parse --no-auth as false', () => {
        const result = parseCliArgs(['--no-auth']);
        expect(result.auth).toBe(false);
      });

      it('should return false as default when auth not provided (minimist behavior)', () => {
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
          '--no-auth',
        ]);

        expect(result.drupalUrl).toBe('https://example.com');
        expect(result.port).toBe(3000);
        expect(result.auth).toBe(false);
      });

      it('should parse multiple arguments with space syntax', () => {
        const result = parseCliArgs([
          '--drupal-url',
          'https://example.com',
          '--port',
          '4000',
        ]);

        expect(result.drupalUrl).toBe('https://example.com');
        expect(result.port).toBe(4000);
      });

      it('should parse all supported arguments together', () => {
        const result = parseCliArgs([
          '--drupal-url=https://example.com',
          '--no-auth',
          '--port=5000',
        ]);

        expect(result.drupalUrl).toBe('https://example.com');
        expect(result.auth).toBe(false);
        expect(result.port).toBe(5000);
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
        expect(result).toHaveProperty('help');
        expect(result).toHaveProperty('version');
      });

      it('should return object with correct types', () => {
        const result = parseCliArgs([
          '--drupal-url=https://example.com',
          '--no-auth',
          '--port=3000',
        ]);

        expect(typeof result.drupalUrl).toBe('string');
        expect(typeof result.auth).toBe('boolean');
        expect(typeof result.port).toBe('number');
      });
    });
  });
});
