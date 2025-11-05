import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { applyArgsToEnv, isValidUrl, isValidPort } from '../config-manager.js';
import type { ParsedCliArgs } from '../cli-parser.js';

describe('Config Manager', () => {
  describe('isValidUrl', () => {
    describe('valid URLs', () => {
      it('should accept HTTP URL', () => {
        expect(isValidUrl('http://example.com')).toBe(true);
      });

      it('should accept HTTPS URL', () => {
        expect(isValidUrl('https://example.com')).toBe(true);
      });

      it('should accept URL with port', () => {
        expect(isValidUrl('https://example.com:8080')).toBe(true);
      });

      it('should accept URL with path', () => {
        expect(isValidUrl('https://example.com/path/to/resource')).toBe(true);
      });

      it('should accept URL with query parameters', () => {
        expect(isValidUrl('https://example.com?key=value&foo=bar')).toBe(true);
      });

      it('should accept URL with subdomain', () => {
        expect(isValidUrl('https://api.example.com')).toBe(true);
      });

      it('should accept localhost URL', () => {
        expect(isValidUrl('http://localhost:3000')).toBe(true);
      });

      it('should accept IP address URL', () => {
        expect(isValidUrl('http://127.0.0.1:8080')).toBe(true);
      });
    });

    describe('invalid URLs', () => {
      it('should reject non-URL string', () => {
        expect(isValidUrl('not-a-url')).toBe(false);
      });

      it('should reject FTP protocol', () => {
        expect(isValidUrl('ftp://example.com')).toBe(false);
      });

      it('should reject file protocol', () => {
        expect(isValidUrl('file:///path/to/file')).toBe(false);
      });

      it('should reject URL without protocol', () => {
        expect(isValidUrl('example.com')).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValidUrl('')).toBe(false);
      });

      it('should reject malformed URL', () => {
        expect(isValidUrl('ht!tp://example.com')).toBe(false);
      });
    });
  });

  describe('isValidPort', () => {
    describe('valid ports', () => {
      it('should accept minimum port 1', () => {
        expect(isValidPort(1)).toBe(true);
      });

      it('should accept maximum port 65535', () => {
        expect(isValidPort(65535)).toBe(true);
      });

      it('should accept common port 80', () => {
        expect(isValidPort(80)).toBe(true);
      });

      it('should accept common port 443', () => {
        expect(isValidPort(443)).toBe(true);
      });

      it('should accept common port 3000', () => {
        expect(isValidPort(3000)).toBe(true);
      });

      it('should accept mid-range port', () => {
        expect(isValidPort(8080)).toBe(true);
      });
    });

    describe('invalid ports', () => {
      it('should reject port 0', () => {
        expect(isValidPort(0)).toBe(false);
      });

      it('should reject negative port', () => {
        expect(isValidPort(-1)).toBe(false);
      });

      it('should reject port above 65535', () => {
        expect(isValidPort(65536)).toBe(false);
      });

      it('should reject port 70000', () => {
        expect(isValidPort(70000)).toBe(false);
      });

      it('should reject decimal port', () => {
        expect(isValidPort(3000.5)).toBe(false);
      });

      it('should reject NaN', () => {
        expect(isValidPort(NaN)).toBe(false);
      });

      it('should reject Infinity', () => {
        expect(isValidPort(Infinity)).toBe(false);
      });
    });
  });

  describe('applyArgsToEnv', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      // Save original environment
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      // Restore original environment
      process.env = originalEnv;
    });

    describe('drupal-url argument', () => {
      it('should apply valid drupalUrl to DRUPAL_BASE_URL', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'https://example.com',
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_BASE_URL).toBe('https://example.com');
      });

      it('should apply valid drupalBaseUrl to DRUPAL_BASE_URL', () => {
        const args: ParsedCliArgs = {
          drupalBaseUrl: 'https://example.com',
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_BASE_URL).toBe('https://example.com');
      });

      it('should prefer drupalUrl over drupalBaseUrl', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'https://url.example.com',
          drupalBaseUrl: 'https://baseurl.example.com',
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_BASE_URL).toBe('https://url.example.com');
      });

      it('should throw error for invalid URL format', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'not-a-url',
        };
        expect(() => applyArgsToEnv(args)).toThrow(/Invalid --drupal-url/);
      });

      it('should throw error for non-HTTP/HTTPS URL', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'ftp://example.com',
        };
        expect(() => applyArgsToEnv(args)).toThrow(/Invalid --drupal-url/);
      });

      it('should include helpful example in error message', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'invalid',
        };
        expect(() => applyArgsToEnv(args)).toThrow(
          /Example: https:\/\/example\.com/
        );
      });

      it('should not modify env when drupalUrl is undefined', () => {
        delete process.env.DRUPAL_BASE_URL;
        const args: ParsedCliArgs = {
          port: 3000,
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_BASE_URL).toBeUndefined();
      });
    });

    describe('auth argument validation and mapping', () => {
      beforeEach(() => {
        delete process.env.AUTH_ENABLED;
      });

      it('should map auth=enabled to AUTH_ENABLED=true', () => {
        const args: ParsedCliArgs = {
          auth: 'enabled',
        };
        applyArgsToEnv(args);
        expect(process.env.AUTH_ENABLED).toBe('true');
      });

      it('should map auth=disabled to AUTH_ENABLED=false', () => {
        const args: ParsedCliArgs = {
          auth: 'disabled',
        };
        applyArgsToEnv(args);
        expect(process.env.AUTH_ENABLED).toBe('false');
      });

      it('should default to enabled when auth is undefined and AUTH_ENABLED not set', () => {
        const args: ParsedCliArgs = {};
        applyArgsToEnv(args);
        expect(process.env.AUTH_ENABLED).toBe('true');
      });

      it('should not override existing AUTH_ENABLED when auth is undefined', () => {
        process.env.AUTH_ENABLED = 'false';
        const args: ParsedCliArgs = {};
        applyArgsToEnv(args);
        expect(process.env.AUTH_ENABLED).toBe('false');
      });

      it('should throw error for invalid auth value', () => {
        const args: ParsedCliArgs = {
          auth: 'yes',
        };
        expect(() => applyArgsToEnv(args)).toThrow(
          "Invalid --auth value: 'yes'. Must be 'enabled' or 'disabled'"
        );
      });

      it('should include example in error message', () => {
        const args: ParsedCliArgs = {
          auth: 'invalid',
        };
        expect(() => applyArgsToEnv(args)).toThrow('Example: --auth=disabled');
      });
    });

    describe('port argument', () => {
      it('should apply valid port to PORT as string', () => {
        const args: ParsedCliArgs = {
          port: 3000,
        };
        applyArgsToEnv(args);
        expect(process.env.PORT).toBe('3000');
      });

      it('should apply minimum port 1', () => {
        const args: ParsedCliArgs = {
          port: 1,
        };
        applyArgsToEnv(args);
        expect(process.env.PORT).toBe('1');
      });

      it('should apply maximum port 65535', () => {
        const args: ParsedCliArgs = {
          port: 65535,
        };
        applyArgsToEnv(args);
        expect(process.env.PORT).toBe('65535');
      });

      it('should throw error for port 0', () => {
        const args: ParsedCliArgs = {
          port: 0,
        };
        expect(() => applyArgsToEnv(args)).toThrow(/Invalid --port/);
      });

      it('should throw error for negative port', () => {
        const args: ParsedCliArgs = {
          port: -1,
        };
        expect(() => applyArgsToEnv(args)).toThrow(/Invalid --port/);
      });

      it('should throw error for port above 65535', () => {
        const args: ParsedCliArgs = {
          port: 70000,
        };
        expect(() => applyArgsToEnv(args)).toThrow(/Invalid --port/);
      });

      it('should include range information in error message', () => {
        const args: ParsedCliArgs = {
          port: 0,
        };
        expect(() => applyArgsToEnv(args)).toThrow(/between 1 and 65535/);
      });

      it('should not modify PORT when port is undefined', () => {
        delete process.env.PORT;
        const args: ParsedCliArgs = {};
        applyArgsToEnv(args);
        expect(process.env.PORT).toBeUndefined();
      });
    });

    describe('multiple arguments', () => {
      it('should apply multiple valid arguments', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'https://example.com',
          auth: 'disabled',
          port: 4000,
        };
        applyArgsToEnv(args);

        expect(process.env.DRUPAL_BASE_URL).toBe('https://example.com');
        expect(process.env.AUTH_ENABLED).toBe('false');
        expect(process.env.PORT).toBe('4000');
      });

      it('should throw on first invalid argument', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'https://example.com',
          port: 0, // Invalid
        };
        expect(() => applyArgsToEnv(args)).toThrow(/Invalid --port/);
      });

      it('should only apply valid arguments before error', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'https://example.com',
          port: 0, // Invalid
        };

        try {
          applyArgsToEnv(args);
        } catch (error) {
          // Expected error
        }

        // drupalUrl should be applied before port validation fails
        expect(process.env.DRUPAL_BASE_URL).toBe('https://example.com');
      });
    });

    describe('undefined arguments do not modify env', () => {
      it('should not modify any env when all args undefined', () => {
        process.env.DRUPAL_BASE_URL = 'existing-url';
        process.env.PORT = '8080';
        process.env.LOG_LEVEL = 'info';

        const args: ParsedCliArgs = {};
        applyArgsToEnv(args);

        expect(process.env.DRUPAL_BASE_URL).toBe('existing-url');
        expect(process.env.PORT).toBe('8080');
        expect(process.env.LOG_LEVEL).toBe('info');
      });

      it('should only modify env for provided arguments', () => {
        process.env.DRUPAL_BASE_URL = 'existing-url';
        process.env.PORT = '8080';
        process.env.LOG_LEVEL = 'info';

        const args: ParsedCliArgs = {
          port: 3000,
        };
        applyArgsToEnv(args);

        expect(process.env.DRUPAL_BASE_URL).toBe('existing-url');
        expect(process.env.PORT).toBe('3000');
        expect(process.env.LOG_LEVEL).toBe('info');
      });
    });
  });
});
