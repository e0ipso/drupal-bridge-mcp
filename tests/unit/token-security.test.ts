/**
 * Token Security Unit Tests
 *
 * Comprehensive test suite for token security components including
 * secure storage, validation, lifecycle management, and background processing.
 */

import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { jest } from '@jest/globals';

// Import components under test
import { SecureTokenStorage } from '../../src/auth/secure-token-storage.js';
import { TokenLifecycleManager } from '../../src/auth/token-lifecycle-manager.js';
import { TokenValidationService } from '../../src/auth/token-validation-service.js';
import {
  BackgroundTokenProcessor,
  BackgroundTaskType,
} from '../../src/auth/background-token-processor.js';
import { TokenSecurityManager } from '../../src/auth/token-security-manager.js';
import { OAuthManager } from '../../src/auth/oauth-client.js';
import type { TokenSet } from '../../src/types/oauth.js';

// Mock dependencies
jest.mock('../../src/utils/logger.js');
jest.mock('../../src/monitoring/metrics.js');
jest.mock('../../src/config/index.js', () => ({
  config: {
    security: {
      token: {
        bcryptSaltRounds: 10,
        encryptionKey: 'test-encryption-key-32-chars-long!!',
        refreshThreshold: 0.9,
        maxRefreshRetries: 3,
        refreshRetryDelayMs: 1000,
        cleanupIntervalMs: 60000,
      },
    },
  },
}));

// Test utilities
function createMockPool(): Pool {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  };

  const mockPool = {
    connect: jest.fn().mockResolvedValue(mockClient),
    query: jest.fn(),
    end: jest.fn(),
    totalCount: 0,
    idleCount: 0,
    waitingCount: 0,
  } as unknown as Pool;

  return mockPool;
}

function createMockTokenSet(overrides: Partial<TokenSet> = {}): TokenSet {
  return {
    accessToken: 'test-access-token-123',
    refreshToken: 'test-refresh-token-456',
    tokenType: 'Bearer',
    expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour from now
    scopes: ['content:read', 'content:search'],
    userId: 'test-user-123',
    subscriptionLevel: 'free',
    ...overrides,
  };
}

