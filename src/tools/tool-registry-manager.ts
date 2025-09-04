/**
 * Tool Registry Manager - Main Integration Layer
 * 
 * Provides a unified interface for tool registration, discovery, and management.
 * Integrates the tool registry, capability discoverer, and validation systems
 * with the MCP protocol for seamless tool operations.
 */

import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import { ToolRegistry } from './tool-registry';
import { ToolCapabilityDiscoverer, createCapabilityDiscoverer } from './capability-discoverer';
import { SchemaValidator } from './schema-validator';
import type { CallToolParams, CallToolResult, ListToolsParams, ListToolsResult } from '@/protocol/types';
import type {
  ExtendedTool,
  ToolRegistrationRequest,
  ToolRegistrationResult,
  ToolInvocationContext,
  ToolRegistryConfig,
  ToolDiscoveryFilter,
  ToolRegistryStats,
  ToolInvocationMetrics,
  SchemaValidationResult,
  IToolRegistry,
  ToolRegistryEvents,
  ToolHandler,
  ToolDiscoveryResult
} from './types';
import type { ToolCapabilitySummary } from './capability-discoverer';

/**
 * Tool registry manager configuration
 */
export interface ToolRegistryManagerConfig extends ToolRegistryConfig {
  readonly enableDiscovery: boolean;
  readonly enableMetadataManagement: boolean;
  readonly autoValidateOnRegistration: boolean;
  readonly enableRuntimeAvailabilityChecks: boolean;
  readonly discoveryConfig?: {
    readonly enableCaching: boolean;
    readonly cacheExpirationMs: number;
    readonly maxToolsPerResponse: number;
  };
}

/**
 * Tool registry manager events
 */
export interface ToolRegistryManagerEvents extends ToolRegistryEvents {
  'manager:initialized': () => void;
  'manager:shutdown': () => void;
  'capabilities:discovered': (summary: ToolCapabilitySummary) => void;
  'tools:listed': (count: number, filter?: ToolDiscoveryFilter) => void;
  'validation:completed': (results: readonly SchemaValidationResult[]) => void;
}

/**
 * Default configuration
 */
const DEFAULT_MANAGER_CONFIG: ToolRegistryManagerConfig = {
  maxTools: 1000,
  defaultTimeout: 30000,
  enableMetrics: true,
  enableCaching: true,
  strictValidation: true,
  allowOverwrite: false,
  enableDiscovery: true,
  enableMetadataManagement: true,
  autoValidateOnRegistration: true,
  enableRuntimeAvailabilityChecks: true,
  validation: {
    requireDescription: true,
    requireExamples: false,
    maxNameLength: 100,
    maxDescriptionLength: 1000
  },
  discoveryConfig: {
    enableCaching: true,
    cacheExpirationMs: 60000,
    maxToolsPerResponse: 100
  }
};

/**
 * Comprehensive tool registry management system
 */
export class ToolRegistryManager extends EventEmitter implements IToolRegistry {
  private readonly config: ToolRegistryManagerConfig;
  private readonly registry: ToolRegistry;
  private readonly discoverer: ToolCapabilityDiscoverer;
  private readonly validator: SchemaValidator;
  private initialized = false;

  constructor(config: Partial<ToolRegistryManagerConfig> = {}) {
    super();
    
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config };
    
    // Initialize core components
    this.registry = new ToolRegistry(this.config);
    this.validator = new SchemaValidator(this.config);
    
    if (this.config.enableDiscovery) {
      this.discoverer = createCapabilityDiscoverer(this.registry, this.config.discoveryConfig);
    } else {
      // Create a minimal discoverer for compatibility
      this.discoverer = createCapabilityDiscoverer(this.registry, { enableCaching: false });
    }

    this.setupEventForwarding();
    this.setupEventHandlers();

