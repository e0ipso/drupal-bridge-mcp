/**
 * TypeScript interfaces for MCP Protocol message structures
 * 
 * Defines all MCP protocol message types, request/response structures,
 * and protocol-specific type definitions for type-safe message handling.
 */

/**
 * MCP Protocol version interface
 */
export interface ProtocolVersion {
  readonly major: number;
  readonly minor: number;
}

/**
 * Standard MCP message ID type - can be string, number, or null
 */
export type MessageId = string | number | null;

/**
 * Base interface for all MCP messages
 */
export interface BaseMessage {
  readonly jsonrpc: '2.0';
  readonly id?: MessageId;
}

/**
 * MCP Request message interface
 */
export interface MCPRequest extends BaseMessage {
  readonly method: string;
  readonly params?: Record<string, any>;
  readonly id: MessageId; // Requests must have an ID
}

/**
 * MCP Response message interface
 */
export interface MCPResponse extends BaseMessage {
  readonly id: MessageId;
  readonly result?: any;
  readonly error?: MCPError;
}

/**
 * MCP Notification message interface (no response expected)
 */
export interface MCPNotification extends BaseMessage {
  readonly method: string;
  readonly params?: Record<string, any>;
  // Notifications don't have an id field
}

/**
 * MCP Error object interface
 */
export interface MCPError {
  readonly code: number;
  readonly message: string;
  readonly data?: any;
}

/**
 * MCP Protocol error codes (following JSON-RPC 2.0 spec)
 */
export enum MCPErrorCode {
  // JSON-RPC 2.0 standard errors
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  
  // MCP-specific errors
  INITIALIZATION_FAILED = -32000,
  NOT_INITIALIZED = -32001,
  ALREADY_INITIALIZED = -32002,
  CAPABILITY_NOT_SUPPORTED = -32003,
  RESOURCE_NOT_FOUND = -32004,
  TOOL_NOT_FOUND = -32005,
  UNAUTHORIZED = -32006,
  FORBIDDEN = -32007,
  TIMEOUT = -32008,
  CONNECTION_LOST = -32009
}

/**
 * Initialize request parameters
 */
export interface InitializeParams {
  readonly protocolVersion: string;
  readonly capabilities: ClientCapabilities;
  readonly clientInfo: {
    readonly name: string;
    readonly version: string;
  };
}

/**
 * Initialize response result
 */
export interface InitializeResult {
  readonly protocolVersion: string;
  readonly capabilities: ServerCapabilities;
  readonly serverInfo: {
    readonly name: string;
    readonly version: string;
  };
  readonly instructions?: string;
}

/**
 * Client capabilities
 */
export interface ClientCapabilities {
  readonly experimental?: Record<string, any>;
  readonly sampling?: object;
}

/**
 * Server capabilities  
 */
export interface ServerCapabilities {
  readonly experimental?: Record<string, any>;
  readonly logging?: object;
  readonly prompts?: {
    readonly listChanged?: boolean;
  };
  readonly resources?: {
    readonly subscribe?: boolean;
    readonly listChanged?: boolean;
  };
  readonly tools?: {
    readonly listChanged?: boolean;
  };
}

/**
 * Tool definition interface
 */
export interface Tool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: {
    readonly type: string;
    readonly properties?: Record<string, any>;
    readonly required?: string[];
    readonly additionalProperties?: boolean;
  };
}

/**
 * List tools request parameters
 */
export interface ListToolsParams {
  readonly cursor?: string;
}

/**
 * List tools response result
 */
export interface ListToolsResult {
  readonly tools: readonly Tool[];
  readonly nextCursor?: string;
}

/**
 * Call tool request parameters
 */
export interface CallToolParams {
  readonly name: string;
  readonly arguments?: Record<string, any>;
}

/**
 * Call tool response result
 */
export interface CallToolResult {
  readonly content: readonly ToolResponseContent[];
  readonly isError?: boolean;
}

/**
 * Tool response content types
 */
export type ToolResponseContent = TextContent | ImageContent | ResourceContent;

/**
 * Text content interface
 */
export interface TextContent {
  readonly type: 'text';
  readonly text: string;
  readonly annotations?: ToolResponseAnnotations;
}

/**
 * Image content interface
 */
export interface ImageContent {
  readonly type: 'image';
  readonly data: string;
  readonly mimeType: string;
  readonly annotations?: ToolResponseAnnotations;
}

/**
 * Resource content interface
 */
export interface ResourceContent {
  readonly type: 'resource';
  readonly resource: {
    readonly uri: string;
    readonly text?: string;
    readonly mimeType?: string;
  };
  readonly annotations?: ToolResponseAnnotations;
}

/**
 * Tool response annotations
 */
export interface ToolResponseAnnotations {
  readonly audience?: readonly ('human' | 'assistant')[];
  readonly priority?: number;
}

/**
 * Progress notification parameters
 */
export interface ProgressParams {
  readonly progressToken: string | number;
  readonly progress: number;
  readonly total?: number;
}

/**
 * Log message levels
 */
export type LogLevel = 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';

/**
 * Logging message parameters
 */
export interface LoggingMessageParams {
  readonly level: LogLevel;
  readonly data: any;
  readonly logger?: string;
}

/**
 * Request context interface for tracking request state
 */
export interface RequestContext {
  readonly id: MessageId;
  readonly method: string;
  readonly timestamp: number;
  readonly connectionId: string;
  readonly timeout?: number;
}

/**
 * Message validation result
 */
export interface MessageValidationResult {
  readonly isValid: boolean;
  readonly error?: string;
  readonly messageType?: 'request' | 'response' | 'notification';
}

/**
 * Protocol state interface for tracking initialization and capabilities
 */
export interface ProtocolState {
  readonly isInitialized: boolean;
  readonly protocolVersion?: string;
  readonly clientCapabilities?: ClientCapabilities;
  readonly serverCapabilities: ServerCapabilities;
  readonly clientInfo?: {
    readonly name: string;
    readonly version: string;
  };
}

/**
 * Message handler function type
 */
export type MessageHandler<TParams = any, TResult = any> = (
  params: TParams,
  context: RequestContext
) => Promise<TResult>;

/**
 * Message handlers registry interface
 */
export interface MessageHandlers {
  readonly 'initialize': MessageHandler<InitializeParams, InitializeResult>;
  readonly 'initialized': MessageHandler<object, void>;
  readonly 'tools/list': MessageHandler<ListToolsParams, ListToolsResult>;
  readonly 'tools/call': MessageHandler<CallToolParams, CallToolResult>;
  readonly 'logging/setLevel': MessageHandler<{ level: LogLevel }, void>;
  readonly 'notifications/progress': MessageHandler<ProgressParams, void>;
  readonly [key: string]: MessageHandler<any, any>;
}