describe('SecureTokenStorage', () => {
  let tokenStorage: SecureTokenStorage;
  let mockPool: Pool;
  let mockClient: any;

  beforeEach(() => {
    mockPool = createMockPool();
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    (mockPool.connect as jest.Mock).mockResolvedValue(mockClient);
    tokenStorage = new SecureTokenStorage(mockPool);
  });

  describe('storeTokens', () => {
    it('should store tokens with bcrypt hashing', async () => {
      const tokenSet = createMockTokenSet();
      const mockResult = { rows: [{ id: 1 }] };

      mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
      mockClient.query.mockResolvedValueOnce(mockResult); // INSERT
      mockClient.query.mockResolvedValueOnce(undefined); // COMMIT

      const result = await tokenStorage.storeTokens('test-user', tokenSet);

      expect(result.success).toBe(true);
      expect(result.sessionId).toBe(1);
      expect(mockClient.query).toHaveBeenCalledTimes(3);
    });

    it('should handle storage errors gracefully', async () => {
      const tokenSet = createMockTokenSet();
      const error = new Error('Database connection failed');

      mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
      mockClient.query.mockRejectedValueOnce(error); // INSERT fails
      mockClient.query.mockResolvedValueOnce(undefined); // ROLLBACK

      const result = await tokenStorage.storeTokens('test-user', tokenSet);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should encrypt sensitive metadata', async () => {
      const tokenSet = createMockTokenSet();
      mockClient.query.mockResolvedValue({ rows: [{ id: 1 }] });

      await tokenStorage.storeTokens('test-user', tokenSet);

      // Verify that encrypted data was passed to query
      const insertCall = mockClient.query.mock.calls.find(call =>
        call[0]?.includes('INSERT INTO user_sessions')
      );

      expect(insertCall).toBeDefined();
      const encryptedMetadata = insertCall[1][6]; // 7th parameter (0-indexed)
      expect(typeof encryptedMetadata).toBe('string');
      expect(encryptedMetadata.split(':')).toHaveLength(3); // IV:AuthTag:EncryptedData
    });
  });

  describe('validateToken', () => {
    it('should validate tokens using constant-time comparison', async () => {
      const tokenSet = createMockTokenSet();
      const hashedToken = await bcrypt.hash(tokenSet.accessToken, 10);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: hashedToken,
            refresh_token_hash: 'mock-refresh-hash',
            expires_at: tokenSet.expiresAt.toISOString(),
            scope: tokenSet.scopes,
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await tokenStorage.validateToken(
        'test-user',
        tokenSet.accessToken
      );

      expect(result.valid).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.userId).toBe('test-user');
    });

    it('should detect expired tokens', async () => {
      const expiredToken = createMockTokenSet({
        expiresAt: new Date(Date.now() - 3600 * 1000), // 1 hour ago
      });

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: 'mock-hash',
            expires_at: expiredToken.expiresAt.toISOString(),
            scope: expiredToken.scopes,
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await tokenStorage.validateToken('test-user', 'any-token');

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('TOKEN_EXPIRED');
    });

    it('should identify tokens requiring refresh', async () => {
      // Create token that expires soon (requiring refresh)
      const tokenSet = createMockTokenSet({
        expiresAt: new Date(Date.now() + 300 * 1000), // 5 minutes from now
      });
      const hashedToken = await bcrypt.hash(tokenSet.accessToken, 10);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: hashedToken,
            expires_at: tokenSet.expiresAt.toISOString(),
            scope: tokenSet.scopes,
            subscription_level: 'free',
            created_at: new Date(Date.now() - 3300 * 1000).toISOString(), // Created 55 minutes ago
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await tokenStorage.validateToken(
        'test-user',
        tokenSet.accessToken
      );

      expect(result.valid).toBe(true);
      expect(result.requiresRefresh).toBe(true);
    });

    it('should handle invalid tokens securely', async () => {
      const hashedToken = await bcrypt.hash('correct-token', 10);

      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: hashedToken,
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            scope: ['content:read'],
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await tokenStorage.validateToken(
        'test-user',
        'wrong-token'
      );

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('TOKEN_INVALID');
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should clean up expired tokens and return statistics', async () => {
      mockClient.query.mockResolvedValueOnce(undefined); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        rowCount: 5,
        rows: Array(5).fill({ user_id: 'test-user' }),
      }); // DELETE
      mockClient.query.mockResolvedValueOnce(undefined); // COMMIT

      const result = await tokenStorage.cleanupExpiredTokens();

      expect(result.totalCleaned).toBe(5);
      expect(result.expiredTokens).toBe(5);
      expect(result.processingTimeMs).toBeGreaterThan(0);
    });
  });
});

