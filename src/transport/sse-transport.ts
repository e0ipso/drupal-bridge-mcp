/**
 * Server-Sent Events (SSE) Transport for MCP Protocol
 *
 * Implements the transport layer for MCP protocol communication using
 * Server-Sent Events with connection lifecycle management and heartbeat monitoring.
 */

import type { Request, Response } from 'express';
import { logger } from '@/utils/logger.js';

/**
 * Connection state interface for tracking individual client connections
 */
export interface ConnectionState {
  readonly id: string;
  readonly connectedAt: Date;
  readonly clientInfo: {
    readonly userAgent?: string;
    readonly remoteAddress?: string;
  };
  lastHeartbeat: Date;
  isActive: boolean;
}

/**
 * SSE message interface for standardized event format
 */
export interface SSEMessage {
  readonly event?: string;
  readonly data: string;
  readonly id?: string;
  readonly retry?: number;
}

/**
 * Connection event handlers interface
 */
export interface ConnectionEventHandlers {
  onConnect?: (
    connectionId: string,
    state: ConnectionState
  ) => void | Promise<void>;
  onDisconnect?: (
    connectionId: string,
    state: ConnectionState
  ) => void | Promise<void>;
  onMessage?: (connectionId: string, message: any) => void | Promise<void>;
  onHeartbeat?: (connectionId: string) => void | Promise<void>;
}

/**
 * SSE Transport configuration
 */
export interface SSETransportConfig {
  readonly heartbeatIntervalMs: number;
  readonly connectionTimeoutMs: number;
  readonly maxConnections: number;
  readonly corsOrigins: string[];
}

/**
 * Server-Sent Events Transport implementation for MCP protocol
 */
export class SSETransport {
  private readonly connections = new Map<string, ConnectionState>();
  private readonly responses = new Map<string, Response>();
  private readonly heartbeatTimer: NodeJS.Timeout;
  private readonly config: SSETransportConfig;
  private readonly eventHandlers: ConnectionEventHandlers;
  private isShuttingDown = false;

  constructor(
    config: Partial<SSETransportConfig> = {},
    handlers: ConnectionEventHandlers = {}
  ) {
    this.config = {
      heartbeatIntervalMs: config.heartbeatIntervalMs ?? 30000, // 30 seconds
      connectionTimeoutMs: config.connectionTimeoutMs ?? 60000, // 60 seconds
      maxConnections: config.maxConnections ?? 100,
      corsOrigins: config.corsOrigins ?? ['*'],
    };

    this.eventHandlers = handlers;

    // Start heartbeat mechanism
    this.heartbeatTimer = setInterval(() => {
      this.performHeartbeat();
    }, this.config.heartbeatIntervalMs);

    logger.info('SSE Transport initialized', {
      heartbeatInterval: this.config.heartbeatIntervalMs,
      connectionTimeout: this.config.connectionTimeoutMs,
      maxConnections: this.config.maxConnections,
    });
  }

  /**
   * Handle new SSE connection requests
   */
  async handleConnection(req: Request, res: Response): Promise<void> {
    if (this.isShuttingDown) {
      res.status(503).json({ error: 'Server is shutting down' });
      return;
    }

    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      logger.warn('Maximum connections reached, rejecting new connection', {
        currentConnections: this.connections.size,
        maxConnections: this.config.maxConnections,
      });
      res.status(503).json({ error: 'Maximum connections reached' });
      return;
    }

    const connectionId = this.generateConnectionId();

    logger.info('New SSE connection request', {
      connectionId,
      userAgent: req.get('User-Agent'),
      remoteAddress: req.socket.remoteAddress,
    });

    // Set SSE headers
    this.setSSEHeaders(res);

    // Create connection state
    const connectionState: ConnectionState = {
      id: connectionId,
      connectedAt: new Date(),
      clientInfo: {
        userAgent: req.get('User-Agent') ?? undefined,
        remoteAddress: req.socket.remoteAddress ?? 'unknown',
      },
      lastHeartbeat: new Date(),
      isActive: true,
    };

    // Store connection
    this.connections.set(connectionId, connectionState);
    this.responses.set(connectionId, res);

    // Send initial connection message
    this.sendMessage(connectionId, {
      event: 'connected',
      data: JSON.stringify({
        connectionId,
        timestamp: new Date().toISOString(),
        server: 'drupalize-mcp-server',
        version: '1.0.0',
      }),
    });