    logger.info('Tool registry manager created', {
      discovery: this.config.enableDiscovery,
      metadata: this.config.enableMetadataManagement,
      autoValidate: this.config.autoValidateOnRegistration,
      runtimeChecks: this.config.enableRuntimeAvailabilityChecks
    });
  }

  /**
   * Initialize the tool registry manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('Tool registry manager already initialized');
      return;
    }

    try {
      // Initialize components - registry is already ready
      
      // Pre-warm discovery cache if enabled
      if (this.config.enableDiscovery && this.config.discoveryConfig?.enableCaching) {
        await this.discoverer.getCapabilitySummary();
      }

      this.initialized = true;
      this.emit('manager:initialized');

      logger.info('Tool registry manager initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize tool registry manager', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Shutdown the tool registry manager
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      // Clear all registrations
      await this.registry.clear();
      
      // Clear caches
      this.discoverer.clearCache();
      this.validator.clearCache();

      this.initialized = false;
      this.emit('manager:shutdown');

      logger.info('Tool registry manager shutdown completed');

    } catch (error) {
      logger.error('Error during tool registry manager shutdown', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // IToolRegistry implementation - delegate to registry

  async registerTool(request: ToolRegistrationRequest): Promise<ToolRegistrationResult> {
    this.ensureInitialized();
    
    // Auto-validate if configured
    if (this.config.autoValidateOnRegistration) {
      request = { ...request, validate: true };
    }

    return await this.registry.registerTool(request);
  }

  async unregisterTool(name: string, version?: string): Promise<boolean> {
    this.ensureInitialized();
    return await this.registry.unregisterTool(name, version);
  }

  async updateTool(request: ToolRegistrationRequest): Promise<ToolRegistrationResult> {
    this.ensureInitialized();
    
    // Auto-validate if configured
    if (this.config.autoValidateOnRegistration) {
      request = { ...request, validate: true };
    }

    return await this.registry.updateTool(request);
  }

  async listTools(filter?: ToolDiscoveryFilter): Promise<ToolDiscoveryResult> {
    this.ensureInitialized();
    
    const result = await this.registry.listTools(filter);
    this.emit('tools:listed', result.tools.length, filter);
    
    return result;
  }

  async getTool(name: string, version?: string): Promise<ExtendedTool | null> {
    this.ensureInitialized();
    return await this.registry.getTool(name, version);
  }

  async searchTools(query: string, filter?: ToolDiscoveryFilter): Promise<ToolDiscoveryResult> {
    this.ensureInitialized();
    return await this.registry.searchTools(query, filter);
  }

  async invokeTool(params: CallToolParams, context: ToolInvocationContext): Promise<CallToolResult> {
    this.ensureInitialized();

    // Enhanced runtime availability checking if enabled
    if (this.config.enableRuntimeAvailabilityChecks) {
      const available = await this.isToolAvailable(params.name);
      if (!available) {
        throw new Error(`Tool '${params.name}' is not available for invocation`);
      }
    }

    return await this.registry.invokeTool(params, context);
  }

  async validateToolParams(toolName: string, params: Record<string, any>): Promise<SchemaValidationResult> {
    this.ensureInitialized();
    return await this.registry.validateToolParams(toolName, params);
  }

  async isToolAvailable(name: string, version?: string): Promise<boolean> {
    this.ensureInitialized();
    return await this.registry.isToolAvailable(name, version);
  }

  async checkToolConditions(name: string, context: ToolInvocationContext): Promise<boolean> {
    this.ensureInitialized();
    return await this.registry.checkToolConditions(name, context);
  }

  async getStats(): Promise<ToolRegistryStats> {
    this.ensureInitialized();
    return await this.registry.getStats();
  }

  async getToolMetrics(name: string): Promise<ToolInvocationMetrics | null> {
    this.ensureInitialized();
    return await this.registry.getToolMetrics(name);
  }

  async clear(): Promise<void> {
    this.ensureInitialized();
    await this.registry.clear();
  }

  async validate(): Promise<SchemaValidationResult[]> {
    this.ensureInitialized();
    
    const results = await this.registry.validate();
    this.emit('validation:completed', results);
    
    return results;
  }

  // Enhanced management methods

  /**
   * Register a tool with handler function (convenience method)
   */
  async registerToolWithHandler(
    tool: Omit<ExtendedTool, 'handler'>,
    handler: ToolHandler,
    options: { replace?: boolean; validate?: boolean } = {}
  ): Promise<ToolRegistrationResult> {
    const extendedTool: ExtendedTool = { ...tool, handler };
    
    return await this.registerTool({
      tool: extendedTool,
      replace: options.replace,
      validate: options.validate
    });
  }

  /**
   * Get MCP-compatible tool list for protocol responses
   */
  async getMCPToolList(params?: ListToolsParams): Promise<ListToolsResult> {
    this.ensureInitialized();

    if (!this.config.enableDiscovery) {
      // Fallback to basic listing
      const result = await this.listTools();
      return {
        tools: result.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
        })),
        nextCursor: undefined
      };
    }

    // Use discoverer for enhanced MCP compatibility
    return await this.discoverer.discoverTools();
  }

  /**
   * Get capability summary for client advertisement
   */
  async getCapabilitySummary(): Promise<ToolCapabilitySummary> {
    this.ensureInitialized();

    if (!this.config.enableDiscovery) {
      // Generate basic summary
      const stats = await this.getStats();
      return {
        supportedTools: stats.totalTools,
        categories: Object.keys(stats.categoryCounts),
        tags: [],
        hasStreamingTools: false,
        hasProgressTools: false,
        hasCancellableTools: false,
        hasAuthRequired: false,
        averageResponseTime: stats.averageResponseTime,
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

    const summary = await this.discoverer.getCapabilitySummary();
    this.emit('capabilities:discovered', summary);
    
    return summary;
  }

  /**
   * Validate a tool definition without registering
   */
  async validateToolDefinition(tool: ExtendedTool): Promise<SchemaValidationResult> {
    this.ensureInitialized();
    return await this.validator.validateToolDefinition(tool);
  }

  /**
   * Get comprehensive registry information
   */
  async getRegistryInfo(): Promise<{
    stats: ToolRegistryStats;
    capabilities: ToolCapabilitySummary;
    discoveryStats: any;
    validationStats: any;
    config: ToolRegistryManagerConfig;
  }> {
    this.ensureInitialized();

    const [stats, capabilities] = await Promise.all([
      this.getStats(),
      this.getCapabilitySummary()
    ]);

    return {
      stats,
      capabilities,
      discoveryStats: this.discoverer.getDiscoveryStats(),
      validationStats: this.validator.getCacheStats(),
      config: this.config
    };
  }

  /**
   * Bulk register multiple tools
   */
  async registerToolsBulk(
    requests: readonly ToolRegistrationRequest[]
  ): Promise<readonly ToolRegistrationResult[]> {
    this.ensureInitialized();

    const results: ToolRegistrationResult[] = [];
    
    for (const request of requests) {
      try {
        const result = await this.registerTool(request);
        results.push(result);
      } catch (error) {
        const errorResult: ToolRegistrationResult = {
          success: false,
          toolName: request.tool.name,
          version: request.tool.version,
          error: error instanceof Error ? error.message : String(error)
        };
        results.push(errorResult);
      }
    }

    return results;
  }

  /**
   * Refresh all caches and indices
   */
  async refresh(): Promise<void> {
    this.ensureInitialized();

    try {
      // Clear caches
      this.validator.clearCache();
      
      if (this.config.enableDiscovery) {
        await this.discoverer.refresh();
      }

      logger.info('Tool registry manager refreshed successfully');

    } catch (error) {
      logger.error('Error refreshing tool registry manager', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get tool by name with automatic version resolution
   */
  async getToolAutoVersion(name: string): Promise<ExtendedTool | null> {
    this.ensureInitialized();

    // Try to get unversioned tool first
    let tool = await this.getTool(name);
    if (tool) return tool;

    // If not found, try to get the latest version
    const allTools = await this.listTools({ namePattern: `^${name}$` });
    const matchingTools = allTools.tools.filter((t: ExtendedTool) => t.name === name);
    
    if (matchingTools.length === 0) return null;

    // Return the first tool (could be enhanced with semantic versioning)
    return matchingTools[0] || null;
  }

  // Private methods

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Tool registry manager not initialized. Call initialize() first.');
    }
  }

  private setupEventForwarding(): void {
    // Forward registry events
    this.registry.on('tool:registered', (...args) => this.emit('tool:registered', ...args));
    this.registry.on('tool:unregistered', (...args) => this.emit('tool:unregistered', ...args));
    this.registry.on('tool:updated', (...args) => this.emit('tool:updated', ...args));
    this.registry.on('tool:invoked', (...args) => this.emit('tool:invoked', ...args));
    this.registry.on('tool:error', (...args) => this.emit('tool:error', ...args));
    this.registry.on('registry:cleared', (...args) => this.emit('registry:cleared', ...args));
    this.registry.on('registry:stats', (...args) => this.emit('registry:stats', ...args));
  }

  private setupEventHandlers(): void {
    this.on('tool:registered', (tool: ExtendedTool) => {
      logger.debug('Tool registered via manager', { toolName: tool.name, version: tool.version });
    });

    this.on('tool:invoked', (toolName: string, context: ToolInvocationContext, result: CallToolResult) => {
      logger.debug('Tool invoked via manager', {
        toolName,
        connectionId: context.connectionId,
        success: !result.isError
      });
    });

    this.on('validation:completed', (results: readonly SchemaValidationResult[]) => {
      const validResults = results.filter(r => r.isValid).length;
      const invalidResults = results.length - validResults;
      
      if (invalidResults > 0) {
        logger.warn('Registry validation found issues', {
          valid: validResults,
          invalid: invalidResults,
          total: results.length
        });
      } else {
        logger.info('Registry validation passed', { totalTools: results.length });
      }
    });
  }

  // Event forwarding for IToolRegistry interface
  override on<K extends keyof ToolRegistryEvents>(event: K, listener: ToolRegistryEvents[K]): void;
  override on(event: string | symbol, listener: (...args: any[]) => void): this;
  override on(event: any, listener: any): this {
    return super.on(event, listener);
  }

  override off<K extends keyof ToolRegistryEvents>(event: K, listener: ToolRegistryEvents[K]): void;
  override off(event: string | symbol, listener: (...args: any[]) => void): this;
  override off(event: any, listener: any): this {
    return super.off(event, listener);
  }

  override emit<K extends keyof ToolRegistryEvents>(event: K, ...args: Parameters<ToolRegistryEvents[K]>): boolean;
  override emit(event: string | symbol, ...args: any[]): boolean;
  override emit(event: any, ...args: any[]): boolean {
    return super.emit(event, ...args);
  }
}

/**
 * Create and initialize a tool registry manager
 */
export async function createToolRegistryManager(
  config?: Partial<ToolRegistryManagerConfig>
): Promise<ToolRegistryManager> {
  const manager = new ToolRegistryManager(config);
  await manager.initialize();
  return manager;
}

/**
 * Default tool registry manager instance
 */
let defaultManager: ToolRegistryManager | null = null;

/**
 * Get or create default tool registry manager instance
 */
export async function getDefaultToolRegistryManager(
  config?: Partial<ToolRegistryManagerConfig>
): Promise<ToolRegistryManager> {
  if (!defaultManager) {
    defaultManager = await createToolRegistryManager(config);
  }
  return defaultManager;
}