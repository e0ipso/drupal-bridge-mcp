/**
 * Tool Registry Unit Tests
 * 
 * Comprehensive test suite for the tool registry system including
 * registration, discovery, validation, and invocation functionality.
 */

import { ToolRegistry } from '../tool-registry';
import { SchemaValidator } from '../schema-validator';
import { ToolCapabilityDiscoverer, createCapabilityDiscoverer } from '../capability-discoverer';
import { ToolRegistryManager, createToolRegistryManager } from '../tool-registry-manager';
import type {
  ExtendedTool,
  ToolRegistrationRequest,
  ToolInvocationContext,
  CallToolResult,
  ToolHandler,
  ToolCapabilities,
  ToolAvailability
} from '../types';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(async () => {
    registry = new ToolRegistry({
      maxTools: 100,
      enableMetrics: true,
      strictValidation: true
    });
  });

  afterEach(async () => {
    await registry.clear();
  });

  describe('Tool Registration', () => {
    test('should register a basic tool successfully', async () => {
      const tool: ExtendedTool = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          },
          required: ['input']
        },
        handler: async (params) => ({
          content: [{ type: 'text', text: `Processed: ${params.input}` }]
        })
      };

      const request: ToolRegistrationRequest = {
        tool,
        validate: true
      };

      const result = await registry.registerTool(request);

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('test_tool');
      expect(result.error).toBeUndefined();
    });

    test('should reject invalid tool definitions', async () => {
      const invalidTool: ExtendedTool = {
        name: '', // Invalid empty name
        description: 'A test tool',
        inputSchema: {
          type: 'object'
        },
        handler: async () => ({ content: [] })
      };

      const request: ToolRegistrationRequest = {
        tool: invalidTool,
        validate: true
      };

      const result = await registry.registerTool(request);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should prevent duplicate tool registration without replace flag', async () => {
      const tool: ExtendedTool = {
        name: 'duplicate_test',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [] })
      };

      // Register first time
      await registry.registerTool({ tool, validate: false });

      // Try to register again without replace
      const result = await registry.registerTool({ tool, validate: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    test('should allow tool replacement with replace flag', async () => {
      const tool: ExtendedTool = {
        name: 'replaceable_test',
        description: 'A test tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [] })
      };

      // Register first time
      await registry.registerTool({ tool, validate: false });

      // Replace with updated tool
      const updatedTool: ExtendedTool = {
        ...tool,
        description: 'Updated test tool'
      };

      const result = await registry.registerTool({ 
        tool: updatedTool, 
        replace: true,
        validate: false 
      });

      expect(result.success).toBe(true);

      // Verify the tool was updated
      const retrievedTool = await registry.getTool('replaceable_test');
      expect(retrievedTool?.description).toBe('Updated test tool');
    });
  });

  describe('Tool Discovery', () => {
    beforeEach(async () => {
      // Register test tools
      const tools: ExtendedTool[] = [
        {
          name: 'search_tool',
          description: 'Search functionality',
          category: 'search',
          tags: ['data', 'query'],
          inputSchema: { type: 'object' },
          handler: async () => ({ content: [] })
        },
        {
          name: 'format_tool',
          description: 'Format data',
          category: 'utility',
          tags: ['format', 'data'],
          inputSchema: { type: 'object' },
          handler: async () => ({ content: [] })
        },
        {
          name: 'auth_tool',
          description: 'Authentication',
          category: 'auth',
          requiresAuth: true,
          inputSchema: { type: 'object' },
          handler: async () => ({ content: [] })
        }
      ];

      for (const tool of tools) {
        await registry.registerTool({ tool, validate: false });
      }
    });

    test('should list all tools', async () => {
      const result = await registry.listTools();

      expect(result.tools).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      expect(result.filteredCount).toBe(3);
    });

    test('should filter tools by category', async () => {
      const result = await registry.listTools({ category: 'search' });

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('search_tool');
      expect(result.filteredCount).toBe(1);
    });

    test('should filter tools by tags', async () => {
      const result = await registry.listTools({ tags: ['data'] });

      expect(result.tools).toHaveLength(2);
      expect(result.filteredCount).toBe(2);
    });

    test('should filter tools by authentication requirement', async () => {
      const result = await registry.listTools({ requiresAuth: true });

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('auth_tool');
    });

    test('should search tools by query', async () => {
      const result = await registry.searchTools('format');

      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('format_tool');
    });
  });

  describe('Tool Invocation', () => {
    let testTool: ExtendedTool;
    let mockHandler: jest.MockedFunction<ToolHandler>;

    beforeEach(async () => {
      mockHandler = jest.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'Test result' }]
      });

      testTool = {
        name: 'invocation_test',
        description: 'Test invocation',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        },
        handler: mockHandler
      };

      await registry.registerTool({ tool: testTool, validate: false });
    });

    test('should invoke tool successfully', async () => {
      const context: ToolInvocationContext = {
        toolName: 'invocation_test',
        connectionId: 'test-conn',
        requestId: 'test-req',
        timestamp: Date.now()
      };

      const result = await registry.invokeTool(
        {
          name: 'invocation_test',
          arguments: { message: 'Hello' }
        },
        context
      );

      expect(result.content).toEqual([{ type: 'text', text: 'Test result' }]);
      expect(mockHandler).toHaveBeenCalledWith(
        { message: 'Hello' },
        expect.objectContaining({
          toolName: 'invocation_test',
          connectionId: 'test-conn'
        })
      );
    });

    test('should validate parameters before invocation', async () => {
      const context: ToolInvocationContext = {
        toolName: 'invocation_test',
        connectionId: 'test-conn',
        requestId: 'test-req',
        timestamp: Date.now()
      };

      await expect(
        registry.invokeTool(
          {
            name: 'invocation_test',
            arguments: { invalid: 'param' } // Missing required 'message'
          },
          context
        )
      ).rejects.toThrow();

      expect(mockHandler).not.toHaveBeenCalled();
    });

    test('should handle tool not found', async () => {
      const context: ToolInvocationContext = {
        toolName: 'nonexistent_tool',
        connectionId: 'test-conn',
        requestId: 'test-req',
        timestamp: Date.now()
      };

      await expect(
        registry.invokeTool(
          {
            name: 'nonexistent_tool',
            arguments: {}
          },
          context
        )
      ).rejects.toThrow('not found');
    });
  });

  describe('Tool Availability', () => {
    test('should check tool availability', async () => {
      const tool: ExtendedTool = {
        name: 'availability_test',
        description: 'Availability test',
        inputSchema: { type: 'object' },
        availability: {
          available: true
        },
        handler: async () => ({ content: [] })
      };

      await registry.registerTool({ tool, validate: false });

      const available = await registry.isToolAvailable('availability_test');
      expect(available).toBe(true);
    });

    test('should respect availability configuration', async () => {
      const tool: ExtendedTool = {
        name: 'unavailable_test',
        description: 'Unavailable test',
        inputSchema: { type: 'object' },
        availability: {
          available: false,
          reason: 'Temporarily disabled'
        },
        handler: async () => ({ content: [] })
      };

      await registry.registerTool({ tool, validate: false });

      const available = await registry.isToolAvailable('unavailable_test');
      expect(available).toBe(false);
    });
  });

  describe('Registry Statistics', () => {
    test('should provide registry statistics', async () => {
      const tool: ExtendedTool = {
        name: 'stats_test',
        description: 'Statistics test',
        category: 'test',
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [] })
      };

      await registry.registerTool({ tool, validate: false });

      const stats = await registry.getStats();

      expect(stats.totalTools).toBe(1);
      expect(stats.categoryCounts.test).toBe(1);
      expect(stats.registryVersion).toBeDefined();
    });
  });
});

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator({
      maxTools: 100,
      defaultTimeout: 30000,
      enableMetrics: true,
      enableCaching: true,
      strictValidation: true,
      allowOverwrite: false
    });
  });

  describe('Tool Definition Validation', () => {
    test('should validate valid tool definition', async () => {
      const tool: ExtendedTool = {
        name: 'valid_tool',
        description: 'A valid tool',
        inputSchema: {
          type: 'object',
          properties: {
            input: { type: 'string' }
          }
        },
        handler: async () => ({ content: [] })
      };

      const result = await validator.validateToolDefinition(tool);

      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    test('should reject tool with invalid name', async () => {
      const tool: ExtendedTool = {
        name: '123invalid', // Names should start with letter
        description: 'Invalid tool',
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [] })
      };

      const result = await validator.validateToolDefinition(tool);

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    test('should validate JSON schema', async () => {
      const validationResult = await validator.validateJSONSchema({
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0 }
        }
      });

      expect(validationResult.isValid).toBe(true);
    });

    test('should reject invalid JSON schema', async () => {
      const validationResult = await validator.validateJSONSchema({
        type: 'object',
        properties: {
          invalid: { type: 'invalid_type' as any }
        }
      });

      expect(validationResult.isValid).toBe(false);
    });
  });

  describe('Data Validation', () => {
    test('should validate data against schema', async () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const },
          age: { type: 'number' as const }
        },
        required: ['name'] as const
      };

      const result = await validator.validateData(
        { name: 'John', age: 30 },
        schema
      );

      expect(result.isValid).toBe(true);
    });

    test('should reject invalid data', async () => {
      const schema = {
        type: 'object' as const,
        properties: {
          name: { type: 'string' as const }
        },
        required: ['name'] as const
      };

      const result = await validator.validateData(
        { age: 30 }, // Missing required 'name'
        schema
      );

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });
});

