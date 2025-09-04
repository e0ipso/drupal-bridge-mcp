/**
 * Enhanced HTTP Server with MCP Protocol Integration
 * 
 * Extends the base HTTP server to include MCP protocol message handling
 * over SSE transport with proper connection lifecycle management.
 */

import type { Request, Response } from 'express';
import { logger } from '@/utils/logger';
import { config } from '@/config';
import {
  MCPHttpServer,
  type HttpServerConfig,
  createMCPHttpServer
} from './http-server';
import type { SSETransportConfig } from '@/transport/sse-transport';
import { createMCPProtocol } from '@/protocol';

/**
 * Enhanced server configuration
 */
export interface EnhancedServerConfig extends HttpServerConfig {
  readonly mcp: {
    readonly enabled: boolean;
    readonly drupalBaseUrl?: string;
    readonly enableToolDiscovery?: boolean;
    readonly enableDebugMessages?: boolean;
    readonly messagePrefix?: string;
  };
}

/**
 * Enhanced MCP HTTP Server with Protocol Integration
 */
export class EnhancedMCPHttpServer extends MCPHttpServer {
  private mcpProtocol: ReturnType<typeof createMCPProtocol> | null = null;
  private readonly enhancedConfig: EnhancedServerConfig;

  constructor(
    serverConfig?: Partial<EnhancedServerConfig>,
    sseConfig?: Partial<SSETransportConfig>
  ) {
    // Extract MCP config and pass the rest to parent
    const { mcp: mcpConfig, ...baseConfig } = serverConfig || {};
    
    super(baseConfig, sseConfig);

    // Get the parent config safely
    const parentConfig = super.getStatus();
    
    this.enhancedConfig = {
      port: parentConfig.port,
      host: baseConfig.host ?? '0.0.0.0',
      cors: baseConfig.cors ?? { enabled: true, origins: ['*'] },
      security: baseConfig.security ?? { enabled: true, rateLimit: { enabled: true, max: 100, windowMs: 900000 } },
      compression: baseConfig.compression ?? true,
      healthCheck: baseConfig.healthCheck ?? { enabled: true, path: '/health' },
      mcp: {
        enabled: mcpConfig?.enabled ?? true,
        drupalBaseUrl: mcpConfig?.drupalBaseUrl ?? config.drupal.baseUrl,
        enableToolDiscovery: mcpConfig?.enableToolDiscovery ?? true,
        enableDebugMessages: mcpConfig?.enableDebugMessages ?? (config.environment === 'development'),
        messagePrefix: mcpConfig?.messagePrefix ?? 'mcp'
      }
    };

    if (this.enhancedConfig.mcp.enabled) {
      this.initializeMCPProtocol();
    }

    logger.info('Enhanced MCP HTTP Server initialized', {
      mcpEnabled: this.enhancedConfig.mcp.enabled,
      drupalBaseUrl: this.enhancedConfig.mcp.drupalBaseUrl
    });
  }

  /**
   * Start the enhanced server
   */
  override async start(): Promise<void> {
    await super.start();
    
    if (this.mcpProtocol) {
      logger.info('Enhanced MCP HTTP Server started with protocol support');
    }
  }

  /**
   * Get enhanced server statistics
   */
  getEnhancedStats() {
    const baseStats = super.getStatus();
    
    return {
      ...baseStats,
      mcp: {
        enabled: this.enhancedConfig.mcp.enabled,
        protocol: this.mcpProtocol?.getStats()
      }
    };
  }

  /**
   * Initialize MCP protocol integration
   */
  private initializeMCPProtocol(): void {
    const sseTransport = this.getSSETransport();
    
    this.mcpProtocol = createMCPProtocol({
      sseTransport,
      drupalBaseUrl: this.enhancedConfig.mcp.drupalBaseUrl,
      enableToolDiscovery: this.enhancedConfig.mcp.enableToolDiscovery,
      enableDebugMessages: this.enhancedConfig.mcp.enableDebugMessages
    });

    // Set up enhanced connection handlers
    this.setupEnhancedConnectionHandlers();

    // Add MCP-specific routes
    this.addMCPRoutes();

    logger.info('MCP protocol integration initialized', {
      drupalBaseUrl: this.enhancedConfig.mcp.drupalBaseUrl,
      toolDiscovery: this.enhancedConfig.mcp.enableToolDiscovery
    });
  }

