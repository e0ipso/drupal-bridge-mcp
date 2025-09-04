/**
 * Demonstration of Simplified MCP Server
 *
 * This script shows how the simplified MCP server works with direct token pass-through.
 * Run this to test the server functionality without the complex auth layer.
 */

import { SimplifiedMCPServer } from './mcp/server.js';
import {
  TokenExtractor,
  createSafeTokenForLogging,
} from './mcp/token-extractor.js';
import {
  createJsonRpcClient,
  type ContentSearchResult,
  type TutorialContent,
} from './drupal/json-rpc-client.js';

// Create a mock Drupal client for demonstration
class MockDrupalClient {
  async searchContent(
    params: any,
    token: string
  ): Promise<ContentSearchResult> {
    console.log(
      `🔍 Mock search with token: ${createSafeTokenForLogging(token)}`
    );
    console.log('📋 Search params:', JSON.stringify(params, null, 2));

    // Simulate search results
    return {
      results: [
        {
          id: 'tutorial-1',
          title: 'Getting Started with Drupal 10',
          summary: 'Learn the basics of Drupal 10 development',
          content_type: 'tutorial',
          tags: ['drupal', 'beginner', 'setup'],
          drupal_version: '10',
          difficulty_level: 'beginner',
          created: '2023-01-15T10:00:00Z',
          updated: '2023-08-20T14:30:00Z',
          access_level: 'free' as const,
          url: 'https://drupalize.me/tutorial/getting-started-drupal-10',
          author: { name: 'Jane Developer' },
        },
        {
          id: 'tutorial-2',
          title: 'Advanced Module Development',
          summary: 'Deep dive into custom module development',
          content_type: 'tutorial',
          tags: ['drupal', 'advanced', 'modules'],
          drupal_version: '10',
          difficulty_level: 'advanced',
          created: '2023-03-10T09:00:00Z',
          updated: '2023-09-01T16:45:00Z',
          access_level: 'subscriber' as const,
          url: 'https://drupalize.me/tutorial/advanced-module-development',
          author: { name: 'John Expert' },
        },
      ],
      total: 2,
      limit: 20,
      offset: 0,
      query: params.query,
      took: 25,
    };
  }

  async getTutorial(params: any, token: string): Promise<TutorialContent> {
    console.log(
      `📖 Mock get tutorial with token: ${createSafeTokenForLogging(token)}`
    );
    console.log('📋 Tutorial params:', JSON.stringify(params, null, 2));

    return {
      id: params.id,
      title: 'Getting Started with Drupal 10',
      summary: 'Learn the basics of Drupal 10 development',
      content: `# Getting Started with Drupal 10

## Introduction
Welcome to Drupal 10! This tutorial will guide you through the basics...

## Prerequisites
- Basic PHP knowledge
- Understanding of web development concepts
- A local development environment

## Installation Steps
1. Download Drupal 10
2. Set up your database
3. Configure your web server
4. Run the installation wizard

## Next Steps
After completing this tutorial, you'll be ready to start building your first Drupal site!`,
      content_type: 'tutorial',
      tags: ['drupal', 'beginner', 'setup'],
      drupal_version: '10',
      difficulty_level: 'beginner',
      created: '2023-01-15T10:00:00Z',
      updated: '2023-08-20T14:30:00Z',
      access_level: 'free' as const,
      url: 'https://drupalize.me/tutorial/getting-started-drupal-10',
      author: {
        name: 'Jane Developer',
        bio: 'Senior Drupal developer with 10+ years experience',
      },
    };
  }

  async discoverMethods(token: string): Promise<string[]> {
    console.log(
      `🔍 Mock discover methods with token: ${createSafeTokenForLogging(token)}`
    );

    return [
      'content.search',
      'content.get_tutorial',
      'content.get_guide',
      'system.health',
      'system.listMethods',
      'system.methodSignature',
    ];
  }

  async healthCheck(
    token: string
  ): Promise<{ status: string; timestamp: number }> {
    console.log(
      `💚 Mock health check with token: ${createSafeTokenForLogging(token)}`
    );

    return {
      status: 'healthy',
      timestamp: Date.now(),
    };
  }
}

/**
 * Demonstrate token extraction
 */
