/**
 * MCP Protocol State Manager and Request Correlation
 * 
 * Manages protocol initialization state, version negotiation, request/response
 * correlation, timeout handling, and message routing to appropriate handlers.
 */

import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';
import {
  messageParser,
  type MCPMessageParser
} from './message-parser';
import type {
  MessageId,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPError,
  ProtocolState,
  RequestContext,
  MessageHandler,
  MessageHandlers,
  InitializeParams,
  InitializeResult,
  ServerCapabilities,
  ProtocolVersion
} from './types';
import {
  MCPErrorCode
} from './types';

/**
 * Configuration for protocol manager
 */
export interface ProtocolManagerConfig {
  readonly defaultTimeout: number;
  readonly maxPendingRequests: number;
  readonly supportedProtocolVersions: string[];
  readonly serverInfo: {
    readonly name: string;
    readonly version: string;
  };
  readonly serverCapabilities: ServerCapabilities;
}

/**
 * Pending request tracking interface
 */
interface PendingRequest {
  readonly id: MessageId;
  readonly method: string;
  readonly timestamp: number;
  readonly timeout: number;
  readonly connectionId: string;
  readonly timeoutHandle: NodeJS.Timeout;
  readonly resolve: (response: MCPResponse) => void;
  readonly reject: (error: Error) => void;
}

/**
 * Protocol manager events
 */
export interface ProtocolManagerEvents {
  'initialized': (connectionId: string, state: ProtocolState) => void;
  'request': (request: MCPRequest, context: RequestContext) => void;
  'response': (response: MCPResponse, context: RequestContext) => void;
  'notification': (notification: MCPNotification, context: RequestContext) => void;
  'error': (error: Error, connectionId: string) => void;
  'timeout': (requestId: MessageId, connectionId: string) => void;
}

/**
 * MCP Protocol Manager
 */
export class MCPProtocolManager extends EventEmitter {
  private readonly config: ProtocolManagerConfig;
  private readonly parser: MCPMessageParser;
  private readonly connectionStates = new Map<string, ProtocolState>();
  private readonly pendingRequests = new Map<MessageId, PendingRequest>();
  private readonly messageHandlers = new Map<string, MessageHandler>();

  constructor(config: Partial<ProtocolManagerConfig> = {}) {
    super();
    
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 30000, // 30 seconds
      maxPendingRequests: config.maxPendingRequests ?? 100,
      supportedProtocolVersions: config.supportedProtocolVersions ?? ['2024-11-05'],
      serverInfo: config.serverInfo ?? {
        name: 'drupalize-mcp-server',
        version: '1.0.0'
      },
      serverCapabilities: config.serverCapabilities ?? {
        tools: { listChanged: true },
        logging: {},
        experimental: {}
      }
    };

    this.parser = messageParser;
    this.setupDefaultHandlers();

