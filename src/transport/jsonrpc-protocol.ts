/**
 * JSON-RPC 2.0 Protocol Handler for MCP Transport
 *
 * This module implements JSON-RPC 2.0 protocol parsing, validation,
 * and integration with MCP (Model Context Protocol) servers.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { Logger } from 'pino';
import { JSONRPCServer, JSONRPCErrorException } from 'json-rpc-2.0';
import type { DrupalMcpServer } from '@/mcp/server.js';
import { McpJsonRpcBridge } from './mcp-jsonrpc-bridge.js';
import {
  type JsonRpcRequest,
  type JsonRpcResponse,
  type JsonRpcValidationResult,
  type McpSession,
  type ContentNegotiation,
  type McpJsonRpcContext,
  JsonRpcErrorCode,
  isJsonRpcRequest,
  createJsonRpcErrorResponse,
  createJsonRpcSuccessResponse,
} from './jsonrpc-types.js';

/**
 * Session storage for MCP connections
 */
class SessionManager {
  private sessions = new Map<string, McpSession>();
  private readonly sessionTimeout = 30 * 60 * 1000; // 30 minutes

  /**
   * Create a new session
   */
  createSession(): McpSession {
    const id = this.generateSessionId();
    const session: McpSession = {
      id,
      createdAt: new Date(),
      lastActivity: new Date(),
      isAuthenticated: false,
    };

    this.sessions.set(id, session);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): McpSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Check if session has expired
      const isExpired =
        Date.now() - session.lastActivity.getTime() > this.sessionTimeout;
      if (isExpired) {
        this.sessions.delete(sessionId);
        return undefined;
      }

      // Update last activity
      session.lastActivity = new Date();
      return session;
    }
    return undefined;
  }

  /**
   * Update session authentication status
   */
  updateSession(sessionId: string, updates: Partial<McpSession>): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      Object.assign(session, updates, { lastActivity: new Date() });
      return true;
    }
    return false;
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.lastActivity.getTime() > this.sessionTimeout) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * JSON-RPC Protocol Handler for MCP
 */
export class JsonRpcProtocolHandler {
  private readonly sessionManager = new SessionManager();
  private readonly jsonRpcServer = new JSONRPCServer();
  private readonly mcpBridge: McpJsonRpcBridge;

