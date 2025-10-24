import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Mock } from 'jest-mock';
import type { OAuthConfigManager } from '../config.js';
import type { JWTPayload } from 'jose';

// Mock jwt-verifier module BEFORE importing token-verifier
jest.mock('../jwt-verifier.js', () => ({
  verifyJWT: jest.fn(),
}));

// Now import after mocking
import { DrupalTokenVerifier } from '../token-verifier.js';
import { verifyJWT } from '../jwt-verifier.js';

// Get typed mock reference
const mockVerifyJWT = jest.mocked(verifyJWT);

// Define OAuth metadata shape (not importing to avoid type issues)
interface OAuthMetadata {
  issuer: string;
  jwks_uri?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  response_types_supported: string[];
}

describe('DrupalTokenVerifier', () => {
  let verifier: DrupalTokenVerifier;
  let mockConfigManager: jest.Mocked<OAuthConfigManager>;

  const mockMetadata: OAuthMetadata = {
    issuer: 'https://drupal.test',
    jwks_uri: 'https://drupal.test/oauth/jwks',
    authorization_endpoint: 'https://drupal.test/oauth/authorize',
    token_endpoint: 'https://drupal.test/oauth/token',
    response_types_supported: ['code'],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock config manager
    mockConfigManager = {
      fetchMetadata: jest.fn(),
    } as any;

    // @ts-expect-error - Mock type inference issue with Zod types
    (mockConfigManager.fetchMetadata as Mock).mockResolvedValue(mockMetadata);

    verifier = new DrupalTokenVerifier(mockConfigManager);
  });

  describe('verifyAccessToken', () => {
    it('should return correct AuthInfo for valid JWT with all claims', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'test-client-123',
        scope: 'read write admin',
        aud: 'https://drupal.test',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        sub: 'user-456',
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('valid.jwt.token');

      expect(result).toEqual({
        token: 'valid.jwt.token',
        clientId: 'test-client-123',
        scopes: ['read', 'write', 'admin'],
        expiresAt: mockPayload.exp,
        resource: new URL('https://drupal.test'),
      });

      expect(mockConfigManager.fetchMetadata).toHaveBeenCalledTimes(1);
      expect(mockVerifyJWT).toHaveBeenCalledWith(
        'valid.jwt.token',
        mockMetadata
      );
    });

    it('should handle scope claim as space-separated string', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-1',
        scope: 'mcp:tools mcp:prompts mcp:resources',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.scopes).toEqual([
        'mcp:tools',
        'mcp:prompts',
        'mcp:resources',
      ]);
    });

    it('should handle scope claim with comma separators', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-2',
        scope: 'read,write,delete',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.scopes).toEqual(['read', 'write', 'delete']);
    });

    it('should handle scope claim with mixed separators', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-3',
        scope: 'read write,admin mcp:tools',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.scopes).toEqual(['read', 'write', 'admin', 'mcp:tools']);
    });

    it('should handle missing scope claim with empty array', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-4',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.scopes).toEqual([]);
    });

    it('should handle empty scope claim with empty array', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-5',
        scope: '',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.scopes).toEqual([]);
    });

    it('should filter out empty scope values from multiple spaces', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-6',
        scope: 'read  write   admin',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.scopes).toEqual(['read', 'write', 'admin']);
    });

    it('should use "unknown" as clientId when missing', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        scope: 'read',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.clientId).toBe('unknown');
    });

    it('should handle missing exp claim', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-7',
        scope: 'read',
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.expiresAt).toBeUndefined();
    });

    it('should extract resource from aud claim as string', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-8',
        scope: 'read',
        aud: 'https://api.example.com',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.resource).toEqual(new URL('https://api.example.com'));
    });

    it('should extract resource from aud claim as array (first element)', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-9',
        scope: 'read',
        aud: ['https://primary.example.com', 'https://secondary.example.com'],
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.resource).toEqual(new URL('https://primary.example.com'));
    });

    it('should ignore invalid aud URLs without throwing', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-10',
        scope: 'read',
        aud: 'not-a-valid-url',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.resource).toBeUndefined();
    });

    it('should ignore non-string aud values without throwing', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-11',
        scope: 'read',
        aud: 12345 as any,
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.resource).toBeUndefined();
    });

    it('should handle empty aud array', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-12',
        scope: 'read',
        aud: [],
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken('token');

      expect(result.resource).toBeUndefined();
    });

    it('should throw error when JWT verification fails', async () => {
      mockVerifyJWT.mockRejectedValueOnce(new Error('Invalid signature'));

      await expect(verifier.verifyAccessToken('invalid.token')).rejects.toThrow(
        'Token verification failed: Invalid signature'
      );

      expect(mockConfigManager.fetchMetadata).toHaveBeenCalledTimes(1);
      expect(mockVerifyJWT).toHaveBeenCalledWith('invalid.token', mockMetadata);
    });

    it('should throw error when JWT is expired', async () => {
      mockVerifyJWT.mockRejectedValueOnce(new Error('JWT has expired'));

      await expect(verifier.verifyAccessToken('expired.token')).rejects.toThrow(
        'Token verification failed: JWT has expired'
      );
    });

    it('should throw error when issuer is invalid', async () => {
      mockVerifyJWT.mockRejectedValueOnce(
        new Error('JWT issuer invalid. Expected https://drupal.test')
      );

      await expect(
        verifier.verifyAccessToken('wrong.issuer.token')
      ).rejects.toThrow(
        'Token verification failed: JWT issuer invalid. Expected https://drupal.test'
      );
    });

    it('should throw generic error for unknown verification failures', async () => {
      mockVerifyJWT.mockRejectedValueOnce('String error');

      await expect(verifier.verifyAccessToken('token')).rejects.toThrow(
        'Token verification failed: Unknown error'
      );
    });

    it('should throw error when metadata fetch fails', async () => {
      mockConfigManager.fetchMetadata.mockRejectedValueOnce(
        new Error('Network error')
      );

      await expect(verifier.verifyAccessToken('token')).rejects.toThrow(
        'Token verification failed: Network error'
      );

      expect(mockConfigManager.fetchMetadata).toHaveBeenCalledTimes(1);
      expect(mockVerifyJWT).not.toHaveBeenCalled();
    });

    it('should include original token in AuthInfo', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-13',
        scope: 'read',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const testToken = 'test.jwt.token.with.signature';
      const result = await verifier.verifyAccessToken(testToken);

      expect(result.token).toBe(testToken);
    });

    it('should handle complex real-world JWT payload', async () => {
      const mockPayload: JWTPayload & Record<string, any> = {
        sub: 'user-789',
        client_id: 'drupal-mcp-client',
        scope: 'mcp:tools mcp:prompts',
        aud: ['https://mcp-server.example.com', 'https://backup.example.com'],
        iss: 'https://drupal.test',
        exp: Math.floor(Date.now() / 1000) + 7200,
        iat: Math.floor(Date.now() / 1000),
        nbf: Math.floor(Date.now() / 1000),
        jti: 'unique-token-id-xyz',
        roles: ['authenticated', 'content_editor'],
        department: 'engineering',
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      const result = await verifier.verifyAccessToken(
        'complex.real.world.token'
      );

      expect(result).toEqual({
        token: 'complex.real.world.token',
        clientId: 'drupal-mcp-client',
        scopes: ['mcp:tools', 'mcp:prompts'],
        expiresAt: mockPayload.exp,
        resource: new URL('https://mcp-server.example.com'),
      });
    });

    it('should pass metadata to verifyJWT correctly', async () => {
      const customMetadata: OAuthMetadata = {
        issuer: 'https://custom-drupal.example.com',
        jwks_uri: 'https://custom-drupal.example.com/oauth/jwks',
        authorization_endpoint:
          'https://custom-drupal.example.com/oauth/authorize',
        token_endpoint: 'https://custom-drupal.example.com/oauth/token',
        response_types_supported: ['code'],
      };

      // @ts-expect-error - Mock type inference issue with Zod types
      mockConfigManager.fetchMetadata.mockResolvedValueOnce(customMetadata);

      const mockPayload: JWTPayload & Record<string, any> = {
        client_id: 'client-14',
        scope: 'read',
        exp: Math.floor(Date.now() / 1000) + 1800,
      };

      mockVerifyJWT.mockResolvedValueOnce(mockPayload);

      await verifier.verifyAccessToken('token');

      expect(mockVerifyJWT).toHaveBeenCalledWith('token', customMetadata);
    });
  });
});
