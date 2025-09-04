/**
 * Tool Registry System Types and Interfaces
 * 
 * Defines all types for dynamic tool registration, discovery, and management
 * with proper schema validation and capability advertisement.
 */

import type { Tool, CallToolParams, CallToolResult } from '@/protocol/types';

/**
 * JSON Schema definition for tool validation
 */
export interface JSONSchema {
  readonly $schema?: string;
  readonly type: string;
  readonly properties?: Record<string, JSONSchema>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean | JSONSchema;
  readonly items?: JSONSchema;
  readonly enum?: readonly any[];
  readonly description?: string;
  readonly default?: any;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly format?: string;
  readonly oneOf?: readonly JSONSchema[];
  readonly anyOf?: readonly JSONSchema[];
  readonly allOf?: readonly JSONSchema[];
  readonly not?: JSONSchema;
  readonly if?: JSONSchema;
  readonly then?: JSONSchema;
  readonly else?: JSONSchema;
}

/**
 * Extended tool definition with additional metadata
 */
export interface ExtendedTool {
  /** Tool name (required) */
  readonly name: string;
  
  /** Tool description (optional) */
  readonly description?: string;
  
  /** JSON Schema for tool input validation (required) */
  readonly inputSchema: JSONSchema;
  /** Tool version for compatibility management */
  readonly version?: string;
  
  /** Tool category for organization */
  readonly category?: string;
  
  /** Tool tags for discovery */
  readonly tags?: readonly string[];
  
  /** Tool documentation */
  readonly documentation?: {
    readonly description: string;
    readonly examples?: readonly ToolExample[];
    readonly seeAlso?: readonly string[];
    readonly author?: string;
    readonly deprecated?: boolean;
    readonly deprecationMessage?: string;
  };
  
  /** Tool capabilities */
  readonly capabilities?: ToolCapabilities;
  
  /** Tool availability configuration */
  readonly availability?: ToolAvailability;
  
  /** Tool execution timeout in milliseconds */
  readonly timeout?: number;
  
  /** Whether the tool requires authentication */
  readonly requiresAuth?: boolean;
  
  /** Tool implementation reference */
  readonly handler?: ToolHandler;
}

/**
 * Tool example interface
 */
export interface ToolExample {
  readonly title: string;
  readonly description?: string;
  readonly input: Record<string, any>;
  readonly expectedOutput?: any;
}

/**
 * Tool capabilities interface
 */
export interface ToolCapabilities {
  /** Supports streaming responses */
  readonly streaming?: boolean;
  
  /** Supports progress notifications */
  readonly progress?: boolean;
  
  /** Supports cancellation */
  readonly cancellable?: boolean;
  
  /** Can be run in parallel with other tools */
  readonly parallel?: boolean;
  
  /** Tool is idempotent (safe to retry) */
  readonly idempotent?: boolean;
  
  /** Tool has side effects */
  readonly sideEffects?: boolean;
}

/**
 * Tool availability configuration
 */
export interface ToolAvailability {
  /** Tool is currently available */
  readonly available: boolean;
  
  /** Reason if tool is unavailable */
  readonly reason?: string;
  
  /** Conditions for tool availability */
  readonly conditions?: readonly ToolCondition[];
  
  /** Maximum concurrent invocations */
  readonly maxConcurrency?: number;
  
  /** Rate limiting configuration */
  readonly rateLimit?: {
    readonly maxCalls: number;
    readonly windowMs: number;
  };
}

/**
 * Tool availability condition
 */
export interface ToolCondition {
  readonly type: 'auth' | 'permission' | 'resource' | 'dependency' | 'custom';
  readonly description: string;
  readonly check: () => Promise<boolean>;
}

/**
 * Tool handler function interface
 */
export type ToolHandler = (
  params: Record<string, any>,
  context: ToolInvocationContext
) => Promise<CallToolResult>;

/**
 * Tool invocation context
 */
export interface ToolInvocationContext {
  readonly toolName: string;
  readonly connectionId: string;
  readonly requestId: string | number | null;
  readonly timestamp: number;
  readonly timeout?: number;
  readonly userId?: string;
  readonly sessionId?: string;
  readonly capabilities?: ToolCapabilities;
  readonly metadata?: Record<string, any>;
}

/**
 * Tool registration request
 */
export interface ToolRegistrationRequest {
  readonly tool: ExtendedTool;
  readonly replace?: boolean;
  readonly validate?: boolean;
}

/**
 * Tool registration result
 */
export interface ToolRegistrationResult {
  readonly success: boolean;
  readonly toolName: string;
  readonly version?: string;
  readonly error?: string;
  readonly warnings?: readonly string[];
  readonly validationResults?: SchemaValidationResult[];
}

/**
 * Schema validation result
 */
export interface SchemaValidationResult {
  readonly isValid: boolean;
  readonly errors?: readonly ValidationError[];
  readonly warnings?: readonly ValidationWarning[];
}

/**
 * Validation error
 */
export interface ValidationError {
  readonly path: string;
  readonly message: string;
  readonly value?: any;
  readonly constraint?: string;
}

/**
 * Validation warning
 */
export interface ValidationWarning {
  readonly path: string;
  readonly message: string;
  readonly suggestion?: string;
}

/**
 * Tool discovery filter
 */
export interface ToolDiscoveryFilter {
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly requiresAuth?: boolean;
  readonly available?: boolean;
  readonly capabilities?: Partial<ToolCapabilities>;
  readonly namePattern?: string;
  readonly version?: string;
}

