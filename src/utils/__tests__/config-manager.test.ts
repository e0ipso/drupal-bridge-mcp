import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  applyArgsToEnv,
  isValidUrl,
  isValidPort,
  isValidLogLevel,
  isValidJsonRpcMethod,
} from '../config-manager.js';
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

  describe('isValidLogLevel', () => {
    describe('valid log levels', () => {
      it('should accept trace', () => {
        expect(isValidLogLevel('trace')).toBe(true);
      });

      it('should accept debug', () => {
        expect(isValidLogLevel('debug')).toBe(true);
      });

      it('should accept info', () => {
        expect(isValidLogLevel('info')).toBe(true);
      });

      it('should accept warn', () => {
        expect(isValidLogLevel('warn')).toBe(true);
      });

      it('should accept error', () => {
        expect(isValidLogLevel('error')).toBe(true);
      });

      it('should accept fatal', () => {
        expect(isValidLogLevel('fatal')).toBe(true);
      });

      it('should accept uppercase TRACE', () => {
        expect(isValidLogLevel('TRACE')).toBe(true);
      });

      it('should accept uppercase DEBUG', () => {
        expect(isValidLogLevel('DEBUG')).toBe(true);
      });

      it('should accept mixed case DeBuG', () => {
        expect(isValidLogLevel('DeBuG')).toBe(true);
      });
    });

    describe('invalid log levels', () => {
      it('should reject invalid level', () => {
        expect(isValidLogLevel('invalid')).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValidLogLevel('')).toBe(false);
      });

      it('should reject verbose', () => {
        expect(isValidLogLevel('verbose')).toBe(false);
      });

      it('should reject silly', () => {
        expect(isValidLogLevel('silly')).toBe(false);
      });
    });
  });

  describe('isValidJsonRpcMethod', () => {
    describe('valid methods', () => {
      it('should accept GET', () => {
        expect(isValidJsonRpcMethod('GET')).toBe(true);
      });

      it('should accept POST', () => {
        expect(isValidJsonRpcMethod('POST')).toBe(true);
      });

      it('should accept lowercase get', () => {
        expect(isValidJsonRpcMethod('get')).toBe(true);
      });

      it('should accept lowercase post', () => {
        expect(isValidJsonRpcMethod('post')).toBe(true);
      });

      it('should accept mixed case GeT', () => {
        expect(isValidJsonRpcMethod('GeT')).toBe(true);
      });
    });

    describe('invalid methods', () => {
      it('should reject PUT', () => {
        expect(isValidJsonRpcMethod('PUT')).toBe(false);
      });

      it('should reject DELETE', () => {
        expect(isValidJsonRpcMethod('DELETE')).toBe(false);
      });

      it('should reject PATCH', () => {
        expect(isValidJsonRpcMethod('PATCH')).toBe(false);
      });

      it('should reject empty string', () => {
        expect(isValidJsonRpcMethod('')).toBe(false);
      });

      it('should reject invalid method', () => {
        expect(isValidJsonRpcMethod('INVALID')).toBe(false);
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

    describe('auth argument', () => {
      it('should apply auth true to AUTH_ENABLED as string', () => {
        const args: ParsedCliArgs = {
          auth: true,
        };
        applyArgsToEnv(args);
        expect(process.env.AUTH_ENABLED).toBe('true');
      });

      it('should apply auth false to AUTH_ENABLED as string', () => {
        const args: ParsedCliArgs = {
          auth: false,
        };
        applyArgsToEnv(args);
        expect(process.env.AUTH_ENABLED).toBe('false');
      });

      it('should not modify AUTH_ENABLED when auth is undefined', () => {
        process.env.AUTH_ENABLED = 'existing-value';
        const args: ParsedCliArgs = {
          port: 3000,
        };
        applyArgsToEnv(args);
        expect(process.env.AUTH_ENABLED).toBe('existing-value');
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
        const args: ParsedCliArgs = {
          logLevel: 'debug',
        };
        applyArgsToEnv(args);
        expect(process.env.PORT).toBeUndefined();
      });
    });

    describe('log-level argument', () => {
      it('should apply valid log level', () => {
        const args: ParsedCliArgs = {
          logLevel: 'debug',
        };
        applyArgsToEnv(args);
        expect(process.env.LOG_LEVEL).toBe('debug');
      });

      it('should apply trace level', () => {
        const args: ParsedCliArgs = {
          logLevel: 'trace',
        };
        applyArgsToEnv(args);
        expect(process.env.LOG_LEVEL).toBe('trace');
      });

      it('should apply fatal level', () => {
        const args: ParsedCliArgs = {
          logLevel: 'fatal',
        };
        applyArgsToEnv(args);
        expect(process.env.LOG_LEVEL).toBe('fatal');
      });

      it('should throw error for invalid log level', () => {
        const args: ParsedCliArgs = {
          logLevel: 'invalid',
        };
        expect(() => applyArgsToEnv(args)).toThrow(/Invalid --log-level/);
      });

      it('should list valid levels in error message', () => {
        const args: ParsedCliArgs = {
          logLevel: 'invalid',
        };
        expect(() => applyArgsToEnv(args)).toThrow(
          /Must be one of: trace, debug, info, warn, error, fatal/
        );
      });

      it('should not modify LOG_LEVEL when logLevel is undefined', () => {
        delete process.env.LOG_LEVEL;
        const args: ParsedCliArgs = {
          port: 3000,
        };
        applyArgsToEnv(args);
        expect(process.env.LOG_LEVEL).toBeUndefined();
      });
    });

    describe('oauth-scopes arguments', () => {
      it('should apply oauthScopes to OAUTH_SCOPES', () => {
        const args: ParsedCliArgs = {
          oauthScopes: 'read:content write:content',
        };
        applyArgsToEnv(args);
        expect(process.env.OAUTH_SCOPES).toBe('read:content write:content');
      });

      it('should apply oauthAdditionalScopes to OAUTH_ADDITIONAL_SCOPES', () => {
        const args: ParsedCliArgs = {
          oauthAdditionalScopes: 'admin:users',
        };
        applyArgsToEnv(args);
        expect(process.env.OAUTH_ADDITIONAL_SCOPES).toBe('admin:users');
      });

      it('should not modify env when scopes are undefined', () => {
        delete process.env.OAUTH_SCOPES;
        const args: ParsedCliArgs = {
          port: 3000,
        };
        applyArgsToEnv(args);
        expect(process.env.OAUTH_SCOPES).toBeUndefined();
      });
    });

    describe('oauth-resource-server-url argument', () => {
      it('should apply valid resource server URL', () => {
        const args: ParsedCliArgs = {
          oauthResourceServerUrl: 'https://resource.example.com',
        };
        applyArgsToEnv(args);
        expect(process.env.OAUTH_RESOURCE_SERVER_URL).toBe(
          'https://resource.example.com'
        );
      });

      it('should throw error for invalid resource server URL', () => {
        const args: ParsedCliArgs = {
          oauthResourceServerUrl: 'not-a-url',
        };
        expect(() => applyArgsToEnv(args)).toThrow(
          /Invalid --oauth-resource-server-url/
        );
      });

      it('should include helpful example in error message', () => {
        const args: ParsedCliArgs = {
          oauthResourceServerUrl: 'invalid',
        };
        expect(() => applyArgsToEnv(args)).toThrow(
          /Example: https:\/\/example\.com/
        );
      });

      it('should not modify env when URL is undefined', () => {
        delete process.env.OAUTH_RESOURCE_SERVER_URL;
        const args: ParsedCliArgs = {
          port: 3000,
        };
        applyArgsToEnv(args);
        expect(process.env.OAUTH_RESOURCE_SERVER_URL).toBeUndefined();
      });
    });

    describe('drupal-jsonrpc-method argument', () => {
      it('should apply GET method', () => {
        const args: ParsedCliArgs = {
          drupalJsonrpcMethod: 'GET',
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_JSONRPC_METHOD).toBe('GET');
      });

      it('should apply POST method', () => {
        const args: ParsedCliArgs = {
          drupalJsonrpcMethod: 'POST',
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_JSONRPC_METHOD).toBe('POST');
      });

      it('should normalize lowercase get to uppercase', () => {
        const args: ParsedCliArgs = {
          drupalJsonrpcMethod: 'get',
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_JSONRPC_METHOD).toBe('GET');
      });

      it('should normalize lowercase post to uppercase', () => {
        const args: ParsedCliArgs = {
          drupalJsonrpcMethod: 'post',
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_JSONRPC_METHOD).toBe('POST');
      });

      it('should throw error for PUT method', () => {
        const args: ParsedCliArgs = {
          drupalJsonrpcMethod: 'PUT',
        };
        expect(() => applyArgsToEnv(args)).toThrow(
          /Invalid --drupal-jsonrpc-method/
        );
      });

      it('should list valid methods in error message', () => {
        const args: ParsedCliArgs = {
          drupalJsonrpcMethod: 'PUT',
        };
        expect(() => applyArgsToEnv(args)).toThrow(/Must be one of: GET, POST/);
      });

      it('should not modify env when method is undefined', () => {
        delete process.env.DRUPAL_JSONRPC_METHOD;
        const args: ParsedCliArgs = {
          port: 3000,
        };
        applyArgsToEnv(args);
        expect(process.env.DRUPAL_JSONRPC_METHOD).toBeUndefined();
      });
    });

    describe('multiple arguments', () => {
      it('should apply multiple valid arguments', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'https://example.com',
          auth: true,
          port: 4000,
          logLevel: 'debug',
          oauthScopes: 'read write',
          drupalJsonrpcMethod: 'POST',
        };
        applyArgsToEnv(args);

        expect(process.env.DRUPAL_BASE_URL).toBe('https://example.com');
        expect(process.env.AUTH_ENABLED).toBe('true');
        expect(process.env.PORT).toBe('4000');
        expect(process.env.LOG_LEVEL).toBe('debug');
        expect(process.env.OAUTH_SCOPES).toBe('read write');
        expect(process.env.DRUPAL_JSONRPC_METHOD).toBe('POST');
      });

      it('should throw on first invalid argument', () => {
        const args: ParsedCliArgs = {
          drupalUrl: 'https://example.com',
          port: 0, // Invalid
          logLevel: 'debug',
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
