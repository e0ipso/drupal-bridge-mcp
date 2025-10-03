/**
 * Integration Tests for Tool Discovery and Dynamic Registration
 *
 * These tests verify the complete flow from discovery to tool invocation
 * using mocked HTTP endpoints.
 *
 * Testing Strategy:
 * - Write a few tests, mostly integration
 * - Focus on custom business logic and critical workflows
 * - Avoid testing third-party libraries (zod-from-json-schema, MCP SDK)
 * - Combine related scenarios in single test file
 */

import nock from 'nock';
import { discoverTools } from '../tool-discovery.js';
import { registerDynamicTools } from '../dynamic-handlers.js';
import { getDiscoveredTools, clearToolCache } from '../tool-cache.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const MOCK_DRUPAL_URL = 'https://mock-drupal.test';

// Sample tool definitions for testing (5+ tools as per requirements)
const SAMPLE_TOOLS = [
  {
    name: 'test_tool_simple',
    description: 'A simple test tool',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
      },
      required: ['message'],
    },
    title: 'Simple Test Tool',
    outputSchema: {
      type: 'object',
      properties: {
        result: { type: 'string' },
      },
    },
  },
  {
    name: 'test_tool_auth',
    description: 'A test tool requiring auth',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string' },
      },
      required: ['data'],
    },
  },
  {
    name: 'test_tool_complex',
    description: 'A tool with complex schema',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        items: {
          type: 'array',
          items: { type: 'string' },
        },
        metadata: {
          type: 'object',
          properties: {
            author: { type: 'string' },
          },
        },
      },
      required: ['id', 'items'],
    },
    annotations: {
      category: 'test',
      complexity: 'high',
    },
  },
  {
    name: 'test_tool_optional',
    description: 'A tool with all optional params',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string' },
      },
    },
  },
  {
    name: 'test_tool_auth_complex',
    description: 'An authenticated tool with complex params',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string' },
        parameters: { type: 'object' },
      },
      required: ['action'],
    },
  },
];

// Clean up after each test
afterEach(() => {
  nock.cleanAll();
  clearToolCache();
});

describe('Tool Discovery', () => {
  test('successfully discovers tools from endpoint', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    expect(tools).toHaveLength(5);
    expect(tools[0]?.name).toBe('test_tool_simple');
    expect(tools[0]?.title).toBe('Simple Test Tool');
    expect(tools[0]?.outputSchema).toBeDefined();
    expect(tools[2]?.name).toBe('test_tool_complex');
    expect(tools[2]?.annotations).toEqual({
      category: 'test',
      complexity: 'high',
    });
  });

  test('throws error on HTTP 404', async () => {
    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(404);

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(/HTTP 404/);
  });

  test('throws error on invalid JSON', async () => {
    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(200, 'not json');

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(
      /Invalid JSON/
    );
  });

  test('throws error on empty tools array', async () => {
    nock(MOCK_DRUPAL_URL).get('/mcp/tools/list').reply(200, { tools: [] });

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(
      /No tools returned/
    );
  });

  test('throws error on missing required field', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, {
        tools: [
          {
            name: 'incomplete_tool',
            description: 'Missing fields',
            // Missing: inputSchema
          },
        ],
      });

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(
      /missing required field/
    );
  });

  test('throws error on invalid tool name', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, {
        tools: [
          {
            name: '',
            description: 'Empty name',
            inputSchema: { type: 'object' },
          },
        ],
      });

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(
      /invalid name: must be non-empty string/
    );
  });

  test('throws error on invalid description', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, {
        tools: [
          {
            name: 'test_tool',
            description: '',
            inputSchema: { type: 'object' },
          },
        ],
      });

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(
      /invalid description: must be non-empty string/
    );
  });

  test('handles timeout', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .delay(6000) // Longer than 5s timeout
      .reply(200, { tools: SAMPLE_TOOLS });

    await expect(discoverTools(MOCK_DRUPAL_URL)).rejects.toThrow(
      /timed out|aborted/i
    );
  }, 10000); // Increase Jest timeout for this test

  test('includes OAuth token in request when provided', async () => {
    const scope = nock(MOCK_DRUPAL_URL, {
      reqheaders: {
        authorization: 'Bearer test-token-123',
      },
    })
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    await discoverTools(MOCK_DRUPAL_URL, 'test-token-123');

    expect(scope.isDone()).toBe(true);
  });

  test('normalizes empty properties array to empty object', async () => {
    const toolWithEmptyPropertiesArray = {
      name: 'test_tool_empty_props',
      description: 'Tool with empty properties array',
      inputSchema: {
        type: 'object',
        properties: [], // Drupal backend quirk - should be {}
      },
    };

    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: [toolWithEmptyPropertiesArray] });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    expect(tools).toHaveLength(1);
    expect(tools[0]?.inputSchema.properties).toEqual({}); // Normalized to object
    expect(Array.isArray(tools[0]?.inputSchema.properties)).toBe(false);
  });
});