/**
 * Tool discovery result
 */
export interface ToolDiscoveryResult {
  readonly tools: readonly ExtendedTool[];
  readonly totalCount: number;
  readonly filteredCount: number;
  readonly cursor?: string;
}

/**
 * Tool registry statistics
 */
export interface ToolRegistryStats {
  readonly totalTools: number;
  readonly availableTools: number;
  readonly categoryCounts: Record<string, number>;
  readonly averageResponseTime: number;
  readonly totalInvocations: number;
  readonly recentErrors: number;
  readonly registryVersion: string;
}

/**
 * Tool invocation metrics
 */
export interface ToolInvocationMetrics {
  readonly toolName: string;
  readonly invocationCount: number;
  readonly averageExecutionTime: number;
  readonly successRate: number;
  readonly lastInvocation: Date;
  readonly errorCount: number;
  readonly lastError?: {
    readonly timestamp: Date;
    readonly message: string;
    readonly details?: any;
  };
}

/**
 * Tool registry event types
 */
export interface ToolRegistryEvents {
  'tool:registered': (tool: ExtendedTool) => void;
  'tool:unregistered': (toolName: string, version?: string) => void;
  'tool:updated': (tool: ExtendedTool, previousTool: ExtendedTool) => void;
  'tool:invoked': (toolName: string, context: ToolInvocationContext, result: CallToolResult) => void;
  'tool:error': (toolName: string, context: ToolInvocationContext, error: Error) => void;
  'registry:cleared': () => void;
  'registry:stats': (stats: ToolRegistryStats) => void;
}

/**
 * Tool registry configuration
 */
export interface ToolRegistryConfig {
  readonly maxTools: number;
  readonly defaultTimeout: number;
  readonly enableMetrics: boolean;
  readonly enableCaching: boolean;
  readonly strictValidation: boolean;
  readonly allowOverwrite: boolean;
  readonly retentionPolicy?: {
    readonly maxAge: number; // milliseconds
    readonly maxUnused: number; // days
  };
  readonly validation?: {
    readonly requireDescription: boolean;
    readonly requireExamples: boolean;
    readonly maxNameLength: number;
    readonly maxDescriptionLength: number;
    readonly allowedCategories?: readonly string[];
  };
}

/**
 * Tool registry error types
 */
export enum ToolRegistryErrorCode {
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  TOOL_ALREADY_EXISTS = 'TOOL_ALREADY_EXISTS',
  INVALID_TOOL_DEFINITION = 'INVALID_TOOL_DEFINITION',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
  TOOL_UNAVAILABLE = 'TOOL_UNAVAILABLE',
  INVOCATION_FAILED = 'INVOCATION_FAILED',
  TIMEOUT_EXCEEDED = 'TIMEOUT_EXCEEDED',
  REGISTRY_FULL = 'REGISTRY_FULL',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CONCURRENT_LIMIT_EXCEEDED = 'CONCURRENT_LIMIT_EXCEEDED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

/**
 * Tool registry error class
 */
export class ToolRegistryError extends Error {
  public readonly code: ToolRegistryErrorCode;
  public readonly toolName?: string;
  public readonly details?: any;

  constructor(
    code: ToolRegistryErrorCode,
    message: string,
    toolName?: string,
    details?: any
  ) {
    super(message);
    this.name = 'ToolRegistryError';
    this.code = code;
    this.toolName = toolName;
    this.details = details;
  }
}

/**
 * Tool invocation state for tracking concurrent executions
 */
export interface ToolInvocationState {
  readonly id: string;
  readonly toolName: string;
  readonly context: ToolInvocationContext;
  readonly startTime: Date;
  promise: Promise<CallToolResult>;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  timeout?: NodeJS.Timeout;
}

/**
 * Tool registry interface - main contract for tool management
 */
export interface IToolRegistry {
  // Registration operations
  registerTool(request: ToolRegistrationRequest): Promise<ToolRegistrationResult>;
  unregisterTool(name: string, version?: string): Promise<boolean>;
  updateTool(request: ToolRegistrationRequest): Promise<ToolRegistrationResult>;
  
  // Discovery operations
  listTools(filter?: ToolDiscoveryFilter): Promise<ToolDiscoveryResult>;
  getTool(name: string, version?: string): Promise<ExtendedTool | null>;
  searchTools(query: string, filter?: ToolDiscoveryFilter): Promise<ToolDiscoveryResult>;
  
  // Invocation operations
  invokeTool(params: CallToolParams, context: ToolInvocationContext): Promise<CallToolResult>;
  validateToolParams(toolName: string, params: Record<string, any>): Promise<SchemaValidationResult>;
  
  // Availability operations
  isToolAvailable(name: string, version?: string): Promise<boolean>;
  checkToolConditions(name: string, context: ToolInvocationContext): Promise<boolean>;
  
  // Metrics and monitoring
  getStats(): Promise<ToolRegistryStats>;
  getToolMetrics(name: string): Promise<ToolInvocationMetrics | null>;
  
  // Management operations
  clear(): Promise<void>;
  validate(): Promise<SchemaValidationResult[]>;
  
  // Event handling
  on<K extends keyof ToolRegistryEvents>(event: K, listener: ToolRegistryEvents[K]): void;
  off<K extends keyof ToolRegistryEvents>(event: K, listener: ToolRegistryEvents[K]): void;
  emit<K extends keyof ToolRegistryEvents>(event: K, ...args: Parameters<ToolRegistryEvents[K]>): void;
}