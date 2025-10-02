/**
 * Tool Cache Layer
 *
 * Caches discovered tool definitions in memory to avoid repeated HTTP requests
 * to the /mcp/tools/list endpoint. Cache is valid for 1 hour by default.
 */

import { discoverTools, type ToolDefinition } from './tool-discovery.js';

interface ToolCache {
  tools: ToolDefinition[];
  timestamp: number;
  ttl: number;
}

// Module-level cache storage
let toolCache: ToolCache | null = null;

// Default TTL: 1 hour (3600000ms)
const DEFAULT_TTL_MS = 3600000;

/**
 * Get cache TTL from environment variable or use default
 */
function getTTL(): number {
  const envTTL = process.env.TOOL_CACHE_TTL_MS;

  if (envTTL) {
    const parsed = parseInt(envTTL, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    console.warn(
      `Invalid TOOL_CACHE_TTL_MS value: "${envTTL}". ` +
        `Using default ${DEFAULT_TTL_MS}ms`
    );
  }

  return DEFAULT_TTL_MS;
}

/**
 * Get discovered tools with caching
 *
 * Returns cached tools if cache is valid, otherwise fetches fresh tools
 * from the discovery endpoint and updates the cache.
 *
 * @param drupalBaseUrl - Base URL of Drupal site
 * @param accessToken - Optional OAuth token for authenticated discovery
 * @param forceFresh - If true, bypass cache and fetch fresh tools
 * @returns Array of tool definitions
 */
export async function getDiscoveredTools(
  drupalBaseUrl: string,
  accessToken?: string,
  forceFresh = false
): Promise<ToolDefinition[]> {
  const now = Date.now();
  const ttl = getTTL();

  // Check if cache is valid
  if (!forceFresh && toolCache && now - toolCache.timestamp < toolCache.ttl) {
    const ageSeconds = Math.round((now - toolCache.timestamp) / 1000);
    console.log(
      `Using cached tool definitions (age: ${ageSeconds}s, ` +
        `TTL: ${Math.round(ttl / 1000)}s)`
    );
    return toolCache.tools;
  }

  // Cache miss or expired - fetch fresh tools
  console.log('Fetching fresh tool definitions from discovery endpoint...');
  const tools = await discoverTools(drupalBaseUrl, accessToken);

  // Update cache
  toolCache = {
    tools,
    timestamp: now,
    ttl,
  };

  console.log(
    `Tool cache updated (${tools.length} tools, TTL: ${Math.round(ttl / 1000)}s)`
  );

  return tools;
}

/**
 * Clear the tool cache
 *
 * Forces next call to getDiscoveredTools to fetch fresh tools from the endpoint.
 * Useful for manual cache invalidation or testing.
 */
export function clearToolCache(): void {
  if (toolCache) {
    console.log('Tool cache cleared');
    toolCache = null;
  }
}
