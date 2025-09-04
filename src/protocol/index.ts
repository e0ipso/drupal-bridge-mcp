/**
 * MCP Protocol Module
 * 
 * Main entry point for the MCP protocol implementation providing
 * message parsing, validation, protocol state management, and
 * integration with transport layers.
 */

export type {
  // Core types
  MessageId,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPError,
  BaseMessage,
  
  // Protocol types
  ProtocolVersion,
  ProtocolState,
  RequestContext,
  MessageValidationResult,
  
  // Message handler types
  MessageHandler,
  MessageHandlers,
  
  // Initialize types
  InitializeParams,
  InitializeResult,
  ClientCapabilities,
  ServerCapabilities,
  
  // Tool types
  Tool,
  ListToolsParams,
  ListToolsResult,
  CallToolParams,
  CallToolResult,
  ToolResponseContent,
  TextContent,
  ImageContent,
  ResourceContent,
  ToolResponseAnnotations,
  
  // Utility types
  LogLevel,
  LoggingMessageParams,
  ProgressParams
} from './types';

export {
  MCPErrorCode
} from './types';

export {
  MCPMessageParser,
  messageParser
} from './message-parser';

export {
  MCPProtocolManager,
  protocolManager
} from './protocol-manager';

export type {
  ProtocolManagerConfig
} from './protocol-manager';

export {
  MCPProtocolHandler,
  createMCPProtocolHandler
} from './mcp-handler';

export type {
  MCPHandlerConfig
} from './mcp-handler';

export {
  MCPSSEIntegration,
  createMCPSSEIntegration
} from './sse-integration';

export type {
  SSEIntegrationConfig
} from './sse-integration';

/**
 * Create a complete MCP protocol setup with SSE integration
 */
export function createMCPProtocol(config: {
  sseTransport: import('@/transport/sse-transport').SSETransport;
  drupalBaseUrl?: string;
  enableToolDiscovery?: boolean;
  enableDebugMessages?: boolean;
}) {
  const integration = createMCPSSEIntegration(config.sseTransport, {
    drupalBaseUrl: config.drupalBaseUrl,
    enableToolDiscovery: config.enableToolDiscovery,
    enableDebugMessages: config.enableDebugMessages
  });

  return {
    integration,
    handleMessage: integration.handleSSEMessage.bind(integration),
    handleConnectionEstablished: integration.handleConnectionEstablished.bind(integration),
    handleConnectionClosed: integration.handleConnectionClosed.bind(integration),
    handleHeartbeat: integration.handleHeartbeat.bind(integration),
    getStats: integration.getStats.bind(integration)
  };
}