/**
 * Tests for search_tutorials MCP tool functionality
 */

import { DrupalMcpServer } from '@/mcp/server.js';
import {
  validateSearchContentParams,
  ValidationError,
} from '@/utils/validation.js';
import type { AppConfig } from '@/config/index.js';
import type {
  SearchContentResponse,
  ProcessedSearchContentParams,
} from '@/types/index.js';

// Mock configuration for testing
const mockConfig: AppConfig = {
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
  mcp: {
    name: 'test-mcp-server',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true, listChanged: true },
      prompts: { listChanged: true },
    },
  },
  oauth: {
    clientId: 'test-client-id',
    authorizationEndpoint: 'http://localhost/oauth/authorize',
    tokenEndpoint: 'http://localhost/oauth/token',
    redirectUri: 'http://localhost/callback',
    scopes: ['read'],
  },
  auth: {
    enabled: false, // Disable auth for tests
    requiredScopes: ['read'],
  },
  server: {
    port: 3000,
    host: 'localhost',
  },
  logging: {
    level: 'info',
  },
  environment: 'test',
};

describe('Search Tutorials MCP Tool', () => {
  let mcpServer: DrupalMcpServer;

  beforeEach(() => {
    mcpServer = new DrupalMcpServer(mockConfig);
  });

  afterEach(async () => {
    await mcpServer.close();
  });

  describe('Parameter Validation', () => {
    describe('validateSearchContentParams', () => {
      it('should validate valid parameters successfully', () => {
        const validParams = {
          keywords: 'drupal configuration',
          types: ['tutorial', 'topic'],
          drupal_version: ['10', '11'],
          category: ['configuration', 'settings'],
          sort: 'search_api_relevance',
          page: { limit: 10, offset: 0 },
        };

        const result = validateSearchContentParams(validParams);

        expect(result).toEqual({
          keywords: 'drupal configuration',
          types: ['tutorial', 'topic'],
          drupal_version: ['10', '11'],
          category: ['configuration', 'settings'],
          sort: 'search_api_relevance',
          page: { limit: 10, offset: 0 },
        });
      });

      it('should validate minimal parameters (keywords only)', () => {
        const minimalParams = { keywords: 'test' };
        const result = validateSearchContentParams(minimalParams);

        expect(result).toEqual({
          keywords: 'test',
          types: ['tutorial', 'topic', 'course'], // default values
          drupal_version: undefined,
          category: undefined,
          sort: 'search_api_relevance',
          page: { limit: 10, offset: 0 },
        });
      });

      it('should throw ValidationError for missing keywords', () => {
        expect(() => validateSearchContentParams({})).toThrow(ValidationError);
        expect(() => validateSearchContentParams({ keywords: '' })).toThrow(
          ValidationError
        );
      });

      it('should throw ValidationError for invalid keywords type', () => {
        expect(() => validateSearchContentParams({ keywords: 123 })).toThrow(
          ValidationError
        );
        expect(() => validateSearchContentParams({ keywords: null })).toThrow(
          ValidationError
        );
      });

      it('should throw ValidationError for keywords too short', () => {
        expect(() => validateSearchContentParams({ keywords: 'a' })).toThrow(
          ValidationError
        );
      });

      it('should throw ValidationError for invalid types array items', () => {
        expect(() =>
          validateSearchContentParams({
            keywords: 'test',
            types: ['invalid-type'],
          })
        ).toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid drupal_version array items', () => {
        expect(() =>
          validateSearchContentParams({
            keywords: 'test',
            drupal_version: ['8'], // Invalid version
          })
        ).toThrow(ValidationError);
      });

      it('should validate drupal_version as array', () => {
        const params = {
          keywords: 'test',
          drupal_version: ['9', '10', '11'],
        };

        const result = validateSearchContentParams(params);

        expect(result.drupal_version).toEqual(['9', '10', '11']);
      });

      it('should filter and normalize category tags', () => {
        const params = {
          keywords: 'test',
          category: ['Config', 'SETTINGS', 'config', '  spaces  ', 'valid-tag'],
        };

        const result = validateSearchContentParams(params);

        expect(result.category).toEqual([
          'config',
          'settings',
          'spaces',
          'valid-tag',
        ]);
      });

      it('should validate page object structure', () => {
        const params = {
          keywords: 'test',
          page: { limit: 20, offset: 10 },
        };

        const result = validateSearchContentParams(params);

        expect(result.page).toEqual({ limit: 20, offset: 10 });
      });

      it('should throw ValidationError for invalid page limit', () => {
        expect(() =>
          validateSearchContentParams({
            keywords: 'test',
            page: { limit: 101, offset: 0 }, // Exceeds max limit
          })
        ).toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid page offset', () => {
        expect(() =>
          validateSearchContentParams({
            keywords: 'test',
            page: { limit: 10, offset: -1 }, // Negative offset
          })
        ).toThrow(ValidationError);
      });

      it('should trim and normalize keywords', () => {
        const params = { keywords: '  drupal configuration  ' };
        const result = validateSearchContentParams(params);

        expect(result.keywords).toBe('drupal configuration');
      });
    });
  });

  describe('Tool Registration', () => {
    it('should register search_tutorials tool in tools list', () => {
      const server = mcpServer.getServer();
      const tools = (mcpServer as any).getTools();

      const searchTutorialsTool = tools.find(
        (tool: any) => tool.name === 'search_tutorials'
      );
      expect(searchTutorialsTool).toBeDefined();
      expect(searchTutorialsTool.description).toContain(
        'Search Drupalize.me tutorials'
      );
    });

    it('should have correct tool schema for new parameters', () => {
      const tools = (mcpServer as any).getTools();
      const searchTutorialsTool = tools.find(
        (tool: any) => tool.name === 'search_tutorials'
      );

      expect(searchTutorialsTool.inputSchema).toEqual({
        type: 'object',
        properties: {
          keywords: {
            type: 'string',
            description: 'Search keywords (minimum 2 characters)',
            minLength: 2,
          },
          types: {
            type: 'array',
            description:
              'Filter by content types (defaults to ["tutorial", "topic", "course"])',
            items: {
              type: 'string',
              enum: ['tutorial', 'topic', 'course', 'video', 'guide'],
            },
          },
          drupal_version: {
            type: 'array',
            description: 'Filter by Drupal versions',
            items: {
              type: 'string',
              enum: ['9', '10', '11'],
            },
          },
          category: {
            type: 'array',
            description: 'Filter by tutorial categories/tags',
            items: {
              type: 'string',
            },
          },
          sort: {
            type: 'string',
            description: 'Sort results by relevance, date, or title',
            enum: ['search_api_relevance', 'created', 'changed', 'title'],
          },
          page: {
            type: 'object',
            description: 'Pagination settings',
            properties: {
              limit: {
                type: 'number',
                description: 'Number of results per page',
                minimum: 1,
                maximum: 100,
                default: 10,
              },
              offset: {
                type: 'number',
                description: 'Number of results to skip',
                minimum: 0,
                default: 0,
              },
            },
          },
        },
        required: ['keywords'],
      });
    });
  });

  describe('Tool Execution', () => {
    it('should execute search_tutorials tool successfully with new format', async () => {
      const params = {
        keywords: 'drupal configuration',
        types: ['tutorial', 'topic'],
        drupal_version: ['10'],
        category: ['config', 'settings'],
        sort: 'search_api_relevance',
        page: { limit: 10, offset: 0 },
      };

      const result = await (mcpServer as any).executeSearchTutorials(params);

      expect(result).toEqual({
        results: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            title: expect.stringContaining('drupal configuration'),
            url: expect.stringMatching(/^https?:\/\//),
            drupal_version: expect.arrayContaining(['10']),
            tags: expect.arrayContaining(['config', 'settings']),
          }),
        ]),
        total: expect.any(Number),
        facets: expect.any(Object),
        query: {
          keywords: 'drupal configuration',
          types: ['tutorial', 'topic'],
          drupal_version: ['10'],
          category: ['config', 'settings'],
          sort: 'search_api_relevance',
          page: { limit: 10, offset: 0 },
        },
      });
    });

    it('should handle search with minimal parameters', async () => {
      const params = { keywords: 'drupal theming' };
      const result = await (mcpServer as any).executeSearchTutorials(params);

      expect(result.query.drupal_version).toBeUndefined();
      expect(result.query.types).toEqual(['tutorial', 'topic', 'course']);
      expect(result.results[0].drupal_version).toEqual(['10', '11']);
    });

    it('should handle search without categories', async () => {
      const params = { keywords: 'drupal api' };
      const result = await (mcpServer as any).executeSearchTutorials(params);

      expect(result.query.category).toBeUndefined();
      expect(result.results[0].tags).toEqual(['tutorial', 'drupal']);
    });

    it('should filter results by drupal_version array', async () => {
      const params = {
        keywords: 'drupal api',
        drupal_version: ['9'],
      };

      const result = await (mcpServer as any).executeSearchTutorials(params);

      // Should return results filtered for Drupal 9
      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.results[0].drupal_version).toContain('9');
      expect(result.results[0].title).toContain('Drupal 9 specific');
    });

    it('should use new RPC method dme_mcp.search_content', async () => {
      // Since we're in test environment, this will use mock data
      // The test validates that the parameters are processed correctly
      const params = {
        keywords: 'test drupal configuration',
        types: ['tutorial'],
        drupal_version: ['10'],
        page: { limit: 5, offset: 0 },
      };

      const result = await (mcpServer as any).executeSearchTutorials(params);

      // Verify the result has the expected structure for new format
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('facets'); // New facets object
      expect(result).toHaveProperty('query');

      // Verify that query reflects the processed parameters
      expect(result.query).toEqual({
        keywords: 'test drupal configuration',
        types: ['tutorial'],
        drupal_version: ['10'],
        category: undefined,
        sort: 'search_api_relevance',
        page: { limit: 5, offset: 0 },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully through executeTool', async () => {
      const invalidParams = { keywords: 'x' }; // Too short

      const result = await (mcpServer as any).executeTool(
        'search_tutorials',
        invalidParams
      );

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.message).toContain('keywords');
    });

    it('should handle missing parameters through executeTool', async () => {
      const result = await (mcpServer as any).executeTool(
        'search_tutorials',
        {}
      );

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.message).toContain('keywords');
    });

    it('should handle invalid argument types through executeTool', async () => {
      const result = await (mcpServer as any).executeTool(
        'search_tutorials',
        'invalid'
      );

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.message).toContain('Invalid arguments');
    });

    it('should handle invalid types parameter', async () => {
      const invalidParams = {
        keywords: 'test',
        types: ['invalid-type'],
      };

      const result = await (mcpServer as any).executeTool(
        'search_tutorials',
        invalidParams
      );

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.message).toContain('types');
    });

    it('should handle invalid drupal_version array', async () => {
      const invalidParams = {
        keywords: 'test',
        drupal_version: ['8'], // Invalid version
      };

      const result = await (mcpServer as any).executeTool(
        'search_tutorials',
        invalidParams
      );

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.message).toContain('drupal_version');
    });
  });

  describe('Response Format', () => {
    it('should return response in correct MCP tool format', async () => {
      const params = { keywords: 'drupal basics' };
      const result = await (mcpServer as any).executeTool(
        'search_tutorials',
        params
      );

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      // Parse the JSON response
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData).toHaveProperty('results');
      expect(responseData).toHaveProperty('total');
      expect(responseData).toHaveProperty('facets'); // New facets object
      expect(responseData).toHaveProperty('query');
    });

    it('should return structured tutorial data with new format', async () => {
      const params = { keywords: 'drupal modules' };
      const result = await (mcpServer as any).executeSearchTutorials(params);

      const tutorial = result.results[0];
      expect(tutorial).toHaveProperty('id');
      expect(tutorial).toHaveProperty('title');
      expect(tutorial).toHaveProperty('url');
      expect(tutorial).toHaveProperty('description');
      expect(tutorial).toHaveProperty('drupal_version');
      expect(tutorial).toHaveProperty('tags');
      expect(tutorial).toHaveProperty('difficulty');
      expect(tutorial).toHaveProperty('created');
      expect(tutorial).toHaveProperty('updated');

      // Validate required fields
      expect(tutorial.id).toBeTruthy();
      expect(tutorial.title).toBeTruthy();
      expect(tutorial.url).toMatch(/^https?:\/\//);
      expect(tutorial.created).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include facets in response', async () => {
      const params = { keywords: 'drupal configuration' };
      const result = await (mcpServer as any).executeSearchTutorials(params);

      expect(result).toHaveProperty('facets');
      expect(result.facets).toBeDefined();
      expect(typeof result.facets).toBe('object');
    });

    it('should include query object with new parameter structure', async () => {
      const params = {
        keywords: 'drupal testing',
        types: ['tutorial'],
        drupal_version: ['10', '11'],
        sort: 'created',
      };

      const result = await (mcpServer as any).executeSearchTutorials(params);

      expect(result.query).toEqual({
        keywords: 'drupal testing',
        types: ['tutorial'],
        drupal_version: ['10', '11'],
        category: undefined,
        sort: 'created',
        page: { limit: 10, offset: 0 },
      });
    });
  });
});

