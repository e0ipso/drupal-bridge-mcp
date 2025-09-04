/**
 * In-Memory Tool Registry with Dynamic CRUD Operations
 * 
 * Provides comprehensive tool management with registration, discovery,
 * invocation, and monitoring capabilities. Implements thread-safe operations
 * with efficient lookup mechanisms and comprehensive validation.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { logger } from '@/utils/logger';
import { SchemaValidator } from './schema-validator';
import type { CallToolParams, CallToolResult, Tool } from '@/protocol/types';
import type {
  ExtendedTool,
  IToolRegistry,
  ToolRegistrationRequest,
  ToolRegistrationResult,
  ToolDiscoveryFilter,
  ToolDiscoveryResult,
  ToolInvocationContext,
  SchemaValidationResult,
  ToolRegistryStats,
  ToolInvocationMetrics,
  ToolRegistryConfig,
  ToolRegistryEvents,
  ToolInvocationState,
  ToolAvailability,
  ToolCondition
} from './types';
import {
  ToolRegistryError,
  ToolRegistryErrorCode
} from './types';

/**
 * Tool storage entry with metadata
 */
interface ToolEntry {
  readonly tool: ExtendedTool;
  readonly registeredAt: Date;
  readonly lastModified: Date;
  metrics: ToolInvocationMetrics;
  readonly activeInvocations: Set<string>;
}

/**
 * Rate limiting tracker
 */
interface RateLimitTracker {
  readonly calls: Date[];
  readonly windowMs: number;
  readonly maxCalls: number;
}

/**
 * Default configuration for tool registry
 */
const DEFAULT_CONFIG: ToolRegistryConfig = {
  maxTools: 1000,
  defaultTimeout: 30000, // 30 seconds
  enableMetrics: true,
  enableCaching: true,
  strictValidation: true,
  allowOverwrite: false,
  validation: {
    requireDescription: true,
    requireExamples: false,
    maxNameLength: 100,
    maxDescriptionLength: 1000,
    allowedCategories: undefined
  }
};

/**
 * In-memory tool registry implementation
 */
export class ToolRegistry extends EventEmitter implements IToolRegistry {
  private readonly config: ToolRegistryConfig;
  private readonly validator: SchemaValidator;
  private readonly tools = new Map<string, ToolEntry>();
  private readonly versionedTools = new Map<string, Map<string, ToolEntry>>();
  private readonly rateLimitTrackers = new Map<string, RateLimitTracker>();
  private readonly activeInvocations = new Map<string, ToolInvocationState>();
  private readonly lock = new AsyncLock();

  // Indices for efficient querying
  private readonly categoryIndex = new Map<string, Set<string>>();
  private readonly tagIndex = new Map<string, Set<string>>();
  private readonly availabilityIndex = new Set<string>();

  constructor(config: Partial<ToolRegistryConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.validator = new SchemaValidator(this.config);

    logger.info('Tool registry initialized', {
      maxTools: this.config.maxTools,
      strictValidation: this.config.strictValidation,
      metricsEnabled: this.config.enableMetrics
    });
  }