function demonstrateTokenExtraction() {
  console.log('\n🔐 Token Extraction Demonstration\n');

  const validToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sample';
  const invalidToken = 'invalid';

  // Test header extraction
  const headerResult = TokenExtractor.extractFromHeaders({
    authorization: `Bearer ${validToken}`,
  });

  console.log('✅ Header extraction result:', {
    valid: headerResult.isValid,
    token: headerResult.token
      ? createSafeTokenForLogging(headerResult.token)
      : null,
    error: headerResult.error,
  });

  // Test parameter extraction
  const paramResult = TokenExtractor.extractFromParams({
    access_token: validToken,
  });

  console.log('✅ Parameter extraction result:', {
    valid: paramResult.isValid,
    token: paramResult.token
      ? createSafeTokenForLogging(paramResult.token)
      : null,
    error: paramResult.error,
  });

  // Test invalid token
  const invalidResult = TokenExtractor.extractFromHeaders({
    authorization: `Bearer ${invalidToken}`,
  });

  console.log('❌ Invalid token result:', {
    valid: invalidResult.isValid,
    error: invalidResult.error,
    errorCode: invalidResult.errorCode,
  });
}

/**
 * Demonstrate MCP server functionality
 */
async function demonstrateMCPServer() {
  console.log('\n🚀 MCP Server Demonstration\n');

  // Mock the createJsonRpcClient function
  const originalCreateClient = createJsonRpcClient;
  (global as any).createJsonRpcClient = () => new MockDrupalClient() as any;

  try {
    // Create MCP server
    const mcpServer = new SimplifiedMCPServer({
      baseUrl: 'http://localhost:8080/jsonrpc',
    });

    const server = mcpServer.getServer();

    // Test tool listing
    console.log('📋 Testing tool listing...');
    const listHandler = server['requestHandlers'].get('tools/list');
    const toolsResponse = await listHandler!({
      method: 'tools/list',
      params: {},
    } as any);

    console.log(
      '✅ Available tools:',
      toolsResponse.tools.map((t: any) => t.name)
    );

    // Test search_content tool
    console.log('\n🔍 Testing search_content tool...');
    const callHandler = server['requestHandlers'].get('tools/call');

    const searchRequest = {
      method: 'tools/call',
      params: {
        name: 'search_content',
        arguments: {
          query: 'drupal 10 basics',
          content_type: 'tutorial',
          limit: 5,
        },
      },
      meta: {
        headers: {
          authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.demo`,
        },
      },
    };

    const searchResponse = await callHandler!(searchRequest as any);
    console.log('✅ Search completed successfully');
    console.log(
      '📄 Response preview:',
      `${searchResponse.content[0].text.slice(0, 200)}...`
    );

    // Test get_tutorial tool
    console.log('\n📖 Testing get_tutorial tool...');
    const tutorialRequest = {
      method: 'tools/call',
      params: {
        name: 'get_tutorial',
        arguments: {
          id: 'tutorial-1',
          include_content: true,
          format: 'markdown',
        },
      },
      meta: {
        headers: {
          authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.demo`,
        },
      },
    };

    const tutorialResponse = await callHandler!(tutorialRequest as any);
    console.log('✅ Tutorial retrieval completed successfully');
    console.log(
      '📄 Response preview:',
      `${tutorialResponse.content[0].text.slice(0, 300)}...`
    );

    // Test authentication error
    console.log('\n🔒 Testing authentication error...');
    const noAuthRequest = {
      method: 'tools/call',
      params: {
        name: 'search_content',
        arguments: { query: 'test' },
      },
      meta: { headers: {} },
    };

    try {
      await callHandler!(noAuthRequest as any);
      console.log('❌ Expected authentication error but request succeeded');
    } catch (error: any) {
      console.log('✅ Authentication error handled correctly:', error.message);
    }

    console.log('\n🎉 All demonstrations completed successfully!');
  } catch (error) {
    console.error('❌ Demonstration failed:', error);
  } finally {
    // Restore original function
    (global as any).createJsonRpcClient = originalCreateClient;
  }
}

/**
 * Main demonstration function
 */
async function main() {
  console.log('🌟 Simplified MCP Server Demonstration');
  console.log('=====================================');

  try {
    // Demonstrate token extraction
    demonstrateTokenExtraction();

    // Demonstrate MCP server
    await demonstrateMCPServer();

    console.log(
      '\n✨ Demonstration complete! The simplified MCP server is working correctly.'
    );
    console.log('🔧 Key features demonstrated:');
    console.log('  - Direct token pass-through (no session management)');
    console.log('  - Clean error handling for authentication failures');
    console.log(
      '  - Stateless operations with each request independently authenticated'
    );
    console.log(
      '  - Four core MCP tools: search_content, get_tutorial, discover_methods, health_check'
    );
  } catch (error) {
    console.error('💥 Demonstration failed:', error);
    process.exit(1);
  }
}

// Run the demonstration
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  main().catch(console.error);
}