describe('Tool Caching', () => {
  test('returns cached tools on second call', async () => {
    const scope = nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .once() // Only mock one request
      .reply(200, { tools: SAMPLE_TOOLS });

    // First call - fetches from endpoint
    const tools1 = await getDiscoveredTools(MOCK_DRUPAL_URL);
    expect(tools1).toHaveLength(5);

    // Second call - should use cache (no HTTP request)
    const tools2 = await getDiscoveredTools(MOCK_DRUPAL_URL);
    expect(tools2).toHaveLength(5);

    expect(scope.isDone()).toBe(true); // Only one request made
  });

  test('bypasses cache with forceFresh parameter', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .twice() // Expect two requests
      .reply(200, { tools: SAMPLE_TOOLS });

    await getDiscoveredTools(MOCK_DRUPAL_URL);
    await getDiscoveredTools(MOCK_DRUPAL_URL, undefined, true); // Force fresh

    // Both requests should have been made
  });

  test('cache is cleared by clearToolCache', async () => {
    const scope = nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .twice()
      .reply(200, { tools: SAMPLE_TOOLS });

    await getDiscoveredTools(MOCK_DRUPAL_URL);
    clearToolCache();
    await getDiscoveredTools(MOCK_DRUPAL_URL);

    expect(scope.isDone()).toBe(true); // Two requests made
  });

  test('handles custom TTL from environment variable', async () => {
    const originalTTL = process.env.TOOL_CACHE_TTL_MS;
    process.env.TOOL_CACHE_TTL_MS = '100'; // 100ms TTL

    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .twice()
      .reply(200, { tools: SAMPLE_TOOLS });

    clearToolCache(); // Clear cache first
    await getDiscoveredTools(MOCK_DRUPAL_URL);

    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should fetch again since cache expired
    await getDiscoveredTools(MOCK_DRUPAL_URL);

    // Restore original value
    if (originalTTL) {
      process.env.TOOL_CACHE_TTL_MS = originalTTL;
    } else {
      delete process.env.TOOL_CACHE_TTL_MS;
    }
    clearToolCache();
  });

  test('handles invalid TTL environment variable', async () => {
    const originalTTL = process.env.TOOL_CACHE_TTL_MS;
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

    process.env.TOOL_CACHE_TTL_MS = 'invalid';

    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    clearToolCache();
    await getDiscoveredTools(MOCK_DRUPAL_URL);

    // Should have logged warning about invalid TTL
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid TOOL_CACHE_TTL_MS')
    );

    warnSpy.mockRestore();
    if (originalTTL) {
      process.env.TOOL_CACHE_TTL_MS = originalTTL;
    } else {
      delete process.env.TOOL_CACHE_TTL_MS;
    }
    clearToolCache();
  });
});