  /**
   * Set up enhanced connection event handlers
   */
  private setupEnhancedConnectionHandlers(): void {
    if (!this.mcpProtocol) {
      return;
    }

    const app = this.getExpressApp();

    // Add middleware to handle MCP messages over SSE
    app.use('/mcp/stream', (req: Request, res: Response, next) => {
      // Store MCP protocol handler reference for this connection
      (req as any).mcpProtocol = this.mcpProtocol;
      next();
    });

    // The actual message handling will be done through SSE message events
    // which we'll need to extend in the SSE transport
  }

  /**
   * Add MCP-specific routes
   */
  private addMCPRoutes(): void {
    const app = this.getExpressApp();

    // MCP protocol information endpoint
    app.get('/mcp/protocol', (req: Request, res: Response) => {
      if (!this.enhancedConfig.mcp.enabled) {
        res.status(404).json({
          error: 'MCP protocol not enabled'
        });
        return;
      }

      res.json({
        protocol: {
          name: 'Model Context Protocol',
          version: '2024-11-05',
          transport: 'Server-Sent Events',
          endpoint: '/mcp/stream'
        },
        server: {
          name: 'drupalize-mcp-server',
          version: '1.0.0',
          capabilities: {
            tools: { listChanged: this.enhancedConfig.mcp.enableToolDiscovery },
            logging: {},
            experimental: {}
          }
        },
        drupal: {
          baseUrl: this.enhancedConfig.mcp.drupalBaseUrl
        },
        stats: this.mcpProtocol?.getStats()
      });
    });

    // MCP connection test endpoint
    app.post('/mcp/test', async (req: Request, res: Response) => {
      if (!this.enhancedConfig.mcp.enabled || !this.mcpProtocol) {
        res.status(404).json({
          error: 'MCP protocol not enabled'
        });
        return;
      }

      try {
        const { message } = req.body;
        
        if (!message) {
          res.status(400).json({
            error: 'Missing message in request body'
          });
          return;
        }

        // Test message processing
        const testConnectionId = `test-${Date.now()}`;
        const result = await this.mcpProtocol.handleMessage(
          JSON.stringify(message),
          testConnectionId
        );

        res.json({
          success: true,
          response: result ? JSON.parse(result) : null,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        logger.error('MCP test endpoint error', {
          error: error instanceof Error ? error.message : String(error)
        });

        res.status(500).json({
          error: 'Failed to process test message',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    logger.debug('MCP-specific routes added', {
      routes: ['/mcp/protocol', '/mcp/test']
    });
  }

  /**
   * Handle connection established (override parent method)
   */
  protected override async handleConnectionEstablished(
    connectionId: string,
    state: any
  ): Promise<void> {
    await super.handleConnectionEstablished(connectionId, state);
    
    if (this.mcpProtocol) {
      this.mcpProtocol.handleConnectionEstablished(connectionId);
    }
  }

  /**
   * Handle connection closed (override parent method)
   */
  protected override async handleConnectionClosed(
    connectionId: string,
    state: any
  ): Promise<void> {
    if (this.mcpProtocol) {
      this.mcpProtocol.handleConnectionClosed(connectionId);
    }
    
    await super.handleConnectionClosed(connectionId, state);
  }

  /**
   * Handle heartbeat (override parent method)
   */
  protected override async handleHeartbeat(connectionId: string): Promise<void> {
    await super.handleHeartbeat(connectionId);
    
    if (this.mcpProtocol) {
      this.mcpProtocol.handleHeartbeat(connectionId);
    }
  }
}

/**
 * Factory function to create enhanced MCP HTTP server
 */
export function createEnhancedMCPHttpServer(
  serverConfig?: Partial<EnhancedServerConfig>,
  sseConfig?: Partial<SSETransportConfig>
): EnhancedMCPHttpServer {
  return new EnhancedMCPHttpServer(serverConfig, sseConfig);
}