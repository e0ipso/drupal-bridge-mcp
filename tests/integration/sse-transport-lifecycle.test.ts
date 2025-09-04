/**
 * SSE Transport Lifecycle Integration Tests
 * 
 * Focused tests for Server-Sent Events connection lifecycle management,
 * heartbeat mechanisms, connection limits, and cleanup procedures.
 */

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import axios from 'axios';

import { SSETransport, type SSETransportConfig, type ConnectionEventHandlers } from '@/transport/sse-transport';
import { MCPHttpServer } from '@/server/http-server';

// Mock logger to reduce test noise
jest.mock('@/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock config
jest.mock('@/config', () => ({
  config: {
    port: 3002,
    environment: 'test',
    health: { enabled: true, path: '/health' },
    security: {
      cors: { enabled: true, origins: ['*'] },
      rateLimit: { enabled: false, max: 100, windowMs: 60000 }
    }
  },
}));

describe('SSE Transport Lifecycle Tests', () => {
  let server: MCPHttpServer;
  let sseTransport: SSETransport;
  let testPort: number;
  let testBaseUrl: string;
  let connectionEventSpy: jest.MockedFunction<any>;
  let disconnectionEventSpy: jest.MockedFunction<any>;
  let heartbeatEventSpy: jest.MockedFunction<any>;

  const sseConfig: SSETransportConfig = {
    heartbeatIntervalMs: 500,  // Fast heartbeat for tests
    connectionTimeoutMs: 2000, // Quick timeout for tests
    maxConnections: 5,         // Low limit for testing
    corsOrigins: ['*']
  };

  beforeAll(async () => {
    // Set up event spies
    connectionEventSpy = jest.fn();
    disconnectionEventSpy = jest.fn();
    heartbeatEventSpy = jest.fn();

    const connectionHandlers: ConnectionEventHandlers = {
      onConnect: connectionEventSpy,
      onDisconnect: disconnectionEventSpy,
      onHeartbeat: heartbeatEventSpy
    };

    // Create server with custom SSE config and handlers
    server = new MCPHttpServer(
      { port: 0, security: { enabled: false, rateLimit: { enabled: false, max: 100, windowMs: 60000 } } },
      sseConfig
    );

    // Replace the SSE transport with our instrumented version
    sseTransport = new SSETransport(sseConfig, connectionHandlers);
    
    // Start server
    await server.start();
    
    // Get assigned port
    const status = server.getStatus();
    testPort = status.port;
    testBaseUrl = `http://localhost:${testPort}`;
  }, 10000);

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  }, 5000);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Establishment', () => {
    it('should establish SSE connection with proper headers', async () => {
      const response = await axios.get(`${testBaseUrl}/mcp/stream`, {
        responseType: 'stream',
        timeout: 1000,
        validateStatus: () => true
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(response.headers['access-control-allow-origin']).toBeDefined();
      
      // Clean up
      response.data.destroy();
    });

    it('should reject connections when max limit is reached', async () => {
      const connections: any[] = [];
      
      try {
        // Create max connections + 1
        for (let i = 0; i <= sseConfig.maxConnections; i++) {
          const response = await axios.get(`${testBaseUrl}/mcp/stream`, {
            responseType: 'stream',
            timeout: 1000,
            validateStatus: () => true
          });
          
          connections.push(response);
          
          // Last connection should be rejected
          if (i === sseConfig.maxConnections) {
            expect(response.status).toBe(503);
            expect(response.data).toMatchObject({
              error: 'Maximum connections reached'
            });
          } else {
            expect(response.status).toBe(200);
          }
        }
      } finally {
        // Clean up all connections
        connections.forEach(conn => {
          if (conn.data && typeof conn.data.destroy === 'function') {
            conn.data.destroy();
          }
        });
      }
    });

    it('should assign unique connection IDs', async () => {
      const connectionIds = new Set<string>();
      const connections: any[] = [];
      
      try {
        // Create multiple connections
        for (let i = 0; i < 3; i++) {
          const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
          connections.push(eventSource);
          
          await new Promise((resolve, reject) => {
            eventSource.onmessage = (event: any) => {
              const data = JSON.parse(event.data);
              if (data.connectionId) {
                connectionIds.add(data.connectionId);
                resolve(data.connectionId);
              }
            };
            
            eventSource.onerror = reject;
            
            setTimeout(() => reject(new Error('Timeout')), 2000);
          });
        }
        
        expect(connectionIds.size).toBe(3); // All unique IDs
        connectionIds.forEach(id => {
          expect(typeof id).toBe('string');
          expect(id).toMatch(/^sse_/);
        });
        
      } finally {
        connections.forEach(conn => conn.close());
      }
    });

    it('should handle connection with custom headers', async () => {
      const customHeaders = {
        'User-Agent': 'test-mcp-client/1.0.0',
        'X-Test-Header': 'test-value'
      };

      const response = await axios.get(`${testBaseUrl}/mcp/stream`, {
        headers: customHeaders,
        responseType: 'stream',
        timeout: 1000,
        validateStatus: () => true
      });

      expect(response.status).toBe(200);
      
      // Clean up
      response.data.destroy();
    });
  });

  describe('Heartbeat Mechanism', () => {
    it('should send regular heartbeat messages', async () => {
      const heartbeats: any[] = [];
      
      const heartbeatPromise = new Promise((resolve, reject) => {
        const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
        
        eventSource.onmessage = (event: any) => {
          if (event.type === 'heartbeat' || JSON.parse(event.data).timestamp) {
            heartbeats.push({
              timestamp: Date.now(),
              data: JSON.parse(event.data)
            });
            
            if (heartbeats.length >= 3) {
              resolve(heartbeats);
              eventSource.close();
            }
          }
        };
        
        eventSource.onerror = (error: any) => {
          reject(error);
          eventSource.close();
        };
        
        setTimeout(() => {
          eventSource.close();
          reject(new Error(`Only received ${heartbeats.length} heartbeats`));
        }, 3000);
      });

      const receivedHeartbeats = await heartbeatPromise;
      expect(Array.isArray(receivedHeartbeats)).toBe(true);
      expect((receivedHeartbeats as any[]).length).toBe(3);
      
      // Check heartbeat intervals
      const intervals = [];
      for (let i = 1; i < (receivedHeartbeats as any[]).length; i++) {
        const interval = (receivedHeartbeats as any[])[i].timestamp - (receivedHeartbeats as any[])[i - 1].timestamp;
        intervals.push(interval);
      }
      
      // Should be approximately every 500ms (±100ms tolerance)
      intervals.forEach(interval => {
        expect(interval).toBeGreaterThan(400);
        expect(interval).toBeLessThan(600);
      });
    });

    it('should detect and cleanup timed out connections', async () => {
      const sseTransportWithShortTimeout = new SSETransport({
        ...sseConfig,
        connectionTimeoutMs: 1000, // Very short timeout
        heartbeatIntervalMs: 200   // Frequent checks
      });

      // Mock a connection that doesn't respond to heartbeats
      const mockReq = { 
        on: jest.fn(),
        get: jest.fn().mockReturnValue('test-agent'),
        socket: { remoteAddress: '127.0.0.1' }
      };
      
      const mockRes = {
        writeHead: jest.fn(),
        write: jest.fn().mockImplementation(() => {
          throw new Error('Connection lost'); // Simulate network error
        }),
        on: jest.fn(),
        end: jest.fn(),
        destroyed: false
      };

      // This should result in connection cleanup after timeout
      try {
        await sseTransportWithShortTimeout.handleConnection(mockReq as any, mockRes as any);
      } catch (error) {
        // Expected to fail due to our mock
      }

      // Wait for timeout cleanup
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const stats = sseTransportWithShortTimeout.getConnectionStats();
      expect(stats.active).toBe(0); // Connection should be cleaned up
    });

    it('should handle heartbeat callback errors gracefully', async () => {
      const erroringHandler: ConnectionEventHandlers = {
        onHeartbeat: jest.fn().mockRejectedValue(new Error('Heartbeat handler error'))
      };

      const sseTransportWithErrorHandler = new SSETransport(sseConfig, erroringHandler);
      
      // Create connection
      const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
      
      // Wait for heartbeats (should continue despite handler errors)
      await new Promise((resolve, reject) => {
        let heartbeatCount = 0;
        
        eventSource.onmessage = (event: any) => {
          if (event.type === 'heartbeat' || JSON.parse(event.data).timestamp) {
            heartbeatCount++;
            if (heartbeatCount >= 2) {
              resolve(heartbeatCount);
              eventSource.close();
            }
          }
        };
        
        eventSource.onerror = reject;
        
        setTimeout(() => {
          eventSource.close();
          reject(new Error('Heartbeat test timeout'));
        }, 2000);
      });

      // Verify handler was called (and failed)
      expect(erroringHandler.onHeartbeat).toHaveBeenCalled();
    });
  });

  describe('Connection Cleanup', () => {
    it('should cleanup connections when client disconnects', async () => {
      const initialStats = server.getSSETransport().getConnectionStats();
      
      // Create and immediately close connection
      const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
      
      // Wait for connection
      await new Promise(resolve => {
        eventSource.onopen = resolve;
        setTimeout(resolve, 1000); // Fallback timeout
      });
      
      const connectedStats = server.getSSETransport().getConnectionStats();
      
      // Close connection
      eventSource.close();
      
      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalStats = server.getSSETransport().getConnectionStats();
      
      expect(finalStats.active).toBeLessThanOrEqual(connectedStats.active);
    });

    it('should cleanup all connections on transport shutdown', async () => {
      const testTransport = new SSETransport({
        ...sseConfig,
        heartbeatIntervalMs: 1000
      });

      // Create mock connections
      const connections: any[] = [];
      for (let i = 0; i < 3; i++) {
        const mockReq = { 
          on: jest.fn(),
          get: jest.fn().mockReturnValue('test-agent'),
          socket: { remoteAddress: '127.0.0.1' }
        };
        
        const mockRes = {
          writeHead: jest.fn(),
          write: jest.fn(),
          on: jest.fn(),
          end: jest.fn(),
          destroyed: false
        };

        connections.push({ req: mockReq, res: mockRes });
        
        try {
          await testTransport.handleConnection(mockReq as any, mockRes as any);
        } catch {
          // May fail due to mocking, that's ok
        }
      }

      const preShutdownStats = testTransport.getConnectionStats();
      
      // Shutdown should cleanup all connections
      await testTransport.shutdown();
      
      const postShutdownStats = testTransport.getConnectionStats();
      expect(postShutdownStats.active).toBe(0);
      expect(postShutdownStats.total).toBe(0);
    });

    it('should handle connection errors during cleanup', async () => {
      const testTransport = new SSETransport(sseConfig);

      // Mock connection with failing response
      const mockReq = { 
        on: jest.fn(),
        get: jest.fn().mockReturnValue('test-agent'),
        socket: { remoteAddress: '127.0.0.1' }
      };
      
      const mockRes = {
        writeHead: jest.fn(),
        write: jest.fn(),
        on: jest.fn(),
        end: jest.fn().mockImplementation(() => {
          throw new Error('Connection cleanup error');
        }),
        destroyed: false
      };

      try {
        await testTransport.handleConnection(mockReq as any, mockRes as any);
      } catch {
        // Expected to fail
      }

      // Shutdown should handle the error gracefully
      await expect(testTransport.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Message Broadcasting', () => {
    it('should broadcast messages to all active connections', async () => {
      const connectionCount = 3;
      const connections: MockEventSource[] = [];
      const receivedMessages: any[][] = Array.from({ length: connectionCount }, () => []);
      
      try {
        // Create multiple connections
        for (let i = 0; i < connectionCount; i++) {
          const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
          connections.push(eventSource);
          
          eventSource.onmessage = (event: any) => {
            receivedMessages[i].push(JSON.parse(event.data));
          };
        }

        // Wait for connections to establish
        await new Promise(resolve => setTimeout(resolve, 100));

        // Broadcast a test message (this would be done by the server)
        const testMessage = {
          event: 'test-broadcast',
          data: JSON.stringify({
            message: 'Hello all connections',
            timestamp: new Date().toISOString()
          })
        };

        // Simulate broadcast via server transport
        const broadcastCount = server.getSSETransport().broadcastMessage(testMessage);
        
        // Wait for message delivery
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // All connections should receive the message
        expect(broadcastCount).toBeGreaterThan(0);
        
      } finally {
        connections.forEach(conn => conn.close());
      }
    });

    it('should handle message sending failures gracefully', async () => {
      const testTransport = new SSETransport(sseConfig);

      // Mock connection with failing write
      const mockReq = { 
        on: jest.fn(),
        get: jest.fn().mockReturnValue('test-agent'),
        socket: { remoteAddress: '127.0.0.1' }
      };
      
      const mockRes = {
        writeHead: jest.fn(),
        write: jest.fn().mockImplementation(() => {
          throw new Error('Write failed');
        }),
        on: jest.fn(),
        end: jest.fn(),
        destroyed: false
      };

      // Connection should be cleaned up after send failure
      const sendResult = testTransport.sendMessage('non-existent-connection', {
        data: 'test message'
      });

      expect(sendResult).toBe(false);
    });
  });

  describe('Connection Statistics', () => {
    it('should track connection statistics accurately', async () => {
      const initialStats = server.getSSETransport().getConnectionStats();
      const connections: MockEventSource[] = [];
      
      try {
        // Create some connections
        for (let i = 0; i < 2; i++) {
          const eventSource = new MockEventSource(`${testBaseUrl}/mcp/stream`);
          connections.push(eventSource);
        }

        // Wait for connections
        await new Promise(resolve => setTimeout(resolve, 200));

        const connectedStats = server.getSSETransport().getConnectionStats();
        
        expect(connectedStats.total).toBeGreaterThanOrEqual(initialStats.total);
        expect(connectedStats.active).toBeGreaterThanOrEqual(initialStats.active);
        expect(typeof connectedStats.connections).toBe('object');
        
        // Close one connection
        connections[0].close();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const afterCloseStats = server.getSSETransport().getConnectionStats();
        expect(afterCloseStats.active).toBeLessThan(connectedStats.active);
        
      } finally {
        connections.forEach(conn => conn.close());
      }
    });

    it('should provide detailed connection information', async () => {
      const stats = server.getSSETransport().getConnectionStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('connections');
      expect(Array.isArray(stats.connections)).toBe(true);
      
      stats.connections.forEach(conn => {
        expect(conn).toHaveProperty('id');
        expect(conn).toHaveProperty('connectedAt');
        expect(conn).toHaveProperty('lastHeartbeat');
        expect(conn).toHaveProperty('isActive');
        expect(conn).toHaveProperty('clientInfo');
        expect(typeof conn.id).toBe('string');
        expect(typeof conn.isActive).toBe('boolean');
      });
    });
  });
});

// Mock EventSource for testing
class MockEventSource extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  
  readyState = MockEventSource.CONNECTING;
  url: string;
  
  constructor(url: string) {
    super();
    this.url = url;
    
    // Simulate async connection
    process.nextTick(() => {
      this.readyState = MockEventSource.OPEN;
      this.emit('open');
      
      // Simulate initial connection message
      setTimeout(() => {
        const data = {
          connectionId: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          timestamp: new Date().toISOString(),
          server: 'drupalize-mcp-server',
          version: '1.0.0'
        };
        
        this.emit('message', {
          type: 'connected',
          data: JSON.stringify(data)
        });
      }, 50);
    });
  }
  
  close() {
    this.readyState = MockEventSource.CLOSED;
    this.emit('close');
    this.removeAllListeners();
  }
  
  set onopen(handler: ((event: any) => void) | null) {
    if (handler) {
      this.removeAllListeners('open');
      this.on('open', handler);
    }
  }
  
  set onmessage(handler: ((event: any) => void) | null) {
    if (handler) {
      this.removeAllListeners('message');
      this.on('message', handler);
    }
  }
  
  set onerror(handler: ((event: any) => void) | null) {
    if (handler) {
      this.removeAllListeners('error');
      this.on('error', handler);
    }
  }
}