/**
 * End-to-end integration tests for the complete JSON-RPC Drupal search workflow
 */

import {
  describe,
  test,
  expect,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import { DrupalMcpServer } from '@/mcp/server.js';
import { DrupalClient } from '@/services/drupal-client.js';
import { loadConfig } from '@/config/index.js';
import type { SearchContentResponse, DrupalNode } from '@/types/index.js';

// Mock fetch for controlled testing
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('End-to-End Integration Tests', () => {
  let config: any;
  let mcpServer: DrupalMcpServer;
  let drupalClient: DrupalClient;

  beforeEach(async () => {
    config = {
      drupal: {
        baseUrl: 'http://localhost/drupal',
        endpoint: '/jsonrpc',
        timeout: 10000,
        retries: 3,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      },
      oauth: {
        clientId: 'test-client-id',
        authorizationEndpoint: 'http://localhost/drupal/oauth/authorize',
        tokenEndpoint: 'http://localhost/drupal/oauth/token',
        redirectUri: 'http://127.0.0.1:3000/callback',
        scopes: ['tutorial:read', 'user:profile'],
      },
      auth: {
        enabled: false, // Disable auth for end-to-end tests
        requiredScopes: ['tutorial:read'],
      },
      mcp: {
        name: 'test-drupal-bridge-mcp',
        version: '1.0.0-test',
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: { subscribe: true, listChanged: true },
          tools: { listChanged: true },
          prompts: { listChanged: true },
        },
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      logging: {
        level: 'error' as const,
      },
      environment: 'test' as const,
    };

    mcpServer = new DrupalMcpServer(config);
    drupalClient = new DrupalClient(config.drupal);

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Complete Search Tutorial Workflow', () => {
    test('should execute complete search workflow successfully', async () => {
      // This test verifies the search tutorial functionality
      const searchArgs = {
        keywords: 'content management',
        drupal_version: ['10'],
        category: ['tutorial', 'cms'],
      };

      // Execute the search through the MCP tool interface
      const result = await (mcpServer as any).executeSearchTutorials(
        searchArgs
      );

      // Verify the response structure
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('query');
      expect(result.query).toHaveProperty('page');

      // Verify result content
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
      expect(result.query.keywords).toBe('content management');
      expect(result.query.drupal_version).toEqual(['10']);

      // Verify individual tutorial result structure
      const firstResult = result.results[0];
      expect(firstResult).toHaveProperty('id');
      expect(firstResult).toHaveProperty('title');
      expect(firstResult).toHaveProperty('url');
      expect(firstResult).toHaveProperty('description');
      expect(firstResult).toHaveProperty('drupal_version');
      expect(firstResult).toHaveProperty('tags');
      expect(firstResult).toHaveProperty('created');

      // Verify filtering worked correctly
      expect(firstResult.drupal_version).toContain('10');
    });

    test('should handle search with minimal parameters', async () => {
      const searchArgs = {
        keywords: 'forms',
      };

      const result = await (mcpServer as any).executeSearchTutorials(
        searchArgs
      );

      expect(result.results).toBeDefined();
      expect(result.query.keywords).toBe('forms');
      expect(result.query.drupal_version).toBeUndefined();
      expect(result.query.category).toBeUndefined();
    });

    test('should filter results by Drupal version', async () => {
      const searchArgs = {
        keywords: 'testing',
        drupal_version: ['9'],
      };

      const result = await (mcpServer as any).executeSearchTutorials(
        searchArgs
      );

      // Results should include version filtering
      const drupal9Results = result.results.filter(r =>
        r.drupal_version?.includes('9')
      );
      expect(drupal9Results.length).toBeGreaterThan(0);
    });
  });

  describe('MCP Tool Integration', () => {
    test('should execute search_tutorials tool through MCP interface', async () => {
      const args = {
        keywords: 'blocks',
        drupal_version: ['11'],
      };

      const toolResponse = await (mcpServer as any).executeTool(
        'search_tutorials',
        args
      );

      expect(toolResponse).toHaveProperty('content');
      expect(Array.isArray(toolResponse.content)).toBe(true);
      expect(toolResponse.content[0]).toHaveProperty('type', 'text');
      expect(toolResponse.content[0]).toHaveProperty('text');

      const responseData = JSON.parse(toolResponse.content[0].text);
      expect(responseData).toHaveProperty('results');
      expect(responseData).toHaveProperty('total');
    });

    test('should handle tool validation errors gracefully', async () => {
      const invalidArgs = {
        keywords: 'x', // Too short
      };

      const toolResponse = await (mcpServer as any).executeTool(
        'search_tutorials',
        invalidArgs
      );

      expect(toolResponse.content[0]).toHaveProperty('type', 'text');

      const errorResponse = JSON.parse(toolResponse.content[0].text);
      expect(errorResponse).toHaveProperty('error');
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.details.field).toBe('keywords');
      expect(errorResponse.error.details.retryable).toBe(false);
    });

    test('should handle unknown tool names', async () => {
      const toolResponse = await (mcpServer as any).executeTool(
        'unknown_tool',
        {}
      );

      const errorResponse = JSON.parse(toolResponse.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.details.field).toBe('name');
      expect(errorResponse.error.message).toContain('Unknown tool');
    });
  });

  describe('Resource Access Integration', () => {
    test('should list available resources', async () => {
      const resources = await (mcpServer as any).getResources();

      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBeGreaterThan(0);

      const nodeResource = resources.find(r => r.uri === 'drupal://nodes');
      expect(nodeResource).toBeDefined();
      expect(nodeResource.name).toBe('Drupal Nodes');
      expect(nodeResource.mimeType).toBe('application/json');
    });

    test('should handle resource read errors gracefully', async () => {
      // This will fail in test environment, but should return structured error
      const result = await (mcpServer as any).readResource('drupal://nodes');

      expect(result).toHaveProperty('contents');
      expect(Array.isArray(result.contents)).toBe(true);

      const content = JSON.parse(result.contents[0].text);

      // Check for results or error response
      if (content.error) {
        expect(content.error).toHaveProperty('type');
        expect(content.error).toHaveProperty('message');
      } else {
        // If results are returned, it should be an array
        expect(Array.isArray(content)).toBe(true);
      }
    });
  });

  describe('Connection Testing', () => {
    test('should test Drupal connection', async () => {
      // In test environment, this should return a consistent result
      const result = await (mcpServer as any).executeTestConnection();

      expect(result).toHaveProperty('connected');
      expect(result).toHaveProperty('config');
      expect(typeof result.connected).toBe('boolean');
      expect(result.config).toHaveProperty('baseUrl');
      expect(result.config).toHaveProperty('endpoint');
    });
  });

  describe('Performance and Memory Usage', () => {
    test('should handle large search results efficiently', async () => {
      const startMemory = process.memoryUsage().heapUsed;
      const startTime = Date.now();

      // Execute multiple searches to test memory efficiency
      const promises = Array.from({ length: 10 }, (_, i) =>
        (mcpServer as any).executeSearchTutorials({
          keywords: `test query ${i}`,
          drupal_version: [i % 2 === 0 ? '10' : '11'],
        })
      );

      const results = await Promise.all(promises);

      const endTime = Date.now();
      const endMemory = process.memoryUsage().heapUsed;

      // Verify all searches completed successfully
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.results).toBeDefined();
        expect(result.query.keywords).toBe(`test query ${i}`);
      });

      // Performance assertions (these are baseline measurements)
      const executionTime = endTime - startTime;
      const memoryIncrease = endMemory - startMemory;

      console.log(`Performance Baseline - 10 searches:`);
      console.log(`  Execution time: ${executionTime}ms`);
      console.log(`  Memory increase: ${Math.round(memoryIncrease / 1024)}KB`);

      // Basic performance expectations (adjust based on actual measurements)
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // Should not increase memory by more than 50MB
    });

    test('should handle concurrent search requests', async () => {
      const concurrentSearches = 5;
      const searchPromises = Array.from(
        { length: concurrentSearches },
        (_, i) =>
          (mcpServer as any).executeTool('search_tutorials', {
            keywords: `concurrent search ${i}`,
          })
      );

      const startTime = Date.now();
      const results = await Promise.all(searchPromises);
      const endTime = Date.now();

      // All searches should complete successfully
      expect(results).toHaveLength(concurrentSearches);
      results.forEach(result => {
        expect(result.content).toBeDefined();
        const data = JSON.parse(result.content[0].text);
        expect(data.results).toBeDefined();
      });

      console.log(
        `Concurrent Baseline - ${concurrentSearches} searches: ${endTime - startTime}ms`
      );
    });
  });

  describe('Data Validation and Processing', () => {
    test('should validate and process search parameters correctly', async () => {
      const args = {
        keywords: '  Content Management  ', // Test trimming
        drupal_version: ['10'],
        category: ['Tutorial', 'CMS', 'tutorial'], // Test deduplication and normalization
      };

      const result = await (mcpServer as any).executeSearchTutorials(args);

      expect(result.query.keywords).toBe('Content Management');
      expect(result.query.drupal_version).toEqual(['10']);
      expect(result.query.category).toEqual(['tutorial', 'cms']); // Should be deduplicated and lowercased
    });

    test('should extract descriptions from tutorial content', async () => {
      const result = await (mcpServer as any).executeSearchTutorials({
        keywords: 'description test',
      });

      const tutorial = result.results[0];
      expect(tutorial.description).toBeDefined();
      expect(typeof tutorial.description).toBe('string');
      expect(tutorial.description.length).toBeGreaterThan(0);
    });
  });
});
