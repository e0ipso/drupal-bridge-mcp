/**
 * Device Flow Handler
 *
 * Implements RFC 8628 Device Authorization Grant flow for headless environments
 */

import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthConfig } from './config.js';
import type {
  DeviceAuthResponse,
  OAuthErrorResponse,
} from './device-flow-types.js';

/**
 * Extended OAuth metadata that includes device authorization endpoint
 * RFC 8628 Section 4
 */
export interface ExtendedOAuthMetadata extends OAuthMetadata {
  device_authorization_endpoint?: string;
}

/**
 * Handles device authorization flow initiation
 */
export class DeviceFlowHandler {
  private readonly config: OAuthConfig;
  private readonly metadata: ExtendedOAuthMetadata;

  constructor(config: OAuthConfig, metadata: OAuthMetadata) {
    this.config = config;
    this.metadata = metadata;
  }

  /**
   * Initiates the device authorization flow
   * @returns {Promise<DeviceAuthResponse>} Device authorization response
   * @throws {Error} If device authorization fails
   */
  async initiateDeviceFlow(): Promise<DeviceAuthResponse> {
    // Get device authorization endpoint
    const deviceAuthEndpoint = this.metadata.device_authorization_endpoint;

    if (!deviceAuthEndpoint) {
      throw new Error(
        'Device authorization endpoint not available in OAuth metadata. ' +
          'The Drupal OAuth server may not support RFC 8628 device flow.'
      );
    }

    // Prepare request parameters
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      scope: this.config.scopes.join(' '),
    });

    try {
      const response = await fetch(deviceAuthEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Device authorization failed: ${response.status} ${response.statusText}`;

        try {
          const errorJson: OAuthErrorResponse = JSON.parse(errorText);
          if (errorJson.error) {
            errorMessage = `Device authorization failed: ${errorJson.error}`;
            if (errorJson.error_description) {
              errorMessage += ` - ${errorJson.error_description}`;
            }
          }
        } catch {
          // If not JSON, append the text
          if (errorText) {
            errorMessage += ` - ${errorText}`;
          }
        }

        throw new Error(errorMessage);
      }

      const deviceAuth: DeviceAuthResponse = await response.json();

      // Validate required fields per RFC 8628
      if (!deviceAuth.device_code) {
        throw new Error(
          'Invalid device authorization response - missing device_code'
        );
      }

      if (!deviceAuth.user_code) {
        throw new Error(
          'Invalid device authorization response - missing user_code'
        );
      }

      if (!deviceAuth.verification_uri) {
        throw new Error(
          'Invalid device authorization response - missing verification_uri'
        );
      }

      if (!deviceAuth.expires_in) {
        throw new Error(
          'Invalid device authorization response - missing expires_in'
        );
      }

      // Default interval to 5 seconds if not provided
      if (!deviceAuth.interval) {
        deviceAuth.interval = 5;
      }

      return deviceAuth;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to initiate device flow: ${error.message}`);
      }
      throw new Error('Failed to initiate device flow: Unknown error');
    }
  }
}