describe('ToolCapabilityDiscoverer', () => {
  let registry: ToolRegistry;
  let discoverer: ToolCapabilityDiscoverer;

  beforeEach(async () => {
    registry = new ToolRegistry();
    discoverer = createCapabilityDiscoverer(registry);

    // Register test tools with different capabilities
    const tools: ExtendedTool[] = [
      {
        name: 'streaming_tool',
        description: 'Streaming tool',
        category: 'data',
        capabilities: { streaming: true, cancellable: true },
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [] })
      },
      {
        name: 'batch_tool',
        description: 'Batch processing tool',
        category: 'processing',
        capabilities: { parallel: true, idempotent: true },
        inputSchema: { type: 'object' },
        handler: async () => ({ content: [] })
      }
    ];

    for (const tool of tools) {
      await registry.registerTool({ tool, validate: false });
    }
  });

  afterEach(async () => {
    await registry.clear();
  });

  test('should discover tools with capabilities', async () => {
    const result = await discoverer.discoverTools();

    expect(result.tools).toHaveLength(2);
    expect(result.tools[0].name).toBeDefined();
    expect(result.tools[0].inputSchema).toBeDefined();
  });

  test('should generate capability summary', async () => {
    const summary = await discoverer.getCapabilitySummary();

    expect(summary.supportedTools).toBe(2);
    expect(summary.categories).toContain('data');
    expect(summary.categories).toContain('processing');
    expect(summary.hasStreamingTools).toBe(true);
    expect(summary.capabilities.streaming).toBe(1);
    expect(summary.capabilities.parallel).toBe(1);
  });

  test('should filter tools by capability', async () => {
    const streamingTools = await discoverer.getToolsByCapability({
      streaming: true
    });

    expect(streamingTools).toHaveLength(1);
    expect(streamingTools[0].name).toBe('streaming_tool');
  });
});