describe('Schema Conversion and Dynamic Registration', () => {
  test('converts valid JSON Schema to Zod and registers handlers', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    // Schema conversion happens in registerDynamicTools
    const mockServer = {
      setRequestHandler: jest.fn(),
    } as unknown as Server;
    const mockMakeRequest = jest.fn();
    const mockGetSession = jest.fn();

    // This should not throw and should register handler
    registerDynamicTools(mockServer, tools, mockMakeRequest, mockGetSession);

    expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(1);
  });

  test('skips tool with invalid schema but continues with valid tools', async () => {
    // Mock normal tools first
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    // Create a circular reference that will cause Zod conversion to fail
    const circularSchema: any = {
      type: 'object',
      properties: {},
    };
    circularSchema.properties.self = circularSchema;

    // Add the invalid tool directly to the array
    const toolsWithInvalidSchema = [
      ...tools,
      {
        name: 'invalid_schema_tool',
        description: 'Has invalid schema',
        inputSchema: circularSchema,
      },
    ];

    const mockServer = {
      setRequestHandler: jest.fn(),
    } as unknown as Server;
    const mockMakeRequest = jest.fn();
    const mockGetSession = jest.fn();

    // Should log warning but not throw
    const warnMock = jest.fn();
    const originalWarn = console.warn;
    console.warn = warnMock;

    registerDynamicTools(
      mockServer,
      toolsWithInvalidSchema,
      mockMakeRequest,
      mockGetSession
    );

    console.warn = originalWarn;

    // Handler should still be registered (for valid tools)
    expect(mockServer.setRequestHandler).toHaveBeenCalled();

    // Should have logged a warning about invalid schema
    const warnCalls = warnMock.mock.calls.map(c => c.join(' '));
    const hasWarning = warnCalls.some(call =>
      call.includes('invalid_schema_tool')
    );
    expect(hasWarning).toBe(true);
  });

  test('throws error if all tools have invalid schemas', async () => {
    // Create a circular reference that will cause Zod conversion to fail
    const circularSchema: any = {
      type: 'object',
      properties: {},
    };
    circularSchema.properties.self = circularSchema;

    // Create invalid tools array directly (not through nock)
    const invalidTools = [
      {
        name: 'invalid_tool',
        description: 'Invalid schema',
        inputSchema: circularSchema,
      },
    ];

    const mockServer = {
      setRequestHandler: jest.fn(),
    } as unknown as Server;
    const mockMakeRequest = jest.fn();
    const mockGetSession = jest.fn();

    // Should throw because no valid tools remain
    expect(() => {
      registerDynamicTools(
        mockServer,
        invalidTools,
        mockMakeRequest,
        mockGetSession
      );
    }).toThrow(/No valid tools/);
  });
});

