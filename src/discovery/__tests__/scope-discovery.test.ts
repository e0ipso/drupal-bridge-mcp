/**
 * Tests for OAuth Scope Discovery and Validation
 *
 * Covers scope extraction from tool metadata, auth level inference,
 * and runtime access validation.
 *
 * Testing Strategy:
 * - Write a few tests, mostly integration
 * - Focus on custom business logic (scope extraction, validation)
 * - Test both positive and negative cases
 * - Verify error message content
 */

import nock from 'nock';
import {
  discoverTools,
  extractRequiredScopes,
  validateToolAccess,
  getAuthLevel,
  type ToolDefinition,
} from '../tool-discovery.js';

const MOCK_DRUPAL_URL = 'https://mock-drupal.test';

describe('Scope Discovery', () => {
  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should extract scopes from tool definitions', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, {
        tools: [
          {
            name: 'content.list',
            description: 'List content',
            inputSchema: { type: 'object', properties: {} },
            annotations: {
              auth: {
                scopes: ['content:read'],
              },
            },
          },
          {
            name: 'content.create',
            description: 'Create content',
            inputSchema: { type: 'object', properties: {} },
            annotations: {
              auth: {
                scopes: ['content:write'],
              },
            },
          },
        ],
      });

    const tools = await discoverTools(MOCK_DRUPAL_URL);
    const scopes = extractRequiredScopes(tools);

    expect(scopes).toContain('content:read');
    expect(scopes).toContain('content:write');
    expect(scopes).toHaveLength(2);
  });

  it('should return empty array when no tools have auth scopes', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, {
        tools: [
          {
            name: 'public.tool',
            description: 'Public tool',
            inputSchema: { type: 'object', properties: {} },
            // No auth metadata
          },
        ],
      });

    const tools = await discoverTools(MOCK_DRUPAL_URL);
    const scopes = extractRequiredScopes(tools);

    expect(scopes).toEqual([]);
  });

  it('should deduplicate scopes', () => {
    const tools: ToolDefinition[] = [
      {
        name: 'tool1',
        description: 'Tool 1',
        inputSchema: { type: 'object', properties: {} },
        annotations: {
          auth: {
            scopes: ['content:read', 'content:write'],
          },
        },
      },
      {
        name: 'tool2',
        description: 'Tool 2',
        inputSchema: { type: 'object', properties: {} },
        annotations: {
          auth: {
            scopes: ['content:read'], // Duplicate
          },
        },
      },
    ];

    const scopes = extractRequiredScopes(tools);

    // Verify no duplicates
    const uniqueScopes = new Set(scopes);
    expect(scopes.length).toBe(uniqueScopes.size);

    // Verify all expected scopes present
    expect(scopes).toContain('content:read');
    expect(scopes).toContain('content:write');
    expect(scopes).toHaveLength(2);
  });

  it('should validate tool access with correct scopes', () => {
    const tool: ToolDefinition = {
      name: 'content.list',
      description: 'List content',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        auth: {
          scopes: ['content:read'],
        },
      },
    };

    expect(() => {
      validateToolAccess(tool, ['profile', 'content:read']);
    }).not.toThrow();
  });

  it('should reject tool access with missing scopes', () => {
    const tool: ToolDefinition = {
      name: 'content.create',
      description: 'Create content',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        auth: {
          scopes: ['content:write'],
        },
      },
    };

    expect(() => {
      validateToolAccess(tool, ['profile', 'content:read']);
    }).toThrow(/Insufficient OAuth scopes/);
  });

  it('should allow anonymous access to public tools', () => {
    const tool: ToolDefinition = {
      name: 'public.hello',
      description: 'Public tool',
      inputSchema: { type: 'object', properties: {} },
      // No auth field
    };

    expect(() => {
      validateToolAccess(tool, []);
    }).not.toThrow();
  });

  it('should infer auth level as required when scopes present', () => {
    const authMetadata = {
      scopes: ['content:read'],
      // No explicit level
    };

    expect(getAuthLevel(authMetadata)).toBe('required');
  });

  it('should return explicit auth level when provided', () => {
    const authMetadata = {
      level: 'optional' as const,
      scopes: ['content:read'],
    };

    expect(getAuthLevel(authMetadata)).toBe('optional');
  });

  it('should return none for undefined auth metadata', () => {
    expect(getAuthLevel(undefined)).toBe('none');
  });

  it('should return none when no scopes and no level', () => {
    const authMetadata = {
      description: 'No scopes',
    };

    expect(getAuthLevel(authMetadata)).toBe('none');
  });

  it('should include missing scopes in error message', () => {
    const tool: ToolDefinition = {
      name: 'content.create',
      description: 'Create content',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        auth: {
          scopes: ['content:write', 'content:delete'],
        },
      },
    };

    expect(() => {
      validateToolAccess(tool, ['profile', 'content:read']);
    }).toThrow(/Missing:.*content:write.*content:delete/s);
  });

  it('should list current scopes in error message', () => {
    const tool: ToolDefinition = {
      name: 'content.create',
      description: 'Create content',
      inputSchema: { type: 'object', properties: {} },
      annotations: {
        auth: {
          scopes: ['content:write'],
        },
      },
    };

    expect(() => {
      validateToolAccess(tool, ['profile', 'content:read']);
    }).toThrow(/Current:.*profile.*content:read/s);
  });
});