  /**
   * Register a new tool or update an existing one
   */
  async registerTool(request: ToolRegistrationRequest): Promise<ToolRegistrationResult> {
    return await this.lock.acquire('registry', async () => {
      try {
        const { tool, replace = this.config.allowOverwrite, validate = true } = request;
        const toolKey = this.getToolKey(tool.name, tool.version);

        // Check if registry is full
        if (!this.tools.has(toolKey) && this.tools.size >= this.config.maxTools) {
          throw new ToolRegistryError(
            ToolRegistryErrorCode.REGISTRY_FULL,
            `Registry is full (max ${this.config.maxTools} tools)`,
            tool.name
          );
        }

        // Check if tool already exists
        if (this.tools.has(toolKey) && !replace) {
          throw new ToolRegistryError(
            ToolRegistryErrorCode.TOOL_ALREADY_EXISTS,
            `Tool '${tool.name}' ${tool.version ? `version '${tool.version}' ` : ''}already exists`,
            tool.name
          );
        }

        // Validate tool definition
        let validationResults: SchemaValidationResult[] = [];
        if (validate) {
          const validation = await this.validator.validateToolDefinition(tool);
          validationResults = [validation];
          
          if (!validation.isValid) {
            throw new ToolRegistryError(
              ToolRegistryErrorCode.SCHEMA_VALIDATION_FAILED,
              `Tool validation failed: ${validation.errors?.map(e => e.message).join(', ')}`,
              tool.name,
              { validation }
            );
          }
        }

        // Store existing tool for comparison
        const existingEntry = this.tools.get(toolKey);
        const previousTool = existingEntry?.tool;

        // Create tool entry
        const now = new Date();
        const entry: ToolEntry = {
          tool: { ...tool },
          registeredAt: existingEntry?.registeredAt ?? now,
          lastModified: now,
          metrics: existingEntry?.metrics ?? this.createEmptyMetrics(tool.name),
          activeInvocations: existingEntry?.activeInvocations ?? new Set()
        };

        // Update storage
        this.tools.set(toolKey, entry);
        
        // Update versioned storage
        if (tool.version) {
          let versionMap = this.versionedTools.get(tool.name);
          if (!versionMap) {
            versionMap = new Map();
            this.versionedTools.set(tool.name, versionMap);
          }
          versionMap.set(tool.version, entry);
        }

        // Update indices
        await this.updateIndices(tool, previousTool);

        // Initialize rate limiting if configured
        if (tool.availability?.rateLimit) {
          this.rateLimitTrackers.set(toolKey, {
            calls: [],
            windowMs: tool.availability.rateLimit.windowMs,
            maxCalls: tool.availability.rateLimit.maxCalls
          });
        }

        // Emit events
        if (previousTool) {
          this.emit('tool:updated', tool, previousTool);
        } else {
          this.emit('tool:registered', tool);
        }

        logger.info('Tool registered successfully', {
          toolName: tool.name,
          version: tool.version,
          category: tool.category,
          replaced: !!previousTool
        });

        return {
          success: true,
          toolName: tool.name,
          version: tool.version,
          validationResults: validationResults.length > 0 ? validationResults : undefined,
          warnings: validationResults[0]?.warnings?.map(w => w.message)
        };

      } catch (error) {
        if (error instanceof ToolRegistryError) {
          logger.warn('Tool registration failed', {
            toolName: error.toolName,
            code: error.code,
            message: error.message
          });

          return {
            success: false,
            toolName: request.tool.name,
            version: request.tool.version,
            error: error.message
          };
        }

        logger.error('Unexpected error during tool registration', {
          toolName: request.tool.name,
          error: error instanceof Error ? error.message : String(error)
        });

        return {
          success: false,
          toolName: request.tool.name,
          version: request.tool.version,
          error: 'Internal registration error'
        };
      }
    });
  }

  /**
   * Unregister a tool
   */
  async unregisterTool(name: string, version?: string): Promise<boolean> {
    return await this.lock.acquire('registry', async () => {
      try {
        const toolKey = this.getToolKey(name, version);
        const entry = this.tools.get(toolKey);

        if (!entry) {
          logger.warn('Attempted to unregister non-existent tool', { name, version });
          return false;
        }

        // Cancel active invocations
        for (const invocationId of entry.activeInvocations) {
          const state = this.activeInvocations.get(invocationId);
          if (state && state.timeout) {
            clearTimeout(state.timeout);
          }
          this.activeInvocations.delete(invocationId);
        }

        // Remove from storage
        this.tools.delete(toolKey);

        // Remove from versioned storage
        if (version) {
          const versionMap = this.versionedTools.get(name);
          if (versionMap) {
            versionMap.delete(version);
            if (versionMap.size === 0) {
              this.versionedTools.delete(name);
            }
          }
        }

        // Update indices
        await this.removeFromIndices(entry.tool);

        // Clean up rate limiting
        this.rateLimitTrackers.delete(toolKey);

        this.emit('tool:unregistered', name, version);

        logger.info('Tool unregistered successfully', { name, version });
        return true;

      } catch (error) {
        logger.error('Error unregistering tool', {
          name,
          version,
          error: error instanceof Error ? error.message : String(error)
        });
        return false;
      }
    });
  }