describe('Tool Invocation and OAuth', () => {
  test('successfully invokes tool without auth', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    const mockMakeRequest = jest.fn().mockResolvedValue({ result: 'success' });
    const mockGetSession = jest.fn();

    let capturedHandler: any;
    const mockServer = {
      setRequestHandler: jest.fn((schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as Server;

    registerDynamicTools(mockServer, tools, mockMakeRequest, mockGetSession);

    // Invoke the tool
    const result = await capturedHandler({
      params: {
        name: 'test_tool_simple',
        arguments: { message: 'Hello' },
      },
    });

    expect(mockMakeRequest).toHaveBeenCalledWith(
      'test_tool_simple',
      { message: 'Hello' },
      undefined
    );
    expect(result.content[0]?.text).toContain('success');
  });

  test('invokes tool with OAuth token when session is available', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    const mockMakeRequest = jest
      .fn()
      .mockResolvedValue({ result: 'authenticated success' });
    const mockGetSession = jest.fn().mockResolvedValue({
      accessToken: 'test-oauth-token',
      expiresAt: Date.now() + 3600000,
    });

    let capturedHandler: any;
    const mockServer = {
      setRequestHandler: jest.fn((schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as Server;

    registerDynamicTools(mockServer, tools, mockMakeRequest, mockGetSession);

    // Invoke tool with session
    const result = await capturedHandler(
      {
        params: {
          name: 'test_tool_auth',
          arguments: { data: 'secure-data' },
        },
      },
      { sessionId: 'test-session-123' }
    );

    expect(mockGetSession).toHaveBeenCalledWith('test-session-123');
    expect(mockMakeRequest).toHaveBeenCalledWith(
      'test_tool_auth',
      { data: 'secure-data' },
      'test-oauth-token'
    );
    expect(result.content[0]?.text).toContain('authenticated success');
  });

  test('invokes tool without token when no session provided', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    const mockMakeRequest = jest.fn().mockResolvedValue({ result: 'success' });
    const mockGetSession = jest.fn();

    let capturedHandler: any;
    const mockServer = {
      setRequestHandler: jest.fn((schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as Server;

    registerDynamicTools(mockServer, tools, mockMakeRequest, mockGetSession);

    // Invoke tool without session (let Drupal handle auth)
    await capturedHandler({
      params: {
        name: 'test_tool_auth',
        arguments: { data: 'secure-data' },
      },
    });

    expect(mockMakeRequest).toHaveBeenCalledWith(
      'test_tool_auth',
      { data: 'secure-data' },
      undefined
    );
  });

  test('invokes tool without token when session is invalid', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    const mockMakeRequest = jest.fn().mockResolvedValue({ result: 'success' });
    const mockGetSession = jest.fn().mockResolvedValue(null);

    let capturedHandler: any;
    const mockServer = {
      setRequestHandler: jest.fn((schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as Server;

    registerDynamicTools(mockServer, tools, mockMakeRequest, mockGetSession);

    // Invoke tool with expired session (let Drupal handle auth)
    await capturedHandler(
      {
        params: {
          name: 'test_tool_auth',
          arguments: { data: 'secure-data' },
        },
      },
      { sessionId: 'expired-session' }
    );

    expect(mockGetSession).toHaveBeenCalledWith('expired-session');
    expect(mockMakeRequest).toHaveBeenCalledWith(
      'test_tool_auth',
      { data: 'secure-data' },
      undefined
    );
  });

  test('validates parameters and rejects invalid input', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    const mockMakeRequest = jest.fn();
    const mockGetSession = jest.fn();

    let capturedHandler: any;
    const mockServer = {
      setRequestHandler: jest.fn((schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as Server;

    registerDynamicTools(mockServer, tools, mockMakeRequest, mockGetSession);

    // Try to invoke tool with missing required parameter
    await expect(
      capturedHandler({
        params: {
          name: 'test_tool_simple',
          arguments: {}, // Missing required 'message' field
        },
      })
    ).rejects.toThrow(/Invalid parameters/);
  });

  test('throws error for unknown tool name', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    const mockMakeRequest = jest.fn();
    const mockGetSession = jest.fn();

    let capturedHandler: any;
    const mockServer = {
      setRequestHandler: jest.fn((schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as Server;

    registerDynamicTools(mockServer, tools, mockMakeRequest, mockGetSession);

    // Try to invoke non-existent tool
    await expect(
      capturedHandler({
        params: {
          name: 'nonexistent_tool',
          arguments: {},
        },
      })
    ).rejects.toThrow(/Unknown tool/);
  });

  test('handles Drupal request errors gracefully', async () => {
    nock(MOCK_DRUPAL_URL)
      .get('/mcp/tools/list')
      .reply(200, { tools: SAMPLE_TOOLS });

    const tools = await discoverTools(MOCK_DRUPAL_URL);

    const mockMakeRequest = jest
      .fn()
      .mockRejectedValue(new Error('Drupal connection failed'));
    const mockGetSession = jest.fn();

    let capturedHandler: any;
    const mockServer = {
      setRequestHandler: jest.fn((schema, handler) => {
        capturedHandler = handler;
      }),
    } as unknown as Server;

    registerDynamicTools(mockServer, tools, mockMakeRequest, mockGetSession);

    // Try to invoke tool when Drupal backend is down
    await expect(
      capturedHandler({
        params: {
          name: 'test_tool_simple',
          arguments: { message: 'Hello' },
        },
      })
    ).rejects.toThrow(/execution failed.*Drupal connection failed/);
  });
});
