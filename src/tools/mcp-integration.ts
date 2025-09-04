/**
 * MCP Protocol Integration for Tool Registry
 * 
 * Provides seamless integration between the tool registry system and the MCP
 * protocol manager, enabling dynamic tool registration, discovery, and invocation
 * through the MCP protocol.
 */

import { logger } from '@/utils/logger';
import { MCPProtocolManager } from '@/protocol/protocol-manager';
import { ToolRegistryManager } from './tool-registry-manager';
import type {
  ListToolsParams,
  ListToolsResult,
  CallToolParams,
  CallToolResult,
  RequestContext,
  MCPError
} from '@/protocol/types';
import type {
  ExtendedTool,
  ToolInvocationContext,
  ToolHandler
} from './types';
import {
  ToolRegistryError,
  ToolRegistryErrorCode
} from './types';
import type { ToolRegistryManagerConfig } from './tool-registry-manager';

/**
 * MCP tool registry integration configuration
 */
export interface MCPToolRegistryIntegrationConfig {
  readonly toolRegistryConfig?: Partial<ToolRegistryManagerConfig>;
  readonly enableAutoRegistration?: boolean;
  readonly enableDynamicDiscovery?: boolean;
  readonly enableToolMetrics?: boolean;
  readonly maxToolsPerResponse?: number;
  readonly defaultToolTimeout?: number;
}

/**
 * Default configuration
 */
const DEFAULT_INTEGRATION_CONFIG: Required<MCPToolRegistryIntegrationConfig> = {
  toolRegistryConfig: {},
  enableAutoRegistration: true,
  enableDynamicDiscovery: true,
  enableToolMetrics: true,
  maxToolsPerResponse: 100,
  defaultToolTimeout: 30000
};

/**
 * MCP Protocol Integration for Tool Registry
 */
export class MCPToolRegistryIntegration {
  private readonly config: Required<MCPToolRegistryIntegrationConfig>;
  private readonly protocolManager: MCPProtocolManager;
  private readonly toolRegistry: ToolRegistryManager;
  private initialized = false;

  constructor(
    protocolManager: MCPProtocolManager,
    config: MCPToolRegistryIntegrationConfig = {}
  ) {
    this.config = { ...DEFAULT_INTEGRATION_CONFIG, ...config };
    this.protocolManager = protocolManager;
    
    // Create tool registry manager
    this.toolRegistry = new ToolRegistryManager({
      defaultTimeout: this.config.defaultToolTimeout,
      enableMetrics: this.config.enableToolMetrics,
      enableDiscovery: this.config.enableDynamicDiscovery,
      discoveryConfig: {
        maxToolsPerResponse: this.config.maxToolsPerResponse,
        enableCaching: true,
        cacheExpirationMs: 60000
      },
      ...this.config.toolRegistryConfig
    });

    logger.info('MCP tool registry integration created', {
      autoRegistration: this.config.enableAutoRegistration,
      dynamicDiscovery: this.config.enableDynamicDiscovery,
      metrics: this.config.enableToolMetrics
    });
  }

  /**
   * Initialize the integration
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('MCP tool registry integration already initialized');
      return;
    }

    try {
      // Initialize tool registry
      await this.toolRegistry.initialize();

      // Register MCP protocol handlers
      this.registerMCPHandlers();

      // Setup event listeners
      this.setupEventListeners();

      // Auto-register default tools if enabled
      if (this.config.enableAutoRegistration) {
        await this.registerDefaultTools();
      }

      this.initialized = true;

      logger.info('MCP tool registry integration initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize MCP tool registry integration', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Shutdown the integration
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await this.toolRegistry.shutdown();
      this.initialized = false;

      logger.info('MCP tool registry integration shutdown completed');

    } catch (error) {
      logger.error('Error during MCP tool registry integration shutdown', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get the tool registry manager instance
   */
  getToolRegistry(): ToolRegistryManager {
    return this.toolRegistry;
  }

  /**
   * Register a tool with handler for MCP invocation
   */
  async registerTool(
    tool: Omit<ExtendedTool, 'handler'>,
    handler: ToolHandler,
    options: { replace?: boolean; validate?: boolean } = {}
  ): Promise<void> {
    this.ensureInitialized();

    const result = await this.toolRegistry.registerToolWithHandler(tool, handler, options);
    
    if (!result.success) {
      throw new Error(`Failed to register tool '${tool.name}': ${result.error}`);
    }

    logger.debug('Tool registered via MCP integration', {
      toolName: tool.name,
      version: tool.version,
      category: tool.category
    });
  }

  /**
   * Unregister a tool
   */
  async unregisterTool(name: string, version?: string): Promise<void> {
    this.ensureInitialized();

    const success = await this.toolRegistry.unregisterTool(name, version);
    if (!success) {
      throw new Error(`Failed to unregister tool '${name}'${version ? ` version '${version}'` : ''}`);
    }

    logger.debug('Tool unregistered via MCP integration', { name, version });
  }

