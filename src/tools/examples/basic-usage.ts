/**
 * Basic Tool Registry Usage Example
 * 
 * Demonstrates how to use the tool registry system to register,
 * discover, and invoke tools in an MCP server environment.
 */

import {
  createToolRegistryManager,
  createBasicTool,
  createToolCapabilities,
  TOOL_CATEGORIES,
  TOOL_TAGS,
  COMMON_SCHEMAS
} from '../index';
import type {
  ExtendedTool,
  ToolHandler,
  ToolInvocationContext
} from '../types';
import type { CallToolResult } from '@/protocol/types';

/**
 * Example: Basic tool registry usage
 */
export async function basicToolRegistryExample(): Promise<void> {
  console.log('=== Basic Tool Registry Usage Example ===\n');

  // Create a tool registry manager
  const registry = await createToolRegistryManager({
    maxTools: 100,
    enableMetrics: true,
    strictValidation: true,
    enableDiscovery: true
  });

  // Define a simple search tool handler
  const searchHandler: ToolHandler = async (params, context: ToolInvocationContext): Promise<CallToolResult> => {
    console.log(`Executing search with query: "${params.query}"`);
    console.log(`Connection ID: ${context.connectionId}`);
    
    // Simulate search results
    const results = [
      `Result 1 for "${params.query}"`,
      `Result 2 for "${params.query}"`,
      `Result 3 for "${params.query}"`
    ];

    return {
      content: [{
        type: 'text',
        text: `Found ${results.length} results:\n${results.join('\n')}`
      }]
    };
  };

  // Create a search tool definition
  const searchTool = createBasicTool(
    'search_content',
    'Search for content with specified query and optional filters',
    COMMON_SCHEMAS.SEARCH_QUERY,
    {
      category: TOOL_CATEGORIES.SEARCH,
      tags: [TOOL_TAGS.READ_ONLY, TOOL_TAGS.STABLE],
      version: '1.0.0',
      timeout: 10000 // 10 seconds
    }
  );

  // Register the tool
  console.log('1. Registering search tool...');
  const registrationResult = await registry.registerToolWithHandler(searchTool, searchHandler);
  console.log(`Registration result: ${registrationResult.success ? 'SUCCESS' : 'FAILED'}`);
  if (registrationResult.error) {
    console.log(`Error: ${registrationResult.error}`);
  }

  // Define a formatting tool
  const formatHandler: ToolHandler = async (params): Promise<CallToolResult> => {
    const { data, format } = params;
    
    let result: string;
    switch (format) {
      case 'uppercase':
        result = data.toUpperCase();
        break;
      case 'lowercase':
        result = data.toLowerCase();
        break;
      case 'title':
        result = data.replace(/\w\S*/g, (txt: string) => 
          txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
        break;
      default:
        result = data;
    }

    return {
      content: [{
        type: 'text',
        text: result
      }]
    };
  };

  const formatTool: ExtendedTool = {
    name: 'format_text',
    description: 'Format text in various ways',
    inputSchema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: 'Text to format' },
        format: { 
          type: 'string', 
          enum: ['uppercase', 'lowercase', 'title'],
          description: 'Format to apply'
        }
      },
      required: ['data', 'format']
    },
    category: TOOL_CATEGORIES.UTILITY,
    tags: [TOOL_TAGS.READ_ONLY, TOOL_TAGS.STABLE],
    capabilities: createToolCapabilities({
      idempotent: true,
      parallel: true,
      sideEffects: false
    }),
    handler: formatHandler
  };

  // Register the formatting tool
  console.log('\n2. Registering format tool...');
  const formatResult = await registry.registerTool({
    tool: formatTool,
    validate: true
  });
  console.log(`Registration result: ${formatResult.success ? 'SUCCESS' : 'FAILED'}`);

  // List all registered tools
  console.log('\n3. Listing all registered tools...');
  const allTools = await registry.listTools();
  console.log(`Total tools: ${allTools.totalCount}`);
  allTools.tools.forEach(tool => {
    console.log(`  - ${tool.name}: ${tool.description}`);
    console.log(`    Category: ${tool.category || 'uncategorized'}`);
    console.log(`    Tags: ${tool.tags?.join(', ') || 'none'}`);
  });

  // Get capability summary
  console.log('\n4. Getting capability summary...');
  const capabilities = await registry.getCapabilitySummary();
  console.log(`Supported tools: ${capabilities.supportedTools}`);
  console.log(`Categories: ${capabilities.categories.join(', ')}`);
  console.log(`Has idempotent tools: ${capabilities.capabilities.idempotent > 0}`);

  // Invoke the search tool
  console.log('\n5. Invoking search tool...');
  const searchParams = {
    name: 'search_content',
    arguments: {
      query: 'TypeScript tutorials',
      limit: 5
    }
  };

  const searchContext: ToolInvocationContext = {
    toolName: 'search_content',
    connectionId: 'example-conn-1',
    requestId: 'req-1',
    timestamp: Date.now()
  };

  try {
    const searchResult = await registry.invokeTool(searchParams, searchContext);
    console.log('Search result:');
    const firstContent = searchResult.content[0];
    if (firstContent && firstContent.type === 'text') {
      console.log(firstContent.text);
    } else {
      console.log('Non-text result');
    }
  } catch (error) {
    console.log(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Invoke the format tool
  console.log('\n6. Invoking format tool...');
  const formatParams = {
    name: 'format_text',
    arguments: {
      data: 'hello world example',
      format: 'title'
    }
  };

  const formatContext: ToolInvocationContext = {
    toolName: 'format_text',
    connectionId: 'example-conn-1',
    requestId: 'req-2',
    timestamp: Date.now()
  };

  try {
    const formatResult = await registry.invokeTool(formatParams, formatContext);
    console.log('Format result:');
    const firstFormatContent = formatResult.content[0];
    if (firstFormatContent && firstFormatContent.type === 'text') {
      console.log(firstFormatContent.text);
    } else {
      console.log('Non-text result');
    }
  } catch (error) {
    console.log(`Format failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Get registry statistics
  console.log('\n7. Getting registry statistics...');
  const stats = await registry.getStats();
  console.log(`Total tools: ${stats.totalTools}`);
  console.log(`Available tools: ${stats.availableTools}`);
  console.log(`Average response time: ${stats.averageResponseTime.toFixed(2)}ms`);
  console.log(`Total invocations: ${stats.totalInvocations}`);

  // Search for tools by category
  console.log('\n8. Searching tools by category...');
  const searchTools = await registry.listTools({ category: TOOL_CATEGORIES.SEARCH });
  console.log(`Search category tools: ${searchTools.tools.length}`);

  // Validate all tools
  console.log('\n9. Validating all registered tools...');
  const validationResults = await registry.validate();
  const validTools = validationResults.filter(r => r.isValid).length;
  console.log(`Valid tools: ${validTools}/${validationResults.length}`);

  // Clean up
  console.log('\n10. Cleaning up...');
  await registry.shutdown();
  console.log('Registry shutdown completed.');
}

/**
 * Example: Using with MCP protocol integration
 */
export async function mcpIntegrationExample(): Promise<void> {
  console.log('\n=== MCP Protocol Integration Example ===\n');

  // This example shows how the tool registry integrates with MCP protocol
  // In a real MCP server implementation, you would use createEnhancedMCPProtocolHandler

  console.log('Tool registry can be integrated with MCP protocol for:');
  console.log('- Automatic tool discovery via tools/list');
  console.log('- Tool invocation via tools/call');
  console.log('- Parameter validation');
  console.log('- Capability advertisement');
  console.log('- Runtime availability checking');
}

// Run the examples if this file is executed directly
if (require.main === module) {
  (async () => {
    try {
      await basicToolRegistryExample();
      await mcpIntegrationExample();
    } catch (error) {
      console.error('Example failed:', error);
      process.exit(1);
    }
  })();
}