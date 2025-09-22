/**
 * Simplified token management system for MVP - file-based storage without encryption
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import type { OAuthTokens } from '@/types/domain-types.js';

export interface StoredTokens extends OAuthTokens {
  expiresAt?: number;
  userId: string;
  scopes: string[];
  refreshExpiresAt?: number;
}

export interface TokenValidationResult {
  isValid: boolean;
  isExpired: boolean;
  needsRefresh: boolean;
  scopes?: string[];
  userId?: string;
}

/**
 * Simplified token manager for MVP - file-based storage without encryption
 */
export class TokenManager {
  private readonly tokenDir: string;
  private readonly tokenFile: string;
  private readonly userId: string;
  constructor(userId?: string) {
    this.tokenDir = join(homedir(), '.drupal-bridge-mcp');

    // Create user fingerprint for file naming
    this.userId = userId || this.createUserFingerprint();
    const userHash = this.hash(this.userId).substring(0, 8);
    this.tokenFile = join(this.tokenDir, `tokens_${userHash}.json`);
  }

  /**
   * Store tokens in simple file format (MVP - no encryption)
   */
  async storeTokens(
    tokens: OAuthTokens,
    userId: string,
    scopes: string[] = []
  ): Promise<void> {
    try {
      await this.ensureTokenDirectory();

      const storedTokens: StoredTokens = {
        ...tokens,
        userId,
        scopes,
        expiresAt: tokens.expiresIn
          ? Date.now() + tokens.expiresIn * 1000
          : undefined,
        // Assume refresh token expires in 30 days if not specified
        refreshExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      };

      // TODO: Add encryption for production deployment
      await fs.writeFile(
        this.tokenFile,
        JSON.stringify(storedTokens, null, 2),
        { mode: 0o600 }
      ); // Owner read/write only
    } catch (error) {
      throw new Error(
        `Failed to store tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve stored tokens from simple file format
   */
  async getTokens(userId?: string): Promise<StoredTokens | null> {
    try {
      const fileContent = await fs.readFile(this.tokenFile, 'utf8');
      const tokens: StoredTokens = JSON.parse(fileContent);

      // Validate user ID if provided
      if (userId && tokens.userId !== userId) {
        return null;
      }

      return tokens;
    } catch (error) {
      // Check for file not found error (ENOENT)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null; // File doesn't exist
      }

      // Handle JSON parsing errors - treat as if file doesn't exist
      if (error instanceof SyntaxError) {
        return null;
      }

      throw new Error(
        `Failed to retrieve tokens: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidAccessToken(
    userId?: string,
    requiredScopes?: string[]
  ): Promise<string | null> {
    const tokens = await this.getTokens(userId);
    if (!tokens) {
      return null;
    }

    const validation = await this.validateToken(
      tokens.accessToken,
      requiredScopes
    );

    if (validation.isValid && !validation.needsRefresh) {
      return tokens.accessToken;
    }

    // Note: Token refresh functionality removed with legacy OAuth client
    // Applications should handle token refresh using the new McpOAuthProvider

    return null;
  }

  /**
   * Validate JWT access token
   */
  async validateToken(
    accessToken: string,
    requiredScopes?: string[]
  ): Promise<TokenValidationResult> {
    try {
      // Decode JWT without verification to get basic info
      const decoded = jwt.decode(accessToken) as jwt.JwtPayload | null;

      if (!decoded || typeof decoded !== 'object') {
        return { isValid: false, isExpired: true, needsRefresh: true };
      }

      const now = Math.floor(Date.now() / 1000);
      const exp = decoded.exp || 0;
      const isExpired = exp <= now;

      // Check if token expires within 5 minutes (refresh buffer)
      const needsRefresh = exp <= now + 300; // 5 minutes

      // Validate scopes if required
      let scopesValid = true;
      if (requiredScopes && requiredScopes.length > 0) {
        const tokenScopes = decoded.scope ? decoded.scope.split(' ') : [];
        scopesValid = requiredScopes.every(scope =>
          tokenScopes.includes(scope)
        );
      }

      return {
        isValid: !isExpired && scopesValid,
        isExpired,
        needsRefresh,
        scopes:
          typeof decoded.scope === 'string' ? decoded.scope.split(' ') : [],
        userId: decoded.sub as string,
      };
    } catch {
      return { isValid: false, isExpired: true, needsRefresh: true };
    }
  }

  /**
   * Validate token signature against Drupal's public key
   */
  async validateTokenSignature(
    accessToken: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      jwt.verify(accessToken, publicKey, {
        algorithms: ['RS256'],
        issuer: process.env.DRUPAL_BASE_URL,
        audience: process.env.OAUTH_CLIENT_ID,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear stored tokens
   */
  async clearTokens(): Promise<void> {
    try {
      await fs.unlink(this.tokenFile);
    } catch (error) {
      // Ignore if file doesn't exist - check for ENOENT code directly since instanceof Error might fail in Node.js
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        // File doesn't exist, which is fine for clearing tokens
        return;
      }

      // Re-throw any other errors
      throw error;
    }
  }

  /**
   * Check if user has valid tokens
   */
  async hasValidTokens(
    userId?: string,
    requiredScopes?: string[]
  ): Promise<boolean> {
    const accessToken = await this.getValidAccessToken(userId, requiredScopes);
    return accessToken !== null;
  }

  /**
   * Get token info without revealing the token value
   */
  async getTokenInfo(userId?: string): Promise<{
    hasTokens: boolean;
    expiresAt?: number;
    scopes?: string[];
    userId?: string;
    isExpired?: boolean;
    needsRefresh?: boolean;
  } | null> {
    const tokens = await this.getTokens(userId);
    if (!tokens) {
      return { hasTokens: false };
    }

    const validation = await this.validateToken(tokens.accessToken);

    return {
      hasTokens: true,
      expiresAt: tokens.expiresAt,
      scopes: tokens.scopes,
      userId: tokens.userId,
      isExpired: validation.isExpired,
      needsRefresh: validation.needsRefresh,
    };
  }

  /**
   * Ensure token directory exists with proper permissions
   */
  private async ensureTokenDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.tokenDir, { recursive: true, mode: 0o700 }); // Owner access only
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          (error as NodeJS.ErrnoException).code === 'EEXIST'
        )
      ) {
        throw error;
      }
    }
  }

  /**
   * Create secure fingerprint for user identification (simplified from CryptoUtils)
   */
  private createUserFingerprint(): string {
    const hostname = process.env.HOSTNAME || 'unknown';
    const username = process.env.USER || process.env.USERNAME || 'unknown';
    const timestamp = Date.now().toString();
    return this.hash(`${hostname}:${username}:${timestamp}`).substring(0, 16);
  }

  /**
   * Hash data using SHA-256 (simplified from CryptoUtils)
   */
  private hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }
}
