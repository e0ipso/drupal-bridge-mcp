/**
 * HTTP Server with SSE Transport for MCP Protocol
 *
 * Implements the foundational HTTP server that provides Server-Sent Events
 * transport for MCP protocol communication.
 */

import express, {
  type Request,
  type Response,
  type Application,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer, type Server as HttpServer } from 'http';

import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';
import {
  SSETransport,
  type ConnectionEventHandlers,
  type SSETransportConfig,
} from '@/transport/sse-transport.js';

/**
 * HTTP Server configuration interface
 */
export interface HttpServerConfig {
  readonly port: number;
  readonly host?: string;
  readonly cors: {
    readonly enabled: boolean;
    readonly origins: string[];
  };
  readonly security: {
    readonly enabled: boolean;
    readonly rateLimit: {
      readonly enabled: boolean;
      readonly max: number;
      readonly windowMs: number;
    };
  };
  readonly compression: boolean;
  readonly healthCheck: {
    readonly enabled: boolean;
    readonly path: string;
  };
}

/**
 * MCP HTTP Server with SSE Transport
 */
export class MCPHttpServer {
  private readonly app: Application;
  private readonly httpServer: HttpServer;
  private readonly sseTransport: SSETransport;
  private readonly config: HttpServerConfig;
  private isStarted = false;
  private isShuttingDown = false;

  constructor(
    serverConfig?: Partial<HttpServerConfig>,
    sseConfig?: Partial<SSETransportConfig>
  ) {
    // Merge configuration
    this.config = {
      port: serverConfig?.port ?? config.port,
      host: serverConfig?.host ?? '0.0.0.0',
      cors: {
        enabled: serverConfig?.cors?.enabled ?? config.security.cors.enabled,
        origins: serverConfig?.cors?.origins ?? config.security.cors.origins,
      },
      security: {
        enabled: serverConfig?.security?.enabled ?? true,
        rateLimit: {
          enabled:
            serverConfig?.security?.rateLimit?.enabled ??
            config.security.rateLimit.enabled,
          max:
            serverConfig?.security?.rateLimit?.max ??
            config.security.rateLimit.max,
          windowMs:
            serverConfig?.security?.rateLimit?.windowMs ??
            config.security.rateLimit.windowMs,
        },
      },
      compression: serverConfig?.compression ?? true,
      healthCheck: {
        enabled: serverConfig?.healthCheck?.enabled ?? config.health.enabled,
        path: serverConfig?.healthCheck?.path ?? config.health.path,
      },
    };

    // Create Express application
    this.app = express();

    // Create HTTP server
    this.httpServer = createServer(this.app);

    // Set up connection event handlers
    const connectionHandlers: ConnectionEventHandlers = {
      onConnect: this.handleConnectionEstablished.bind(this),
      onDisconnect: this.handleConnectionClosed.bind(this),
      onHeartbeat: this.handleHeartbeat.bind(this),
    };

    // Create SSE transport with merged configuration
    const sseTransportConfig: Partial<SSETransportConfig> = {
      corsOrigins: this.config.cors.origins,
      ...sseConfig,
    };

    this.sseTransport = new SSETransport(
      sseTransportConfig,
      connectionHandlers
    );

    // Configure Express middleware and routes
    this.configureMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();

    logger.info('MCP HTTP Server initialized', {
      port: this.config.port,
      host: this.config.host,
      cors: this.config.cors,
      security: this.config.security,
    });
  }

