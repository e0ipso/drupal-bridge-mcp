/**
 * JSON-RPC 2.0 Protocol Types for MCP Transport
 *
 * This module defines the types and interfaces for JSON-RPC 2.0 protocol
 * used to transport MCP (Model Context Protocol) messages over HTTP.
 */

import type { ServerResponse } from 'http';

/**
 * JSON-RPC 2.0 Request object
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
  id?: string | number | null;
}

/**
 * JSON-RPC 2.0 Notification (request without id)
 */
export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC 2.0 Success Response
 */
export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  result: unknown;
  id: string | number | null;
}

/**
 * JSON-RPC 2.0 Error object
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * JSON-RPC 2.0 Error Response
 */
export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  error: JsonRpcError;
  id: string | number | null;
}

/**
 * Union type for all JSON-RPC responses
 */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/**
 * Standard JSON-RPC 2.0 error codes
 */
export enum JsonRpcErrorCode {
  // JSON-RPC 2.0 standard error codes
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // MCP-specific error codes (server-defined range)
  MCP_AUTHENTICATION_REQUIRED = -32000,
  MCP_AUTHENTICATION_FAILED = -32001,
  MCP_INVALID_SESSION = -32002,
  MCP_SESSION_EXPIRED = -32003,
  MCP_TOOL_ERROR = -32004,
  MCP_RESOURCE_ERROR = -32005,
  MCP_VALIDATION_ERROR = -32006,
  MCP_TRANSPORT_ERROR = -32007,
}

/**
 * Standard JSON-RPC 2.0 error messages
 */
export const JSON_RPC_ERROR_MESSAGES = {
  [JsonRpcErrorCode.PARSE_ERROR]: 'Parse error',
  [JsonRpcErrorCode.INVALID_REQUEST]: 'Invalid Request',
  [JsonRpcErrorCode.METHOD_NOT_FOUND]: 'Method not found',
  [JsonRpcErrorCode.INVALID_PARAMS]: 'Invalid params',
  [JsonRpcErrorCode.INTERNAL_ERROR]: 'Internal error',
  [JsonRpcErrorCode.MCP_AUTHENTICATION_REQUIRED]: 'Authentication required',
  [JsonRpcErrorCode.MCP_AUTHENTICATION_FAILED]: 'Authentication failed',
  [JsonRpcErrorCode.MCP_INVALID_SESSION]: 'Invalid session',
  [JsonRpcErrorCode.MCP_SESSION_EXPIRED]: 'Session expired',
  [JsonRpcErrorCode.MCP_TOOL_ERROR]: 'Tool execution error',
  [JsonRpcErrorCode.MCP_RESOURCE_ERROR]: 'Resource access error',
  [JsonRpcErrorCode.MCP_VALIDATION_ERROR]: 'Validation error',
  [JsonRpcErrorCode.MCP_TRANSPORT_ERROR]: 'Transport error',
} as const;

/**
 * Session information for MCP connections
 */
export interface McpSession {
  id: string;
  createdAt: Date;
  lastActivity: Date;
  isAuthenticated: boolean;
  userId?: string;
  capabilities?: unknown;
}

/**
 * Content negotiation result
 */
export interface ContentNegotiation {
  contentType: 'application/json' | 'text/event-stream';
  acceptsJson: boolean;
  acceptsSSE: boolean;
}

/**
 * SSE connection information
 */
export interface SseConnection {
  id: string;
  response: ServerResponse;
  sessionId?: string;
  createdAt: Date;
  lastHeartbeat: Date;
  isActive: boolean;
}

/**
 * SSE event types for MCP streaming
 */
export enum SseEventType {
  CONNECTION = 'connection',
  MCP_RESPONSE = 'mcp-response',
  MCP_ERROR = 'mcp-error',
  MCP_NOTIFICATION = 'mcp-notification',
  HEARTBEAT = 'heartbeat',
  CLOSE = 'close',
}

/**
 * SSE event data structure
 */