  /**
   * Update an existing tool
   */
  async updateTool(request: ToolRegistrationRequest): Promise<ToolRegistrationResult> {
    // Update is the same as register with replace=true
    return await this.registerTool({ ...request, replace: true });
  }

  /**
   * List tools with optional filtering
   */
  async listTools(filter?: ToolDiscoveryFilter): Promise<ToolDiscoveryResult> {
    try {
      let tools = Array.from(this.tools.values()).map(entry => entry.tool);

      // Apply filters
      if (filter) {
        tools = await this.applyFilters(tools, filter);
      }

      return {
        tools,
        totalCount: this.tools.size,
        filteredCount: tools.length
      };

    } catch (error) {
      logger.error('Error listing tools', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        tools: [],
        totalCount: 0,
        filteredCount: 0
      };
    }
  }

  /**
   * Get a specific tool by name and optional version
   */
  async getTool(name: string, version?: string): Promise<ExtendedTool | null> {
    try {
      const toolKey = this.getToolKey(name, version);
      const entry = this.tools.get(toolKey);
      return entry?.tool ?? null;

    } catch (error) {
      logger.error('Error getting tool', {
        name,
        version,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Search tools by query string
   */
  async searchTools(query: string, filter?: ToolDiscoveryFilter): Promise<ToolDiscoveryResult> {
    try {
      const lowercaseQuery = query.toLowerCase();
      let tools = Array.from(this.tools.values())
        .map(entry => entry.tool)
        .filter(tool => 
          tool.name.toLowerCase().includes(lowercaseQuery) ||
          tool.description?.toLowerCase().includes(lowercaseQuery) ||
          tool.category?.toLowerCase().includes(lowercaseQuery) ||
          tool.tags?.some(tag => tag.toLowerCase().includes(lowercaseQuery))
        );

      // Apply additional filters
      if (filter) {
        tools = await this.applyFilters(tools, filter);
      }

      return {
        tools,
        totalCount: this.tools.size,
        filteredCount: tools.length
      };

    } catch (error) {
      logger.error('Error searching tools', {
        query,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        tools: [],
        totalCount: 0,
        filteredCount: 0
      };
    }
  }

  /**
   * Invoke a tool with parameters
   */
  async invokeTool(params: CallToolParams, context: ToolInvocationContext): Promise<CallToolResult> {
    const invocationId = randomUUID();
    
    try {
      // Get tool
      const tool = await this.getTool(params.name);
      if (!tool) {
        throw new ToolRegistryError(
          ToolRegistryErrorCode.TOOL_NOT_FOUND,
          `Tool '${params.name}' not found`,
          params.name
        );
      }

      // Check availability
      const isAvailable = await this.isToolAvailable(params.name);
      if (!isAvailable) {
        throw new ToolRegistryError(
          ToolRegistryErrorCode.TOOL_UNAVAILABLE,
          `Tool '${params.name}' is currently unavailable`,
          params.name
        );
      }

      // Check conditions
      const conditionsOk = await this.checkToolConditions(params.name, context);
      if (!conditionsOk) {
        throw new ToolRegistryError(
          ToolRegistryErrorCode.PERMISSION_DENIED,
          `Tool '${params.name}' conditions not met`,
          params.name
        );
      }

      // Check concurrency limits
      await this.checkConcurrencyLimits(tool, invocationId);

      // Check rate limits
      await this.checkRateLimits(tool);

      // Validate parameters
      const paramValidation = await this.validateToolParams(params.name, params.arguments || {});
      if (!paramValidation.isValid) {
        throw new ToolRegistryError(
          ToolRegistryErrorCode.SCHEMA_VALIDATION_FAILED,
          `Parameter validation failed: ${paramValidation.errors?.map(e => e.message).join(', ')}`,
          params.name
        );
      }

      // Execute tool
      const result = await this.executeTool(tool, params.arguments || {}, context, invocationId);

      // Update metrics
      if (this.config.enableMetrics) {
        await this.updateToolMetrics(params.name, true, Date.now() - context.timestamp);
      }

      this.emit('tool:invoked', params.name, context, result);
      
      return result;

    } catch (error) {
      // Update error metrics
      if (this.config.enableMetrics) {
        await this.updateToolMetrics(params.name, false, Date.now() - context.timestamp, error);
      }

      this.emit('tool:error', params.name, context, error as Error);

      if (error instanceof ToolRegistryError) {
        throw error;
      }

      logger.error('Unexpected error during tool invocation', {
        toolName: params.name,
        invocationId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw new ToolRegistryError(
        ToolRegistryErrorCode.INVOCATION_FAILED,
        'Tool invocation failed due to internal error',
        params.name
      );

    } finally {
      // Clean up invocation tracking
      this.activeInvocations.delete(invocationId);
      const toolKey = this.getToolKey(params.name);
      const entry = this.tools.get(toolKey);
      entry?.activeInvocations.delete(invocationId);
    }
  }

  /**
   * Validate tool parameters against tool schema
   */
  async validateToolParams(toolName: string, params: Record<string, any>): Promise<SchemaValidationResult> {
    try {
      const tool = await this.getTool(toolName);
      if (!tool) {
        return {
          isValid: false,
          errors: [{
            path: 'root',
            message: `Tool '${toolName}' not found`,
            constraint: 'existence'
          }]
        };
      }

      return await this.validator.validateData(params, tool.inputSchema, 'params');

    } catch (error) {
      logger.error('Error validating tool parameters', {
        toolName,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        isValid: false,
        errors: [{
          path: 'root',
          message: 'Parameter validation error',
          constraint: 'internal'
        }]
      };
    }
  }

  /**
   * Check if a tool is currently available
   */
  async isToolAvailable(name: string, version?: string): Promise<boolean> {
    try {
      const tool = await this.getTool(name, version);
      if (!tool) {
        return false;
      }

      // Check explicit availability
      if (tool.availability?.available === false) {
        return false;
      }

      // Check availability conditions
      if (tool.availability?.conditions) {
        for (const condition of tool.availability.conditions) {
          try {
            const result = await condition.check();
            if (!result) {
              return false;
            }
          } catch (error) {
            logger.warn('Tool availability condition check failed', {
              toolName: name,
              conditionType: condition.type,
              error: error instanceof Error ? error.message : String(error)
            });
            return false;
          }
        }
      }

      return true;

    } catch (error) {
      logger.error('Error checking tool availability', {
        name,
        version,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Check tool conditions for invocation context
   */
  async checkToolConditions(name: string, context: ToolInvocationContext): Promise<boolean> {
    try {
      const tool = await this.getTool(name);
      if (!tool?.availability?.conditions) {
        return true;
      }

      for (const condition of tool.availability.conditions) {
        try {
          const result = await condition.check();
          if (!result) {
            logger.debug('Tool condition failed', {
              toolName: name,
              conditionType: condition.type,
              description: condition.description,
              connectionId: context.connectionId
            });
            return false;
          }
        } catch (error) {
          logger.warn('Tool condition check error', {
            toolName: name,
            conditionType: condition.type,
            error: error instanceof Error ? error.message : String(error)
          });
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Error checking tool conditions', {
        name,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Get registry statistics
   */
  async getStats(): Promise<ToolRegistryStats> {
    try {
      const tools = Array.from(this.tools.values());
      const availableTools = await Promise.all(
        Array.from(this.tools.keys()).map(async key => {
          const [name] = this.parseToolKey(key);
          return await this.isToolAvailable(name || key);
        })
      );
      const availableCount = availableTools.filter(Boolean).length;

      const categoryCounts: Record<string, number> = {};
      let totalInvocations = 0;
      let totalExecutionTime = 0;
      let recentErrors = 0;
      const now = Date.now();

      for (const entry of tools) {
        // Category counts
        const category = entry.tool.category || 'uncategorized';
        categoryCounts[category] = (categoryCounts[category] || 0) + 1;

        // Metrics
        totalInvocations += entry.metrics.invocationCount;
        totalExecutionTime += entry.metrics.averageExecutionTime * entry.metrics.invocationCount;
        
        // Recent errors (last 24 hours)
        if (entry.metrics.lastError && 
            now - entry.metrics.lastError.timestamp.getTime() < 24 * 60 * 60 * 1000) {
          recentErrors++;
        }
      }

      return {
        totalTools: this.tools.size,
        availableTools: availableCount,
        categoryCounts,
        averageResponseTime: totalInvocations > 0 ? totalExecutionTime / totalInvocations : 0,
        totalInvocations,
        recentErrors,
        registryVersion: '1.0.0'
      };

    } catch (error) {
      logger.error('Error getting registry stats', {
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        totalTools: 0,
        availableTools: 0,
        categoryCounts: {},
        averageResponseTime: 0,
        totalInvocations: 0,
        recentErrors: 0,
        registryVersion: '1.0.0'
      };
    }
  }

  /**
   * Get metrics for a specific tool
   */
  async getToolMetrics(name: string): Promise<ToolInvocationMetrics | null> {
    try {
      const toolKey = this.getToolKey(name);
      const entry = this.tools.get(toolKey);
      return entry?.metrics ?? null;

    } catch (error) {
      logger.error('Error getting tool metrics', {
        name,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Clear all tools from registry
   */
  async clear(): Promise<void> {
    return await this.lock.acquire('registry', async () => {
      try {
        // Cancel all active invocations
        for (const [invocationId, state] of this.activeInvocations) {
          if (state.timeout) {
            clearTimeout(state.timeout);
          }
        }

        // Clear all storage
        this.tools.clear();
        this.versionedTools.clear();
        this.rateLimitTrackers.clear();
        this.activeInvocations.clear();
        this.categoryIndex.clear();
        this.tagIndex.clear();
        this.availabilityIndex.clear();

        // Clear validator cache
        this.validator.clearCache();

        this.emit('registry:cleared');

        logger.info('Tool registry cleared');

      } catch (error) {
        logger.error('Error clearing registry', {
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    });
  }

  /**
   * Validate all registered tools
   */
  async validate(): Promise<SchemaValidationResult[]> {
    try {
      const results: SchemaValidationResult[] = [];

      for (const entry of this.tools.values()) {
        const validation = await this.validator.validateToolDefinition(entry.tool);
        results.push(validation);
      }

      return results;

    } catch (error) {
      logger.error('Error validating registry', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  // Private helper methods

  private getToolKey(name: string, version?: string): string {
    return version ? `${name}@${version}` : name;
  }

  private parseToolKey(key: string): [string, string | undefined] {
    const parts = key.split('@');
    return [parts[0] || key, parts[1]];
  }

  private createEmptyMetrics(toolName: string): ToolInvocationMetrics {
    return {
      toolName,
      invocationCount: 0,
      averageExecutionTime: 0,
      successRate: 1.0,
      lastInvocation: new Date(),
      errorCount: 0
    };
  }

  private async updateIndices(tool: ExtendedTool, previousTool?: ExtendedTool): Promise<void> {
    // Remove from old indices
    if (previousTool) {
      await this.removeFromIndices(previousTool);
    }

    // Add to new indices
    if (tool.category) {
      let categorySet = this.categoryIndex.get(tool.category);
      if (!categorySet) {
        categorySet = new Set();
        this.categoryIndex.set(tool.category, categorySet);
      }
      categorySet.add(tool.name);
    }

    if (tool.tags) {
      for (const tag of tool.tags) {
        let tagSet = this.tagIndex.get(tag);
        if (!tagSet) {
          tagSet = new Set();
          this.tagIndex.set(tag, tagSet);
        }
        tagSet.add(tool.name);
      }
    }

    // Update availability index
    const isAvailable = await this.isToolAvailable(tool.name);
    if (isAvailable) {
      this.availabilityIndex.add(tool.name);
    } else {
      this.availabilityIndex.delete(tool.name);
    }
  }

  private async removeFromIndices(tool: ExtendedTool): Promise<void> {
    // Remove from category index
    if (tool.category) {
      const categorySet = this.categoryIndex.get(tool.category);
      if (categorySet) {
        categorySet.delete(tool.name);
        if (categorySet.size === 0) {
          this.categoryIndex.delete(tool.category);
        }
      }
    }

    // Remove from tag indices
    if (tool.tags) {
      for (const tag of tool.tags) {
        const tagSet = this.tagIndex.get(tag);
        if (tagSet) {
          tagSet.delete(tool.name);
          if (tagSet.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      }
    }

    // Remove from availability index
    this.availabilityIndex.delete(tool.name);
  }

  private async applyFilters(tools: ExtendedTool[], filter: ToolDiscoveryFilter): Promise<ExtendedTool[]> {
    let filtered = tools;

    if (filter.category) {
      filtered = filtered.filter(tool => tool.category === filter.category);
    }

    if (filter.tags && filter.tags.length > 0) {
      filtered = filtered.filter(tool => 
        tool.tags && filter.tags!.some(tag => tool.tags!.includes(tag))
      );
    }

    if (filter.requiresAuth !== undefined) {
      filtered = filtered.filter(tool => tool.requiresAuth === filter.requiresAuth);
    }

    if (filter.available !== undefined) {
      const availabilityChecks = await Promise.all(
        filtered.map(tool => this.isToolAvailable(tool.name))
      );
      filtered = filtered.filter((_, index) => availabilityChecks[index] === filter.available);
    }

    if (filter.namePattern) {
      const regex = new RegExp(filter.namePattern, 'i');
      filtered = filtered.filter(tool => regex.test(tool.name));
    }

    if (filter.version) {
      filtered = filtered.filter(tool => tool.version === filter.version);
    }

    if (filter.capabilities) {
      filtered = filtered.filter(tool => {
        if (!tool.capabilities) return false;
        
        for (const [key, value] of Object.entries(filter.capabilities!)) {
          if (tool.capabilities[key as keyof typeof tool.capabilities] !== value) {
            return false;
          }
        }
        return true;
      });
    }

    return filtered;
  }

  private async checkConcurrencyLimits(tool: ExtendedTool, invocationId: string): Promise<void> {
    const maxConcurrency = tool.availability?.maxConcurrency;
    if (!maxConcurrency) return;

    const toolKey = this.getToolKey(tool.name, tool.version);
    const entry = this.tools.get(toolKey);
    
    if (entry && entry.activeInvocations.size >= maxConcurrency) {
      throw new ToolRegistryError(
        ToolRegistryErrorCode.CONCURRENT_LIMIT_EXCEEDED,
        `Tool '${tool.name}' has reached maximum concurrency limit of ${maxConcurrency}`,
        tool.name
      );
    }

    // Add to active invocations
    entry?.activeInvocations.add(invocationId);
  }

  private async checkRateLimits(tool: ExtendedTool): Promise<void> {
    const rateLimit = tool.availability?.rateLimit;
    if (!rateLimit) return;

    const toolKey = this.getToolKey(tool.name, tool.version);
    const tracker = this.rateLimitTrackers.get(toolKey);
    
    if (!tracker) return;

    const now = new Date();
    const windowStart = new Date(now.getTime() - tracker.windowMs);

    // Remove old calls outside the window
    const recentCalls = tracker.calls.filter(call => call > windowStart);
    tracker.calls.splice(0, tracker.calls.length, ...recentCalls);

    // Check if limit is exceeded
    if (recentCalls.length >= tracker.maxCalls) {
      throw new ToolRegistryError(
        ToolRegistryErrorCode.RATE_LIMIT_EXCEEDED,
        `Tool '${tool.name}' has exceeded rate limit of ${tracker.maxCalls} calls per ${tracker.windowMs}ms`,
        tool.name
      );
    }

    // Add current call
    tracker.calls.push(now);
  }

  private async executeTool(
    tool: ExtendedTool,
    params: Record<string, any>,
    context: ToolInvocationContext,
    invocationId: string
  ): Promise<CallToolResult> {
    if (!tool.handler) {
      throw new ToolRegistryError(
        ToolRegistryErrorCode.INVOCATION_FAILED,
        `Tool '${tool.name}' has no handler implementation`,
        tool.name
      );
    }

    const timeout = tool.timeout || this.config.defaultTimeout;
    const startTime = new Date();

    // Create invocation state
    const invocationState: ToolInvocationState = {
      id: invocationId,
      toolName: tool.name,
      context,
      startTime,
      promise: Promise.resolve(), // Will be replaced
      status: 'pending',
      timeout: undefined
    };

    this.activeInvocations.set(invocationId, invocationState);

    try {
      // Set timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        invocationState.timeout = setTimeout(() => {
          reject(new ToolRegistryError(
            ToolRegistryErrorCode.TIMEOUT_EXCEEDED,
            `Tool '${tool.name}' execution timed out after ${timeout}ms`,
            tool.name
          ));
        }, timeout);
      });

      // Update status
      invocationState.status = 'running';

      // Execute tool with timeout
      const executionPromise = tool.handler(params, context);
      invocationState.promise = executionPromise;

      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Clear timeout
      if (invocationState.timeout) {
        clearTimeout(invocationState.timeout);
      }

      invocationState.status = 'completed';
      return result;

    } catch (error) {
      invocationState.status = 'failed';
      
      // Clear timeout
      if (invocationState.timeout) {
        clearTimeout(invocationState.timeout);
      }

      throw error;
    }
  }

  private async updateToolMetrics(
    toolName: string,
    success: boolean,
    executionTime: number,
    error?: any
  ): Promise<void> {
    try {
      const toolKey = this.getToolKey(toolName);
      const entry = this.tools.get(toolKey);
      
      if (!entry) return;

      const metrics = entry.metrics;
      const newCount = metrics.invocationCount + 1;
      const newAvgTime = (metrics.averageExecutionTime * metrics.invocationCount + executionTime) / newCount;
      const newErrorCount = success ? metrics.errorCount : metrics.errorCount + 1;
      const newSuccessRate = (newCount - newErrorCount) / newCount;

      // Update metrics
      entry.metrics = {
        ...metrics,
        invocationCount: newCount,
        averageExecutionTime: newAvgTime,
        successRate: newSuccessRate,
        lastInvocation: new Date(),
        errorCount: newErrorCount,
        lastError: !success && error ? {
          timestamp: new Date(),
          message: error instanceof Error ? error.message : String(error),
          details: error
        } : metrics.lastError
      };

    } catch (updateError) {
      logger.warn('Failed to update tool metrics', {
        toolName,
        error: updateError instanceof Error ? updateError.message : String(updateError)
      });
    }
  }
}

/**
 * Simple async lock implementation
 */
class AsyncLock {
  private readonly locks = new Map<string, Promise<any>>();

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Wait for existing lock if any
    const existingLock = this.locks.get(key);
    if (existingLock) {
      await existingLock.catch(() => {}); // Ignore errors from previous operations
    }

    // Create new lock
    const lockPromise = fn();
    this.locks.set(key, lockPromise);

    try {
      const result = await lockPromise;
      return result;
    } finally {
      // Clean up lock
      if (this.locks.get(key) === lockPromise) {
        this.locks.delete(key);
      }
    }
  }
}