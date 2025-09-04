/**
 * Tool Capability Discovery System
 * 
 * Provides comprehensive capability discovery and advertisement for MCP clients.
 * Handles tool enumeration, capability analysis, and dynamic capability updates.
 */

import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import type { Tool, ListToolsResult } from '@/protocol/types';
import type {
  ExtendedTool,
  ToolCapabilities,
  ToolDiscoveryFilter,
  ToolDiscoveryResult,
  ToolRegistryStats,
  IToolRegistry
} from './types';

/**
 * Capability summary for efficient advertisement
 */
export interface ToolCapabilitySummary {
  readonly supportedTools: number;
  readonly categories: readonly string[];
  readonly tags: readonly string[];
  readonly hasStreamingTools: boolean;
  readonly hasProgressTools: boolean;
  readonly hasCancellableTools: boolean;
  readonly hasAuthRequired: boolean;
  readonly averageResponseTime: number;
  readonly capabilities: {
    readonly streaming: number;
    readonly progress: number;
    readonly cancellable: number;
    readonly parallel: number;
    readonly idempotent: number;
    readonly sideEffects: number;
  };
}

/**
 * Tool advertisement data optimized for MCP protocol
 */
export interface ToolAdvertisement {
  readonly tool: Tool; // MCP-compatible tool definition
  readonly extended?: {
    readonly category?: string;
    readonly tags?: readonly string[];
    readonly version?: string;
    readonly capabilities?: ToolCapabilities;
    readonly documentation?: {
      readonly examples?: readonly any[];
      readonly deprecated?: boolean;
    };
  };
}

/**
 * Capability discovery configuration
 */
export interface CapabilityDiscovererConfig {
  readonly enableCaching: boolean;
  readonly cacheExpirationMs: number;
  readonly enableMetrics: boolean;
  readonly maxToolsPerResponse: number;
  readonly includeDevelopmentTools: boolean;
  readonly includeDeprecatedTools: boolean;
}

/**
 * Capability discovery events
 */
export interface CapabilityDiscovererEvents {
  'capabilities:changed': (summary: ToolCapabilitySummary) => void;
  'tools:updated': (tools: readonly ToolAdvertisement[]) => void;
  'discovery:requested': (filter?: ToolDiscoveryFilter) => void;
  'advertisement:generated': (advertisements: readonly ToolAdvertisement[]) => void;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CapabilityDiscovererConfig = {
  enableCaching: true,
  cacheExpirationMs: 60000, // 1 minute
  enableMetrics: true,
  maxToolsPerResponse: 100,
  includeDevelopmentTools: false,
  includeDeprecatedTools: false
};

/**
 * Tool capability discovery and advertisement service
 */
export class ToolCapabilityDiscoverer extends EventEmitter {
  private readonly config: CapabilityDiscovererConfig;
  private readonly registry: IToolRegistry;

  // Cache for expensive operations
  private capabilitySummaryCache: {
    summary: ToolCapabilitySummary;
    timestamp: number;
  } | null = null;

  private toolAdvertisementCache: {
    advertisements: readonly ToolAdvertisement[];
    timestamp: number;
    filter?: ToolDiscoveryFilter;
  } | null = null;

  // Metrics
  private discoveryRequestCount = 0;
  private cacheHitCount = 0;
  private cacheMissCount = 0;

  constructor(
    registry: IToolRegistry,
    config: Partial<CapabilityDiscovererConfig> = {}
  ) {
    super();
    this.registry = registry;
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Listen for registry changes to invalidate cache
    this.setupRegistryEventHandlers();

    logger.info('Tool capability discoverer initialized', {
      cacheEnabled: this.config.enableCaching,
      cacheExpiration: this.config.cacheExpirationMs,
      maxToolsPerResponse: this.config.maxToolsPerResponse
    });
  }

