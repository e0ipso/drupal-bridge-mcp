#!/usr/bin/env tsx
/**
 * OAuth 2.1 Endpoint Discovery Demonstration
 *
 * This script demonstrates the RFC8414-compliant OAuth endpoint discovery
 * functionality with various scenarios including success, fallback, and error handling.
 */

import {
  discoverOAuthEndpoints,
  clearDiscoveryCache,
  getDiscoveryCacheStats,
} from '../src/auth/endpoint-discovery.js';
import type { DiscoveryConfig } from '../src/auth/types.js';

async function demonstrateDiscovery() {
  console.log('🔍 OAuth 2.1 Endpoint Discovery Demonstration\n');

  // Clear any existing cache
  clearDiscoveryCache();

  const scenarios = [
    {
      name: 'Real Drupal Site Discovery',
      config: {
        baseUrl: 'https://www.drupal.org',
        timeout: 5000,
        debug: true,
      } satisfies DiscoveryConfig,
    },
    {
      name: 'Local Development Fallback',
      config: {
        baseUrl: 'http://localhost:8080',
        timeout: 2000,
        debug: true,
        validateHttps: false,
      } satisfies DiscoveryConfig,
    },
    {
      name: 'Invalid URL Handling',
      config: {
        baseUrl: 'https://nonexistent-example-domain-12345.com',
        timeout: 1000,
        retries: 1,
        debug: true,
      } satisfies DiscoveryConfig,
    },
  ];

  for (const { name, config } of scenarios) {
    console.log(`\n📋 ${name}`);
    console.log(`   Base URL: ${config.baseUrl}`);
    console.log(`   Timeout: ${config.timeout}ms\n`);

    try {
      const startTime = Date.now();
      const endpoints = await discoverOAuthEndpoints(config);
      const duration = Date.now() - startTime;

      console.log(`✅ Discovery completed in ${duration}ms`);
      console.log(`   Authorization: ${endpoints.authorizationEndpoint}`);
      console.log(`   Token: ${endpoints.tokenEndpoint}`);
      console.log(`   Issuer: ${endpoints.issuer}`);
      console.log(`   Is Fallback: ${endpoints.isFallback ? '🔄' : '🎯'}`);

      if (endpoints.metadata) {
        console.log(
          `   Metadata Fields: ${Object.keys(endpoints.metadata).length}`
        );
        if (endpoints.metadata.scopes_supported) {
          console.log(
            `   Supported Scopes: ${endpoints.metadata.scopes_supported.slice(0, 3).join(', ')}${endpoints.metadata.scopes_supported.length > 3 ? '...' : ''}`
          );
        }
      }
    } catch (error) {
      console.log(
        `❌ Discovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  // Demonstrate caching
  console.log('\n🗄️  Cache Statistics');
  const cacheStats = getDiscoveryCacheStats();
  console.log(`   Cached Entries: ${cacheStats.size}`);
  if (cacheStats.entries.length > 0) {
    console.log(`   Cached URLs: ${cacheStats.entries.join(', ')}`);
  }

  // Test cache hit
  console.log('\n🚀 Testing Cache Performance');
  const cachedConfig = scenarios[0].config;
  console.log(`   Re-discovering endpoints for ${cachedConfig.baseUrl}`);

  const startTime = Date.now();
  try {
    await discoverOAuthEndpoints(cachedConfig);
    const duration = Date.now() - startTime;
    console.log(`✅ Cache hit! Completed in ${duration}ms (should be < 10ms)`);
  } catch (error) {
    console.log(
      `❌ Cache test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  console.log('\n🎉 Demonstration completed!');
  console.log('\nKey Features Demonstrated:');
  console.log('• RFC8414 OAuth 2.0 Authorization Server Metadata discovery');
  console.log(
    '• Graceful fallback to standard /oauth/authorize and /oauth/token endpoints'
  );
  console.log(
    '• Configurable timeout and retry logic with exponential backoff'
  );
  console.log('• In-memory caching with TTL for performance optimization');
  console.log(
    '• Comprehensive error handling for network failures and malformed responses'
  );
  console.log(
    '• Support for both HTTP (development) and HTTPS (production) endpoints'
  );
}

// Environment variable configuration examples
console.log('Environment Variables for OAuth Discovery:');
console.log(
  '• OAUTH_DISCOVERY_TIMEOUT=5000        # Discovery timeout in milliseconds'
);
console.log('• OAUTH_DISCOVERY_RETRIES=2           # Number of retry attempts');
console.log(
  '• OAUTH_DISCOVERY_CACHE_TTL=3600000   # Cache TTL in milliseconds (1 hour)'
);
console.log(
  '• OAUTH_DISCOVERY_VALIDATE_HTTPS=true # Require HTTPS in production'
);
console.log('• OAUTH_DISCOVERY_DEBUG=true          # Enable debug logging');
console.log(
  '• OAUTH_SKIP_DISCOVERY=true           # Skip discovery, use hardcoded endpoints'
);
console.log('');

demonstrateDiscovery().catch(error => {
  console.error('Demonstration failed:', error);
  process.exit(1);
});