  /**
   * Start the HTTP server
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      throw new Error('Server is already started');
    }

    if (this.isShuttingDown) {
      throw new Error('Server is shutting down');
    }

    return new Promise((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        logger.error('Failed to start HTTP server', {
          port: this.config.port,
          host: this.config.host,
          error: error.message,
          code: error.code,
        });

        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.config.port} is already in use`));
        } else if (error.code === 'EACCES') {
          reject(
            new Error(
              `Insufficient permissions to bind to port ${this.config.port}`
            )
          );
        } else {
          reject(error);
        }
      };

      const onListening = () => {
        this.isStarted = true;
        const address = this.httpServer.address();
        const port = typeof address === 'string' ? address : address?.port;

        logger.info('MCP HTTP Server started successfully', {
          port,
          host: this.config.host,
          environment: config.environment,
        });

        // Remove error listener after successful start
        this.httpServer.removeListener('error', onError);
        resolve();
      };

      // Set up listeners
      this.httpServer.once('error', onError);
      this.httpServer.once('listening', onListening);

      // Start listening
      this.httpServer.listen(this.config.port, this.config.host);
    });
  }

  /**
   * Stop the HTTP server gracefully
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      logger.info('Server is not started, nothing to stop');
      return;
    }

    if (this.isShuttingDown) {
      logger.info('Server is already shutting down');
      return;
    }

    logger.info('Starting graceful server shutdown...');
    this.isShuttingDown = true;

    // Shutdown SSE transport first
    await this.sseTransport.shutdown();

    // Close HTTP server
    return new Promise(resolve => {
      this.httpServer.close(error => {
        if (error) {
          logger.error('Error during server shutdown', {
            error: error.message,
          });
        } else {
          logger.info('HTTP server shutdown completed');
        }

        this.isStarted = false;
        this.isShuttingDown = false;
        resolve();
      });
    });
  }

  /**
   * Get server status and statistics
   */
  getStatus(): {
    isStarted: boolean;
    isShuttingDown: boolean;
    port: number;
    uptime?: number;
    connections: ReturnType<SSETransport['getConnectionStats']>;
  } {
    const address = this.httpServer.address();
    const port =
      typeof address === 'string'
        ? parseInt(address)
        : (address?.port ?? this.config.port);

    const status = {
      isStarted: this.isStarted,
      isShuttingDown: this.isShuttingDown,
      port,
      connections: this.sseTransport.getConnectionStats(),
    };

    if (this.isStarted) {
      return { ...status, uptime: process.uptime() };
    }

    return status;
  }

  /**
   * Get the SSE transport instance for advanced usage
   */
  getSSETransport(): SSETransport {
    return this.sseTransport;
  }

  /**
   * Get the Express application instance for advanced configuration
   */
  getExpressApp(): Application {
    return this.app;
  }

  /**
   * Get the HTTP server instance
   */
  getHttpServer(): HttpServer {
    return this.httpServer;
  }

