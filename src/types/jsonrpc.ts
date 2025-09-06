/**
 * JSON-RPC 2.0 type definitions for Drupal communication
 */

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
