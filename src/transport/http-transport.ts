/**
 * HTTP Transport for MCP server
 * Refactored to use official MCP SDK StreamableHTTPServerTransport
 * Provides HTTP server infrastructure with CORS support and SDK integration
 */

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
  type Server,
} from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AppConfig } from '@/config/index.js';
import type { DrupalMcpServer } from '@/mcp/server.js';
import { createChildLogger } from '@/utils/logger.js';
import type { Logger } from 'pino';

/**
 * HTTP transport implementation using MCP SDK
 */
export class HttpTransport {
  private server: Server | null = null;
  private readonly logger: Logger;
  private readonly connections = new Set<NodeJS.Socket>();
  private isShuttingDown = false;
  private readonly mcpEndpoint: string;
  private sdkTransport?: StreamableHTTPServerTransport;

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

    // SDK transport will be created in start() method for proper restart handling
  }

  /**
   * Start the HTTP server with MCP SDK integration
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('HTTP server is already running');
    }

    this.logger.info('Starting HTTP server with MCP SDK integration...');

    // Create and connect MCP SDK transport if MCP server is provided
    if (this.mcpServer) {
      this.sdkTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId: string) => {
          this.logger.debug({ sessionId }, 'MCP session initialized');
        },
        onsessionclosed: (sessionId: string) => {
          this.logger.debug({ sessionId }, 'MCP session closed');
        },
        allowedHosts: this.config.http.host
          ? [this.config.http.host]
          : undefined,
        allowedOrigins:
          this.config.http.corsOrigins.length > 0
            ? this.config.http.corsOrigins
            : undefined,
        enableDnsRebindingProtection: this.config.environment === 'production',
      });

      try {
        await this.mcpServer.connect(this.sdkTransport);
        this.logger.debug('MCP server connected to SDK transport');
      } catch (error) {
        this.logger.error(
          { err: error },
          'Failed to connect MCP server to transport'
        );
        throw error;
      }
    }

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
            sdkIntegration: !!this.sdkTransport,
          },
          'HTTP server started successfully with MCP SDK'
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

    try {
      // Close MCP server and SDK transport first
      if (this.mcpServer) {
        await this.mcpServer.close();
        this.logger.debug('MCP server closed');
      }

      if (this.sdkTransport) {
        await this.sdkTransport.close();
        this.sdkTransport = undefined;
        this.logger.debug('SDK transport closed');
      }

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

      // Close the HTTP server
      await new Promise<void>((resolve, reject) => {
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
    } catch (error) {
      this.logger.error({ err: error }, 'Error during server shutdown');
      throw error;
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
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
      await this.routeRequest(req, res, requestLogger);
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
  private async routeRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): Promise<void> {
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

    // MCP endpoint - delegate to SDK transport
    if (pathname === this.mcpEndpoint) {
      if (this.sdkTransport) {
        try {
          await this.sdkTransport.handleRequest(req, res);
          return;
        } catch (error) {
          logger.error({ err: error }, 'SDK transport error');
          this.sendResponse(
            res,
            500,
            {
              error: 'MCP transport error',
              message: 'Failed to process MCP request',
            },
            logger
          );
          return;
        }
      } else {
        this.sendResponse(
          res,
          503,
          {
            error: 'MCP transport not available',
            message: 'MCP server not configured for HTTP transport',
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
   * Handle CORS preflight requests with MCP SDK compatibility
   */
  private handleCorsPreflightRequest(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger
  ): void {
    const origin = req.headers.origin;
    this.setMcpCorsHeaders(res, origin);

    if (this.isValidCorsOrigin(origin)) {
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
      server: {
        name: this.config.mcp.name,
        version: this.config.mcp.version,
      },
    };

    logger.debug('Health check requested');
    this.sendResponse(res, 200, health, logger);
  }

  /**
   * Enhanced CORS handling with SDK-compatible headers
   */
  private setMcpCorsHeaders(res: ServerResponse, origin?: string): void {
    if (origin && this.isValidCorsOrigin(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (
      this.config.environment === 'development' &&
      this.config.http.corsOrigins.length === 0
    ) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, X-MCP-Session-ID'
    );
    res.setHeader('Access-Control-Expose-Headers', 'X-MCP-Session-ID');
    res.setHeader('Access-Control-Max-Age', '86400');
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

    // Set CORS headers if not already set
    if (!res.getHeader('Access-Control-Allow-Origin')) {
      const corsOrigin = this.getCorsOriginFromResponse(res);
      if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
      }
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
