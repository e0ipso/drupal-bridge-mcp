/**
 * Tests for search_tutorials MCP tool functionality
 */

import { DrupalMcpServer } from '@/mcp/server.js';
import { validateSearchToolParams, ValidationError } from '@/utils/validation.js';
import type { AppConfig } from '@/config/index.js';
import type { SearchTutorialsResponse, ProcessedSearchParams } from '@/types/index.js';

// Mock configuration for testing
const mockConfig: AppConfig = {
  drupal: {
    baseUrl: 'http://localhost/drupal',
    endpoint: '/jsonrpc',
    timeout: 10000,
    retries: 3,
  },
  mcp: {
    name: 'test-mcp-server',
    version: '1.0.0',
    capabilities: {
      tools: { listChanged: true },
      resources: { subscribe: true },
      prompts: { listChanged: true },
    },
  },
  environment: 'test',
  logLevel: 'info',
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
    describe('validateSearchToolParams', () => {
      it('should validate valid parameters successfully', () => {
        const validParams = {
          query: 'drupal configuration',
          drupal_version: '10',
          tags: ['configuration', 'settings'],
        };

        const result = validateSearchToolParams(validParams);

        expect(result).toEqual({
          query: 'drupal configuration',
          drupal_version: '10',
          tags: ['configuration', 'settings'],
        });
      });

      it('should validate minimal parameters (query only)', () => {
        const minimalParams = { query: 'test' };
        const result = validateSearchToolParams(minimalParams);

        expect(result).toEqual({
          query: 'test',
          drupal_version: null,
          tags: [],
        });
      });

      it('should throw ValidationError for missing query', () => {
        expect(() => validateSearchToolParams({})).toThrow(ValidationError);
        expect(() => validateSearchToolParams({ query: '' })).toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid query type', () => {
        expect(() => validateSearchToolParams({ query: 123 })).toThrow(ValidationError);
        expect(() => validateSearchToolParams({ query: null })).toThrow(ValidationError);
      });

      it('should throw ValidationError for query too short', () => {
        expect(() => validateSearchToolParams({ query: 'a' })).toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid drupal_version', () => {
        expect(() => validateSearchToolParams({
          query: 'test',
          drupal_version: '8',
        })).toThrow(ValidationError);

        expect(() => validateSearchToolParams({
          query: 'test',
          drupal_version: 123,
        })).toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid tags type', () => {
        expect(() => validateSearchToolParams({
          query: 'test',
          tags: 'not-array',
        })).toThrow(ValidationError);
      });

      it('should filter and normalize tags', () => {
        const params = {
          query: 'test',
          tags: ['Config', 'SETTINGS', '', 'config', '  spaces  ', 123, null],
        };

        const result = validateSearchToolParams(params);

        expect(result.tags).toEqual(['config', 'settings', 'spaces']);
      });

      it('should trim and normalize query', () => {
        const params = { query: '  drupal configuration  ' };
        const result = validateSearchToolParams(params);

        expect(result.query).toBe('drupal configuration');
      });
    });
  });

  describe('Tool Registration', () => {
    it('should register search_tutorials tool in tools list', () => {
      const server = mcpServer.getServer();
      const tools = (mcpServer as any).getTools();

      const searchTutorialsTool = tools.find((tool: any) => tool.name === 'search_tutorials');
      expect(searchTutorialsTool).toBeDefined();
      expect(searchTutorialsTool.description).toContain('Search Drupalize.me tutorials');
    });

    it('should have correct tool schema', () => {
      const tools = (mcpServer as any).getTools();
      const searchTutorialsTool = tools.find((tool: any) => tool.name === 'search_tutorials');

      expect(searchTutorialsTool.inputSchema).toEqual({
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query string (minimum 2 characters)',
            minLength: 2,
          },
          drupal_version: {
            type: 'string',
            description: 'Filter by Drupal version',
            enum: ['9', '10', '11'],
          },
          tags: {
            type: 'array',
            description: 'Filter by tutorial tags',
            items: {
              type: 'string',
            },
          },
        },
        required: ['query'],
      });
    });
  });

  describe('Tool Execution', () => {
    it('should execute search_tutorials tool successfully', async () => {
      const params = {
        query: 'drupal configuration',
        drupal_version: '10',
        tags: ['config', 'settings'],
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
        page: 1,
        limit: 10,
        query: {
          query: 'drupal configuration',
          drupal_version: '10',
          tags: ['config', 'settings'],
        },
      });
    });

    it('should handle search without drupal_version filter', async () => {
      const params = { query: 'drupal theming' };
      const result = await (mcpServer as any).executeSearchTutorials(params);

      expect(result.query.drupal_version).toBeNull();
      expect(result.results[0].drupal_version).toEqual(['10', '11']);
    });

    it('should handle search without tags', async () => {
      const params = { query: 'drupal api' };
      const result = await (mcpServer as any).executeSearchTutorials(params);

      expect(result.query.tags).toEqual([]);
      expect(result.results[0].tags).toEqual(['tutorial', 'drupal']);
    });

    it('should filter results by drupal_version', async () => {
      const params = {
        query: 'drupal api',
        drupal_version: '9',
      };

      const result = await (mcpServer as any).executeSearchTutorials(params);

      // Should return results filtered for Drupal 9
      expect(result.results).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.results[0].drupal_version).toContain('9');
      expect(result.results[0].title).toContain('Drupal 9 specific');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors gracefully through executeTool', async () => {
      const invalidParams = { query: 'x' }; // Too short

      const result = await (mcpServer as any).executeTool('search_tutorials', invalidParams);

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.details.field).toBe('query');
      expect(errorResponse.error.message).toContain('query parameter');
    });

    it('should handle missing parameters through executeTool', async () => {
      const result = await (mcpServer as any).executeTool('search_tutorials', {});

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.details.field).toBe('query');
      expect(errorResponse.error.message).toContain('query parameter');
    });

    it('should handle invalid argument types through executeTool', async () => {
      const result = await (mcpServer as any).executeTool('search_tutorials', 'invalid');

      const errorResponse = JSON.parse(result.content[0].text);
      expect(errorResponse.error.type).toBe('VALIDATION_ERROR');
      expect(errorResponse.error.message).toContain('Invalid request parameters');
    });
  });

  describe('Response Format', () => {
    it('should return response in correct MCP tool format', async () => {
      const params = { query: 'drupal basics' };
      const result = await (mcpServer as any).executeTool('search_tutorials', params);

      expect(result).toHaveProperty('content');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect(result.content[0]).toHaveProperty('text');

      // Parse the JSON response
      const responseData = JSON.parse(result.content[0].text);
      expect(responseData).toHaveProperty('results');
      expect(responseData).toHaveProperty('total');
      expect(responseData).toHaveProperty('page');
      expect(responseData).toHaveProperty('limit');
      expect(responseData).toHaveProperty('query');
    });

    it('should return structured tutorial data', async () => {
      const params = { query: 'drupal modules' };
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

  it('should execute through the standard tool execution flow', async () => {
    const result = await (mcpServer as any).executeTool('search_tutorials', {
      query: 'drupal testing',
      drupal_version: '11',
    });

    expect(result.content[0].type).toBe('text');
    
    const responseData = JSON.parse(result.content[0].text);
    expect(responseData.query.query).toBe('drupal testing');
    expect(responseData.query.drupal_version).toBe('11');
  });
});