/**
 * JWT Decoder Utility for User ID Extraction
 *
 * Provides lightweight JWT token decoding without verification.
 * Used to extract user IDs from OAuth access tokens for session-to-user mapping.
 */

export interface JwtClaims {
  sub?: string; // Subject (standard JWT claim)
  user_id?: string; // Custom user ID claim
  uid?: string; // Alternative user ID claim
  exp?: number; // Expiration timestamp
  iat?: number; // Issued at timestamp
  [key: string]: any; // Additional claims
}

/**
 * Decode a JWT token without verification
 * @param token - JWT token string
 * @returns Decoded payload as object
 * @throws Error if token is malformed
 */
export function decodeJwt(token: string): Record<string, any> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format: expected 3 parts');
    }

    const payload = parts[1];
    if (!payload) {
      throw new Error('Invalid JWT format: missing payload');
    }

    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
  } catch (error) {
    throw new Error(
      `JWT decoding failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Extract user ID from JWT token
 * Checks multiple standard claims: sub, user_id, uid
 * @param token - OAuth access token (JWT)
 * @returns User ID string
 * @throws Error if user ID cannot be extracted
 */
export function extractUserId(token: string): string {
  try {
    const claims = decodeJwt(token);

    // Check standard JWT claims in order of priority
    const userId = claims.sub || claims.user_id || claims.uid;

    if (!userId) {
      throw new Error(
        'No user ID found in token claims (checked sub, user_id, uid)'
      );
    }

    return String(userId);
  } catch (error) {
    throw new Error(
      `User ID extraction failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
