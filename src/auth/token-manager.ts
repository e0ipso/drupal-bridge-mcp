/**
 * Token management system with AES-256 encryption and automatic refresh
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import jwt from 'jsonwebtoken';
import { CryptoUtils } from './crypto-utils.js';
import { OAuthTokens, OAuthClient } from './oauth-client.js';

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
 * Secure token manager with encryption and automatic refresh
 */
export class TokenManager {
  private readonly tokenDir: string;
  private readonly tokenFile: string;
  private encryptionKey: Buffer;
  private oauthClient: OAuthClient;

  constructor(oauthClient: OAuthClient, userId?: string) {
    this.oauthClient = oauthClient;
    this.tokenDir = join(homedir(), '.drupalizeme-mcp');
    
    // Generate encryption key based on user ID or create fingerprint
    const actualUserId = userId || CryptoUtils.createUserFingerprint();
    this.encryptionKey = CryptoUtils.generateEncryptionKey(actualUserId);
    
    // Use user-specific file to prevent conflicts
    const userHash = CryptoUtils.hash(actualUserId).substring(0, 8);
    this.tokenFile = join(this.tokenDir, `tokens_${userHash}.json`);
  }

  /**
   * Store tokens securely with encryption
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

      const encryptedData = CryptoUtils.encrypt(
        JSON.stringify(storedTokens),
        this.encryptionKey
      );

      await fs.writeFile(
        this.tokenFile,
        JSON.stringify({
          version: '1.0',
          data: encryptedData,
          timestamp: Date.now(),
        }),
        { mode: 0o600 }
      ); // Owner read/write only
    } catch (error) {
      throw new Error(
        `Failed to store tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve and decrypt stored tokens
   */
  async getTokens(userId?: string): Promise<StoredTokens | null> {
    try {
      const fileContent = await fs.readFile(this.tokenFile, 'utf8');
      const tokenFile = JSON.parse(fileContent);

      const decryptedData = CryptoUtils.decrypt(
        tokenFile.data,
        this.encryptionKey
      );
      const tokens: StoredTokens = JSON.parse(decryptedData);

      // Validate user ID if provided
      if (userId && tokens.userId !== userId) {
        return null;
      }

      return tokens;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw new Error(
        `Failed to retrieve tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
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

    // Try to refresh if token is expired but we have a refresh token
    if (validation.needsRefresh && tokens.refreshToken) {
      try {
        const refreshedTokens = await this.oauthClient.refreshToken(
          tokens.refreshToken
        );

        // Store refreshed tokens
        await this.storeTokens(refreshedTokens, tokens.userId, tokens.scopes);

        return refreshedTokens.accessToken;
      } catch (error) {
        // Refresh failed - tokens are invalid
        await this.clearTokens();
        return null;
      }
    }

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
      const decoded = jwt.decode(accessToken) as any;

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
        scopes: decoded.scope ? decoded.scope.split(' ') : [],
        userId: decoded.sub,
      };
    } catch (error) {
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
    } catch (error) {
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
      // Ignore if file doesn't exist
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
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
      if ((error as any).code !== 'EEXIST') {
        throw error;
      }
    }
  }
}