describe('ToolRegistryManager', () => {
  let manager: ToolRegistryManager;

  beforeEach(async () => {
    manager = await createToolRegistryManager({
      maxTools: 100,
      enableMetrics: true,
      enableDiscovery: true
    });
  });

  afterEach(async () => {
    await manager.shutdown();
  });

  test('should initialize successfully', async () => {
    const stats = await manager.getStats();
    expect(stats).toBeDefined();
    expect(stats.totalTools).toBe(0);
  });

  test('should register tool with handler', async () => {
    const tool: Omit<ExtendedTool, 'handler'> = {
      name: 'manager_test',
      description: 'Manager test tool',
      inputSchema: { type: 'object' }
    };

    const handler: ToolHandler = async (params) => ({
      content: [{ type: 'text', text: 'Manager test result' }]
    });

    const result = await manager.registerToolWithHandler(tool, handler);

    expect(result.success).toBe(true);

    // Verify tool is registered
    const retrievedTool = await manager.getTool('manager_test');
    expect(retrievedTool).toBeDefined();
    expect(retrievedTool?.handler).toBeDefined();
  });

  test('should get MCP-compatible tool list', async () => {
    const tool: Omit<ExtendedTool, 'handler'> = {
      name: 'mcp_test',
      description: 'MCP test tool',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' }
        }
      }
    };

    const handler: ToolHandler = async () => ({ content: [] });

    await manager.registerToolWithHandler(tool, handler);

    const mcpList = await manager.getMCPToolList();

    expect(mcpList.tools).toHaveLength(1);
    expect(mcpList.tools[0].name).toBe('mcp_test');
    expect(mcpList.tools[0].inputSchema).toEqual(tool.inputSchema);
  });

  test('should provide comprehensive registry info', async () => {
    const info = await manager.getRegistryInfo();

    expect(info.stats).toBeDefined();
    expect(info.capabilities).toBeDefined();
    expect(info.discoveryStats).toBeDefined();
    expect(info.validationStats).toBeDefined();
    expect(info.config).toBeDefined();
  });
});