  /**
   * Discover and advertise available tools for MCP clients
   */
  async discoverTools(filter?: ToolDiscoveryFilter): Promise<ListToolsResult> {
    this.discoveryRequestCount++;
    this.emit('discovery:requested', filter);

    try {
      // Check cache first
      const cached = this.getCachedAdvertisements(filter);
      if (cached) {
        this.cacheHitCount++;
        return this.convertToListToolsResult(cached);
      }

      this.cacheMissCount++;

      // Get tools from registry
      const discoveryResult = await this.registry.listTools(filter);
      
      // Generate advertisements
      const advertisements = await this.generateAdvertisements(
        discoveryResult.tools,
        filter
      );

      // Cache the results
      if (this.config.enableCaching) {
        this.cacheAdvertisements(advertisements, filter);
      }

      this.emit('advertisement:generated', advertisements);

      return this.convertToListToolsResult(advertisements);

    } catch (error) {
      logger.error('Error discovering tools', {
        filter,
        error: error instanceof Error ? error.message : String(error)
      });

      // Return empty result on error
      return {
        tools: [],
        nextCursor: undefined
      };
    }
  }

  /**
   * Get comprehensive capability summary
   */
  async getCapabilitySummary(): Promise<ToolCapabilitySummary> {
    try {
      // Check cache first
      if (this.config.enableCaching && this.capabilitySummaryCache) {
        const age = Date.now() - this.capabilitySummaryCache.timestamp;
        if (age < this.config.cacheExpirationMs) {
          this.cacheHitCount++;
          return this.capabilitySummaryCache.summary;
        }
      }

      this.cacheMissCount++;

      // Generate fresh summary
      const summary = await this.generateCapabilitySummary();

      // Cache the summary
      if (this.config.enableCaching) {
        this.capabilitySummaryCache = {
          summary,
          timestamp: Date.now()
        };
      }

      this.emit('capabilities:changed', summary);
      return summary;

    } catch (error) {
      logger.error('Error generating capability summary', {
        error: error instanceof Error ? error.message : String(error)
      });

      // Return empty summary on error
      return this.createEmptyCapabilitySummary();
    }
  }

