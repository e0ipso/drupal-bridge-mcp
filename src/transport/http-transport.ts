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
import { createChildLogger } from '@/utils/logger.js';
import type { Logger } from 'pino';

/**
 * HTTP transport implementation for MCP over HTTP
 */
export class HttpTransport {
  private server: Server | null = null;
  private readonly logger: Logger;
  private readonly connections = new Set<any>();
  private isShuttingDown = false;
  private readonly mcpEndpoint: string;

  constructor(
    private readonly config: AppConfig,
    parentLogger?: Logger
  ) {
    if (parentLogger) {
      this.logger = parentLogger.child({ component: 'http-transport' });
    } else {
      this.logger = createChildLogger({ component: 'http-transport' });
    }
    this.mcpEndpoint = '/mcp';
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
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With'
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
    logger.info('Setting up SSE connection');

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': this.getCorsOrigin(req),
    });

    // Send initial event
    res.write('data: {"type":"connection","status":"ready"}\n\n');

    // Keep connection alive with periodic heartbeat
    const heartbeat = setInterval(() => {
      res.write(
        'data: {"type":"heartbeat","timestamp":"' +
          new Date().toISOString() +
          '"}\n\n'
      );
    }, 30000);

    // Clean up on client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      logger.info('SSE connection closed');
    });

    req.on('error', error => {
      clearInterval(heartbeat);
      logger.error({ err: error }, 'SSE connection error');
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
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      this.processJsonRpcRequest(body, res, logger);
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
   * Process JSON-RPC request body
   */
  private processJsonRpcRequest(
    body: string,
    res: ServerResponse,
    logger: Logger
  ): void {
    try {
      // Validate Content-Type (optional for now, but good practice)
      // In a full implementation, this would be more strict

      if (!body.trim()) {
        this.sendResponse(
          res,
          400,
          {
            error: 'Empty request body',
            message: 'Request body cannot be empty',
          },
          logger
        );
        return;
      }

      // Try to parse JSON
      let jsonRequest;
      try {
        jsonRequest = JSON.parse(body);
      } catch {
        logger.warn(
          { body: body.substring(0, 100) },
          'Invalid JSON in request body'
        );
        this.sendResponse(
          res,
          400,
          {
            error: 'Invalid JSON',
            message: 'Request body must be valid JSON',
          },
          logger
        );
        return;
      }

      logger.debug(
        { method: jsonRequest.method, id: jsonRequest.id },
        'JSON-RPC request received'
      );

      // For now, just echo back a basic response indicating the server is ready
      // Real MCP handling will be implemented in subsequent tasks
      const response = {
        jsonrpc: '2.0',
        result: {
          message: 'HTTP transport ready',
          endpoint: this.mcpEndpoint,
          capabilities: ['json-rpc', 'sse'],
        },
        id: jsonRequest.id || null,
      };

      this.sendResponse(res, 200, response, logger);
    } catch (error) {
      logger.error({ err: error }, 'Error processing JSON-RPC request');
      this.sendResponse(
        res,
        500,
        {
          error: 'Processing error',
          message: 'Error processing request',
        },
        logger
      );
    }
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
    data: any,
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
