/**
 * Cryptographic utilities for secure token storage
 */

import { randomBytes, createHash } from 'crypto';
import CryptoJS from 'crypto-js';

/**
 * AES-256 encryption utilities for token storage
 */
export class CryptoUtils {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_SIZE = 32; // 256 bits
  private static readonly IV_SIZE = 16; // 128 bits
  private static readonly TAG_SIZE = 16; // 128 bits

  /**
   * Generate a secure encryption key from user identifier
   */
  static generateEncryptionKey(userId: string, salt?: string): Buffer {
    const actualSalt = salt || 'drupalizeme-mcp-default-salt';
    return createHash('sha256')
      .update(userId + actualSalt)
      .digest();
  }

  /**
   * Encrypt data using AES-256-CBC (simplified approach)
   */
  static encrypt(data: string, key: Buffer): string {
    try {
      const iv = randomBytes(this.IV_SIZE);
      const encrypted = CryptoJS.AES.encrypt(
        data,
        CryptoJS.lib.WordArray.create(key),
        {
          iv: CryptoJS.lib.WordArray.create(iv),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        }
      );

      const encryptedData = encrypted.ciphertext.toString(CryptoJS.enc.Base64);

      // Return format: iv:encrypted (all base64)
      return `${iv.toString('base64')}:${encryptedData}`;
    } catch (error) {
      throw new Error(
        `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Decrypt data using AES-256-CBC
   */
  static decrypt(encryptedData: string, key: Buffer): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivBase64, encryptedBase64] = parts;
      if (!ivBase64 || !encryptedBase64) {
        throw new Error('Missing encryption components');
      }

      const iv = Buffer.from(ivBase64, 'base64');

      const decrypted = CryptoJS.AES.decrypt(
        encryptedBase64,
        CryptoJS.lib.WordArray.create(key),
        {
          iv: CryptoJS.lib.WordArray.create(iv),
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        }
      );

      const result = decrypted.toString(CryptoJS.enc.Utf8);
      if (!result) {
        throw new Error('Decryption failed - invalid key or corrupted data');
      }

      return result;
    } catch (error) {
      throw new Error(
        `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate secure random string for salts and nonces
   */
  static generateSecureRandom(length: number = 32): string {
    return randomBytes(length).toString('base64url');
  }

  /**
   * Hash data using SHA-256
   */
  static hash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify hash matches data
   */
  static verifyHash(data: string, hash: string): boolean {
    return this.hash(data) === hash;
  }

  /**
   * Create secure fingerprint for user identification
   */
  static createUserFingerprint(): string {
    const hostname = process.env.HOSTNAME || 'unknown';
    const username = process.env.USER || process.env.USERNAME || 'unknown';
    const timestamp = Date.now().toString();

    return this.hash(`${hostname}:${username}:${timestamp}`).substring(0, 16);
  }
}
