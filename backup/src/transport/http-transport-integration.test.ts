/**
 * Simple integration test for HttpTransport
 * This demonstrates the HTTP server actually works
 */

import { setTimeout } from 'timers/promises';

// Mock the logger module before any imports
const mockLogger = {
  child: jest.fn(() => mockLogger),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
  fatal: jest.fn(),
  level: 'info',
  silent: false,
} as any;

jest.mock('@/utils/logger.js', () => ({
  initializeLogger: jest.fn(),
  getLogger: jest.fn(() => mockLogger),
  createChildLogger: jest.fn(() => mockLogger),
  isLoggerInitialized: jest.fn(() => true),
}));

// Now import the modules that depend on the mocked logger
import { HttpTransport } from './http-transport.js';
import type { AppConfig } from '@/config/index.js';

describe('HttpTransport Integration', () => {
  let transport: HttpTransport;
  let config: AppConfig;

  beforeEach(() => {
    config = {
      http: {
        port: 3002, // Use different port to avoid conflicts
        host: 'localhost',
        corsOrigins: ['http://localhost:3000'],
        timeout: 5000,
      },
      mcp: {
        name: 'test-server',
        version: '1.0.0',
        protocolVersion: '2024-11-05',
        capabilities: {},
      },
      environment: 'test',
    } as AppConfig;

    // Reset the mock functions before each test
    jest.clearAllMocks();

    // Reset the mock logger like in the unit tests
    mockLogger.child = jest.fn(() => mockLogger);

    transport = new HttpTransport(config, undefined as any, mockLogger);
  });

  afterEach(async () => {
    if (transport.getStatus().running) {
      await transport.stop();
    }
  });

  it('should successfully start and stop HTTP server', async () => {
    // Test server startup
    expect(transport.getStatus().running).toBe(false);

    await transport.start();
    expect(transport.getStatus().running).toBe(true);
    expect(transport.getStatus().port).toBe(3002);

    // Give server a moment to fully initialize
    await setTimeout(10);

    // Test server shutdown
    await transport.stop();
    expect(transport.getStatus().running).toBe(false);
  });

  it('should handle multiple start/stop cycles', async () => {
    // First cycle
    await transport.start();
    expect(transport.getStatus().running).toBe(true);
    await transport.stop();
    expect(transport.getStatus().running).toBe(false);

    // Second cycle
    await transport.start();
    expect(transport.getStatus().running).toBe(true);
    await transport.stop();
    expect(transport.getStatus().running).toBe(false);
  });

  it('should prevent duplicate server starts', async () => {
    await transport.start();

    await expect(transport.start()).rejects.toThrow(
      'HTTP server is already running'
    );

    await transport.stop();
  });
});
