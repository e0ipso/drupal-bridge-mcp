/**
 * HTTP Transport for MCP server
 * Provides basic HTTP server infrastructure with CORS support and graceful shutdown
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'http';
import { URL } from 'url';
import type { AppConfig } from '@/config/index.js';
import type { DrupalMcpServer } from '@/mcp/server.js';
import { createChildLogger } from '@/utils/logger.js';
import type { Logger } from 'pino';
import { JsonRpcProtocolHandler } from './jsonrpc-protocol.js';
import {
  type SseConnection,
  SseEventType,
  formatSseEvent,
  createSseConnectionEvent,
  createSseHeartbeatEvent,
} from './jsonrpc-types.js';

/**
 * HTTP transport implementation for MCP over HTTP
 */
export class HttpTransport {
  private server: Server | null = null;
  private readonly logger: Logger;
  private readonly connections = new Set<NodeJS.Socket>();
  private readonly sseConnections = new Map<string, SseConnection>();
  private isShuttingDown = false;
  private readonly mcpEndpoint: string;
  private jsonRpcHandler?: JsonRpcProtocolHandler;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(
    private readonly config: AppConfig,
    private readonly mcpServer?: DrupalMcpServer,
    parentLogger?: Logger
  ) {
    if (parentLogger) {
      this.logger = parentLogger.child({ component: 'http-transport' });
    } else {
      this.logger = createChildLogger({ component: 'http-transport' });
    }
    this.mcpEndpoint = '/mcp';

    // Initialize JSON-RPC handler if MCP server is provided
    if (mcpServer) {
      this.jsonRpcHandler = new JsonRpcProtocolHandler(mcpServer, this.logger);
      this.jsonRpcHandler.setHttpTransport(this);
    }
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('HTTP server is already running');
    }

