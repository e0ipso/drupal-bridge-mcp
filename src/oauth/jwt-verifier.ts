import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import debugFactory from 'debug';

const _debug = debugFactory('mcp:oauth:jwt');

/**
 * Verifies a JWT access token using Drupal's JWKS endpoint
 * @param token - The JWT access token to verify
 * @param metadata - OAuth metadata containing jwks_uri and issuer
 * @returns The decoded JWT payload
 * @throws Error if verification fails or JWKS URI is missing
 */
export async function verifyJWT(token: string, metadata: OAuthMetadata) {
  const jwksUri = metadata.jwks_uri;
  if (!jwksUri || typeof jwksUri !== 'string') {
    throw new Error('JWKS URI not available in OAuth metadata');
  }

  // Use JWKS endpoint from discovered metadata (not hard-coded)
  const JWKS = createRemoteJWKSet(new URL(jwksUri));

  // Verify with issuer validation (most secure)
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: metadata.issuer,
  });
  return payload;
}