export interface SseEvent {
  event: SseEventType;
  data: unknown;
  id?: string;
  retry?: number;
}

/**
 * MCP over JSON-RPC request context
 */
export interface McpJsonRpcContext {
  requestId: string;
  session?: McpSession;
  contentType: ContentNegotiation['contentType'];
  method: string;
  params?: unknown;
  sseConnection?: SseConnection;
}

/**
 * JSON-RPC validation result
 */
export interface JsonRpcValidationResult {
  isValid: boolean;
  request?: JsonRpcRequest;
  error?: JsonRpcError;
}

/**
 * Type guard to check if an object is a valid JSON-RPC request
 */
export function isJsonRpcRequest(obj: unknown): obj is JsonRpcRequest {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    candidate.jsonrpc === '2.0' &&
    typeof candidate.method === 'string' &&
    candidate.method.length > 0 &&
    (candidate.id === undefined ||
      candidate.id === null ||
      typeof candidate.id === 'string' ||
      typeof candidate.id === 'number')
  );
}

/**
 * Type guard to check if an object is a JSON-RPC notification
 */
export function isJsonRpcNotification(
  obj: unknown
): obj is JsonRpcNotification {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    candidate.jsonrpc === '2.0' &&
    typeof candidate.method === 'string' &&
    candidate.method.length > 0 &&
    !('id' in candidate)
  );
}

/**
 * Type guard to check if response is a success response
 */
export function isJsonRpcSuccessResponse(
  response: JsonRpcResponse
): response is JsonRpcSuccessResponse {
  return 'result' in response;
}

/**
 * Type guard to check if response is an error response
 */
export function isJsonRpcErrorResponse(
  response: JsonRpcResponse
): response is JsonRpcErrorResponse {
  return 'error' in response;
}

/**
 * Helper to create a JSON-RPC success response
 */
export function createJsonRpcSuccessResponse(
  result: unknown,
  id: string | number | null
): JsonRpcSuccessResponse {
  return {
    jsonrpc: '2.0',
    result,
    id,
  };
}

/**
 * Helper to create a JSON-RPC error response
 */
export function createJsonRpcErrorResponse(
  code: JsonRpcErrorCode,
  message?: string,
  data?: unknown,
  id?: string | number | null
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    error: {
      code,
      message: message || JSON_RPC_ERROR_MESSAGES[code] || 'Unknown error',
      data,
    },
    id: id ?? null,
  };
}

/**
 * Helper to format SSE event for transmission
 */
export function formatSseEvent(event: SseEvent): string {
  let sseString = '';

  if (event.id) {
    sseString += `id: ${event.id}\n`;
  }

  if (event.retry) {
    sseString += `retry: ${event.retry}\n`;
  }

  sseString += `event: ${event.event}\n`;

  // Handle multi-line data
  const dataString =
    typeof event.data === 'string' ? event.data : JSON.stringify(event.data);

  const dataLines = dataString.split('\n');
  for (const line of dataLines) {
    sseString += `data: ${line}\n`;
  }

  sseString += '\n'; // End with double newline

  return sseString;
}

/**
 * Helper to create SSE event for JSON-RPC response
 */
export function createSseResponseEvent(
  response: JsonRpcResponse,
  eventId?: string
): SseEvent {
  const eventType = isJsonRpcSuccessResponse(response)
    ? SseEventType.MCP_RESPONSE
    : SseEventType.MCP_ERROR;

  return {
    event: eventType,
    data: response,
    id: eventId,
  };
}

/**
 * Helper to create SSE heartbeat event
 */
export function createSseHeartbeatEvent(): SseEvent {
  return {
    event: SseEventType.HEARTBEAT,
    data: {
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Helper to create SSE connection event
 */
export function createSseConnectionEvent(status: string): SseEvent {
  return {
    event: SseEventType.CONNECTION,
    data: {
      type: 'connection',
      status,
      timestamp: new Date().toISOString(),
    },
  };
}