  constructor(
    private readonly mcpServer: DrupalMcpServer,
    private readonly logger: Logger
  ) {
    this.mcpBridge = new McpJsonRpcBridge(mcpServer, logger);
    this.setupJsonRpcMethods();

    // Cleanup expired sessions every 5 minutes
    setInterval(
      () => {
        this.sessionManager.cleanupExpiredSessions();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Handle incoming JSON-RPC request from HTTP
   */
  async handleJsonRpcRequest(
    req: IncomingMessage,
    res: ServerResponse,
    body: string,
    requestLogger: Logger
  ): Promise<void> {
    const requestId = this.generateRequestId();

    try {
      // Parse JSON body
      let jsonRequest: unknown;
      try {
        jsonRequest = JSON.parse(body);
      } catch {
        requestLogger.warn(
          { body: body.substring(0, 100) },
          'Invalid JSON in request body'
        );
        this.sendJsonRpcResponse(
          res,
          createJsonRpcErrorResponse(JsonRpcErrorCode.PARSE_ERROR),
          requestLogger
        );
        return;
      }

      // Validate JSON-RPC request structure
      const validation = this.validateJsonRpcRequest(jsonRequest);
      if (!validation.isValid) {
        requestLogger.warn(
          { request: jsonRequest },
          'Invalid JSON-RPC request'
        );
        this.sendJsonRpcResponse(
          res,
          createJsonRpcErrorResponse(
            JsonRpcErrorCode.INVALID_REQUEST,
            validation.error?.message,
            validation.error?.data,
            Array.isArray(jsonRequest) ? null : (jsonRequest as any)?.id
          ),
          requestLogger
        );
        return;
      }

      // Handle session management
      const sessionId = req.headers['mcp-session-id'] as string;
      const session = sessionId
        ? this.sessionManager.getSession(sessionId)
        : undefined;

      // Negotiate content type
      const contentNegotiation = this.negotiateContentType(req);

      // Create request context
      const context: McpJsonRpcContext = {
        requestId,
        session,
        contentType: contentNegotiation.contentType,
        method: validation.request!.method,
        params: validation.request!.params,
      };

      requestLogger.debug(
        {
          method: context.method,
          sessionId: session?.id,
          contentType: context.contentType,
        },
        'Processing JSON-RPC request'
      );

      // Handle batch requests (array of requests)
      if (Array.isArray(jsonRequest)) {
        await this.handleBatchRequest(jsonRequest, context, res, requestLogger);
        return;
      }

      // Handle single request
      const response = await this.processJsonRpcRequest(
        validation.request!,
        context,
        requestLogger
      );

      // Set session header if session was created
      if (context.session && !sessionId) {
        res.setHeader('Mcp-Session-Id', context.session.id);
      }

      this.sendJsonRpcResponse(res, response, requestLogger);
    } catch (error) {
      requestLogger.error({ err: error }, 'Error processing JSON-RPC request');
      this.sendJsonRpcResponse(
        res,
        createJsonRpcErrorResponse(
          JsonRpcErrorCode.INTERNAL_ERROR,
          'Internal server error'
        ),
        requestLogger
      );
    }
  }

  /**
   * Validate JSON-RPC request structure
   */
  private validateJsonRpcRequest(obj: unknown): JsonRpcValidationResult {
    // Handle batch requests
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return {
          isValid: false,
          error: {
            code: JsonRpcErrorCode.INVALID_REQUEST,
            message: 'Batch request cannot be empty',
          },
        };
      }

      // Validate each request in batch
      for (const item of obj) {
        if (!isJsonRpcRequest(item)) {
          return {
            isValid: false,
            error: {
              code: JsonRpcErrorCode.INVALID_REQUEST,
              message: 'Invalid request in batch',
              data: item,
            },
          };
        }
      }

      return { isValid: true };
    }

    // Handle single request
    if (!isJsonRpcRequest(obj)) {
      return {
        isValid: false,
        error: {
          code: JsonRpcErrorCode.INVALID_REQUEST,
          message: 'Invalid JSON-RPC request format',
          data: obj,
        },
      };
    }

    return { isValid: true, request: obj };
  }

  /**
   * Negotiate content type based on Accept header
   */
  private negotiateContentType(req: IncomingMessage): ContentNegotiation {
    const acceptHeader = req.headers.accept || '';
    const acceptsJson =
      acceptHeader.includes('application/json') || acceptHeader.includes('*/*');
    const acceptsSSE = acceptHeader.includes('text/event-stream');

    // Default to JSON for POST requests (standard JSON-RPC)
    let contentType: ContentNegotiation['contentType'] = 'application/json';

    // Prefer SSE if explicitly requested and supported
    if (acceptsSSE && !acceptsJson) {
      contentType = 'text/event-stream';
    }

    return {
      contentType,
      acceptsJson,
      acceptsSSE,
    };
  }

  /**
   * Process single JSON-RPC request
   */
  private async processJsonRpcRequest(
    request: JsonRpcRequest,
    context: McpJsonRpcContext,
    logger: Logger
  ): Promise<JsonRpcResponse> {
    try {
      // Handle MCP initialization specially
      if (request.method === 'initialize') {
        return await this.handleInitialize(request, context, logger);
      }

      // Ensure session exists for non-initialize methods
      if (!context.session) {
        context.session = this.sessionManager.createSession();
        logger.debug({ sessionId: context.session.id }, 'Created new session');
      }

      // Route to appropriate MCP method handler
      const result = await this.routeToMcpMethod(
        request.method,
        request.params,
        context,
        logger
      );

      return createJsonRpcSuccessResponse(result, request.id ?? null);
    } catch (error) {
      logger.error(
        { err: error, method: request.method },
        'Error processing MCP method'
      );

      if (error instanceof JSONRPCErrorException) {
        return createJsonRpcErrorResponse(
          error.code,
          error.message,
          error.data,
          request.id ?? null
        );
      }

      return createJsonRpcErrorResponse(
        JsonRpcErrorCode.INTERNAL_ERROR,
        'Method execution failed',
        undefined,
        request.id ?? null
      );
    }
  }

  /**
   * Handle MCP initialize method
   */
  private async handleInitialize(
    request: JsonRpcRequest,
    context: McpJsonRpcContext,
    logger: Logger
  ): Promise<JsonRpcResponse> {
    // Create new session for initialization
    if (!context.session) {
      context.session = this.sessionManager.createSession();
      logger.info(
        { sessionId: context.session.id },
        'Created session for MCP initialization'
      );
    }

    // Store capabilities if provided
    if (request.params && typeof request.params === 'object') {
      context.session.capabilities = request.params;
    }

    // Return MCP server capabilities
    const capabilities = {
      capabilities: {
        resources: { subscribe: true, listChanged: true },
        tools: { listChanged: true },
        prompts: { listChanged: true },
      },
      serverInfo: {
        name: 'drupal-bridge-mcp',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
      },
      instructions: 'Connected to Drupal MCP Server via JSON-RPC transport',
    };

    return createJsonRpcSuccessResponse(capabilities, request.id ?? null);
  }

  /**
   * Route JSON-RPC method to MCP server via bridge
   */
  private async routeToMcpMethod(
    method: string,
    params: unknown,
    context: McpJsonRpcContext,
    _logger: Logger
  ): Promise<unknown> {
    // Use the bridge to route to MCP server
    const response = await this.mcpBridge.routeToMcpMethod(
      method,
      params,
      context,
      null // We'll handle the response format here
    );

    // Extract the result from JSON-RPC response
    if ('result' in response) {
      return response.result;
    } else if ('error' in response) {
      throw new JSONRPCErrorException(
        response.error.message,
        response.error.code,
        response.error.data
      );
    }

    throw new Error('Invalid response from MCP bridge');
  }

  /**
   * Handle batch JSON-RPC requests
   */
  private async handleBatchRequest(
    requests: unknown[],
    context: McpJsonRpcContext,
    res: ServerResponse,
    logger: Logger
  ): Promise<void> {
    const responses: JsonRpcResponse[] = [];

    for (const req of requests) {
      if (!isJsonRpcRequest(req)) {
        responses.push(
          createJsonRpcErrorResponse(
            JsonRpcErrorCode.INVALID_REQUEST,
            'Invalid request in batch'
          )
        );
        continue;
      }

      try {
        const response = await this.processJsonRpcRequest(req, context, logger);
        responses.push(response);
      } catch (error) {
        logger.error({ err: error }, 'Error in batch request');
        responses.push(
          createJsonRpcErrorResponse(
            JsonRpcErrorCode.INTERNAL_ERROR,
            'Batch request failed',
            undefined,
            req.id ?? null
          )
        );
      }
    }

    this.sendJsonRpcResponse(res, responses, logger);
  }

  /**
   * Send JSON-RPC response
   */
  private sendJsonRpcResponse(
    res: ServerResponse,
    response: JsonRpcResponse | JsonRpcResponse[],
    logger: Logger
  ): void {
    if (res.headersSent) {
      logger.warn('Attempted to send JSON-RPC response after headers sent');
      return;
    }

    res.setHeader('Content-Type', 'application/json');
    const responseBody = JSON.stringify(response, null, 2);

    res.writeHead(200);
    res.end(responseBody);

    logger.debug(
      { responseSize: responseBody.length },
      'JSON-RPC response sent'
    );
  }

  /**
   * Setup JSON-RPC server methods (alternative approach using json-rpc-2.0 library)
   */
  private setupJsonRpcMethods(): void {
    // This could be used as an alternative to manual routing
    // The json-rpc-2.0 library provides automatic method dispatching

    this.jsonRpcServer.addMethod('initialize', async (_params: unknown) => {
      return {
        capabilities: {
          resources: { subscribe: true, listChanged: true },
          tools: { listChanged: true },
          prompts: { listChanged: true },
        },
        serverInfo: {
          name: 'drupal-bridge-mcp',
          version: '1.0.0',
        },
      };
    });
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `jsonrpc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get session manager for testing
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }
}