    // Set up connection cleanup handlers
    this.setupConnectionCleanup(req, res, connectionId);

    // Notify event handler
    if (this.eventHandlers.onConnect) {
      try {
        await this.eventHandlers.onConnect(connectionId, connectionState);
      } catch (error) {
        logger.error('Error in connection event handler', {
          connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('SSE connection established', {
      connectionId,
      totalConnections: this.connections.size,
    });
  }

  /**
   * Send message to specific connection
   */
  sendMessage(connectionId: string, message: SSEMessage): boolean {
    const response = this.responses.get(connectionId);
    const connectionState = this.connections.get(connectionId);

    if (!response || !connectionState || !connectionState.isActive) {
      logger.warn('Attempted to send message to inactive connection', {
        connectionId,
        hasResponse: !!response,
        hasConnection: !!connectionState,
        isActive: connectionState?.isActive,
      });
      return false;
    }

    try {
      let sseData = '';

      if (message.event) {
        sseData += `event: ${message.event}\n`;
      }

      if (message.id) {
        sseData += `id: ${message.id}\n`;
      }

      if (message.retry) {
        sseData += `retry: ${message.retry}\n`;
      }

      // Handle multi-line data
      const dataLines = message.data.split('\n');
      dataLines.forEach(line => {
        sseData += `data: ${line}\n`;
      });

      sseData += '\n'; // End with blank line

      response.write(sseData);

      logger.debug('Message sent to SSE connection', {
        connectionId,
        event: message.event,
        dataLength: message.data.length,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send SSE message', {
        connectionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Mark connection as inactive and clean up
      this.cleanupConnection(connectionId, 'send_error');
      return false;
    }
  }

  /**
   * Broadcast message to all active connections
   */
  broadcastMessage(message: SSEMessage): number {
    let successCount = 0;
    const activeConnections = Array.from(this.connections.keys()).filter(
      id => this.connections.get(id)?.isActive
    );

    logger.debug('Broadcasting message to active connections', {
      activeConnections: activeConnections.length,
      event: message.event,
    });

    activeConnections.forEach(connectionId => {
      if (this.sendMessage(connectionId, message)) {
        successCount++;
      }
    });

    return successCount;
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    total: number;
    active: number;
    connections: Array<{
      id: string;
      connectedAt: string;
      lastHeartbeat: string;
      isActive: boolean;
      clientInfo: ConnectionState['clientInfo'];
    }>;
  } {
    const connectionDetails = Array.from(this.connections.entries()).map(
      ([id, state]) => ({
        id,
        connectedAt: state.connectedAt.toISOString(),
        lastHeartbeat: state.lastHeartbeat.toISOString(),
        isActive: state.isActive,
        clientInfo: state.clientInfo,
      })
    );

    return {
      total: this.connections.size,
      active: connectionDetails.filter(c => c.isActive).length,
      connections: connectionDetails,
    };
  }

  /**
   * Graceful shutdown of all connections
   */
  async shutdown(): Promise<void> {
    logger.info('Starting SSE transport shutdown', {
      activeConnections: this.connections.size,
    });

    this.isShuttingDown = true;

    // Clear heartbeat timer
    clearInterval(this.heartbeatTimer);

    // Send shutdown message to all active connections
    this.broadcastMessage({
      event: 'server-shutdown',
      data: JSON.stringify({
        message: 'Server is shutting down',
        timestamp: new Date().toISOString(),
      }),
    });

    // Close all connections
    const closePromises = Array.from(this.connections.keys()).map(
      async connectionId => {
        await this.closeConnection(connectionId, 'server_shutdown');
      }
    );

    await Promise.all(closePromises);

    logger.info('SSE transport shutdown completed');
  }

  /**
   * Set standard SSE response headers
   */
  private setSSEHeaders(res: Response): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': this.config.corsOrigins.includes('*')
        ? '*'
        : this.config.corsOrigins.join(','),
      'Access-Control-Allow-Headers': 'Cache-Control',
      'Access-Control-Allow-Methods': 'GET',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `sse_${timestamp}_${random}`;
  }

  /**
   * Set up connection cleanup handlers for client disconnect detection
   */
  private setupConnectionCleanup(
    req: Request,
    res: Response,
    connectionId: string
  ): void {
    const cleanup = (reason: string) => {
      this.cleanupConnection(connectionId, reason);
    };

    // Handle client disconnect events
    req.on('close', () => cleanup('client_close'));
    req.on('end', () => cleanup('client_end'));
    res.on('close', () => cleanup('response_close'));
    res.on('finish', () => cleanup('response_finish'));

    // Handle connection errors
    req.on('error', error => {
      logger.error('SSE request error', {
        connectionId,
        error: error.message,
      });
      cleanup('request_error');
    });

    res.on('error', error => {
      logger.error('SSE response error', {
        connectionId,
        error: error.message,
      });
      cleanup('response_error');
    });
  }

  /**
   * Clean up connection resources
   */
  private cleanupConnection(connectionId: string, reason: string): void {
    const connectionState = this.connections.get(connectionId);

    if (!connectionState) {
      return; // Already cleaned up
    }

    logger.info('Cleaning up SSE connection', {
      connectionId,
      reason,
      duration: Date.now() - connectionState.connectedAt.getTime(),
    });

    // Mark as inactive
    connectionState.isActive = false;

    // Remove from maps
    const response = this.responses.get(connectionId);
    if (response && !response.destroyed) {
      try {
        response.end();
      } catch (error) {
        logger.debug('Error ending SSE response', {
          connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.responses.delete(connectionId);
    this.connections.delete(connectionId);

    // Notify event handler
    if (this.eventHandlers.onDisconnect) {
      Promise.resolve(
        this.eventHandlers.onDisconnect(connectionId, connectionState)
      ).catch(error => {
        logger.error('Error in disconnect event handler', {
          connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    logger.debug('SSE connection cleanup completed', {
      connectionId,
      remainingConnections: this.connections.size,
    });
  }

  /**
   * Close specific connection gracefully
   */
  private async closeConnection(
    connectionId: string,
    reason: string
  ): Promise<void> {
    const connectionState = this.connections.get(connectionId);

    if (!connectionState || !connectionState.isActive) {
      return;
    }

    // Send close message
    this.sendMessage(connectionId, {
      event: 'connection-close',
      data: JSON.stringify({
        reason,
        timestamp: new Date().toISOString(),
      }),
    });

    // Allow time for message to be sent
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clean up connection
    this.cleanupConnection(connectionId, reason);
  }

  /**
   * Perform heartbeat check on all connections
   */
  private performHeartbeat(): void {
    if (this.isShuttingDown) {
      return;
    }

    const now = new Date();
    const timeoutThreshold = now.getTime() - this.config.connectionTimeoutMs;
    const connectionsToCheck = Array.from(this.connections.entries());

    logger.debug('Performing heartbeat check', {
      totalConnections: connectionsToCheck.length,
      timeoutThreshold: new Date(timeoutThreshold).toISOString(),
    });

    let heartbeatsSent = 0;
    let timeoutsDetected = 0;

    connectionsToCheck.forEach(([connectionId, connectionState]) => {
      if (!connectionState.isActive) {
        return;
      }

      // Check for timeout
      if (connectionState.lastHeartbeat.getTime() < timeoutThreshold) {
        logger.info('Connection timeout detected', {
          connectionId,
          lastHeartbeat: connectionState.lastHeartbeat.toISOString(),
          timeoutAfter: this.config.connectionTimeoutMs,
        });
        this.cleanupConnection(connectionId, 'timeout');
        timeoutsDetected++;
        return;
      }

      // Send heartbeat
      const heartbeatSent = this.sendMessage(connectionId, {
        event: 'heartbeat',
        data: JSON.stringify({
          timestamp: now.toISOString(),
          connectionId,
        }),
      });

      if (heartbeatSent) {
        connectionState.lastHeartbeat = now;
        heartbeatsSent++;

        // Notify event handler
        if (this.eventHandlers.onHeartbeat) {
          Promise.resolve(this.eventHandlers.onHeartbeat(connectionId)).catch(
            error => {
              logger.error('Error in heartbeat event handler', {
                connectionId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          );
        }
      }
    });

    if (heartbeatsSent > 0 || timeoutsDetected > 0) {
      logger.debug('Heartbeat cycle completed', {
        heartbeatsSent,
        timeoutsDetected,
        activeConnections: this.connections.size,
      });
    }
  }
}