    logger.info('Protocol manager initialized', {
      supportedVersions: this.config.supportedProtocolVersions,
      defaultTimeout: this.config.defaultTimeout,
      maxPendingRequests: this.config.maxPendingRequests
    });
  }

  /**
   * Process incoming raw message data
   */
  async processMessage(
    rawData: string | Buffer,
    connectionId: string
  ): Promise<MCPResponse | null> {
    try {
      // Parse the message
      const parseResult = this.parser.parseMessage(rawData);
      if (!parseResult.success) {
        logger.warn('Failed to parse message', {
          connectionId,
          error: parseResult.error
        });
        
        return this.parser.createErrorResponse(
          null,
          MCPErrorCode.PARSE_ERROR,
          parseResult.error || 'Failed to parse JSON'
        );
      }

      // Validate message structure
      const validationResult = this.parser.validateMessage(parseResult.data);
      if (!validationResult.isValid) {
        logger.warn('Invalid message structure', {
          connectionId,
          error: validationResult.error
        });

        return this.parser.createErrorResponse(
          parseResult.data?.id || null,
          MCPErrorCode.INVALID_REQUEST,
          validationResult.error || 'Invalid message structure'
        );
      }

      const message = parseResult.data;

      // Route message based on type
      if (this.parser.isRequest(message)) {
        return await this.handleRequest(message, connectionId);
      } else if (this.parser.isResponse(message)) {
        await this.handleResponse(message, connectionId);
        return null; // Responses don't generate new responses
      } else if (this.parser.isNotification(message)) {
        await this.handleNotification(message, connectionId);
        return null; // Notifications don't generate responses
      }

      return this.parser.createErrorResponse(
        message.id || null,
        MCPErrorCode.INVALID_REQUEST,
        'Unrecognized message type'
      );

    } catch (error) {
      logger.error('Error processing message', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      return this.parser.createErrorResponse(
        null,
        MCPErrorCode.INTERNAL_ERROR,
        'Internal server error'
      );
    }
  }

  /**
   * Register a message handler for a specific method
   */
  registerHandler<TParams = any, TResult = any>(
    method: string,
    handler: MessageHandler<TParams, TResult>
  ): void {
    this.messageHandlers.set(method, handler);
    logger.debug('Registered message handler', { method });
  }

  /**
   * Get protocol state for a connection
   */
  getProtocolState(connectionId: string): ProtocolState | undefined {
    return this.connectionStates.get(connectionId);
  }

  /**
   * Check if connection is initialized
   */
  isInitialized(connectionId: string): boolean {
    const state = this.connectionStates.get(connectionId);
    return state?.isInitialized ?? false;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connections: number;
    initializedConnections: number;
    pendingRequests: number;
    supportedVersions: string[];
  } {
    const initializedConnections = Array.from(this.connectionStates.values())
      .filter(state => state.isInitialized).length;

    return {
      connections: this.connectionStates.size,
      initializedConnections,
      pendingRequests: this.pendingRequests.size,
      supportedVersions: this.config.supportedProtocolVersions
    };
  }

  /**
   * Clean up connection state
   */
  cleanupConnection(connectionId: string): void {
    // Remove protocol state
    this.connectionStates.delete(connectionId);

    // Cancel pending requests for this connection
    const pendingForConnection = Array.from(this.pendingRequests.values())
      .filter(req => req.connectionId === connectionId);

    for (const request of pendingForConnection) {
      clearTimeout(request.timeoutHandle);
      this.pendingRequests.delete(request.id);
      
      request.reject(new Error('Connection closed'));
      
      logger.debug('Cancelled pending request due to connection cleanup', {
        requestId: request.id,
        method: request.method,
        connectionId
      });
    }

    logger.debug('Cleaned up connection state', {
      connectionId,
      cancelledRequests: pendingForConnection.length
    });
  }

  /**
   * Handle incoming request messages
   */
  private async handleRequest(
    request: MCPRequest,
    connectionId: string
  ): Promise<MCPResponse> {
    const context: RequestContext = {
      id: request.id,
      method: request.method,
      timestamp: Date.now(),
      connectionId,
      timeout: this.config.defaultTimeout
    };

    this.emit('request', request, context);

    try {
      // Check if connection needs to be initialized first
      if (!this.isConnectionMethodAllowed(request.method, connectionId)) {
        return this.parser.createErrorResponse(
          request.id,
          MCPErrorCode.NOT_INITIALIZED,
          'Connection must be initialized before calling this method'
        );
      }

      // Validate method parameters
      const paramsValidation = this.parser.validateParams(request.method, request.params);
      if (!paramsValidation.isValid) {
        return this.parser.createErrorResponse(
          request.id,
          MCPErrorCode.INVALID_PARAMS,
          paramsValidation.error || 'Invalid parameters'
        );
      }

      // Find handler for the method
      const handler = this.messageHandlers.get(request.method);
      if (!handler) {
        return this.parser.createErrorResponse(
          request.id,
          MCPErrorCode.METHOD_NOT_FOUND,
          `Method '${request.method}' not found`
        );
      }

      // Execute handler
      const result = await handler(paramsValidation.validatedParams, context);
      
      return this.parser.createSuccessResponse(request.id, result);

    } catch (error) {
      logger.error('Error handling request', {
        method: request.method,
        requestId: request.id,
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Check if it's a custom MCP error
      if (this.isMCPError(error)) {
        return this.parser.createErrorResponse(
          request.id,
          error.code,
          error.message,
          error.data
        );
      }

      return this.parser.createErrorResponse(
        request.id,
        MCPErrorCode.INTERNAL_ERROR,
        'Internal server error'
      );
    }
  }

  /**
   * Handle incoming response messages
   */
  private async handleResponse(
    response: MCPResponse,
    connectionId: string
  ): Promise<void> {
    const pendingRequest = this.pendingRequests.get(response.id);
    if (!pendingRequest) {
      logger.warn('Received response for unknown request', {
        responseId: response.id,
        connectionId
      });
      return;
    }

    // Clean up the pending request
    clearTimeout(pendingRequest.timeoutHandle);
    this.pendingRequests.delete(response.id);

    const context: RequestContext = {
      id: response.id,
      method: pendingRequest.method,
      timestamp: pendingRequest.timestamp,
      connectionId
    };

    this.emit('response', response, context);

    // Resolve the promise
    pendingRequest.resolve(response);
  }

  /**
   * Handle incoming notification messages
   */
  private async handleNotification(
    notification: MCPNotification,
    connectionId: string
  ): Promise<void> {
    const context: RequestContext = {
      id: null, // Notifications don't have IDs
      method: notification.method,
      timestamp: Date.now(),
      connectionId
    };

    this.emit('notification', notification, context);

    try {
      // Find handler for the notification method
      const handler = this.messageHandlers.get(notification.method);
      if (handler) {
        await handler(notification.params, context);
      } else {
        logger.debug('No handler for notification method', {
          method: notification.method,
          connectionId
        });
      }
    } catch (error) {
      logger.error('Error handling notification', {
        method: notification.method,
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Check if a method is allowed for the connection state
   */
  private isConnectionMethodAllowed(method: string, connectionId: string): boolean {
    // Allow initialize and initialized methods always
    if (method === 'initialize' || method === 'initialized') {
      return true;
    }

    // All other methods require initialization
    return this.isInitialized(connectionId);
  }

  /**
   * Check if error is an MCP error
   */
  private isMCPError(error: any): error is MCPError {
    return (
      error &&
      typeof error.code === 'number' &&
      typeof error.message === 'string'
    );
  }

  /**
   * Set up default protocol handlers
   */
  private setupDefaultHandlers(): void {
    // Initialize handler
    this.registerHandler('initialize', async (
      params: InitializeParams,
      context: RequestContext
    ): Promise<InitializeResult> => {
      return await this.handleInitialize(params, context);
    });

    // Initialized notification handler
    this.registerHandler('initialized', async (
      params: object,
      context: RequestContext
    ): Promise<void> => {
      logger.info('Client initialization completed', {
        connectionId: context.connectionId
      });
    });
  }

  /**
   * Handle initialize request
   */
  private async handleInitialize(
    params: InitializeParams,
    context: RequestContext
  ): Promise<InitializeResult> {
    const { connectionId } = context;

    // Check if already initialized
    if (this.isInitialized(connectionId)) {
      throw {
        code: MCPErrorCode.ALREADY_INITIALIZED,
        message: 'Connection already initialized'
      };
    }

    // Validate protocol version
    if (!this.config.supportedProtocolVersions.includes(params.protocolVersion)) {
      throw {
        code: MCPErrorCode.INITIALIZATION_FAILED,
        message: `Unsupported protocol version: ${params.protocolVersion}. Supported versions: ${this.config.supportedProtocolVersions.join(', ')}`
      };
    }

    // Create protocol state
    const protocolState: ProtocolState = {
      isInitialized: true,
      protocolVersion: params.protocolVersion,
      clientCapabilities: params.capabilities,
      serverCapabilities: this.config.serverCapabilities,
      clientInfo: params.clientInfo
    };

    this.connectionStates.set(connectionId, protocolState);

    logger.info('Connection initialized', {
      connectionId,
      protocolVersion: params.protocolVersion,
      clientName: params.clientInfo.name,
      clientVersion: params.clientInfo.version
    });

    this.emit('initialized', connectionId, protocolState);

    return {
      protocolVersion: params.protocolVersion,
      capabilities: this.config.serverCapabilities,
      serverInfo: this.config.serverInfo
    };
  }

  /**
   * Handle request timeout
   */
  private handleRequestTimeout(requestId: MessageId, connectionId: string): void {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      return;
    }

    this.pendingRequests.delete(requestId);
    
    const error = new Error(`Request ${requestId} timed out after ${pendingRequest.timeout}ms`);
    pendingRequest.reject(error);

    this.emit('timeout', requestId, connectionId);

    logger.warn('Request timed out', {
      requestId,
      method: pendingRequest.method,
      connectionId,
      timeout: pendingRequest.timeout
    });
  }
}

/**
 * Default protocol manager instance
 */
export const protocolManager = new MCPProtocolManager();