describe('Integration with MCP Server', () => {
  let mcpServer: DrupalMcpServer;

  beforeEach(() => {
    mcpServer = new DrupalMcpServer(mockConfig);
  });

  afterEach(async () => {
    await mcpServer.close();
  });

  it('should be available in tools list', () => {
    const tools = (mcpServer as any).getTools();
    const toolNames = tools.map((tool: any) => tool.name);

    expect(toolNames).toContain('search_tutorials');
  });

  it('should execute through the standard tool execution flow with new format', async () => {
    const result = await (mcpServer as any).executeTool('search_tutorials', {
      keywords: 'drupal testing',
      drupal_version: ['11'],
    });

    expect(result.content[0].type).toBe('text');

    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.query.keywords).toBe('drupal testing');
    expect(responseData.query.drupal_version).toEqual(['11']);
    expect(responseData).toHaveProperty('facets'); // New facets object
  });

  it('should validate complete search workflow with new parameters', async () => {
    const searchParams = {
      keywords: 'drupal configuration management',
      types: ['tutorial', 'guide'],
      drupal_version: ['10', '11'],
      category: ['config', 'admin'],
      sort: 'search_api_relevance',
      page: { limit: 20, offset: 10 },
    };

    const result = await (mcpServer as any).executeTool(
      'search_tutorials',
      searchParams
    );

    expect(result.content[0].type).toBe('text');
    const responseData = JSON.parse(result.content[0].text);

    // Validate complete parameter transformation
    expect(responseData.query).toMatchObject({
      keywords: 'drupal configuration management',
      types: ['tutorial', 'guide'],
      drupal_version: ['10', '11'],
      category: ['config', 'admin'],
      sort: 'search_api_relevance',
      page: { limit: 20, offset: 10 },
    });

    // Validate response structure
    expect(responseData).toHaveProperty('results');
    expect(responseData).toHaveProperty('total');
    expect(responseData).toHaveProperty('facets');
    expect(Array.isArray(responseData.results)).toBe(true);
  });
});
