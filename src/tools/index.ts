/**
 * Tool Registry System - Main Export Module
 * 
 * Provides a comprehensive tool registration, discovery, and management system
 * for the MCP server with dynamic CRUD operations, schema validation,
 * capability discovery, and runtime availability checking.
 */

// Core types and interfaces
export type {
  // Tool definitions
  ExtendedTool,
  ToolHandler,
  ToolExample,
  ToolCapabilities,
  ToolAvailability,
  ToolCondition,
  
  // Context and invocation
  ToolInvocationContext,
  ToolInvocationState,
  ToolInvocationMetrics,
  
  // Registration
  ToolRegistrationRequest,
  ToolRegistrationResult,
  
  // Discovery and filtering
  ToolDiscoveryFilter,
  ToolDiscoveryResult,
  
  // Validation
  JSONSchema,
  SchemaValidationResult,
  ValidationError,
  ValidationWarning,
  
  // Configuration
  ToolRegistryConfig,
  
  // Statistics and monitoring
  ToolRegistryStats,
  
  // Events
  ToolRegistryEvents,
  
  // Registry interface
  IToolRegistry
} from './types';

// Schema validation
export { SchemaValidator } from './schema-validator';

// Core registry
export { ToolRegistry } from './tool-registry';

// Capability discovery
export {
  ToolCapabilityDiscoverer,
  CapabilityMatcher,
  createCapabilityDiscoverer
} from './capability-discoverer';
export type {
  ToolCapabilitySummary,
  ToolAdvertisement
} from './capability-discoverer';

// Main manager
export {
  ToolRegistryManager,
  createToolRegistryManager,
  getDefaultToolRegistryManager
} from './tool-registry-manager';
export type {
  ToolRegistryManagerEvents
} from './tool-registry-manager';

// MCP Protocol Integration
export {
  MCPToolRegistryIntegration,
  EnhancedMCPProtocolHandler,
  createMCPToolRegistryIntegration,
  createEnhancedMCPProtocolHandler
} from './mcp-integration';
export type {
  MCPToolRegistryIntegrationConfig
} from './mcp-integration';

// Error classes
export { ToolRegistryError, ToolRegistryErrorCode } from './types';

// Utility functions and constants
export const TOOL_REGISTRY_VERSION = '1.0.0';

/**
 * Default tool registry configuration
 */
export const DEFAULT_TOOL_REGISTRY_CONFIG = {
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
    maxDescriptionLength: 1000
  }
};

/**
 * Common tool categories for organization
 */
export const TOOL_CATEGORIES = {
  CONTENT: 'content',
  SEARCH: 'search',
  UTILITY: 'utility',
  AUTHENTICATION: 'auth',
  DATA: 'data',
  COMMUNICATION: 'communication',
  DEVELOPMENT: 'development',
  MONITORING: 'monitoring',
  INTEGRATION: 'integration',
  WORKFLOW: 'workflow'
} as const;

/**
 * Standard tool tags
 */
export const TOOL_TAGS = {
  // Functional tags
  READ_ONLY: 'read-only',
  WRITE: 'write',
  BULK: 'bulk',
  STREAMING: 'streaming',
  ASYNC: 'async',
  
  // Domain tags
  DRUPAL: 'drupal',
  API: 'api',
  DATABASE: 'database',
  FILE: 'file',
  NETWORK: 'network',
  
  // Quality tags
  STABLE: 'stable',
  EXPERIMENTAL: 'experimental',
  DEPRECATED: 'deprecated',
  BETA: 'beta'
} as const;

/**
 * Common JSON Schema patterns for tool input validation
 */
export const COMMON_SCHEMAS = {
  STRING: {
    type: 'string' as const
  },
  
  NON_EMPTY_STRING: {
    type: 'string' as const,
    minLength: 1
  },
  
  POSITIVE_INTEGER: {
    type: 'integer' as const,
    minimum: 1
  },
  
  NON_NEGATIVE_INTEGER: {
    type: 'integer' as const,
    minimum: 0
  },
  
  BOOLEAN: {
    type: 'boolean' as const
  },
  
  OBJECT: {
    type: 'object' as const
  },
  
  ARRAY: {
    type: 'array' as const
  },
  
  STRING_ARRAY: {
    type: 'array' as const,
    items: { type: 'string' as const }
  },
  
  PAGINATION: {
    type: 'object' as const,
    properties: {
      limit: {
        type: 'integer' as const,
        minimum: 1,
        maximum: 100,
        default: 10
      },
      offset: {
        type: 'integer' as const,
        minimum: 0,
        default: 0
      }
    },
    additionalProperties: false
  },
  
  SEARCH_QUERY: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string' as const,
        minLength: 1,
        description: 'Search query string'
      },
      filters: {
        type: 'object' as const,
        description: 'Additional search filters'
      },
      limit: {
        type: 'integer' as const,
        minimum: 1,
        maximum: 100,
        default: 10
      }
    },
    required: ['query'] as const,
    additionalProperties: false
  }
} as const;

/**
 * Helper function to create a basic tool definition
 */
export function createBasicTool(
  name: string,
  description: string,
  inputSchema: any,
  options: {
    category?: string;
    tags?: readonly string[];
    version?: string;
    timeout?: number;
    requiresAuth?: boolean;
  } = {}
): any {
  return {
    name,
    description,
    inputSchema,
    category: options.category,
    tags: options.tags,
    version: options.version,
    timeout: options.timeout,
    requiresAuth: options.requiresAuth
  };
}

/**
 * Helper function to create tool capabilities
 */
export function createToolCapabilities(capabilities: {
  streaming?: boolean;
  progress?: boolean;
  cancellable?: boolean;
  parallel?: boolean;
  idempotent?: boolean;
  sideEffects?: boolean;
}): any {
  return {
    streaming: capabilities.streaming ?? false,
    progress: capabilities.progress ?? false,
    cancellable: capabilities.cancellable ?? false,
    parallel: capabilities.parallel ?? true,
    idempotent: capabilities.idempotent ?? true,
    sideEffects: capabilities.sideEffects ?? false
  };
}

/**
 * Helper function to create tool availability configuration
 */
export function createToolAvailability(config: {
  available: boolean;
  reason?: string;
  maxConcurrency?: number;
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
  conditions?: readonly any[];
}): any {
  return {
    available: config.available,
    reason: config.reason,
    maxConcurrency: config.maxConcurrency,
    rateLimit: config.rateLimit,
    conditions: config.conditions
  };
}