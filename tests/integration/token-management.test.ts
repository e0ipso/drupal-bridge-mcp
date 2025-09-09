/**
 * Token management and security integration tests
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import jwt from 'jsonwebtoken';
import { TokenManager, StoredTokens } from '../../src/auth/token-manager.js';
import { OAuthClient, OAuthTokens } from '../../src/auth/oauth-client.js';
// CryptoUtils removed for MVP simplification
// import { CryptoUtils } from '../../src/auth/crypto-utils.js';

describe('Token Management Integration Tests', () => {
  let tokenManager: TokenManager;
  let oauthClient: OAuthClient;
  let testTokenDir: string;
  let originalHomedir: string;

  const createMockJWT = (payload: any, expiresIn: string = '1h'): string => {
    // Don't pass expiresIn if payload already has exp
    const options = payload.exp ? {} : { expiresIn };
    return jwt.sign(payload, 'test-secret', options);
  };

  beforeAll(() => {
    // Mock homedir for testing
    originalHomedir = process.env.HOME || '';
    testTokenDir = join(tmpdir(), 'drupalizeme-test-tokens');
    process.env.HOME = tmpdir();

    oauthClient = new OAuthClient({
      clientId: 'test-client-id',
      authorizationEndpoint: 'http://localhost/oauth/authorize',
      tokenEndpoint: 'http://localhost/oauth/token',
      redirectUri: 'http://127.0.0.1:3000/callback',
      scopes: ['tutorial:read', 'user:profile'],
    });

    tokenManager = new TokenManager(oauthClient, 'test-user');
  });

  afterAll(() => {
    process.env.HOME = originalHomedir;
  });

  beforeEach(async () => {
    // Clean up test tokens before each test
    try {
      await fs.rm(join(tmpdir(), '.drupalizeme-mcp'), {
        recursive: true,
        force: true,
      });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  afterEach(async () => {
    // Clean up test tokens after each test
    try {
      await fs.rm(join(tmpdir(), '.drupalizeme-mcp'), {
        recursive: true,
        force: true,
      });
    } catch {
      // Ignore if directory doesn't exist
    }
  });

  describe('Token Storage Security', () => {
    test('should store tokens in plain JSON format (MVP simplified)', async () => {
      // Create a fresh token manager for this specific test
      const testTokenManager = new TokenManager(oauthClient, 'plain-test-user');
      
      const mockTokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read user:profile',
      };

      await testTokenManager.storeTokens(mockTokens, 'plain-test-user', [
        'tutorial:read',
      ]);

      // Read raw file content - use the specific token file for this user
      const tokenFile = (testTokenManager as any).tokenFile;
      const rawContent = await fs.readFile(tokenFile, 'utf8');
      const tokenData = JSON.parse(rawContent);

      // Verify tokens are stored in plain JSON format (MVP simplified)
      expect(rawContent).toContain(mockTokens.accessToken);
      expect(rawContent).toContain(mockTokens.refreshToken);
      expect(tokenData.accessToken).toBe(mockTokens.accessToken);
      expect(tokenData.refreshToken).toBe(mockTokens.refreshToken);
      expect(tokenData.userId).toBe('plain-test-user');
    });

    test('should retrieve tokens correctly (MVP simplified)', async () => {
      const mockTokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'tutorial:read user:profile',
      };

      await tokenManager.storeTokens(mockTokens, 'test-user', [
        'tutorial:read',
      ]);
      const retrievedTokens = await tokenManager.getTokens('test-user');

      expect(retrievedTokens).toBeDefined();
      expect(retrievedTokens!.accessToken).toBe(mockTokens.accessToken);
      expect(retrievedTokens!.refreshToken).toBe(mockTokens.refreshToken);
      expect(retrievedTokens!.tokenType).toBe(mockTokens.tokenType);
      expect(retrievedTokens!.userId).toBe('test-user');
    });

    test('should fail to decrypt with wrong user', async () => {
      const mockTokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      await tokenManager.storeTokens(mockTokens, 'user1', ['tutorial:read']);

      // Different user should not be able to access tokens
      const retrievedTokens = await tokenManager.getTokens('user2');
      expect(retrievedTokens).toBeNull();
    });

    test('should secure file permissions', async () => {
      const mockTokens: OAuthTokens = {
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      await tokenManager.storeTokens(mockTokens, 'test-user', [
        'tutorial:read',
      ]);

      const tokenDir = (tokenManager as any).tokenDir;
      
      try {
        // Check directory permissions (owner only)
        const dirStats = await fs.stat(tokenDir);
        const dirMode = dirStats.mode & parseInt('777', 8);
        expect(dirMode).toBe(parseInt('700', 8)); // Owner read/write/execute only

        // Find the actual token file and check file permissions (owner only)
        const files = await fs.readdir(tokenDir);
        const tokenFile = join(tokenDir, files.find(f => f.startsWith('tokens_')) || 'tokens.json');
        const fileStats = await fs.stat(tokenFile);
        const fileMode = fileStats.mode & parseInt('777', 8);
        expect(fileMode).toBe(parseInt('600', 8)); // Owner read/write only
      } catch (error) {
        throw new Error(`File permissions test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  });

  describe('JWT Token Validation', () => {
    test('should validate JWT structure and expiration', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        scope: 'tutorial:read user:profile',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const mockToken = createMockJWT(mockPayload);
      const validation = await tokenManager.validateToken(mockToken);

      expect(validation.isValid).toBe(true);
      expect(validation.isExpired).toBe(false);
      expect(validation.needsRefresh).toBe(false);
      expect(validation.scopes).toEqual(['tutorial:read', 'user:profile']);
      expect(validation.userId).toBe('test-user-id');
    });

    test('should detect expired tokens', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        scope: 'tutorial:read user:profile',
        iat: Math.floor(Date.now() / 1000) - 7200, // 2 hours ago
        exp: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      const mockToken = createMockJWT(mockPayload);
      const validation = await tokenManager.validateToken(mockToken);

      expect(validation.isValid).toBe(false);
      expect(validation.isExpired).toBe(true);
      expect(validation.needsRefresh).toBe(true);
    });

    test('should detect tokens needing refresh (5-minute buffer)', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        scope: 'tutorial:read user:profile',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 240, // Expires in 4 minutes
      };

      const mockToken = createMockJWT(mockPayload);
      const validation = await tokenManager.validateToken(mockToken);

      expect(validation.isValid).toBe(true);
      expect(validation.isExpired).toBe(false);
      expect(validation.needsRefresh).toBe(true); // Should refresh within 5 minutes
    });

    test('should validate required scopes', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        scope: 'tutorial:read',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const mockToken = createMockJWT(mockPayload);

      // Valid with required scopes
      const validValidation = await tokenManager.validateToken(mockToken, [
        'tutorial:read',
      ]);
      expect(validValidation.isValid).toBe(true);

      // Invalid with missing scopes
      const invalidValidation = await tokenManager.validateToken(mockToken, [
        'tutorial:read',
        'tutorial:write',
      ]);
      expect(invalidValidation.isValid).toBe(false);
    });
  });

  describe('Automatic Token Refresh', () => {
    test('should refresh token automatically when expired', async () => {
      // Create expired token
      const expiredToken: OAuthTokens = {
        accessToken: createMockJWT({
          sub: 'test-user',
          exp: Math.floor(Date.now() / 1000) - 3600,
        }),
        refreshToken: 'test-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 1,
      };

      // Mock successful refresh
      const newTokens: OAuthTokens = {
        accessToken: createMockJWT({
          sub: 'test-user',
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      jest.spyOn(oauthClient, 'refreshToken').mockResolvedValue(newTokens);

      await tokenManager.storeTokens(expiredToken, 'test-user', [
        'tutorial:read',
      ]);

      const validToken = await tokenManager.getValidAccessToken('test-user');

      expect(validToken).toBe(newTokens.accessToken);
      expect(oauthClient.refreshToken).toHaveBeenCalledWith(
        'test-refresh-token'
      );
    });

    test('should clear tokens when refresh fails', async () => {
      const expiredToken: OAuthTokens = {
        accessToken: createMockJWT({
          sub: 'test-user',
          exp: Math.floor(Date.now() / 1000) - 3600,
        }),
        refreshToken: 'invalid-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 1,
      };

      // Mock failed refresh
      jest
        .spyOn(oauthClient, 'refreshToken')
        .mockRejectedValue(new Error('Refresh failed'));

      await tokenManager.storeTokens(expiredToken, 'test-user', [
        'tutorial:read',
      ]);

      const validToken = await tokenManager.getValidAccessToken('test-user');

      expect(validToken).toBeNull();

      // Verify tokens were cleared
      const tokens = await tokenManager.getTokens('test-user');
      expect(tokens).toBeNull();
    });
  });

  // Cryptographic Utilities tests disabled for MVP simplification
  /*
  describe('Cryptographic Utilities', () => {
    test('should encrypt and decrypt data correctly', () => {
      const testData = 'sensitive-data-12345';
      const key = CryptoUtils.generateEncryptionKey('test-user');

      const encrypted = CryptoUtils.encrypt(testData, key);
      const decrypted = CryptoUtils.decrypt(encrypted, key);

      expect(decrypted).toBe(testData);
      expect(encrypted).not.toContain(testData);
    });

    test('should fail decryption with wrong key', () => {
      const testData = 'sensitive-data-12345';
      const key1 = CryptoUtils.generateEncryptionKey('user1');
      const key2 = CryptoUtils.generateEncryptionKey('user2');

      const encrypted = CryptoUtils.encrypt(testData, key1);

      expect(() => {
        CryptoUtils.decrypt(encrypted, key2);
      }).toThrow('Decryption failed');
    });

    test('should generate unique encryption keys for different users', () => {
      const key1 = CryptoUtils.generateEncryptionKey('user1');
      const key2 = CryptoUtils.generateEncryptionKey('user2');

      expect(key1).not.toEqual(key2);
      expect(key1.length).toBe(32); // 256 bits
      expect(key2.length).toBe(32); // 256 bits
    });

    test('should create secure user fingerprints', async () => {
      const fingerprint1 = CryptoUtils.createUserFingerprint();
      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));
      const fingerprint2 = CryptoUtils.createUserFingerprint();

      expect(fingerprint1).toBeDefined();
      expect(fingerprint2).toBeDefined();
      expect(fingerprint1.length).toBe(16);
      expect(fingerprint2.length).toBe(16);
      // Fingerprints should be different due to timestamp
      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });
  */

  describe('Token Isolation', () => {
    test('should isolate tokens between users', async () => {
      const tokens1: OAuthTokens = {
        accessToken: 'user1-access-token',
        refreshToken: 'user1-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      const tokens2: OAuthTokens = {
        accessToken: 'user2-access-token',
        refreshToken: 'user2-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      const tokenManager1 = new TokenManager(oauthClient, 'user1');
      const tokenManager2 = new TokenManager(oauthClient, 'user2');

      await tokenManager1.storeTokens(tokens1, 'user1', ['tutorial:read']);
      await tokenManager2.storeTokens(tokens2, 'user2', ['tutorial:read']);

      const retrieved1 = await tokenManager1.getTokens('user1');
      const retrieved2 = await tokenManager2.getTokens('user2');

      expect(retrieved1!.accessToken).toBe(tokens1.accessToken);
      expect(retrieved2!.accessToken).toBe(tokens2.accessToken);

      // User1 cannot access User2's tokens
      const crossAccess = await tokenManager1.getTokens('user2');
      expect(crossAccess).toBeNull();
    });
  });
});