    this.logger.info('Starting HTTP server...');

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        this.handleRequest(req, res);
      });

      // Track connections for graceful shutdown
      this.server.on('connection', socket => {
        this.connections.add(socket);
        socket.on('close', () => {
          this.connections.delete(socket);
        });
      });

      this.server.on('error', error => {
        this.logger.error({ err: error }, 'HTTP server error');
        reject(error);
      });

      this.server.listen(this.config.http.port, this.config.http.host, () => {
        this.logger.info(
          {
            host: this.config.http.host,
            port: this.config.http.port,
            endpoint: this.mcpEndpoint,
            corsOrigins: this.config.http.corsOrigins.length,
            timeout: this.config.http.timeout,
            sse: this.config.http.enableSSE,
          },
          'HTTP server started successfully'
        );

        // Start SSE heartbeat interval if SSE is enabled
        if (this.config.http.enableSSE) {
          this.startSseHeartbeat();
        }

        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server with graceful shutdown
   */
  async stop(): Promise<void> {
    if (!this.server) {
      this.logger.warn('HTTP server is not running');
      return;
    }

    this.logger.info('Stopping HTTP server...');
    this.isShuttingDown = true;

    // Stop SSE heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    // Close all SSE connections gracefully
    this.closeAllSseConnections();

    return new Promise((resolve, reject) => {
      // Close all active connections
      for (const connection of this.connections) {
        connection.destroy();
      }
      this.connections.clear();

      // Close the server
      this.server!.close(error => {
        if (error) {
          this.logger.error({ err: error }, 'Error stopping HTTP server');
          reject(error);
        } else {
          this.logger.info('HTTP server stopped successfully');
          this.server = null;
          this.isShuttingDown = false;
          resolve();
        }
      });
    });
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    const method = req.method?.toUpperCase() || 'UNKNOWN';
    const url = req.url || '/';

    const requestLogger = this.logger.child({
      requestId,
      method,
      url,
      userAgent: req.headers['user-agent'],
    });

    requestLogger.debug('Incoming HTTP request');

    // Set common headers
    this.setCommonHeaders(res);

    // Handle server shutdown
    if (this.isShuttingDown) {
      this.sendResponse(
        res,
        503,
        {
          error: 'Server is shutting down',
          message: 'Please retry your request',
        },
        requestLogger
      );
      return;
    }

    // Set up request timeout
    const timeoutId = setTimeout(() => {
      if (!res.headersSent) {
        requestLogger.warn(
          { timeout: this.config.http.timeout },
          'Request timeout'
        );
        this.sendResponse(
          res,
          408,
          {
            error: 'Request timeout',
            message: 'Request took too long to process',
          },
          requestLogger
        );
      }
    }, this.config.http.timeout);

    // Clean up timeout when response finishes
    res.on('finish', () => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      requestLogger.info(
        { duration, statusCode: res.statusCode },
        'Request completed'
      );
    });

    try {
      this.routeRequest(req, res, requestLogger);
    } catch (error) {
      clearTimeout(timeoutId);
      requestLogger.error({ err: error }, 'Error handling request');
      if (!res.headersSent) {
        this.sendResponse(
          res,
          500,
          {
            error: 'Internal server error',
            message: 'An unexpected error occurred',
          },
          requestLogger
        );
      }
    }
  }

  /**
   * Route requests to appropriate handlers
   */
  private routeRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): void {
    const method = req.method?.toUpperCase();
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Handle CORS preflight requests
    if (method === 'OPTIONS') {
      this.handleCorsPreflightRequest(req, res, logger);
      return;
    }

    // Health check endpoint
    if (pathname === '/health' && method === 'GET') {
      this.handleHealthCheck(req, res, logger);
      return;
    }

    // MCP endpoint
    if (pathname === this.mcpEndpoint) {
      if (method === 'GET' || method === 'POST') {
        this.handleMcpRequest(req, res, logger);
        return;
      } else {
        this.sendResponse(
          res,
          405,
          {
            error: 'Method not allowed',
            message: `Method ${method} is not allowed for ${pathname}`,
            allowed: ['GET', 'POST', 'OPTIONS'],
          },
          logger
        );
        return;
      }
    }

    // MCP SSE endpoint for JSON-RPC over existing SSE connections
    if (pathname === `${this.mcpEndpoint}/sse` && method === 'POST') {
      this.handleSseJsonRpcRequest(req, res, logger);
      return;
    }

    // 404 for all other routes
    this.sendResponse(
      res,
      404,
      {
        error: 'Not found',
        message: `Path ${pathname} not found`,
      },
      logger
    );
  }

  /**
   * Handle CORS preflight requests
   */
  private handleCorsPreflightRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): void {
    const origin = req.headers.origin;

    if (this.isValidCorsOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin!);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, Mcp-Session-Id'
      );
      res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

      logger.debug({ origin }, 'CORS preflight request approved');
    } else {
      logger.warn(
        { origin, configuredOrigins: this.config.http.corsOrigins },
        'CORS preflight request denied'
      );
    }

    this.sendResponse(res, 204, null, logger);
  }

  /**
   * Handle health check requests
   */
  private handleHealthCheck(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): void {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: this.config.mcp.version,
      environment: this.config.environment,
    };

    logger.debug('Health check requested');
    this.sendResponse(res, 200, health, logger);
  }

  /**
   * Handle MCP requests (GET for SSE, POST for JSON-RPC)
   */
  private handleMcpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): void {
    const method = req.method?.toUpperCase();

    if (method === 'GET') {
      if (this.config.http.enableSSE) {
        this.handleSseRequest(req, res, logger);
      } else {
        this.sendResponse(
          res,
          405,
          {
            error: 'SSE not enabled',
            message: 'Server-Sent Events are disabled',
          },
          logger
        );
      }
    } else if (method === 'POST') {
      this.handleJsonRpcRequest(req, res, logger);
    }
  }

  /**
   * Handle Server-Sent Events requests
   */
  private handleSseRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): void {
    const connectionId = this.generateConnectionId();

    logger.info({ connectionId }, 'Setting up SSE connection');

    // Check Accept header specifically for text/event-stream
    const acceptHeader = req.headers.accept || '';
    if (!acceptHeader.includes('text/event-stream')) {
      this.sendResponse(
        res,
        406,
        {
          error: 'Not Acceptable',
          message: 'Client must accept text/event-stream content type',
        },
        logger
      );
      return;
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': this.getCorsOrigin(req),
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Create SSE connection object
    const sseConnection: SseConnection = {
      id: connectionId,
      response: res,
      sessionId: req.headers['mcp-session-id'] as string,
      createdAt: new Date(),
      lastHeartbeat: new Date(),
      isActive: true,
    };

    // Store connection
    this.sseConnections.set(connectionId, sseConnection);

    // Send initial connection event with connection ID
    const connectionEvent = createSseConnectionEvent('ready');
    const initialEvent = {
      ...connectionEvent,
      data: {
        ...(connectionEvent.data as Record<string, unknown>),
        connectionId,
      },
    };
    res.write(formatSseEvent(initialEvent));

    logger.info(
      {
        connectionId,
        sessionId: sseConnection.sessionId,
        totalConnections: this.sseConnections.size,
      },
      'SSE connection established'
    );

    // Clean up on client disconnect
    req.on('close', () => {
      this.closeSseConnection(connectionId, logger);
    });

    req.on('error', error => {
      logger.error({ err: error, connectionId }, 'SSE connection error');
      this.closeSseConnection(connectionId, logger);
    });

    // Handle server shutdown
    res.on('error', error => {
      logger.error({ err: error, connectionId }, 'SSE response error');
      this.closeSseConnection(connectionId, logger);
    });
  }

  /**
   * Handle JSON-RPC requests over existing SSE connection
   */
  private handleSseJsonRpcRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): void {
    if (!this.jsonRpcHandler) {
      this.sendResponse(
        res,
        503,
        {
          error: 'JSON-RPC handler not available',
          message: 'MCP server not configured for HTTP transport',
        },
        logger
      );
      return;
    }

    // Get SSE connection ID from header
    const connectionId = req.headers['x-sse-connection-id'] as string;
    if (!connectionId) {
      this.sendResponse(
        res,
        400,
        {
          error: 'Missing SSE connection ID',
          message: 'X-SSE-Connection-Id header is required',
        },
        logger
      );
      return;
    }

    // Verify SSE connection exists and is active
    const sseConnection = this.getSseConnection(connectionId);
    if (!sseConnection || !sseConnection.isActive) {
      this.sendResponse(
        res,
        404,
        {
          error: 'SSE connection not found',
          message: 'No active SSE connection with the provided ID',
        },
        logger
      );
      return;
    }

    logger.debug(
      { connectionId, sessionId: sseConnection.sessionId },
      'Processing JSON-RPC over SSE'
    );

    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        // Create modified headers for SSE context
        const modifiedHeaders = {
          ...req.headers,
          accept: 'text/event-stream', // Force SSE response
          'mcp-session-id': sseConnection.sessionId,
          'x-sse-connection-id': connectionId,
        };

        // Create a new request object with modified headers
        const modifiedReq = Object.create(req);
        modifiedReq.headers = modifiedHeaders;

        // Create a dummy response that won't be used (SSE response goes through connection)
        const dummyRes = {
          headersSent: false,
          setHeader: () => {},
          writeHead: () => {},
          end: () => {},
          getHeader: () => undefined,
        } as ServerResponse;

        await this.jsonRpcHandler!.handleJsonRpcRequest(
          modifiedReq,
          dummyRes,
          body,
          logger
        );

        // Send acknowledgment that the request was received and processed
        this.sendResponse(
          res,
          202,
          {
            message: 'Request accepted for SSE processing',
            connectionId,
          },
          logger
        );
      } catch (error) {
        logger.error(
          { err: error, connectionId },
          'Error in SSE JSON-RPC handler'
        );
        if (!res.headersSent) {
          this.sendResponse(
            res,
            500,
            {
              error: 'Internal server error',
              message: 'SSE JSON-RPC processing failed',
            },
            logger
          );
        }
      }
    });

    req.on('error', error => {
      logger.error(
        { err: error, connectionId },
        'Error reading SSE JSON-RPC request body'
      );
      if (!res.headersSent) {
        this.sendResponse(
          res,
          400,
          {
            error: 'Bad request',
            message: 'Error reading request body',
          },
          logger
        );
      }
    });
  }

  /**
   * Handle JSON-RPC requests
   */
  private handleJsonRpcRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): void {
    if (!this.jsonRpcHandler) {
      this.sendResponse(
        res,
        503,
        {
          error: 'JSON-RPC handler not available',
          message: 'MCP server not configured for HTTP transport',
        },
        logger
      );
      return;
    }

    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        await this.jsonRpcHandler!.handleJsonRpcRequest(req, res, body, logger);
      } catch (error) {
        logger.error({ err: error }, 'Error in JSON-RPC handler');
        if (!res.headersSent) {
          this.sendResponse(
            res,
            500,
            {
              error: 'Internal server error',
              message: 'JSON-RPC processing failed',
            },
            logger
          );
        }
      }
    });

    req.on('error', error => {
      logger.error({ err: error }, 'Error reading request body');
      if (!res.headersSent) {
        this.sendResponse(
          res,
          400,
          {
            error: 'Bad request',
            message: 'Error reading request body',
          },
          logger
        );
      }
    });
  }

  /**
   * Set common HTTP headers
   */
  private setCommonHeaders(res: ServerResponse): void {
    res.setHeader(
      'Server',
      `${this.config.mcp.name}/${this.config.mcp.version}`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }

  /**
   * Send HTTP response
   */
  private sendResponse(
    res: ServerResponse,
    statusCode: number,
    data: unknown,
    logger: Logger
  ): void {
    if (res.headersSent) {
      logger.warn(
        { statusCode },
        'Attempted to send response after headers sent'
      );
      return;
    }

    const corsOrigin = this.getCorsOriginFromResponse(res);
    if (corsOrigin) {
      res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    }

    res.setHeader('Content-Type', 'application/json');

    const responseBody = data !== null ? JSON.stringify(data, null, 2) : '';

    res.writeHead(statusCode);
    res.end(responseBody);

    logger.debug(
      { statusCode, responseSize: responseBody.length },
      'Response sent'
    );
  }

  /**
   * Check if origin is allowed by CORS policy
   */
  private isValidCorsOrigin(origin: string | undefined): boolean {
    if (!origin) {
      return false;
    }

    if (this.config.http.corsOrigins.length === 0) {
      // No CORS origins configured - deny all in production, allow in development
      return this.config.environment === 'development';
    }

    return this.config.http.corsOrigins.includes(origin);
  }

  /**
   * Get CORS origin for request
   */
  private getCorsOrigin(req: IncomingMessage): string {
    const origin = req.headers.origin;
    if (origin && this.isValidCorsOrigin(origin)) {
      return origin;
    }

    // Fallback to first configured origin or wildcard for development
    if (
      this.config.environment === 'development' &&
      this.config.http.corsOrigins.length === 0
    ) {
      return '*';
    }

    return this.config.http.corsOrigins[0] || 'null';
  }

  /**
   * Get CORS origin from response headers (for late CORS header setting)
   */
  private getCorsOriginFromResponse(res: ServerResponse): string | null {
    const existingOrigin = res.getHeader('Access-Control-Allow-Origin');
    if (existingOrigin) {
      return existingOrigin as string;
    }

    // Fallback for cases where CORS origin wasn't set earlier
    if (
      this.config.environment === 'development' &&
      this.config.http.corsOrigins.length === 0
    ) {
      return '*';
    }

    return this.config.http.corsOrigins[0] || null;
  }

  /**
   * Generate unique request ID for tracking
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique connection ID for SSE connections
   */
  private generateConnectionId(): string {
    return `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start heartbeat interval for SSE connections
   */
  private startSseHeartbeat(): void {
    // Send heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeatToAllConnections();
    }, 30000);

    this.logger.debug('SSE heartbeat interval started');
  }

  /**
   * Send heartbeat to all active SSE connections
   */
  private sendHeartbeatToAllConnections(): void {
    const heartbeatEvent = createSseHeartbeatEvent();
    const now = new Date();

    for (const [connectionId, connection] of this.sseConnections.entries()) {
      if (connection.isActive) {
        try {
          connection.response.write(formatSseEvent(heartbeatEvent));
          connection.lastHeartbeat = now;
        } catch (error) {
          this.logger.warn(
            { err: error, connectionId },
            'Failed to send heartbeat, closing connection'
          );
          this.closeSseConnection(connectionId, this.logger);
        }
      }
    }

    // Clean up stale connections (older than 5 minutes without heartbeat)
    const staleThreshold = new Date(now.getTime() - 5 * 60 * 1000);
    for (const [connectionId, connection] of this.sseConnections.entries()) {
      if (connection.lastHeartbeat < staleThreshold) {
        this.logger.info(
          { connectionId, lastHeartbeat: connection.lastHeartbeat },
          'Closing stale SSE connection'
        );
        this.closeSseConnection(connectionId, this.logger);
      }
    }
  }

  /**
   * Close a specific SSE connection
   */
  private closeSseConnection(connectionId: string, logger: Logger): void {
    const connection = this.sseConnections.get(connectionId);
    if (connection) {
      connection.isActive = false;

      try {
        // Send close event before ending connection
        const closeEvent = {
          event: SseEventType.CLOSE,
          data: { timestamp: new Date().toISOString() },
        };
        connection.response.write(formatSseEvent(closeEvent));
        connection.response.end();
      } catch {
        // Ignore errors when closing
      }

      this.sseConnections.delete(connectionId);

      logger.info(
        {
          connectionId,
          totalConnections: this.sseConnections.size,
          duration: Date.now() - connection.createdAt.getTime(),
        },
        'SSE connection closed'
      );
    }
  }

  /**
   * Close all SSE connections gracefully
   */
  private closeAllSseConnections(): void {
    this.logger.info(
      { connectionCount: this.sseConnections.size },
      'Closing all SSE connections'
    );

    for (const connectionId of this.sseConnections.keys()) {
      this.closeSseConnection(connectionId, this.logger);
    }
  }

  /**
   * Send JSON-RPC response to SSE connection
   */
  public sendSseResponse(
    connectionId: string,
    response: unknown,
    eventId?: string
  ): boolean {
    const connection = this.sseConnections.get(connectionId);
    if (!connection || !connection.isActive) {
      return false;
    }

    try {
      const sseEvent = {
        event:
          'error' in response
            ? SseEventType.MCP_ERROR
            : SseEventType.MCP_RESPONSE,
        data: response,
        id: eventId,
      };

      connection.response.write(formatSseEvent(sseEvent));
      return true;
    } catch (error) {
      this.logger.warn(
        { err: error, connectionId },
        'Failed to send SSE response, closing connection'
      );
      this.closeSseConnection(connectionId, this.logger);
      return false;
    }
  }

  /**
   * Get SSE connection by ID
   */
  public getSseConnection(connectionId: string): SseConnection | undefined {
    return this.sseConnections.get(connectionId);
  }

  /**
   * Get all active SSE connections
   */
  public getActiveSseConnections(): SseConnection[] {
    return Array.from(this.sseConnections.values()).filter(
      conn => conn.isActive
    );
  }

  /**
   * Get server status
   */
  public getStatus(): { running: boolean; host?: string; port?: number } {
    return {
      running: this.server !== null && !this.isShuttingDown,
      host: this.server ? this.config.http.host : undefined,
      port: this.server ? this.config.http.port : undefined,
    };
  }
}