describe('TokenValidationService', () => {
  let validationService: TokenValidationService;
  let mockPool: Pool;
  let mockOAuthManager: jest.Mocked<OAuthManager>;
  let mockLifecycleManager: jest.Mocked<TokenLifecycleManager>;

  beforeEach(() => {
    mockPool = createMockPool();
    mockOAuthManager = {
      introspectToken: jest.fn(),
      refreshToken: jest.fn(),
      checkHealth: jest.fn(),
    } as any;

    mockLifecycleManager = {
      refreshUserTokenIfNeeded: jest.fn(),
      forceRefreshUser: jest.fn(),
    } as any;

    validationService = new TokenValidationService(
      mockPool,
      mockOAuthManager,
      mockLifecycleManager
    );
  });

  describe('validateToken', () => {
    it('should perform comprehensive token validation', async () => {
      const context = {
        userId: 'test-user',
        accessToken: 'test-token',
        requiredScopes: ['content:read'],
        allowExpiredWithRefresh: false,
      };

      // Mock successful validation by setting up the token storage response
      const mockClient = await mockPool.connect();
      (mockClient.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: await bcrypt.hash('test-token', 10),
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            scope: ['content:read', 'content:search'],
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await validationService.validateToken(context);

      expect(result.valid).toBe(true);
      expect(result.context).toBeDefined();
      expect(result.context?.scopes).toContain('content:read');
    });

    it('should handle expired tokens with auto-refresh', async () => {
      const context = {
        userId: 'test-user',
        accessToken: 'expired-token',
        allowExpiredWithRefresh: true,
      };

      // Mock expired token
      const mockClient = await mockPool.connect();
      (mockClient.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: await bcrypt.hash('expired-token', 10),
            expires_at: new Date(Date.now() - 1000).toISOString(), // Expired
            scope: ['content:read'],
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      // Mock successful refresh
      mockLifecycleManager.refreshUserTokenIfNeeded.mockResolvedValueOnce({
        success: true,
        newTokens: createMockTokenSet({ accessToken: 'new-access-token' }),
      });

      // Mock validation of new token
      (mockClient.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: await bcrypt.hash('new-access-token', 10),
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            scope: ['content:read'],
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await validationService.validateToken(context);

      expect(result.valid).toBe(true);
      expect(result.refreshed).toBe(true);
      expect(mockLifecycleManager.refreshUserTokenIfNeeded).toHaveBeenCalled();
    });

    it('should validate required scopes', async () => {
      const context = {
        userId: 'test-user',
        accessToken: 'test-token',
        requiredScopes: ['content:write', 'admin:access'], // Scopes not available
      };

      const mockClient = await mockPool.connect();
      (mockClient.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: await bcrypt.hash('test-token', 10),
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            scope: ['content:read'], // Only has read access
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await validationService.validateToken(context);

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe('INSUFFICIENT_SCOPE');
      expect(result.error).toContain('content:write');
      expect(result.error).toContain('admin:access');
    });
  });

  describe('quickValidateToken', () => {
    it('should perform fast validation without introspection', async () => {
      const mockClient = await mockPool.connect();
      (mockClient.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: await bcrypt.hash('test-token', 10),
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            scope: ['content:read'],
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const result = await validationService.quickValidateToken(
        'test-user',
        'test-token'
      );

      expect(result.valid).toBe(true);
      expect(mockOAuthManager.introspectToken).not.toHaveBeenCalled();
    });
  });

  describe('statistics tracking', () => {
    it('should track validation statistics', async () => {
      const initialStats = validationService.getStats();
      expect(initialStats.totalValidations).toBe(0);

      // Perform some validations
      const mockClient = await mockPool.connect();
      (mockClient.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: await bcrypt.hash('test-token', 10),
            expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
            scope: ['content:read'],
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      await validationService.validateToken({
        userId: 'test-user',
        accessToken: 'test-token',
      });

      const finalStats = validationService.getStats();
      expect(finalStats.totalValidations).toBe(1);
      expect(finalStats.successfulValidations).toBe(1);
      expect(finalStats.averageValidationTime).toBeGreaterThan(0);
    });
  });
});

describe('BackgroundTokenProcessor', () => {
  let processor: BackgroundTokenProcessor;
  let mockPool: Pool;
  let mockOAuthManager: jest.Mocked<OAuthManager>;
  let mockLifecycleManager: jest.Mocked<TokenLifecycleManager>;
  let mockValidationService: jest.Mocked<TokenValidationService>;

  beforeEach(() => {
    mockPool = createMockPool();
    mockOAuthManager = {} as any;
    mockLifecycleManager = {} as any;
    mockValidationService = {} as any;

    processor = new BackgroundTokenProcessor(
      mockPool,
      mockOAuthManager,
      mockLifecycleManager,
      mockValidationService
    );
  });

  describe('task management', () => {
    it('should enqueue tasks in priority order', () => {
      processor.enqueueTask(BackgroundTaskType.CLEANUP_EXPIRED, 5);
      processor.enqueueTask(BackgroundTaskType.REFRESH_TOKENS, 8);
      processor.enqueueTask(BackgroundTaskType.HEALTH_CHECK, 3);

      const status = processor.getQueueStatus();
      expect(status.queueSize).toBe(3);
      expect(status.upcomingTasks[0].type).toBe(
        BackgroundTaskType.REFRESH_TOKENS
      );
      expect(status.upcomingTasks[1].type).toBe(
        BackgroundTaskType.CLEANUP_EXPIRED
      );
      expect(status.upcomingTasks[2].type).toBe(
        BackgroundTaskType.HEALTH_CHECK
      );
    });

    it('should track task statistics', () => {
      const initialStats = processor.getStats();
      expect(initialStats.tasksExecuted).toBe(0);
      expect(initialStats.currentQueueSize).toBe(0);
    });
  });
});

describe('TokenSecurityManager', () => {
  let securityManager: TokenSecurityManager;
  let mockPool: Pool;
  let mockOAuthManager: jest.Mocked<OAuthManager>;

  beforeEach(() => {
    mockPool = createMockPool();
    mockOAuthManager = {
      checkHealth: jest.fn().mockResolvedValue(true),
      getAuthContext: jest.fn(),
    } as any;

    securityManager = new TokenSecurityManager(mockPool, mockOAuthManager, {
      enableBackgroundProcessing: false, // Disable for unit tests
    });
  });

  describe('initialization', () => {
    it('should initialize all components', async () => {
      await expect(securityManager.initialize()).resolves.not.toThrow();

      const status = securityManager.getCurrentStatus();
      expect(status.isInitialized).toBe(true);
    });

    it('should shutdown gracefully', async () => {
      await securityManager.initialize();
      await expect(securityManager.shutdown()).resolves.not.toThrow();

      const status = securityManager.getCurrentStatus();
      expect(status.isInitialized).toBe(false);
    });
  });

  describe('token operations integration', () => {
    it('should coordinate token storage and validation', async () => {
      await securityManager.initialize();

      const tokenSet = createMockTokenSet();
      const mockClient = await mockPool.connect();

      // Mock successful storage
      (mockClient.query as jest.Mock)
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT
        .mockResolvedValueOnce(undefined); // COMMIT

      const storeResult = await securityManager.storeUserTokens(
        'test-user',
        tokenSet
      );
      expect(storeResult.success).toBe(true);

      // Mock successful validation
      (mockClient.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 'test-user',
            access_token_hash: await bcrypt.hash(tokenSet.accessToken, 10),
            expires_at: tokenSet.expiresAt.toISOString(),
            scope: tokenSet.scopes,
            subscription_level: 'free',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });

      const validateResult = await securityManager.validateUserToken({
        userId: 'test-user',
        accessToken: tokenSet.accessToken,
      });

      expect(validateResult.valid).toBe(true);
      expect(validateResult.context?.userId).toBe('test-user');
    });

    it('should provide comprehensive security statistics', async () => {
      await securityManager.initialize();

      const stats = securityManager.getSecurityStats();
      expect(stats).toBeDefined();
      expect(stats.tokenOperations).toBeDefined();
      expect(stats.backgroundTasks).toBeDefined();
      expect(stats.validationMetrics).toBeDefined();
      expect(stats.securityEvents).toBeDefined();
    });
  });

  describe('health monitoring', () => {
    it('should perform health checks on all components', async () => {
      await securityManager.initialize();

      const mockClient = await mockPool.connect();
      (mockClient.query as jest.Mock).mockResolvedValue({ rows: [] });

      const healthStatus = await securityManager.performHealthCheck();

      expect(healthStatus.isInitialized).toBe(true);
      expect(healthStatus.lastHealthCheck).toBeDefined();
      expect(healthStatus.componentStatus).toBeDefined();
    });
  });
});

// Integration test helper
describe('End-to-End Token Security Integration', () => {
  let mockPool: Pool;
  let oauthManager: OAuthManager;
  let securityManager: TokenSecurityManager;

  beforeAll(async () => {
    mockPool = createMockPool();
    oauthManager = new OAuthManager(mockPool);
    securityManager = new TokenSecurityManager(mockPool, oauthManager, {
      enableBackgroundProcessing: false,
    });

    await securityManager.initialize();
  });

  afterAll(async () => {
    await securityManager.shutdown();
  });

  it('should handle complete token lifecycle', async () => {
    const userId = 'integration-test-user';
    const tokenSet = createMockTokenSet({ userId });

    const mockClient = await mockPool.connect();

    // Mock token storage
    (mockClient.query as jest.Mock)
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT
      .mockResolvedValueOnce(undefined); // COMMIT

    // Store tokens
    const storeResult = await securityManager.storeUserTokens(userId, tokenSet);
    expect(storeResult.success).toBe(true);

    // Mock token validation
    (mockClient.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          user_id: userId,
          access_token_hash: await bcrypt.hash(tokenSet.accessToken, 10),
          expires_at: tokenSet.expiresAt.toISOString(),
          scope: tokenSet.scopes,
          subscription_level: 'free',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });

    // Validate tokens
    const validateResult = await securityManager.validateUserToken({
      userId,
      accessToken: tokenSet.accessToken,
      requiredScopes: ['content:read'],
    });

    expect(validateResult.valid).toBe(true);
    expect(validateResult.context?.userId).toBe(userId);
    expect(validateResult.context?.scopes).toContain('content:read');
  });
});
