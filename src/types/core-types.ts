/**
 * Core protocol type definitions (JSON-RPC + MCP)
 * Consolidated for MVP simplification
 */

// =============================================================================
// JSON-RPC 2.0 Types
// =============================================================================

/**
 * JSON-RPC 2.0 request structure
 */
export interface JsonRpcRequest<TParams = unknown> {
  readonly jsonrpc: '2.0';
  readonly method: string;
  readonly params?: TParams;
  readonly id?: string | number | null;
}

/**
 * JSON-RPC 2.0 response structure for successful calls
 */
export interface JsonRpcSuccessResponse<TResult = unknown> {
  readonly jsonrpc: '2.0';
  readonly result: TResult;
  readonly id: string | number | null;
}

/**
 * JSON-RPC 2.0 error object
 */
export interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/**
 * JSON-RPC 2.0 response structure for failed calls
 */
export interface JsonRpcErrorResponse {
  readonly jsonrpc: '2.0';
  readonly error: JsonRpcError;
  readonly id: string | number | null;
}

/**
 * Union type for JSON-RPC 2.0 responses
 */
export type JsonRpcResponse<TResult = unknown> =
  | JsonRpcSuccessResponse<TResult>
  | JsonRpcErrorResponse;

/**
 * Type guard to check if response is successful
 */
export const isJsonRpcSuccessResponse = <TResult = unknown>(
  response: JsonRpcResponse<TResult>
): response is JsonRpcSuccessResponse<TResult> => {
  return 'result' in response;
};

/**
 * Type guard to check if response is an error
 */
export const isJsonRpcErrorResponse = (
  response: JsonRpcResponse
): response is JsonRpcErrorResponse => {
  return 'error' in response;
};

/**
 * Standard JSON-RPC 2.0 error codes
 */
export const JsonRpcErrorCode = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000, // to -32099 reserved for server errors
} as const;

export type JsonRpcErrorCode =
  (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

// =============================================================================
// MCP Protocol Types
// =============================================================================

/**
 * MCP resource definition
 */
export interface McpResource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
}

/**
 * MCP tool definition
 */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/**
 * MCP prompt definition
 */
export interface McpPrompt {
  readonly name: string;
  readonly description: string;
  readonly arguments?: Array<{
    readonly name: string;
    readonly description: string;
    readonly required?: boolean;
  }>;
}

// Simplified MCP types for MVP - removed unused complex nested structures

/**
 * MCP server capabilities (simplified)
 */
export interface McpServerCapabilities {
  readonly resources?: Record<string, unknown>;
  readonly tools?: Record<string, unknown>;
  readonly prompts?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * MCP server information (simplified)
 */
export interface McpServerInfo {
  readonly name: string;
  readonly version: string;
  readonly protocolVersion: string;
  readonly capabilities: McpServerCapabilities;
}

/**
 * MCP error types
 */
export const McpErrorType = {
  INVALID_REQUEST: 'InvalidRequest',
  METHOD_NOT_FOUND: 'MethodNotFound',
  INVALID_PARAMS: 'InvalidParams',
  INTERNAL_ERROR: 'InternalError',
} as const;

export type McpErrorType = (typeof McpErrorType)[keyof typeof McpErrorType];

/**
 * MCP error structure
 */
export interface McpError {
  readonly type: McpErrorType;
  readonly message: string;
  readonly data?: unknown;
}

/**
 * Search tutorials tool input parameters
 */
export interface SearchToolParams {
  readonly query: string;
  readonly drupal_version?: '9' | '10' | '11';
  readonly tags?: string[];
}

/**
 * Processed search parameters after validation
 */
export interface ProcessedSearchParams {
  readonly query: string;
  readonly drupal_version: string | null;
  readonly tags: string[];
}

/**
 * Tutorial search result item
 */
export interface TutorialSearchResult {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly description?: string;
  readonly drupal_version?: string[];
  readonly tags?: string[];
  readonly difficulty?: 'beginner' | 'intermediate' | 'advanced';
  readonly created: string;
  readonly updated?: string;
}

/**
 * Search tutorials response
 */
export interface SearchTutorialsResponse {
  readonly results: TutorialSearchResult[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly query: ProcessedSearchParams;
}