---
id: 4
group: 'caching'
dependencies: [2]
status: 'completed'
created: '2025-10-02'
skills: ['typescript']
---

# Implement Tool Cache Layer

## Objective

Create `src/discovery/tool-cache.ts` to cache discovered tools in memory for 1 hour, reducing
repeated discovery calls and improving startup performance.

## Skills Required

- **typescript**: Module-level state management, timestamp handling

## Acceptance Criteria

- [ ] `src/discovery/tool-cache.ts` created with cache logic
- [ ] Export `getDiscoveredTools` function that wraps `discoverTools`
- [ ] Cache stores tools with timestamp and TTL (1 hour default)
- [ ] Cache hit returns stored tools without HTTP request
- [ ] Cache miss calls `discoverTools` and stores result
- [ ] `forceFresh` parameter bypasses cache
- [ ] Export `clearToolCache` function for manual cache invalidation
- [ ] TTL configurable via environment variable `TOOL_CACHE_TTL_MS`

## Technical Requirements

**File Location**: `src/discovery/tool-cache.ts`

**Cache Structure**:

```typescript
interface ToolCache {
  tools: ToolDefinition[];
  timestamp: number;
  ttl: number; // milliseconds
}
```

**Function Signatures**:

```typescript
export async function getDiscoveredTools(
  drupalBaseUrl: string,
  accessToken?: string,
  forceFresh?: boolean
): Promise<ToolDefinition[]>;

export function clearToolCache(): void;
```

**Default TTL**: 3600000ms (1 hour)

**Environment Variable**: `TOOL_CACHE_TTL_MS` (optional, defaults to 1 hour)

## Input Dependencies

- `discoverTools` function from `tool-discovery.ts`
- Environment variable `TOOL_CACHE_TTL_MS` (optional)

## Output Artifacts

- `src/discovery/tool-cache.ts` with caching logic
- Cached tool definitions in module-level variable

## Implementation Notes

<details>
<summary>Detailed Implementation Steps</summary>

### Step 1: Create File with Type Definitions

```typescript
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
```

### Step 2: Implement getTTL Helper

```typescript
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
    console.warn(`Invalid TOOL_CACHE_TTL_MS value: "${envTTL}". Using default ${DEFAULT_TTL_MS}ms`);
  }

  return DEFAULT_TTL_MS;
}
```

### Step 3: Implement getDiscoveredTools Function

```typescript
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
      `Using cached tool definitions (age: ${ageSeconds}s, TTL: ${Math.round(ttl / 1000)}s)`
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

  console.log(`Tool cache updated (${tools.length} tools, TTL: ${Math.round(ttl / 1000)}s)`);

  return tools;
}
```

### Step 4: Implement clearToolCache Function

```typescript
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
```

### Step 5: Add Exports to Discovery Index

Update `src/discovery/index.ts`:

```typescript
export {
  discoverTools,
  type ToolDefinition,
  type ToolDiscoveryResponse,
  type JSONSchema,
} from './tool-discovery.js';

export { getDiscoveredTools, clearToolCache } from './tool-cache.js';

export { registerDynamicTools } from './dynamic-handlers.js';
```

### Step 6: Type Check

```bash
npm run type-check
```

### Step 7: Optional - Add Cache Statistics

Consider adding a function to get cache statistics for debugging:

```typescript
export function getCacheStats(): {
  isCached: boolean;
  age?: number;
  ttl?: number;
  toolCount?: number;
} {
  if (!toolCache) {
    return { isCached: false };
  }

  return {
    isCached: true,
    age: Date.now() - toolCache.timestamp,
    ttl: toolCache.ttl,
    toolCount: toolCache.tools.length,
  };
}
```

### Usage Example

```typescript
// In src/index.ts startup code
import { getDiscoveredTools } from './discovery/index.js';

// First call - fetches from endpoint
const tools1 = await getDiscoveredTools(DRUPAL_BASE_URL);

// Second call within 1 hour - returns cached
const tools2 = await getDiscoveredTools(DRUPAL_BASE_URL);

// Force fresh fetch
const tools3 = await getDiscoveredTools(DRUPAL_BASE_URL, undefined, true);
```

### Configuration Example

Set custom TTL via environment variable:

```bash
# .env file
TOOL_CACHE_TTL_MS=7200000  # 2 hours
```

### Troubleshooting

**Issue: Cache Never Expires**

- Check system clock is working correctly
- Verify `Date.now()` returns increasing timestamps
- Check TTL calculation logic

**Issue: Cache Always Misses**

- Check `toolCache` variable is persisting between calls
- Verify module is not being reloaded (check module caching in Node.js)
- Check TTL is not set to 0 or negative value

**Issue: Memory Leak Concerns**

- Current implementation stores single cache entry (small memory footprint)
- Tools array typically small (< 100 tools, few KB)
- Cache automatically expires and gets replaced
- For large deployments, consider LRU cache or external cache (Redis)

</details>