  /**
   * Get tools filtered by capability requirements
   */
  async getToolsByCapability(requiredCapabilities: Partial<ToolCapabilities>): Promise<readonly ExtendedTool[]> {
    try {
      const filter: ToolDiscoveryFilter = {
        capabilities: requiredCapabilities,
        available: true
      };

      const result = await this.registry.listTools(filter);
      return result.tools;

    } catch (error) {
      logger.error('Error getting tools by capability', {
        requiredCapabilities,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Check if a specific capability is supported by any tool
   */
  async isCapabilitySupported(capability: keyof ToolCapabilities): Promise<boolean> {
    try {
      const summary = await this.getCapabilitySummary();
      return summary.capabilities[capability] > 0;

    } catch (error) {
      logger.error('Error checking capability support', {
        capability,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get tools that match MCP protocol requirements
   */
  async getMCPCompatibleTools(filter?: ToolDiscoveryFilter): Promise<readonly Tool[]> {
    try {
      const advertisements = await this.discoverTools(filter);
      return advertisements.tools;

    } catch (error) {
      logger.error('Error getting MCP compatible tools', {
        filter,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Get discovery and cache statistics
   */
  getDiscoveryStats(): {
    requestCount: number;
    cacheHitRate: number;
    cachedSummaries: number;
    cachedAdvertisements: number;
    lastDiscoveryTime?: Date;
  } {
    const totalRequests = this.cacheHitCount + this.cacheMissCount;
    const hitRate = totalRequests > 0 ? this.cacheHitCount / totalRequests : 0;

    return {
      requestCount: this.discoveryRequestCount,
      cacheHitRate: hitRate,
      cachedSummaries: this.capabilitySummaryCache ? 1 : 0,
      cachedAdvertisements: this.toolAdvertisementCache ? 1 : 0,
      lastDiscoveryTime: this.toolAdvertisementCache ? 
        new Date(this.toolAdvertisementCache.timestamp) : undefined
    };
  }

  /**
   * Clear discovery cache
   */
  clearCache(): void {
    this.capabilitySummaryCache = null;
    this.toolAdvertisementCache = null;
    
    logger.debug('Tool discovery cache cleared');
  }

  /**
   * Refresh capability summary and tool advertisements
   */
  async refresh(): Promise<void> {
    try {
      this.clearCache();
      
      // Pre-warm cache with fresh data
      await this.getCapabilitySummary();
      await this.discoverTools();

      logger.info('Tool discovery cache refreshed');

    } catch (error) {
      logger.error('Error refreshing discovery cache', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // Private helper methods

  private setupRegistryEventHandlers(): void {
    this.registry.on('tool:registered', () => this.invalidateCache());
    this.registry.on('tool:unregistered', () => this.invalidateCache());
    this.registry.on('tool:updated', () => this.invalidateCache());
    this.registry.on('registry:cleared', () => this.invalidateCache());
  }

  private invalidateCache(): void {
    this.capabilitySummaryCache = null;
    this.toolAdvertisementCache = null;
    logger.debug('Discovery cache invalidated due to registry change');
  }

  private getCachedAdvertisements(filter?: ToolDiscoveryFilter): readonly ToolAdvertisement[] | null {
    if (!this.config.enableCaching || !this.toolAdvertisementCache) {
      return null;
    }

    const age = Date.now() - this.toolAdvertisementCache.timestamp;
    if (age >= this.config.cacheExpirationMs) {
      return null;
    }

    // Simple filter comparison - could be improved for complex filters
    if (!this.filtersEqual(this.toolAdvertisementCache.filter, filter)) {
      return null;
    }

    return this.toolAdvertisementCache.advertisements;
  }

  private cacheAdvertisements(advertisements: readonly ToolAdvertisement[], filter?: ToolDiscoveryFilter): void {
    this.toolAdvertisementCache = {
      advertisements,
      timestamp: Date.now(),
      filter
    };
  }

  private async generateAdvertisements(
    tools: readonly ExtendedTool[],
    filter?: ToolDiscoveryFilter
  ): Promise<readonly ToolAdvertisement[]> {
    const advertisements: ToolAdvertisement[] = [];

    for (const tool of tools) {
      // Apply additional filters not handled by registry
      if (!this.shouldIncludeTool(tool, filter)) {
        continue;
      }

      const advertisement = this.createToolAdvertisement(tool);
      advertisements.push(advertisement);

      // Respect max tools limit
      if (advertisements.length >= this.config.maxToolsPerResponse) {
        break;
      }
    }

    return advertisements;
  }

  private shouldIncludeTool(tool: ExtendedTool, filter?: ToolDiscoveryFilter): boolean {
    // Check development tools
    if (!this.config.includeDevelopmentTools && tool.category === 'development') {
      return false;
    }

    // Check deprecated tools
    if (!this.config.includeDeprecatedTools && tool.documentation?.deprecated) {
      return false;
    }

    return true;
  }

  private createToolAdvertisement(tool: ExtendedTool): ToolAdvertisement {
    // Create MCP-compatible tool definition
    const mcpTool: Tool = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    };

    // Create extended metadata
    const extended: any = {};

    if (tool.category) extended.category = tool.category;
    if (tool.tags) extended.tags = tool.tags;
    if (tool.version) extended.version = tool.version;
    if (tool.capabilities) extended.capabilities = tool.capabilities;

    if (tool.documentation) {
      extended.documentation = {
        examples: tool.documentation.examples,
        deprecated: tool.documentation.deprecated
      };
    }

    return {
      tool: mcpTool,
      extended: Object.keys(extended).length > 0 ? extended : undefined
    };
  }

  private async generateCapabilitySummary(): Promise<ToolCapabilitySummary> {
    try {
      const [discoveryResult, stats] = await Promise.all([
        this.registry.listTools(),
        this.registry.getStats()
      ]);

      const tools = discoveryResult.tools;
      
      // Collect categories and tags
      const categories = new Set<string>();
      const tags = new Set<string>();
      
      // Count capabilities
      const capabilities = {
        streaming: 0,
        progress: 0,
        cancellable: 0,
        parallel: 0,
        idempotent: 0,
        sideEffects: 0
      };

      let hasStreamingTools = false;
      let hasProgressTools = false;
      let hasCancellableTools = false;
      let hasAuthRequired = false;

      for (const tool of tools) {
        // Categories and tags
        if (tool.category) categories.add(tool.category);
        if (tool.tags) tool.tags.forEach(tag => tags.add(tag));

        // Authentication
        if (tool.requiresAuth) hasAuthRequired = true;

        // Capabilities
        if (tool.capabilities) {
          if (tool.capabilities.streaming) {
            capabilities.streaming++;
            hasStreamingTools = true;
          }
          if (tool.capabilities.progress) {
            capabilities.progress++;
            hasProgressTools = true;
          }
          if (tool.capabilities.cancellable) {
            capabilities.cancellable++;
            hasCancellableTools = true;
          }
          if (tool.capabilities.parallel) capabilities.parallel++;
          if (tool.capabilities.idempotent) capabilities.idempotent++;
          if (tool.capabilities.sideEffects) capabilities.sideEffects++;
        }
      }

      return {
        supportedTools: stats.totalTools,
        categories: Array.from(categories).sort(),
        tags: Array.from(tags).sort(),
        hasStreamingTools,
        hasProgressTools,
        hasCancellableTools,
        hasAuthRequired,
        averageResponseTime: stats.averageResponseTime,
        capabilities
      };

    } catch (error) {
      logger.error('Error generating capability summary', {
        error: error instanceof Error ? error.message : String(error)
      });
      return this.createEmptyCapabilitySummary();
    }
  }

  private createEmptyCapabilitySummary(): ToolCapabilitySummary {
    return {
      supportedTools: 0,
      categories: [],
      tags: [],
      hasStreamingTools: false,
      hasProgressTools: false,
      hasCancellableTools: false,
      hasAuthRequired: false,
      averageResponseTime: 0,
      capabilities: {
        streaming: 0,
        progress: 0,
        cancellable: 0,
        parallel: 0,
        idempotent: 0,
        sideEffects: 0
      }
    };
  }

  private convertToListToolsResult(advertisements: readonly ToolAdvertisement[]): ListToolsResult {
    const tools = advertisements.map(ad => ad.tool);
    
    // Simple cursor implementation - could be enhanced for pagination
    const nextCursor = advertisements.length >= this.config.maxToolsPerResponse ? 
      `page_${Math.ceil(advertisements.length / this.config.maxToolsPerResponse)}` : 
      undefined;

    return {
      tools,
      nextCursor
    };
  }

  private filtersEqual(filter1?: ToolDiscoveryFilter, filter2?: ToolDiscoveryFilter): boolean {
    // Simplified filter comparison - could be enhanced for deep comparison
    if (!filter1 && !filter2) return true;
    if (!filter1 || !filter2) return false;

    return (
      filter1.category === filter2.category &&
      filter1.requiresAuth === filter2.requiresAuth &&
      filter1.available === filter2.available &&
      filter1.namePattern === filter2.namePattern &&
      filter1.version === filter2.version &&
      JSON.stringify(filter1.tags) === JSON.stringify(filter2.tags) &&
      JSON.stringify(filter1.capabilities) === JSON.stringify(filter2.capabilities)
    );
  }
}

/**
 * Utility functions for capability matching and analysis
 */
export class CapabilityMatcher {
  /**
   * Check if a tool matches required capabilities
   */
  static matchesCapabilities(
    tool: ExtendedTool,
    required: Partial<ToolCapabilities>
  ): boolean {
    if (!tool.capabilities) {
      // If tool has no capabilities, it only matches if no capabilities are required
      return Object.keys(required).length === 0;
    }

    for (const [key, value] of Object.entries(required)) {
      if (tool.capabilities[key as keyof ToolCapabilities] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Score tool compatibility with required capabilities
   */
  static scoreCompatibility(
    tool: ExtendedTool,
    required: Partial<ToolCapabilities>
  ): number {
    if (!tool.capabilities) {
      return Object.keys(required).length === 0 ? 1.0 : 0.0;
    }

    const requiredKeys = Object.keys(required);
    if (requiredKeys.length === 0) return 1.0;

    let matches = 0;
    for (const [key, value] of Object.entries(required)) {
      if (tool.capabilities[key as keyof ToolCapabilities] === value) {
        matches++;
      }
    }

    return matches / requiredKeys.length;
  }

  /**
   * Find best matching tools for capabilities
   */
  static findBestMatches(
    tools: readonly ExtendedTool[],
    required: Partial<ToolCapabilities>,
    limit: number = 10
  ): readonly ExtendedTool[] {
    const scored = tools
      .map(tool => ({
        tool,
        score: CapabilityMatcher.scoreCompatibility(tool, required)
      }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map(item => item.tool);
  }
}

/**
 * Export default instance factory
 */
export function createCapabilityDiscoverer(
  registry: IToolRegistry,
  config?: Partial<CapabilityDiscovererConfig>
): ToolCapabilityDiscoverer {
  return new ToolCapabilityDiscoverer(registry, config);
}