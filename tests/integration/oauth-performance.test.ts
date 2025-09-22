/**
 * OAuth 2.1 Performance and Latency Validation Tests
 *
 * Tests performance characteristics of the OAuth 2.1 implementation:
 * - Authentication flow latency requirements
 * - PKCE challenge generation performance
 * - Endpoint discovery performance
 * - Token exchange throughput
 * - Memory usage optimization
 * - Concurrent authentication handling
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
  beforeAll,
  afterAll,
} from '@jest/globals';
import { OAuthClient } from '@/auth/oauth-client.js';
import {
  discoverOAuthEndpoints,
  clearDiscoveryCache,
} from '@/auth/endpoint-discovery.js';
import type { OAuthTokens } from '@/auth/oauth-client.js';
import { createServer } from 'http';
import type { Server } from 'http';
import type { AddressInfo } from 'net';

describe('OAuth 2.1 Performance and Latency Tests', () => {
  let mockOAuthServer: Server;
  let serverPort: number;
  let oauthClient: OAuthClient;

  beforeAll(async () => {
    mockOAuthServer = await createPerformanceTestServer();
    const address = mockOAuthServer.address() as AddressInfo;
    serverPort = address.port;

    oauthClient = new OAuthClient({
      clientId: 'test-client-id',
      authorizationEndpoint: `http://localhost:${serverPort}/oauth/authorize`,
      tokenEndpoint: `http://localhost:${serverPort}/oauth/token`,
      redirectUri: 'http://127.0.0.1:3000/callback',
      scopes: ['tutorial:read', 'user:profile'],
    });
  });

  afterAll(async () => {
    if (mockOAuthServer) {
      await new Promise<void>(resolve => {
        mockOAuthServer.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    clearDiscoveryCache();
  });

  describe('PKCE Performance Benchmarks', () => {
    test('should generate PKCE challenge within acceptable time limits', () => {
      const iterations = 1000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        oauthClient.generatePKCEChallenge();
      }

      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / iterations;

      // Should generate PKCE challenge in under 1ms on average
      expect(averageTime).toBeLessThan(1);

      // Total time for 1000 generations should be under 100ms
      expect(totalTime).toBeLessThan(100);

      console.log(
        `PKCE generation: ${averageTime.toFixed(3)}ms average, ${totalTime.toFixed(1)}ms total`
      );
    });

    test('should maintain consistent PKCE generation performance', () => {
      const measurements: number[] = [];
      const batches = 10;
      const batchSize = 100;

      for (let batch = 0; batch < batches; batch++) {
        const startTime = performance.now();

        for (let i = 0; i < batchSize; i++) {
          oauthClient.generatePKCEChallenge();
        }

        const endTime = performance.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxTime = Math.max(...measurements);
      const minTime = Math.min(...measurements);

      // Performance should be consistent (max shouldn't be more than 5x min)
      expect(maxTime / minTime).toBeLessThan(5);

      // Average batch time should be reasonable
      expect(averageTime).toBeLessThan(50);

      console.log(
        `PKCE consistency: avg=${averageTime.toFixed(1)}ms, min=${minTime.toFixed(1)}ms, max=${maxTime.toFixed(1)}ms`
      );
    });

    test('should not consume excessive memory during PKCE generation', () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 10000;

      // Generate many PKCE challenges
      for (let i = 0; i < iterations; i++) {
        oauthClient.generatePKCEChallenge();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be minimal (less than 10MB for 10k generations)
      expect(memoryIncrease).toBeLessThan(10);

      console.log(
        `PKCE memory usage: ${memoryIncrease.toFixed(2)}MB increase for ${iterations} generations`
      );
    });
  });

  describe('Token Exchange Performance', () => {
    test('should complete token exchange within latency requirements', async () => {
      const iterations = 50;
      const measurements: number[] = [];

      setMockTokenResponse({
        accessToken: 'test_access_token',
        refreshToken: 'test_refresh_token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      for (let i = 0; i < iterations; i++) {
        const challenge = oauthClient.generatePKCEChallenge();
        const startTime = performance.now();

        const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
          oauthClient
        );

        await exchangeMethod(`test_code_${i}`, challenge.codeVerifier);

        const endTime = performance.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxTime = Math.max(...measurements);
      const p95Time = measurements.sort((a, b) => a - b)[
        Math.floor(measurements.length * 0.95)
      ];

      // Average token exchange should be under 50ms
      expect(averageTime).toBeLessThan(50);

      // 95th percentile should be under 100ms
      expect(p95Time).toBeLessThan(100);

      // No single exchange should take more than 200ms
      expect(maxTime).toBeLessThan(200);

      console.log(
        `Token exchange: avg=${averageTime.toFixed(1)}ms, p95=${p95Time.toFixed(1)}ms, max=${maxTime.toFixed(1)}ms`
      );
    });

    test('should handle concurrent token exchanges efficiently', async () => {
      const concurrency = 10;
      const iterations = 5;

      setMockTokenResponse({
        accessToken: 'concurrent_access_token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      const startTime = performance.now();

      const promises = Array.from({ length: concurrency }, async (_, i) => {
        const measurements: number[] = [];

        for (let j = 0; j < iterations; j++) {
          const challenge = oauthClient.generatePKCEChallenge();
          const exchangeStart = performance.now();

          const exchangeMethod = (
            oauthClient as any
          ).exchangeCodeForTokens.bind(oauthClient);

          await exchangeMethod(
            `concurrent_code_${i}_${j}`,
            challenge.codeVerifier
          );

          measurements.push(performance.now() - exchangeStart);
        }

        return measurements;
      });

      const results = await Promise.all(promises);
      const endTime = performance.now();

      const allMeasurements = results.flat();
      const averageTime =
        allMeasurements.reduce((a, b) => a + b, 0) / allMeasurements.length;
      const totalTime = endTime - startTime;

      // Concurrent operations shouldn't significantly degrade performance
      expect(averageTime).toBeLessThan(100);

      // Total time should show concurrency benefit
      expect(totalTime).toBeLessThan(concurrency * iterations * 50);

      console.log(
        `Concurrent exchanges: ${concurrency}x${iterations} in ${totalTime.toFixed(1)}ms, avg=${averageTime.toFixed(1)}ms`
      );
    });

    test('should maintain performance under token refresh load', async () => {
      const iterations = 100;
      const measurements: number[] = [];

      setMockTokenResponse({
        accessToken: 'refreshed_access_token',
        refreshToken: 'new_refresh_token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        await oauthClient.refreshToken(`refresh_token_${i}`);

        const endTime = performance.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxTime = Math.max(...measurements);

      // Token refresh should be consistently fast
      expect(averageTime).toBeLessThan(30);
      expect(maxTime).toBeLessThan(100);

      console.log(
        `Token refresh: avg=${averageTime.toFixed(1)}ms, max=${maxTime.toFixed(1)}ms for ${iterations} refreshes`
      );
    });
  });

  describe('Endpoint Discovery Performance', () => {
    test('should complete discovery within acceptable time limits', async () => {
      const iterations = 20;
      const measurements: number[] = [];

      setServerBehavior('fast_discovery');

      for (let i = 0; i < iterations; i++) {
        clearDiscoveryCache(); // Force fresh discovery each time

        const startTime = performance.now();

        await discoverOAuthEndpoints({
          baseUrl: `http://localhost:${serverPort}`,
          timeout: 5000,
        });

        const endTime = performance.now();
        measurements.push(endTime - startTime);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxTime = Math.max(...measurements);

      // Discovery should be fast
      expect(averageTime).toBeLessThan(100);
      expect(maxTime).toBeLessThan(200);

      console.log(
        `Discovery: avg=${averageTime.toFixed(1)}ms, max=${maxTime.toFixed(1)}ms`
      );
    });

    test('should demonstrate cache performance benefits', async () => {
      const iterations = 50;

      setServerBehavior('fast_discovery');

      // Measure first discovery (cache miss)
      clearDiscoveryCache();
      const firstDiscoveryStart = performance.now();
      await discoverOAuthEndpoints({
        baseUrl: `http://localhost:${serverPort}`,
        cacheTtl: 60000,
      });
      const firstDiscoveryTime = performance.now() - firstDiscoveryStart;

      // Measure cached discoveries
      const cachedMeasurements: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();

        await discoverOAuthEndpoints({
          baseUrl: `http://localhost:${serverPort}`,
          cacheTtl: 60000,
        });

        const endTime = performance.now();
        cachedMeasurements.push(endTime - startTime);
      }

      const averageCachedTime =
        cachedMeasurements.reduce((a, b) => a + b, 0) /
        cachedMeasurements.length;

      // Cached access should be much faster than initial discovery
      expect(averageCachedTime).toBeLessThan(firstDiscoveryTime / 5);
      expect(averageCachedTime).toBeLessThan(5); // Should be very fast

      console.log(
        `Discovery cache: first=${firstDiscoveryTime.toFixed(1)}ms, cached avg=${averageCachedTime.toFixed(3)}ms`
      );
    });

    test('should handle discovery fallback efficiently', async () => {
      const iterations = 10;
      const measurements: number[] = [];

      setServerBehavior('discovery_failure');

      for (let i = 0; i < iterations; i++) {
        clearDiscoveryCache();

        const startTime = performance.now();

        const endpoints = await discoverOAuthEndpoints({
          baseUrl: `http://localhost:${serverPort}`,
          timeout: 1000,
          retries: 1,
        });

        const endTime = performance.now();
        measurements.push(endTime - startTime);

        expect(endpoints.isFallback).toBe(true);
      }

      const averageTime =
        measurements.reduce((a, b) => a + b, 0) / measurements.length;

      // Fallback should complete within reasonable time
      expect(averageTime).toBeLessThan(3000); // Should include timeout + retry

      console.log(`Discovery fallback: avg=${averageTime.toFixed(1)}ms`);
    });
  });

  describe('Memory Usage Optimization', () => {
    test('should not leak memory during repeated OAuth flows', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 100;

      setMockTokenResponse({
        accessToken: 'memory_test_token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      for (let i = 0; i < iterations; i++) {
        const challenge = oauthClient.generatePKCEChallenge();

        const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
          oauthClient
        );

        await exchangeMethod(`memory_test_code_${i}`, challenge.codeVerifier);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory increase should be minimal
      expect(memoryIncrease).toBeLessThan(5);

      console.log(
        `OAuth flows memory: ${memoryIncrease.toFixed(2)}MB increase for ${iterations} flows`
      );
    });

    test('should efficiently manage discovery cache memory', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      const baseUrls = Array.from(
        { length: 100 },
        (_, i) => `http://localhost:${serverPort}/site${i}`
      );

      setServerBehavior('fast_discovery');

      // Fill cache with many entries
      for (const baseUrl of baseUrls) {
        await discoverOAuthEndpoints({
          baseUrl,
          cacheTtl: 60000,
        });
      }

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // Memory usage should be reasonable for cached data
      expect(memoryIncrease).toBeLessThan(10);

      console.log(
        `Discovery cache memory: ${memoryIncrease.toFixed(2)}MB for ${baseUrls.length} cached entries`
      );
    });
  });

  describe('Throughput Benchmarks', () => {
    test('should achieve acceptable PKCE generation throughput', () => {
      const duration = 1000; // 1 second
      const startTime = performance.now();
      let count = 0;

      while (performance.now() - startTime < duration) {
        oauthClient.generatePKCEChallenge();
        count++;
      }

      const actualDuration = performance.now() - startTime;
      const throughput = (count / actualDuration) * 1000; // ops per second

      // Should generate at least 1000 PKCE challenges per second
      expect(throughput).toBeGreaterThan(1000);

      console.log(`PKCE throughput: ${throughput.toFixed(0)} challenges/sec`);
    });

    test('should handle high-frequency token operations', async () => {
      const operations = 100;
      const startTime = performance.now();

      setMockTokenResponse({
        accessToken: 'throughput_test_token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      });

      const promises = Array.from({ length: operations }, async (_, i) => {
        const challenge = oauthClient.generatePKCEChallenge();
        const exchangeMethod = (oauthClient as any).exchangeCodeForTokens.bind(
          oauthClient
        );
        return exchangeMethod(`throughput_code_${i}`, challenge.codeVerifier);
      });

      await Promise.all(promises);

      const endTime = performance.now();
      const duration = endTime - startTime;
      const throughput = (operations / duration) * 1000; // ops per second

      // Should handle significant token operation throughput
      expect(throughput).toBeGreaterThan(10);

      console.log(
        `Token operation throughput: ${throughput.toFixed(1)} ops/sec`
      );
    });
  });
});

// Mock server implementation for performance testing
let serverBehavior = 'fast_discovery';
let mockTokenResponse: OAuthTokens | null = null;

function setServerBehavior(behavior: string): void {
  serverBehavior = behavior;
}

function setMockTokenResponse(tokens: OAuthTokens): void {
  mockTokenResponse = tokens;
}

async function createPerformanceTestServer(): Promise<Server> {
  return new Promise<Server>(resolve => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost`);

      if (url.pathname === '/.well-known/oauth-authorization-server') {
        handlePerformanceDiscoveryRequest(req, res);
      } else if (url.pathname === '/oauth/token' && req.method === 'POST') {
        handlePerformanceTokenRequest(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    server.listen(0, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

function handlePerformanceDiscoveryRequest(req: any, res: any): void {
  const address = req.socket.address();
  const baseUrl = `http://localhost:${address.port}`;

  switch (serverBehavior) {
    case 'discovery_failure':
      res.writeHead(404);
      res.end('Not Found');
      break;

    case 'fast_discovery':
    default:
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          issuer: baseUrl,
          authorization_endpoint: `${baseUrl}/oauth/authorize`,
          token_endpoint: `${baseUrl}/oauth/token`,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
        })
      );
  }
}

function handlePerformanceTokenRequest(req: any, res: any): void {
  if (mockTokenResponse) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        access_token: mockTokenResponse.accessToken,
        refresh_token: mockTokenResponse.refreshToken,
        token_type: mockTokenResponse.tokenType,
        expires_in: mockTokenResponse.expiresIn,
        scope: mockTokenResponse.scope,
      })
    );
  } else {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'server_error' }));
  }
}
