import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import debugFactory from 'debug';

const debug = debugFactory('mcp:oauth:jwt');

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

  // Try with issuer validation first (most secure)
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: metadata.issuer,
    });
    debug('JWT verified with issuer validation');
    return payload;
  } catch (error) {
    // If issuer validation failed due to missing iss claim, try without it
    // This maintains compatibility with Drupal Simple OAuth default configuration
    if (
      error instanceof Error &&
      error.message.includes('missing required "iss" claim')
    ) {
      debug(
        'JWT missing iss claim - falling back to signature-only verification'
      );
      console.warn(
        '⚠️  JWT token missing issuer (iss) claim. ' +
          'Falling back to signature verification only. ' +
          'For better security, configure Drupal Simple OAuth to include iss claim ' +
          'using the simple_oauth_claims module.'
      );

      // Verify signature only (still secure via JWKS)
      const { payload } = await jwtVerify(token, JWKS);
      return payload;
    }

    // For other errors, provide detailed debugging info
    throw error;
  }
}
