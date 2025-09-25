/**
 * HTTP Transport for MCP server
 * Provides basic HTTP server infrastructure with CORS support and graceful shutdown
 */

import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'http';
import { discoverOAuthEndpoints } from '@/auth/endpoint-discovery.js';
import { DiscoveryError } from '@/auth/types.js';
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
  private readonly app: Express;
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
    this.app = express();
    this.mcpEndpoint = '/mcp';

    // Initialize JSON-RPC handler if MCP server is provided
    if (mcpServer) {
      this.jsonRpcHandler = new JsonRpcProtocolHandler(mcpServer, this.logger);
      this.jsonRpcHandler.setHttpTransport(this);
    }

    this.configureExpressApp();
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
      this.server = createServer(this.app);

      // Track connections for graceful shutdown
      this.server.on('connection', socket => {
        this.connections.add(socket);
        socket.on('close', () => {
          this.connections.delete(socket);
        });
      });

      this.server.on('error', error => {
        this.logger.error({ err: error }, 'HTTP server error');
        if (this.server) {
          try {
            this.server.close();
          } catch {
            // Ignore errors when closing a server that failed to start
          }
          this.server = null;
        }
        this.connections.clear();
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
        if (
          'destroy' in connection &&
          typeof connection.destroy === 'function'
        ) {
          connection.destroy();
        }
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
   * Configure Express application with middleware and routes
   */
  private configureExpressApp(): void {
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const requestId = this.generateRequestId();
      const method = req.method?.toUpperCase() || 'UNKNOWN';
      const url = req.originalUrl || req.url || '/';

      const requestLogger = this.logger.child({
        requestId,
        method,
        url,
        userAgent: req.headers['user-agent'],
      });

      res.locals.requestLogger = requestLogger;
      res.locals.requestStartTime = startTime;

      requestLogger.debug('Incoming HTTP request');

      this.setCommonHeaders(res);

      const origin = req.headers.origin;
      if (this.isValidCorsOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin as string);
      }

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

      const clearRequestTimeout = () => {
        clearTimeout(timeoutId);
      };

      res.on('finish', () => {
        clearRequestTimeout();
        const duration = Date.now() - startTime;
        requestLogger.info(
          { duration, statusCode: res.statusCode },
          'Request completed'
        );
      });

      res.on('close', clearRequestTimeout);

      next();
    });

    this.registerRoutes();

    this.app.use((req: Request, res: Response) => {
      const logger = this.getRequestLogger(res);
      this.sendResponse(
        res,
        404,
        {
          error: 'Not found',
          message: `Path ${req.originalUrl || req.url || '/'} not found`,
        },
        logger
      );
    });

    this.app.use(
      (error: Error, req: Request, res: Response, next: NextFunction) => {
        const logger = this.getRequestLogger(res);
        logger.error({ err: error }, 'Unhandled error in request pipeline');
        if (!res.headersSent) {
          this.sendResponse(
            res,
            500,
            {
              error: 'Internal server error',
              message: 'An unexpected error occurred',
            },
            logger
          );
        }
        next(error);
      }
    );
  }

  /**
   * Register Express routes
   */
  private registerRoutes(): void {
    this.app.options(
      '*',
      this.createExpressHandler((req, res, logger) => {
        this.handleCorsPreflightRequest(req, res, logger);
      })
    );

    this.app.get(
      '/health',
      this.createExpressHandler((req, res, logger) => {
        this.handleHealthCheck(req, res, logger);
      })
    );

    this.app.get(
      this.mcpEndpoint,
      this.createExpressHandler((req, res, logger) => {
        this.handleMcpRequest(req, res, logger);
      })
    );

    this.app.get(
      '/.well-known/oauth-authorization-server',
      this.createExpressHandler((req, res, logger) => {
        return this.handleOAuthWellKnownMetadata(
          req,
          res,
          logger,
          '/.well-known/oauth-authorization-server'
        );
      })
    );

    this.app.post(
      this.mcpEndpoint,
      this.createExpressHandler((req, res, logger) => {
        this.handleMcpRequest(req, res, logger);
      })
    );

    this.app.all(
      this.mcpEndpoint,
      this.createExpressHandler((req, res, logger) => {
        const method = req.method?.toUpperCase() || 'UNKNOWN';
        this.sendResponse(
          res,
          405,
          {
            error: 'Method not allowed',
            message: `Method ${method} is not allowed for ${this.mcpEndpoint}`,
            allowed: ['GET', 'POST', 'OPTIONS'],
          },
          logger
        );
      })
    );

    this.app.post(
      `${this.mcpEndpoint}/sse`,
      this.createExpressHandler((req, res, logger) => {
        this.handleSseJsonRpcRequest(req, res, logger);
      })
    );
  }

  /**
   * Wrap route handlers to provide consistent error handling
   */
  private createExpressHandler(
    handler: (
      req: Request,
      res: Response,
      logger: Logger
    ) => void | Promise<void>
  ): (req: Request, res: Response, next: NextFunction) => void {
    return (req, res, next) => {
      const logger = this.getRequestLogger(res);
      try {
        const result = handler.call(this, req, res, logger);
        if (result instanceof Promise) {
          result.catch(error => {
            logger.error({ err: error }, 'Error handling request');
            next(error);
          });
        }
      } catch (error) {
        logger.error({ err: error }, 'Error handling request');
        next(error);
      }
    };
  }

  /**
   * Helper to read request-scoped logger
   */
  private getRequestLogger(res: Response): Logger {
    return (res.locals.requestLogger as Logger) ?? this.logger;
  }

  /**
   * Handle CORS preflight requests
   */
  private handleCorsPreflightRequest(
    req: Request,
    res: Response,
    logger: Logger
  ): void {
    const origin = req.headers.origin;

    if (!this.isValidCorsOrigin(origin)) {
      logger.warn(
        { origin, configuredOrigins: this.config.http.corsOrigins },
        'CORS preflight request denied'
      );

      this.sendResponse(
        res,
        403,
        {
          error: 'CORS origin denied',
          message: 'The request origin is not permitted',
        },
        logger
      );
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin!);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Mcp-Session-Id, Mcp-Protocol-Version'
    );
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    logger.debug({ origin }, 'CORS preflight request approved');

    this.sendResponse(res, 204, null, logger);
  }

  /**
   * Handle health check requests
   */
  private handleHealthCheck(req: Request, res: Response, logger: Logger): void {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: this.config.mcp.version,
      environment: this.config.environment,
      server: {
        name: this.config.mcp.name,
        version: this.config.mcp.version,
        host: this.config.http.host,
        port: this.config.http.port,
      },
    };

    logger.debug('Health check requested');
    this.sendResponse(res, 200, health, logger);
  }

  /**
   * Proxy OAuth well-known documents from the upstream Drupal site
   */
  private async handleOAuthWellKnownMetadata(
    _req: Request,
    res: Response,
    logger: Logger,
    wellKnownPath: string
  ): Promise<void> {
    try {
      if (wellKnownPath === '/.well-known/oauth-authorization-server') {
        const endpoints = await discoverOAuthEndpoints(this.config.discovery);
        const metadata = endpoints.metadata;

        if (!metadata) {
          throw new Error('Authorization server metadata not available');
        }

        logger.debug(
          { wellKnownPath },
          'Serving authorization server metadata'
        );
        this.sendResponse(res, 200, metadata, logger);
        return;
      }

      throw new Error(`Unsupported well-known path: ${wellKnownPath}`);
    } catch (error) {
      const isDiscoveryError = error instanceof DiscoveryError;
      const statusCode = isDiscoveryError ? 502 : 500;

      logger.error(
        { err: error, wellKnownPath },
        'Failed to provide OAuth well-known metadata'
      );

      this.sendResponse(
        res,
        statusCode,
        {
          error: 'OAuth provider metadata unavailable',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to retrieve OAuth metadata from discovery',
        },
        logger
      );
    }
  }

  /**
   * Handle MCP requests (GET for SSE, POST for JSON-RPC)
   */
  private handleMcpRequest(req: Request, res: Response, logger: Logger): void {
    const method = req.method?.toUpperCase();

    if (method === 'GET') {
      if (this.config.http.enableSSE) {
        this.handleSseRequest(req, res, logger);
      } else {
        this.sendResponse(
          res,
          400,
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
  private handleSseRequest(req: Request, res: Response, logger: Logger): void {
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
      this.handleSseConnectionError(
        error,
        connectionId,
        logger,
        'SSE connection error'
      );
      this.closeSseConnection(connectionId, logger);
    });

    // Handle server shutdown
    res.on('error', error => {
      this.handleSseConnectionError(
        error,
        connectionId,
        logger,
        'SSE response error'
      );
      this.closeSseConnection(connectionId, logger);
    });
  }

  /**
   * Handle JSON-RPC requests over existing SSE connection
   */
  private handleSseJsonRpcRequest(
    req: Request,
    res: Response,
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
        } as unknown as ServerResponse;

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
    req: Request,
    res: Response,
    logger: Logger
  ): void {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      const trimmedBody = body.trim();

      if (!trimmedBody) {
        this.sendResponse(
          res,
          400,
          {
            error: 'Empty request body',
          },
          logger
        );
        return;
      }

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

      try {
        JSON.parse(trimmedBody);
      } catch {
        this.sendResponse(
          res,
          400,
          {
            jsonrpc: '2.0',
            error: {
              code: -32700,
              message: 'Parse error',
            },
            id: null,
          },
          logger
        );
        return;
      }

      try {
        await this.jsonRpcHandler!.handleJsonRpcRequest(
          req,
          res,
          trimmedBody,
          logger
        );
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

    return null;
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
          this.handleSseConnectionError(
            error as Error,
            connectionId,
            this.logger,
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
   * Handle SSE connection errors with appropriate logging level
   */
  private handleSseConnectionError(
    error: Error,
    connectionId: string,
    logger: Logger,
    context: string
  ): void {
    // Check if this is a normal client disconnection
    const isNormalDisconnection =
      error.message === 'aborted' ||
      (error as NodeJS.ErrnoException).code === 'ECONNRESET' ||
      (error as NodeJS.ErrnoException).code === 'EPIPE' ||
      (error as NodeJS.ErrnoException).code === 'ECONNABORTED';

    if (isNormalDisconnection) {
      // Log as info for normal client disconnections
      logger.info(
        {
          connectionId,
          errorCode: (error as NodeJS.ErrnoException).code,
          errorMessage: error.message,
        },
        `${context} - client disconnected normally`
      );
    } else {
      // Log as error for actual problems
      logger.error({ err: error, connectionId }, context);
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
          'error' in (response as any)
            ? SseEventType.MCP_ERROR
            : SseEventType.MCP_RESPONSE,
        data: response,
        id: eventId,
      };

      connection.response.write(formatSseEvent(sseEvent));
      return true;
    } catch (error) {
      this.handleSseConnectionError(
        error as Error,
        connectionId,
        this.logger,
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