  /**
   * Configure Express middleware
   */
  private configureMiddleware(): void {
    // Security headers
    if (this.config.security.enabled) {
      this.app.use(
        helmet({
          crossOriginEmbedderPolicy: false, // Allow SSE
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              connectSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
            },
          },
        })
      );
    }

    // CORS configuration
    if (this.config.cors.enabled) {
      this.app.use(
        cors({
          origin: this.config.cors.origins.includes('*')
            ? true
            : this.config.cors.origins,
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization', 'Cache-Control'],
          credentials: true,
        })
      );
    }

    // Compression
    if (this.config.compression) {
      this.app.use(
        compression({
          filter: (req, res) => {
            // Don't compress SSE responses
            if (req.path === '/mcp/stream') {
              return false;
            }
            return compression.filter(req, res);
          },
        })
      );
    }

    // Rate limiting
    if (this.config.security.rateLimit.enabled) {
      const limiter = rateLimit({
        windowMs: this.config.security.rateLimit.windowMs,
        max: this.config.security.rateLimit.max,
        message: {
          error: 'Too many requests from this IP, please try again later.',
        },
        standardHeaders: true,
        legacyHeaders: false,
        // Skip rate limiting for SSE endpoints
        skip: req => req.path === '/mcp/stream',
      });

      this.app.use(limiter);
    }

    // JSON parsing
    this.app.use(express.json({ limit: '1mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next) => {
      const start = Date.now();

      res.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = res.statusCode >= 400 ? 'warn' : 'info';

        logger[logLevel]('HTTP request processed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          userAgent: req.get('User-Agent'),
          remoteAddress: req.socket.remoteAddress,
        });
      });

      next();
    });
  }

  /**
   * Configure Express routes
   */
  private configureRoutes(): void {
    // Health check endpoint
    if (this.config.healthCheck.enabled) {
      this.app.get(
        this.config.healthCheck.path,
        (req: Request, res: Response) => {
          const status = this.getStatus();
          const healthData = {
            status: 'healthy',
            timestamp: new Date().toISOString(),
            server: {
              isStarted: status.isStarted,
              uptime: status.uptime,
              port: status.port,
            },
            connections: status.connections,
            environment: config.environment,
            version: process.env.npm_package_version ?? '1.0.0',
          };

          res.json(healthData);
        }
      );
    }

    // SSE endpoint for MCP protocol
    this.app.get('/mcp/stream', async (req: Request, res: Response) => {
      try {
        await this.sseTransport.handleConnection(req, res);
      } catch (error) {
        logger.error('Error handling SSE connection', {
          error: error instanceof Error ? error.message : String(error),
          userAgent: req.get('User-Agent'),
          remoteAddress: req.socket.remoteAddress,
        });

        if (!res.headersSent) {
          res.status(500).json({
            error: 'Internal server error',
            message: 'Failed to establish SSE connection',
          });
        }
      }
    });

    // Server status endpoint
    this.app.get('/mcp/status', (req: Request, res: Response) => {
      const status = this.getStatus();
      res.json(status);
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        name: 'Drupalize.me MCP Server',
        version: process.env.npm_package_version ?? '1.0.0',
        description:
          'Model Context Protocol server for Drupalize.me Drupal integration',
        endpoints: {
          health: this.config.healthCheck.path,
          mcp_stream: '/mcp/stream',
          status: '/mcp/status',
        },
        documentation: 'https://github.com/drupalizeme/mcp-server',
      });
    });

    // 404 handler
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        message: `The requested endpoint ${req.originalUrl} was not found`,
        availableEndpoints: [
          '/',
          this.config.healthCheck.path,
          '/mcp/stream',
          '/mcp/status',
        ],
      });
    });
  }

  /**
   * Configure error handling
   */
  private configureErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: Request, res: Response, next: any) => {
      logger.error('Unhandled Express error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
      });

      if (res.headersSent) {
        return next(error);
      }

      res.status(500).json({
        error: 'Internal server error',
        message:
          config.environment === 'development'
            ? error.message
            : 'An unexpected error occurred',
      });
    });

    // Handle server errors
    this.httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${this.config.port} is already in use`);
      } else {
        logger.error('HTTP server error', {
          error: error.message,
          code: error.code,
        });
      }
    });

    // Handle process signals for graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);
      this.stop()
        .then(() => {
          logger.info('Graceful shutdown completed');
          process.exit(0);
        })
        .catch(error => {
          logger.error('Error during graceful shutdown', {
            error: error instanceof Error ? error.message : String(error),
          });
          process.exit(1);
        });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }

  /**
   * Handle new connection established
   */
  private async handleConnectionEstablished(
    connectionId: string,
    state: any
  ): Promise<void> {
    logger.info('SSE connection established', {
      connectionId,
      clientInfo: state.clientInfo,
      totalConnections: this.sseTransport.getConnectionStats().active,
    });
  }

  /**
   * Handle connection closed
   */
  private async handleConnectionClosed(
    connectionId: string,
    state: any
  ): Promise<void> {
    const duration = Date.now() - state.connectedAt.getTime();
    logger.info('SSE connection closed', {
      connectionId,
      duration,
      remainingConnections: this.sseTransport.getConnectionStats().active,
    });
  }

  /**
   * Handle connection heartbeat
   */
  private async handleHeartbeat(connectionId: string): Promise<void> {
    logger.debug('Connection heartbeat', { connectionId });
  }
}

/**
 * Factory function to create and configure the HTTP server
 */
export function createMCPHttpServer(
  serverConfig?: Partial<HttpServerConfig>,
  sseConfig?: Partial<SSETransportConfig>
): MCPHttpServer {
  return new MCPHttpServer(serverConfig, sseConfig);
}
