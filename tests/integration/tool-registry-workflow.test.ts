/**
 * Tool Registry Workflow Integration Tests
 * 
 * Comprehensive tests for tool registration, discovery, validation, and invocation
 * workflows, including concurrent operations and error scenarios.
 */

import { jest } from '@jest/globals';

import { ToolRegistry } from '@/tools/tool-registry';
import { SchemaValidator } from '@/tools/schema-validator';
import type { 
  Tool, 
  CallToolParams, 
  CallToolResult, 
  ExtendedTool,
  ToolRegistrationRequest,
  ToolInvocationContext
} from '@/protocol/types';
import { 
  ToolRegistryError, 
  ToolRegistryErrorCode 
} from '@/tools/types';

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Tool Registry Workflow Integration Tests', () => {
  let toolRegistry: ToolRegistry;
  let schemaValidator: SchemaValidator;

  const mockInvocationContext: ToolInvocationContext = {
    connectionId: 'test-connection',
    userId: 'test-user',
    timestamp: Date.now(),
    requestId: 'test-request',
    metadata: {}
  };

  beforeEach(() => {
    toolRegistry = new ToolRegistry({
      maxTools: 50,
      enableMetrics: true,
      enableCaching: true,
      strictValidation: true,
      allowOverwrite: true,
      defaultTimeout: 5000,
      validation: {
        requireDescription: true,
        requireExamples: false,
        maxNameLength: 100,
        maxDescriptionLength: 1000
      }
    });

    schemaValidator = new SchemaValidator();
  });

  afterEach(async () => {
    await toolRegistry.clear();
  });

  describe('Tool Registration Workflows', () => {
    it('should register a basic tool successfully', async () => {
      const tool: Tool = {
        name: 'basic_tool',
        description: 'A basic test tool',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' }
          },
          required: ['message']
        }
      };

      const result = await toolRegistry.registerTool({
        tool,
        validate: true
      });

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('basic_tool');
      expect(result.validationResults).toBeDefined();
      expect(result.validationResults?.[0]?.isValid).toBe(true);
    });

    it('should register extended tool with all features', async () => {
      const extendedTool: ExtendedTool = {
        name: 'advanced_tool',
        description: 'An advanced tool with all features',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 100 },
            filters: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          required: ['query']
        },
        version: '1.0.0',
        category: 'search',
        tags: ['content', 'search'],
        requiresAuth: true,
        timeout: 10000,
        availability: {
          available: true,
          maxConcurrency: 5,
          rateLimit: {
            maxCalls: 100,
            windowMs: 60000
          }
        },
        capabilities: {
          streaming: true,
          caching: true,
          batchSupport: false
        },
        examples: [
          {
            name: 'Basic search',
            description: 'Search for content',
            input: { query: 'Drupal tutorials' },
            output: { results: [], count: 0 }
          }
        ],
        handler: async (params: Record<string, any>, context: ToolInvocationContext): Promise<CallToolResult> => {
          return {
            content: [{
              type: 'text',
              text: `Search results for: ${params.query}`
            }]
          };
        }
      };

      const result = await toolRegistry.registerTool({
        tool: extendedTool,
        validate: true
      });

      expect(result.success).toBe(true);
      expect(result.toolName).toBe('advanced_tool');
      expect(result.version).toBe('1.0.0');
    });

    it('should handle tool registration with validation errors', async () => {
      const invalidTool: Tool = {
        name: '', // Invalid: empty name
        description: '', // Invalid: empty description
        inputSchema: {
          type: 'invalid-type' as any // Invalid schema type
        }
      };

      const result = await toolRegistry.registerTool({
        tool: invalidTool,
        validate: true
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('validation failed');
    });

    it('should prevent duplicate tool registration without replace flag', async () => {
      const tool: Tool = {
        name: 'duplicate_tool',
        description: 'A tool to test duplicates',
        inputSchema: { type: 'object', properties: {} }
      };

      // First registration should succeed
      const firstResult = await toolRegistry.registerTool({ tool });
      expect(firstResult.success).toBe(true);

      // Second registration without replace should fail
      const secondResult = await toolRegistry.registerTool({ tool, replace: false });
      expect(secondResult.success).toBe(false);
      expect(secondResult.error).toContain('already exists');
    });

    it('should allow tool updates with replace flag', async () => {
      const originalTool: Tool = {
        name: 'updatable_tool',
        description: 'Original description',
        inputSchema: { type: 'object', properties: { old_param: { type: 'string' } } }
      };

      const updatedTool: Tool = {
        name: 'updatable_tool',
        description: 'Updated description',
        inputSchema: { type: 'object', properties: { new_param: { type: 'string' } } }
      };

      // Register original
      await toolRegistry.registerTool({ tool: originalTool });

      // Update with new version
      const updateResult = await toolRegistry.updateTool({ tool: updatedTool });
      
      expect(updateResult.success).toBe(true);

      // Verify update
      const retrieved = await toolRegistry.getTool('updatable_tool');
      expect(retrieved?.description).toBe('Updated description');
      expect(retrieved?.inputSchema.properties).toHaveProperty('new_param');
    });

    it('should handle concurrent tool registrations', async () => {
      const tools: Tool[] = Array.from({ length: 10 }, (_, i) => ({
        name: `concurrent_tool_${i}`,
        description: `Concurrent tool ${i}`,
        inputSchema: {
          type: 'object',
          properties: {
            id: { type: 'number', const: i }
          }
        }
      }));

      const registrationPromises = tools.map(tool => 
        toolRegistry.registerTool({ tool, validate: true })
      );

      const results = await Promise.all(registrationPromises);

      // All registrations should succeed
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.toolName).toBe(`concurrent_tool_${index}`);
      });

      // Verify all tools are registered
      const listResult = await toolRegistry.listTools();
      expect(listResult.tools.length).toBeGreaterThanOrEqual(10);
    });

    it('should enforce registry capacity limits', async () => {
      // Create registry with very small capacity
      const smallRegistry = new ToolRegistry({ maxTools: 2 });

      const tools: Tool[] = Array.from({ length: 3 }, (_, i) => ({
        name: `capacity_tool_${i}`,
        description: `Tool ${i}`,
        inputSchema: { type: 'object', properties: {} }
      }));

      // First two should succeed
      const result1 = await smallRegistry.registerTool({ tool: tools[0] });
      const result2 = await smallRegistry.registerTool({ tool: tools[1] });

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      // Third should fail due to capacity
      const result3 = await smallRegistry.registerTool({ tool: tools[2] });

      expect(result3.success).toBe(false);
      expect(result3.error).toContain('Registry is full');

      await smallRegistry.clear();
    });
  });

  describe('Tool Discovery and Search', () => {
    beforeEach(async () => {
      // Register sample tools for discovery tests
      const sampleTools: Tool[] = [
        {
          name: 'search_content',
          description: 'Search for content in the system',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          category: 'search',
          tags: ['content', 'search']
        },
        {
          name: 'create_user',
          description: 'Create a new user account',
          inputSchema: { type: 'object', properties: { username: { type: 'string' } } },
          category: 'user',
          tags: ['user', 'admin']
        },
        {
          name: 'analytics_report',
          description: 'Generate analytics reports',
          inputSchema: { type: 'object', properties: { period: { type: 'string' } } },
          category: 'analytics',
          tags: ['reporting', 'analytics']
        }
      ];

      for (const tool of sampleTools) {
        await toolRegistry.registerTool({ tool });
      }
    });

    it('should list all tools', async () => {
      const result = await toolRegistry.listTools();

      expect(result.tools.length).toBeGreaterThanOrEqual(3);
      expect(result.totalCount).toBeGreaterThanOrEqual(3);
      expect(result.filteredCount).toBe(result.tools.length);

      const toolNames = result.tools.map(t => t.name);
      expect(toolNames).toContain('search_content');
      expect(toolNames).toContain('create_user');
      expect(toolNames).toContain('analytics_report');
    });

    it('should filter tools by category', async () => {
      const result = await toolRegistry.listTools({
        category: 'search'
      });

      expect(result.tools.length).toBe(1);
      expect(result.tools[0].name).toBe('search_content');
      expect(result.tools[0].category).toBe('search');
    });

    it('should filter tools by tags', async () => {
      const result = await toolRegistry.listTools({
        tags: ['admin']
      });

      expect(result.tools.length).toBe(1);
      expect(result.tools[0].name).toBe('create_user');
      expect(result.tools[0].tags).toContain('admin');
    });

    it('should search tools by query', async () => {
      const result = await toolRegistry.searchTools('analytics');

      expect(result.tools.length).toBeGreaterThanOrEqual(1);
      expect(result.tools.some(t => t.name === 'analytics_report')).toBe(true);
    });

    it('should search tools by partial name match', async () => {
      const result = await toolRegistry.searchTools('user');

      expect(result.tools.length).toBeGreaterThanOrEqual(1);
      expect(result.tools.some(t => t.name === 'create_user')).toBe(true);
    });

    it('should combine search with filters', async () => {
      const result = await toolRegistry.searchTools('content', {
        category: 'search'
      });

      expect(result.tools.length).toBe(1);
      expect(result.tools[0].name).toBe('search_content');
    });

    it('should handle empty search results', async () => {
      const result = await toolRegistry.searchTools('nonexistent');

      expect(result.tools.length).toBe(0);
      expect(result.filteredCount).toBe(0);
      expect(result.totalCount).toBeGreaterThan(0);
    });

    it('should retrieve specific tool by name', async () => {
      const tool = await toolRegistry.getTool('search_content');

      expect(tool).toBeDefined();
      expect(tool?.name).toBe('search_content');
      expect(tool?.description).toContain('Search for content');
    });

    it('should return null for non-existent tool', async () => {
      const tool = await toolRegistry.getTool('non_existent_tool');

      expect(tool).toBeNull();
    });
  });

  describe('Tool Validation', () => {
    beforeEach(async () => {
      const testTool: Tool = {
        name: 'validation_tool',
        description: 'Tool for testing parameter validation',
        inputSchema: {
          type: 'object',
          properties: {
            required_param: { type: 'string' },
            optional_param: { type: 'number', minimum: 0, maximum: 100 },
            enum_param: { type: 'string', enum: ['option1', 'option2', 'option3'] }
          },
          required: ['required_param'],
          additionalProperties: false
        }
      };

      await toolRegistry.registerTool({ tool: testTool });
    });

    it('should validate correct parameters', async () => {
      const validParams = {
        required_param: 'test value',
        optional_param: 50,
        enum_param: 'option1'
      };

      const result = await toolRegistry.validateToolParams('validation_tool', validParams);

      expect(result.isValid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should detect missing required parameters', async () => {
      const invalidParams = {
        optional_param: 50
      };

      const result = await toolRegistry.validateToolParams('validation_tool', invalidParams);

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some(e => e.message.includes('required_param'))).toBe(true);
    });

    it('should validate parameter types', async () => {
      const invalidParams = {
        required_param: 123, // Should be string
        optional_param: 'not a number' // Should be number
      };

      const result = await toolRegistry.validateToolParams('validation_tool', invalidParams);

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('should validate parameter constraints', async () => {
      const invalidParams = {
        required_param: 'test',
        optional_param: 150, // Exceeds maximum
        enum_param: 'invalid_option' // Not in enum
      };

      const result = await toolRegistry.validateToolParams('validation_tool', invalidParams);

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle validation of non-existent tool', async () => {
      const result = await toolRegistry.validateToolParams('non_existent', {});

      expect(result.isValid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.[0]?.message).toContain('not found');
    });
  });

  describe('Tool Invocation Workflow', () => {
    beforeEach(async () => {
      const executableTool: ExtendedTool = {
        name: 'executable_tool',
        description: 'A tool that can be invoked',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['greet', 'calculate', 'error'] },
            value: { type: 'number' }
          },
          required: ['action']
        },
        handler: async (params: Record<string, any>, context: ToolInvocationContext): Promise<CallToolResult> => {
          switch (params.action) {
            case 'greet':
              return {
                content: [{
                  type: 'text',
                  text: `Hello from ${context.connectionId}!`
                }]
              };
            case 'calculate':
              const result = (params.value || 0) * 2;
              return {
                content: [{
                  type: 'text',
                  text: `Result: ${result}`
                }]
              };
            case 'error':
              throw new Error('Intentional test error');
            default:
              throw new Error('Unknown action');
          }
        }
      };

      await toolRegistry.registerTool({ tool: executableTool });
    });

    it('should invoke tool successfully', async () => {
      const params: CallToolParams = {
        name: 'executable_tool',
        arguments: {
          action: 'greet'
        }
      };

      const result = await toolRegistry.invokeTool(params, mockInvocationContext);

      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Hello from test-connection');
    });

    it('should pass parameters to tool handler', async () => {
      const params: CallToolParams = {
        name: 'executable_tool',
        arguments: {
          action: 'calculate',
          value: 21
        }
      };

      const result = await toolRegistry.invokeTool(params, mockInvocationContext);

      expect(result.content[0].text).toBe('Result: 42');
    });

    it('should handle tool invocation errors', async () => {
      const params: CallToolParams = {
        name: 'executable_tool',
        arguments: {
          action: 'error'
        }
      };

      await expect(
        toolRegistry.invokeTool(params, mockInvocationContext)
      ).rejects.toThrow('Intentional test error');
    });

    it('should handle invocation of non-existent tool', async () => {
      const params: CallToolParams = {
        name: 'non_existent_tool',
        arguments: {}
      };

      await expect(
        toolRegistry.invokeTool(params, mockInvocationContext)
      ).rejects.toThrow(ToolRegistryError);
    });

    it('should validate parameters before invocation', async () => {
      const params: CallToolParams = {
        name: 'executable_tool',
        arguments: {
          action: 'invalid_action' // Not in enum
        }
      };

      await expect(
        toolRegistry.invokeTool(params, mockInvocationContext)
      ).rejects.toThrow(ToolRegistryError);
    });

    it('should handle concurrent tool invocations', async () => {
      const invocations: Promise<CallToolResult>[] = [];

      // Create multiple concurrent invocations
      for (let i = 0; i < 5; i++) {
        const params: CallToolParams = {
          name: 'executable_tool',
          arguments: {
            action: 'calculate',
            value: i * 10
          }
        };

        const context = { ...mockInvocationContext, requestId: `request-${i}` };
        invocations.push(toolRegistry.invokeTool(params, context));
      }

      const results = await Promise.all(invocations);

      expect(results).toHaveLength(5);
      results.forEach((result, index) => {
        expect(result.content[0].text).toBe(`Result: ${index * 20}`);
      });
    });
  });

  describe('Tool Availability and Conditions', () => {
    beforeEach(async () => {
      const conditionalTool: ExtendedTool = {
        name: 'conditional_tool',
        description: 'Tool with availability conditions',
        inputSchema: { type: 'object', properties: {} },
        availability: {
          available: true,
          conditions: [
            {
              type: 'custom',
              description: 'Always pass condition',
              check: async () => true
            },
            {
              type: 'custom',
              description: 'Time-based condition',
              check: async () => new Date().getHours() < 24 // Always true for testing
            }
          ],
          maxConcurrency: 2,
          rateLimit: {
            maxCalls: 10,
            windowMs: 60000
          }
        },
        handler: async (): Promise<CallToolResult> => ({
          content: [{ type: 'text', text: 'Available tool executed' }]
        })
      };

      await toolRegistry.registerTool({ tool: conditionalTool });
    });

    it('should check tool availability', async () => {
      const isAvailable = await toolRegistry.isToolAvailable('conditional_tool');
      expect(isAvailable).toBe(true);
    });

    it('should handle availability conditions', async () => {
      const conditionsOk = await toolRegistry.checkToolConditions('conditional_tool', mockInvocationContext);
      expect(conditionsOk).toBe(true);
    });

    it('should handle failing availability conditions', async () => {
      const failingTool: ExtendedTool = {
        name: 'failing_condition_tool',
        description: 'Tool with failing condition',
        inputSchema: { type: 'object', properties: {} },
        availability: {
          available: true,
          conditions: [
            {
              type: 'custom',
              description: 'Always fail condition',
              check: async () => false
            }
          ]
        },
        handler: async (): Promise<CallToolResult> => ({
          content: [{ type: 'text', text: 'Should not execute' }]
        })
      };

      await toolRegistry.registerTool({ tool: failingTool });

      const isAvailable = await toolRegistry.isToolAvailable('failing_condition_tool');
      expect(isAvailable).toBe(false);

      const conditionsOk = await toolRegistry.checkToolConditions('failing_condition_tool', mockInvocationContext);
      expect(conditionsOk).toBe(false);
    });

    it('should handle condition check errors', async () => {
      const erroringTool: ExtendedTool = {
        name: 'erroring_condition_tool',
        description: 'Tool with erroring condition',
        inputSchema: { type: 'object', properties: {} },
        availability: {
          available: true,
          conditions: [
            {
              type: 'custom',
              description: 'Error condition',
              check: async () => {
                throw new Error('Condition check failed');
              }
            }
          ]
        },
        handler: async (): Promise<CallToolResult> => ({
          content: [{ type: 'text', text: 'Should not execute' }]
        })
      };

      await toolRegistry.registerTool({ tool: erroringTool });

      const isAvailable = await toolRegistry.isToolAvailable('erroring_condition_tool');
      expect(isAvailable).toBe(false);

      const conditionsOk = await toolRegistry.checkToolConditions('erroring_condition_tool', mockInvocationContext);
      expect(conditionsOk).toBe(false);
    });
  });

  describe('Metrics and Statistics', () => {
    beforeEach(async () => {
      // Register tools and perform some operations for metrics testing
      const metricsTools: ExtendedTool[] = [
        {
          name: 'metrics_tool_1',
          description: 'First metrics tool',
          inputSchema: { type: 'object', properties: {} },
          category: 'metrics',
          handler: async (): Promise<CallToolResult> => ({
            content: [{ type: 'text', text: 'Tool 1 result' }]
          })
        },
        {
          name: 'metrics_tool_2',
          description: 'Second metrics tool',
          inputSchema: { type: 'object', properties: {} },
          category: 'metrics',
          handler: async (): Promise<CallToolResult> => {
            throw new Error('Metrics error');
          }
        }
      ];

      for (const tool of metricsTools) {
        await toolRegistry.registerTool({ tool });
      }

      // Perform some invocations to generate metrics
      const params1: CallToolParams = { name: 'metrics_tool_1', arguments: {} };
      await toolRegistry.invokeTool(params1, mockInvocationContext);
      await toolRegistry.invokeTool(params1, mockInvocationContext);

      const params2: CallToolParams = { name: 'metrics_tool_2', arguments: {} };
      try {
        await toolRegistry.invokeTool(params2, mockInvocationContext);
      } catch {
        // Expected error
      }
    });

    it('should track tool invocation metrics', async () => {
      const metrics = await toolRegistry.getToolMetrics('metrics_tool_1');

      expect(metrics).toBeDefined();
      expect(metrics?.toolName).toBe('metrics_tool_1');
      expect(metrics?.invocationCount).toBe(2);
      expect(metrics?.successRate).toBe(1.0);
      expect(metrics?.errorCount).toBe(0);
      expect(metrics?.averageExecutionTime).toBeGreaterThan(0);
    });

    it('should track error metrics', async () => {
      const metrics = await toolRegistry.getToolMetrics('metrics_tool_2');

      expect(metrics).toBeDefined();
      expect(metrics?.invocationCount).toBe(1);
      expect(metrics?.successRate).toBe(0);
      expect(metrics?.errorCount).toBe(1);
      expect(metrics?.lastError).toBeDefined();
    });

    it('should provide registry statistics', async () => {
      const stats = await toolRegistry.getStats();

      expect(stats.totalTools).toBeGreaterThan(0);
      expect(stats.availableTools).toBeGreaterThanOrEqual(0);
      expect(stats.categoryCounts).toHaveProperty('metrics');
      expect(stats.categoryCounts.metrics).toBeGreaterThanOrEqual(2);
      expect(stats.totalInvocations).toBeGreaterThan(0);
      expect(stats.averageResponseTime).toBeGreaterThan(0);
      expect(typeof stats.registryVersion).toBe('string');
    });

    it('should handle metrics for non-existent tool', async () => {
      const metrics = await toolRegistry.getToolMetrics('non_existent_tool');
      expect(metrics).toBeNull();
    });
  });

  describe('Registry Management', () => {
    it('should clear all tools', async () => {
      // Register some tools
      const tools: Tool[] = [
        { name: 'clear_test_1', description: 'Test 1', inputSchema: { type: 'object' } },
        { name: 'clear_test_2', description: 'Test 2', inputSchema: { type: 'object' } }
      ];

      for (const tool of tools) {
        await toolRegistry.registerTool({ tool });
      }

      const beforeClear = await toolRegistry.listTools();
      expect(beforeClear.tools.length).toBeGreaterThanOrEqual(2);

      await toolRegistry.clear();

      const afterClear = await toolRegistry.listTools();
      expect(afterClear.tools.length).toBe(0);
      expect(afterClear.totalCount).toBe(0);
    });

    it('should unregister specific tools', async () => {
      const tool: Tool = {
        name: 'unregister_test',
        description: 'Tool for unregistration test',
        inputSchema: { type: 'object', properties: {} }
      };

      await toolRegistry.registerTool({ tool });
      
      let retrieved = await toolRegistry.getTool('unregister_test');
      expect(retrieved).toBeDefined();

      const unregistered = await toolRegistry.unregisterTool('unregister_test');
      expect(unregistered).toBe(true);

      retrieved = await toolRegistry.getTool('unregister_test');
      expect(retrieved).toBeNull();
    });

    it('should handle unregistering non-existent tool', async () => {
      const result = await toolRegistry.unregisterTool('non_existent_tool');
      expect(result).toBe(false);
    });

    it('should validate all registered tools', async () => {
      // Register mix of valid and potentially invalid tools
      const tools: Tool[] = [
        {
          name: 'valid_tool',
          description: 'A valid tool',
          inputSchema: { type: 'object', properties: { param: { type: 'string' } } }
        }
      ];

      for (const tool of tools) {
        await toolRegistry.registerTool({ tool, validate: false }); // Skip validation during registration
      }

      const validationResults = await toolRegistry.validate();

      expect(Array.isArray(validationResults)).toBe(true);
      expect(validationResults.length).toBeGreaterThan(0);
      
      validationResults.forEach(result => {
        expect(result).toHaveProperty('isValid');
      });
    });
  });
});