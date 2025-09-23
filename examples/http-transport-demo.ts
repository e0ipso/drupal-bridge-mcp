/**
 * Demonstration script for HttpTransport
 * Run with: npx tsx examples/http-transport-demo.ts
 */

import { HttpTransport } from '../src/transport/http-transport.js';
import type { AppConfig } from '../src/config/index.js';
import { createChildLogger } from '../src/utils/logger.js';

// Create a demo configuration
const demoConfig: AppConfig = {
  drupal: {
    baseUrl: 'http://localhost',
    endpoint: '/jsonrpc',
    timeout: 10000,
    retries: 3,
    headers: {},
  },
  oauth: {
    clientId: 'demo-client',
    redirectUri: 'urn:ietf:wg:oauth:2.0:oob',
    scopes: ['demo'],
    serverUrl: 'http://localhost',
  },
  auth: {
    enabled: false,
    requiredScopes: [],
    skipAuth: true,
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  http: {
    port: 3000,
    host: 'localhost',
    corsOrigins: ['http://localhost:3001', 'http://127.0.0.1:3001'],
    timeout: 30000,
    enableSSE: true,
  },
  mcp: {
    name: 'demo-http-transport',
    version: '1.0.0',
    protocolVersion: '2024-11-05',
    capabilities: {},
  },
  logging: {
    level: 'info',
  },
  environment: 'development',
  discovery: {
    baseUrl: 'http://localhost',
    timeout: 5000,
    retries: 2,
    cacheTtl: 3600000,
    validateHttps: false,
    debug: false,
  },
};

async function demo() {
  console.log('🚀 HttpTransport Demo');
  console.log('===================');

  // Create logger
  const logger = createChildLogger({ component: 'demo' });

  // Create transport
  const transport = new HttpTransport(demoConfig, logger);

  try {
    // Start the server
    console.log('\n📡 Starting HTTP server...');
    await transport.start();

    const status = transport.getStatus();
    console.log(`✅ Server running on ${status.host}:${status.port}`);
    console.log('\n🔗 Available endpoints:');
    console.log('  • GET  /health - Health check');
    console.log('  • GET  /mcp    - Server-Sent Events (if enabled)');
    console.log('  • POST /mcp    - JSON-RPC requests');
    console.log('\n💡 Try these commands in another terminal:');
    console.log(`  curl http://${status.host}:${status.port}/health`);
    console.log(`  curl -X POST http://${status.host}:${status.port}/mcp \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"jsonrpc":"2.0","method":"ping","id":1}'`);

    // Wait for user input
    console.log('\n⏳ Press Enter to stop the server...');
    await new Promise<void>(resolve => {
      process.stdin.once('data', () => resolve());
    });
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    // Clean shutdown
    console.log('\n🛑 Stopping server...');
    await transport.stop();
    console.log('✅ Server stopped');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

demo().catch(error => {
  console.error('❌ Demo failed:', error);
  process.exit(1);
});