  /**
   * Get integration statistics
   */
  async getIntegrationStats(): Promise<{
    registry: any;
    protocol: any;
    integration: {
      initialized: boolean;
      autoRegistration: boolean;
      dynamicDiscovery: boolean;
      registeredHandlers: string[];
    };
  }> {
    const registryInfo = this.initialized ? await this.toolRegistry.getRegistryInfo() : null;
    const protocolStats = this.protocolManager.getStats();

    return {
      registry: registryInfo,
      protocol: protocolStats,
      integration: {
        initialized: this.initialized,
        autoRegistration: this.config.enableAutoRegistration,
        dynamicDiscovery: this.config.enableDynamicDiscovery,
        registeredHandlers: ['tools/list', 'tools/call']
      }
    };
  }

  // Private methods

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('MCP tool registry integration not initialized. Call initialize() first.');
    }
  }

  private registerMCPHandlers(): void {
    // Register tools/list handler
    this.protocolManager.registerHandler(
      'tools/list',
      async (params: ListToolsParams, context: RequestContext): Promise<ListToolsResult> => {
        return await this.handleListTools(params, context);
      }
    );

    // Register tools/call handler
    this.protocolManager.registerHandler(
      'tools/call',
      async (params: CallToolParams, context: RequestContext): Promise<CallToolResult> => {
        return await this.handleCallTool(params, context);
      }
    );

    logger.debug('MCP protocol handlers registered for tool registry', {
      handlers: ['tools/list', 'tools/call']
    });
  }

  private setupEventListeners(): void {
    // Listen for tool registry events
    this.toolRegistry.on('tool:registered', (tool) => {
      logger.debug('Tool registered in registry', { toolName: tool.name });
    });

    this.toolRegistry.on('tool:unregistered', (name, version) => {
      logger.debug('Tool unregistered from registry', { name, version });
    });

    this.toolRegistry.on('tool:error', (toolName, context, error) => {
      logger.warn('Tool invocation error', {
        toolName,
        connectionId: context.connectionId,
        error: error.message
      });
    });

    // Listen for protocol manager events
    this.protocolManager.on('initialized', (connectionId, state) => {
      logger.debug('MCP client initialized for tool registry integration', {
        connectionId,
        protocolVersion: state.protocolVersion
      });
    });
  }

  private async registerDefaultTools(): Promise<void> {
    try {
      // Default tools are now registered through the tool registry
      // This provides a clean separation between the registry and the specific tools
      logger.info('Auto-registration enabled but no default tools to register');
      
      // In future iterations, default Drupal tools would be registered here
      // using the registerTool method with appropriate handlers

    } catch (error) {
      logger.error('Error registering default tools', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't throw - default tools are optional
    }
  }

  private async handleListTools(
    params: ListToolsParams,
    context: RequestContext
  ): Promise<ListToolsResult> {
    logger.debug('Handling MCP tools/list request via registry', {
      connectionId: context.connectionId,
      cursor: params.cursor
    });

    try {
      // Use the tool registry's MCP-compatible tool listing
      const result = await this.toolRegistry.getMCPToolList(params);

      logger.debug('MCP tools/list response via registry', {
        connectionId: context.connectionId,
        toolCount: result.tools.length,
        hasNextCursor: !!result.nextCursor
      });

      return result;

    } catch (error) {
      logger.error('Error handling MCP tools/list via registry', {
        connectionId: context.connectionId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.convertToMCPError(error, 'Failed to list tools');
    }
  }

  private async handleCallTool(
    params: CallToolParams,
    context: RequestContext
  ): Promise<CallToolResult> {
    logger.debug('Handling MCP tools/call request via registry', {
      connectionId: context.connectionId,
      toolName: params.name,
      hasArguments: !!params.arguments
    });

    try {
      // Create tool invocation context
      const toolContext: ToolInvocationContext = {
        toolName: params.name,
        connectionId: context.connectionId,
        requestId: context.id,
        timestamp: context.timestamp,
        timeout: context.timeout,
        metadata: {
          protocolVersion: this.protocolManager.getProtocolState(context.connectionId)?.protocolVersion,
          method: context.method
        }
      };

      // Invoke tool via registry
      const result = await this.toolRegistry.invokeTool(params, toolContext);

      logger.debug('MCP tools/call completed via registry', {
        connectionId: context.connectionId,
        toolName: params.name,
        success: !result.isError
      });

      return result;

    } catch (error) {
      logger.error('Error handling MCP tools/call via registry', {
        connectionId: context.connectionId,
        toolName: params.name,
        error: error instanceof Error ? error.message : String(error)
      });

      throw this.convertToMCPError(error, `Failed to call tool '${params.name}'`);
    }
  }

  private convertToMCPError(error: any, defaultMessage: string): MCPError {
    // Convert ToolRegistryError to MCP error
    if (error instanceof Error && 'code' in error) {
      const toolError = error as ToolRegistryError;
      
      switch (toolError.code) {
        case ToolRegistryErrorCode.TOOL_NOT_FOUND:
          return {
            code: -32005, // MCP tool not found
            message: toolError.message
          };
          
        case ToolRegistryErrorCode.TOOL_UNAVAILABLE:
          return {
            code: -32007, // MCP forbidden
            message: toolError.message
          };
          
        case ToolRegistryErrorCode.SCHEMA_VALIDATION_FAILED:
          return {
            code: -32602, // MCP invalid params
            message: toolError.message,
            data: toolError.details
          };
          
        case ToolRegistryErrorCode.TIMEOUT_EXCEEDED:
          return {
            code: -32008, // MCP timeout
            message: toolError.message
          };
          
        case ToolRegistryErrorCode.PERMISSION_DENIED:
          return {
            code: -32006, // MCP unauthorized
            message: toolError.message
          };
          
        case ToolRegistryErrorCode.RATE_LIMIT_EXCEEDED:
        case ToolRegistryErrorCode.CONCURRENT_LIMIT_EXCEEDED:
          return {
            code: -32007, // MCP forbidden
            message: toolError.message
          };
          
        default:
          return {
            code: -32603, // MCP internal error
            message: toolError.message || defaultMessage
          };
      }
    }

    // Generic error conversion
    return {
      code: -32603, // MCP internal error
      message: error instanceof Error ? error.message : defaultMessage
    };
  }
}

/**
 * Create and initialize MCP tool registry integration
 */
export async function createMCPToolRegistryIntegration(
  protocolManager: MCPProtocolManager,
  config?: MCPToolRegistryIntegrationConfig
): Promise<MCPToolRegistryIntegration> {
  const integration = new MCPToolRegistryIntegration(protocolManager, config);
  await integration.initialize();
  return integration;
}

/**
 * Enhanced MCP Protocol Handler with Tool Registry Integration
 */
export class EnhancedMCPProtocolHandler {
  private readonly integration: MCPToolRegistryIntegration;
  private readonly protocolManager: MCPProtocolManager;

  constructor(config: MCPToolRegistryIntegrationConfig = {}) {
    // Create protocol manager
    this.protocolManager = new MCPProtocolManager({
      serverInfo: {
        name: 'drupalize-mcp-server',
        version: '1.0.0'
      },
      serverCapabilities: {
        tools: { listChanged: true },
        logging: {},
        experimental: {}
      }
    });

    // Create integration
    this.integration = new MCPToolRegistryIntegration(this.protocolManager, config);
  }

  /**
   * Initialize the enhanced handler
   */
  async initialize(): Promise<void> {
    await this.integration.initialize();
    logger.info('Enhanced MCP protocol handler initialized with tool registry');
  }

  /**
   * Shutdown the enhanced handler
   */
  async shutdown(): Promise<void> {
    await this.integration.shutdown();
    logger.info('Enhanced MCP protocol handler shutdown completed');
  }

  /**
   * Process incoming message
   */
  async handleMessage(
    rawMessage: string | Buffer,
    connectionId: string
  ): Promise<string | null> {
    try {
      const response = await this.protocolManager.processMessage(rawMessage, connectionId);
      return response ? JSON.stringify(response) : null;

    } catch (error) {
      logger.error('Error handling MCP message in enhanced handler', {
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });

      const errorResponse = {
        jsonrpc: '2.0' as const,
        id: null,
        error: {
          code: -32603,
          message: 'Internal error processing message'
        }
      };

      return JSON.stringify(errorResponse);
    }
  }

  /**
   * Handle connection established
   */
  onConnectionEstablished(connectionId: string): void {
    logger.debug('New enhanced MCP connection established', { connectionId });
  }

  /**
   * Handle connection closed
   */
  onConnectionClosed(connectionId: string): void {
    logger.debug('Enhanced MCP connection closed', { connectionId });
    this.protocolManager.cleanupConnection(connectionId);
  }

  /**
   * Get the tool registry for external tool registration
   */
  getToolRegistry(): ToolRegistryManager {
    return this.integration.getToolRegistry();
  }

  /**
   * Get comprehensive statistics
   */
  async getStats(): Promise<any> {
    return await this.integration.getIntegrationStats();
  }

  /**
   * Register a tool (convenience method)
   */
  async registerTool(
    tool: Omit<ExtendedTool, 'handler'>,
    handler: ToolHandler,
    options: { replace?: boolean; validate?: boolean } = {}
  ): Promise<void> {
    await this.integration.registerTool(tool, handler, options);
  }

  /**
   * Unregister a tool (convenience method)
   */
  async unregisterTool(name: string, version?: string): Promise<void> {
    await this.integration.unregisterTool(name, version);
  }
}

/**
 * Create and initialize enhanced MCP protocol handler
 */
export async function createEnhancedMCPProtocolHandler(
  config?: MCPToolRegistryIntegrationConfig
): Promise<EnhancedMCPProtocolHandler> {
  const handler = new EnhancedMCPProtocolHandler(config);
  await handler.initialize();
  return handler;
}