/**
 * SSE Transport Integration for MCP Protocol
 * 
 * Integrates the MCP protocol handler with the SSE transport layer,
 * providing message forwarding, connection lifecycle management,
 * and proper error handling for MCP over SSE.
 */

import { logger } from '@/utils/logger';
import type { SSETransport, SSEMessage } from '@/transport/sse-transport';
import { MCPProtocolHandler } from './mcp-handler';
import type { MCPHandlerConfig } from './mcp-handler';

/**
 * Configuration for SSE integration
 */
export interface SSEIntegrationConfig extends MCPHandlerConfig {
  readonly messagePrefix?: string;
  readonly enableHeartbeat?: boolean;
  readonly enableDebugMessages?: boolean;
}

/**
 * SSE Integration for MCP Protocol
 */
export class MCPSSEIntegration {
  private readonly sseTransport: SSETransport;
  private readonly protocolHandler: MCPProtocolHandler;
  private readonly config: SSEIntegrationConfig;

  constructor(
    sseTransport: SSETransport,
    config: SSEIntegrationConfig = {}
  ) {
    this.sseTransport = sseTransport;
    this.config = {
      messagePrefix: config.messagePrefix ?? 'mcp',
      enableHeartbeat: config.enableHeartbeat ?? true,
      enableDebugMessages: config.enableDebugMessages ?? false,
      ...config
    };

    this.protocolHandler = new MCPProtocolHandler(config);
    this.setupIntegration();

    logger.info('MCP SSE Integration initialized', {
      messagePrefix: this.config.messagePrefix,
      enableHeartbeat: this.config.enableHeartbeat,
      enableDebugMessages: this.config.enableDebugMessages
    });
  }

  /**
   * Set up the integration between SSE transport and MCP protocol handler
   */
  private setupIntegration(): void {
    // We can't directly modify the existing SSETransport to add message handlers,
    // but we can extend its functionality through the connection event handlers
    // that were set up in the HTTP server.
    
    logger.debug('MCP SSE Integration setup completed');
  }

  /**
   * Handle incoming SSE message and route to MCP protocol handler
   */
  async handleSSEMessage(
    connectionId: string,
    messageData: string | Buffer
  ): Promise<void> {
    try {
      logger.debug('Processing SSE message for MCP', {
        connectionId,
        messageLength: messageData.length
      });

      // Process the message through the MCP protocol handler
      const response = await this.protocolHandler.handleMessage(messageData, connectionId);
      
      if (response) {
        // Send response back through SSE
        const sseMessage: SSEMessage = {
          event: `${this.config.messagePrefix}-response`,
          data: response,
          id: `${connectionId}-${Date.now()}`
        };

        const sent = this.sseTransport.sendMessage(connectionId, sseMessage);
        
        if (!sent) {
          logger.warn('Failed to send MCP response via SSE', {
            connectionId,
            responseLength: response.length
          });
        } else {
          logger.debug('MCP response sent via SSE', {
            connectionId,
            responseLength: response.length
          });
        }
      }

    } catch (error) {
      logger.error('Error handling SSE message in MCP integration', {
        connectionId,
        error: error instanceof Error ? error.message : String(error)
      });

      // Send error response
      await this.sendErrorMessage(connectionId, 'Message processing failed');
    }
  }

  /**
   * Handle new SSE connection
   */
  handleConnectionEstablished(connectionId: string): void {
    logger.debug('MCP connection established via SSE', { connectionId });
    
    this.protocolHandler.onConnectionEstablished(connectionId);

    // Send welcome message
    if (this.config.enableDebugMessages) {
      const welcomeMessage: SSEMessage = {
        event: `${this.config.messagePrefix}-welcome`,
        data: JSON.stringify({
          message: 'Connected to Drupalize.me MCP Server',
          timestamp: new Date().toISOString(),
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'drupalize-mcp-server',
            version: '1.0.0'
          }
        })
      };

      this.sseTransport.sendMessage(connectionId, welcomeMessage);
    }
  }

  /**
   * Handle SSE connection closed
   */
  handleConnectionClosed(connectionId: string): void {
    logger.debug('MCP connection closed via SSE', { connectionId });
    this.protocolHandler.onConnectionClosed(connectionId);
  }

  /**
   * Handle heartbeat events
   */
  handleHeartbeat(connectionId: string): void {
    if (this.config.enableHeartbeat) {
      logger.debug('MCP heartbeat via SSE', { connectionId });
      
      // Optionally send MCP-specific heartbeat
      if (this.config.enableDebugMessages) {
        const heartbeatMessage: SSEMessage = {
          event: `${this.config.messagePrefix}-heartbeat`,
          data: JSON.stringify({
            timestamp: new Date().toISOString(),
            connectionId
          })
        };

        this.sseTransport.sendMessage(connectionId, heartbeatMessage);
      }
    }
  }

  /**
   * Send error message to client
   */
  async sendErrorMessage(connectionId: string, message: string): Promise<void> {
    const errorMessage: SSEMessage = {
      event: `${this.config.messagePrefix}-error`,
      data: JSON.stringify({
        error: message,
        timestamp: new Date().toISOString()
      })
    };

    const sent = this.sseTransport.sendMessage(connectionId, errorMessage);
    
    if (!sent) {
      logger.error('Failed to send error message via SSE', {
        connectionId,
        message
      });
    }
  }

  /**
   * Send protocol notification to client
   */
  async sendNotification(
    connectionId: string,
    method: string,
    params?: any
  ): Promise<void> {
    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params
    };

    const notificationMessage: SSEMessage = {
      event: `${this.config.messagePrefix}-notification`,
      data: JSON.stringify(notification)
    };

    const sent = this.sseTransport.sendMessage(connectionId, notificationMessage);
    
    if (!sent) {
      logger.warn('Failed to send notification via SSE', {
        connectionId,
        method
      });
    }
  }

  /**
   * Broadcast message to all connections
   */
  async broadcastMessage(method: string, params?: any): Promise<number> {
    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params
    };

    const broadcastMessage: SSEMessage = {
      event: `${this.config.messagePrefix}-broadcast`,
      data: JSON.stringify(notification)
    };

    const sentCount = this.sseTransport.broadcastMessage(broadcastMessage);
    
    logger.debug('Broadcasted MCP message', {
      method,
      sentCount
    });

    return sentCount;
  }

  /**
   * Get integration statistics
   */
  getStats() {
    return {
      sse: this.sseTransport.getConnectionStats(),
      protocol: this.protocolHandler.getStats(),
      integration: {
        messagePrefix: this.config.messagePrefix,
        enableHeartbeat: this.config.enableHeartbeat,
        enableDebugMessages: this.config.enableDebugMessages
      }
    };
  }
}

/**
 * Factory function to create SSE integration
 */
export function createMCPSSEIntegration(
  sseTransport: SSETransport,
  config?: SSEIntegrationConfig
): MCPSSEIntegration {
  return new MCPSSEIntegration(sseTransport, config);
}