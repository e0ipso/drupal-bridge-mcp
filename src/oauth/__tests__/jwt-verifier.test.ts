import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

// Mock jose module BEFORE importing jwt-verifier
jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn(),
}));

// Now import after mocking
import { verifyJWT } from '../jwt-verifier.js';
import * as jose from 'jose';

// Get typed mock references
const mockJwtVerify = jest.mocked(jose.jwtVerify);
const mockCreateRemoteJWKSet = jest.mocked(jose.createRemoteJWKSet);

describe('JWT Verifier', () => {
  const mockMetadata: OAuthMetadata = {
    issuer: 'https://drupal.test',
    jwks_uri: 'https://drupal.test/oauth/jwks',
    authorization_endpoint: 'https://drupal.test/oauth/authorize',
    token_endpoint: 'https://drupal.test/oauth/token',
    response_types_supported: ['code'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyJWT', () => {
    it('should verify valid JWT and return payload', async () => {
      const mockPayload = {
        sub: 'user-123',
        client_id: 'test-client',
        scope: 'read write',
        iss: 'https://drupal.test',
        exp: 1735689600,
        iat: 1735603200,
      };

      const mockJWKS = {} as any;
      mockCreateRemoteJWKSet.mockReturnValueOnce(mockJWKS);
      mockJwtVerify.mockResolvedValueOnce({
        payload: mockPayload,
        protectedHeader: { alg: 'RS256' },
      } as any);

      const result = await verifyJWT('valid.jwt.token', mockMetadata);

      expect(result).toEqual(mockPayload);
      expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
        new URL('https://drupal.test/oauth/jwks')
      );
      // Should try with issuer validation first
      expect(mockJwtVerify).toHaveBeenCalledWith('valid.jwt.token', mockJWKS, {
        issuer: 'https://drupal.test',
      });
    });

    it('should verify JWT with complex payload including scopes and client metadata', async () => {
      const mockPayload = {
        sub: 'user-456',
        client_id: 'drupal-mcp-client',
        scope: 'read write admin',
        aud: 'https://drupal.test',
        iss: 'https://drupal.test',
        exp: 1735689600,
        iat: 1735603200,
        jti: 'unique-token-id',
      };

      mockCreateRemoteJWKSet.mockReturnValueOnce({} as any);
      mockJwtVerify.mockResolvedValueOnce({
        payload: mockPayload,
        protectedHeader: { alg: 'RS256' },
      } as any);

      const result = await verifyJWT('complex.jwt.token', mockMetadata);

      expect(result).toEqual(mockPayload);
      expect(result.client_id).toBe('drupal-mcp-client');
      expect(result.scope).toBe('read write admin');
      expect(result.aud).toBe('https://drupal.test');
    });

    it('should throw error when jwks_uri is missing', async () => {
      const metadataWithoutJWKS = {
        ...mockMetadata,
        jwks_uri: undefined,
      };

      await expect(
        verifyJWT('token', metadataWithoutJWKS as any)
      ).rejects.toThrow('JWKS URI not available in OAuth metadata');

      expect(mockCreateRemoteJWKSet).not.toHaveBeenCalled();
      expect(mockJwtVerify).not.toHaveBeenCalled();
    });

    it('should throw error when jwks_uri is not a string', async () => {
      const metadataWithInvalidJWKS = {
        ...mockMetadata,
        jwks_uri: 12345,
      };

      await expect(
        verifyJWT('token', metadataWithInvalidJWKS as any)
      ).rejects.toThrow('JWKS URI not available in OAuth metadata');

      expect(mockCreateRemoteJWKSet).not.toHaveBeenCalled();
      expect(mockJwtVerify).not.toHaveBeenCalled();
    });

    it('should throw error when jwks_uri is empty string', async () => {
      const metadataWithEmptyJWKS = {
        ...mockMetadata,
        jwks_uri: '',
      };

      await expect(
        verifyJWT('token', metadataWithEmptyJWKS as any)
      ).rejects.toThrow('JWKS URI not available in OAuth metadata');

      expect(mockCreateRemoteJWKSet).not.toHaveBeenCalled();
      expect(mockJwtVerify).not.toHaveBeenCalled();
    });

    it('should propagate verification errors from jwtVerify', async () => {
      mockCreateRemoteJWKSet.mockReturnValueOnce({} as any);
      mockJwtVerify.mockRejectedValueOnce(new Error('Invalid signature'));

      await expect(verifyJWT('invalid.token', mockMetadata)).rejects.toThrow(
        'Invalid signature'
      );

      expect(mockCreateRemoteJWKSet).toHaveBeenCalled();
      expect(mockJwtVerify).toHaveBeenCalled();
    });

    it('should propagate JWT expired errors', async () => {
      mockCreateRemoteJWKSet.mockReturnValueOnce({} as any);
      mockJwtVerify.mockRejectedValueOnce(new Error('JWT has expired'));

      await expect(verifyJWT('expired.token', mockMetadata)).rejects.toThrow(
        'JWT has expired'
      );
    });

    it('should propagate issuer mismatch errors', async () => {
      mockCreateRemoteJWKSet.mockReturnValueOnce({} as any);
      mockJwtVerify.mockRejectedValueOnce(
        new Error('JWT issuer invalid. Expected https://drupal.test')
      );

      await expect(
        verifyJWT('wrong.issuer.token', mockMetadata)
      ).rejects.toThrow('JWT issuer invalid. Expected https://drupal.test');
    });

    it('should throw error when issuer validation fails', async () => {
      const customMetadata: OAuthMetadata = {
        ...mockMetadata,
        issuer: 'https://custom-drupal.example.com',
        jwks_uri: 'https://custom-drupal.example.com/oauth/jwks',
      };

      const mockJWKS = {} as any;
      mockCreateRemoteJWKSet.mockReturnValueOnce(mockJWKS);

      // Issuer validation fails
      mockJwtVerify.mockRejectedValueOnce(
        new Error('missing required "iss" claim')
      );

      await expect(verifyJWT('token', customMetadata)).rejects.toThrow(
        'missing required "iss" claim'
      );

      // Should only try once with issuer validation
      expect(mockJwtVerify).toHaveBeenCalledTimes(1);
      expect(mockJwtVerify).toHaveBeenCalledWith('token', mockJWKS, {
        issuer: 'https://custom-drupal.example.com',
      });
    });

    it('should create JWKS from metadata jwks_uri', async () => {
      const customMetadata: OAuthMetadata = {
        ...mockMetadata,
        jwks_uri: 'https://another-server.com/.well-known/jwks.json',
      };

      mockCreateRemoteJWKSet.mockReturnValueOnce({} as any);
      mockJwtVerify.mockResolvedValueOnce({
        payload: { sub: 'test' },
        protectedHeader: { alg: 'RS256' },
      } as any);

      await verifyJWT('token', customMetadata);

      expect(mockCreateRemoteJWKSet).toHaveBeenCalledWith(
        new URL('https://another-server.com/.well-known/jwks.json')
      );
    });

    it('should handle JWKS endpoint network errors', async () => {
      mockCreateRemoteJWKSet.mockImplementation(() => {
        throw new Error('Network error: Unable to fetch JWKS');
      });

      await expect(verifyJWT('token', mockMetadata)).rejects.toThrow(
        'Network error: Unable to fetch JWKS'
      );
    });

    it('should return full payload including custom claims', async () => {
      const mockPayload = {
        sub: 'user-999',
        client_id: 'test-client',
        scope: 'openid profile',
        custom_claim: 'custom_value',
        roles: ['admin', 'editor'],
        metadata: { department: 'engineering' },
      };

      mockCreateRemoteJWKSet.mockReturnValueOnce({} as any);
      mockJwtVerify.mockResolvedValueOnce({
        payload: mockPayload,
        protectedHeader: { alg: 'RS256' },
      } as any);

      const result = await verifyJWT('token.with.custom.claims', mockMetadata);

      expect(result).toEqual(mockPayload);
      expect(result.custom_claim).toBe('custom_value');
      expect(result.roles).toEqual(['admin', 'editor']);
      expect(result.metadata).toEqual({ department: 'engineering' });
    });
  });
});
