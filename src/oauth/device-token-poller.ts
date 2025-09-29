/**
 * Device Token Poller
 *
 * Implements token polling with exponential backoff for RFC 8628 device flow
 */

import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthConfig } from './config.js';
import type { TokenResponse, OAuthErrorResponse } from './device-flow-types.js';
import { DeviceAuthUI } from './device-flow-ui.js';

/**
 * Polls the token endpoint for device authorization completion
 */
export class DeviceTokenPoller {
  private readonly config: OAuthConfig;
  private readonly metadata: OAuthMetadata;

  constructor(config: OAuthConfig, metadata: OAuthMetadata) {
    this.config = config;
    this.metadata = metadata;
  }

  /**
   * Polls for token until authorization is complete or timeout
   * @param {string} deviceCode Device code from authorization response
   * @param {number} interval Polling interval in seconds
   * @param {number} expiresIn Expiration time in seconds
   * @returns {Promise<TokenResponse>} Token response
   * @throws {Error} If polling fails or times out
   */
  async pollForToken(
    deviceCode: string,
    interval: number,
    expiresIn: number
  ): Promise<TokenResponse> {
    const tokenEndpoint = this.metadata.token_endpoint;
    const startTime = Date.now();
    const expiryTime = startTime + expiresIn * 1000;
    let attempt = 0;
    let currentInterval = interval;

    while (Date.now() < expiryTime) {
      attempt++;
      DeviceAuthUI.updatePollingStatus(attempt, currentInterval);

      try {
        // Prepare token request parameters
        const params = new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: deviceCode,
          client_id: this.config.clientId,
        });

        // Add client secret if available (for confidential clients)
        if (this.config.clientSecret) {
          params.append('client_secret', this.config.clientSecret);
        }

        const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: params.toString(),
        });

        const result = await response.json();

        if (response.ok) {
          // Success - got the token
          return this.validateTokenResponse(result);
        }

        // Handle OAuth errors per RFC 8628 Section 3.5
        const errorResponse = result as OAuthErrorResponse;
        await this.handleOAuthError(errorResponse, currentInterval);

        // Update interval if slow_down was requested
        if (errorResponse.error === 'slow_down') {
          currentInterval = Math.min(currentInterval + 5, 30);
        }
      } catch (error) {
        // Re-throw terminal errors
        if (error instanceof Error) {
          if (
            error.message.includes('expired') ||
            error.message.includes('denied') ||
            error.message.includes('Device authorization')
          ) {
            throw error;
          }
          // Log transient errors but continue polling
          DeviceAuthUI.displayWarning(
            `Polling error (attempt ${attempt}): ${error.message}`
          );
        }
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, currentInterval * 1000));
    }

    throw new Error('Device code expired - authentication timed out');
  }

  /**
   * Validates the token response
   * @param {unknown} result Token response from server
   * @returns {TokenResponse} Validated token response
   * @throws {Error} If response is invalid
   */
  private validateTokenResponse(result: unknown): TokenResponse {
    const token = result as TokenResponse;

    if (!token.access_token) {
      throw new Error('Invalid token response - missing access_token');
    }

    if (!token.token_type) {
      throw new Error('Invalid token response - missing token_type');
    }

    if (!token.expires_in) {
      throw new Error('Invalid token response - missing expires_in');
    }

    if (!token.scope) {
      token.scope = this.config.scopes.join(' ');
    }

    return token;
  }

  /**
   * Handles OAuth error responses during polling
   * @param {OAuthErrorResponse} errorResponse OAuth error response
   * @param {number} currentInterval Current polling interval
   * @throws {Error} For terminal errors that should stop polling
   */
  private async handleOAuthError(
    errorResponse: OAuthErrorResponse,
    currentInterval: number
  ): Promise<void> {
    const { error, error_description } = errorResponse;

    switch (error) {
      case 'authorization_pending':
        // User hasn't completed authorization yet - continue polling
        break;

      case 'slow_down':
        // Server requests slower polling - increase interval
        DeviceAuthUI.displayWarning(
          `Slowing down polling to ${currentInterval + 5} seconds`
        );
        break;

      case 'expired_token':
        throw new Error(
          'Device code expired. Please restart authentication. ' +
            (error_description || '')
        );

      case 'access_denied':
        throw new Error(
          'Authentication was denied by user. ' + (error_description || '')
        );

      default:
        throw new Error(
          `Device authorization failed: ${error}` +
            (error_description ? ` - ${error_description}` : '')
        );
    }
  }
}
