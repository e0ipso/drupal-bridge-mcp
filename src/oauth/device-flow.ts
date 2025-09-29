/**
 * Device Authorization Grant Flow
 *
 * Complete implementation of RFC 8628 Device Authorization Grant flow
 * for headless OAuth authentication
 */

import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthConfig } from './config.js';
import type { DeviceFlowConfig, TokenResponse } from './device-flow-types.js';
import { getDeviceFlowConfig } from './device-flow-types.js';
import { DeviceFlowDetector } from './device-flow-detector.js';
import { DeviceFlowHandler } from './device-flow-handler.js';
import { DeviceTokenPoller } from './device-token-poller.js';
import { DeviceAuthUI } from './device-flow-ui.js';

/**
 * Complete device flow orchestrator
 */
export class DeviceFlow {
  private readonly config: OAuthConfig;
  private readonly metadata: OAuthMetadata;
  private readonly flowConfig: DeviceFlowConfig;

  constructor(
    config: OAuthConfig,
    metadata: OAuthMetadata,
    flowConfig?: DeviceFlowConfig
  ) {
    this.config = config;
    this.metadata = metadata;
    this.flowConfig = flowConfig || getDeviceFlowConfig();
  }

  /**
   * Executes the complete device authorization flow
   * @returns {Promise<TokenResponse>} OAuth tokens
   * @throws {Error} If authentication fails
   */
  async authenticate(): Promise<TokenResponse> {
    let lastError: Error | undefined;

    // Attempt authentication with retries
    for (let attempt = 1; attempt <= this.flowConfig.maxRetries; attempt++) {
      try {
        return await this.attemptAuthentication();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry for certain terminal errors
        if (this.isTerminalError(lastError)) {
          throw lastError;
        }

        // If auto-retry is disabled or this was the last attempt, throw
        if (
          !this.flowConfig.enableAutoRetry ||
          attempt >= this.flowConfig.maxRetries
        ) {
          throw lastError;
        }

        // Display retry message
        DeviceAuthUI.displayWarning(
          `Authentication attempt ${attempt} failed: ${lastError.message}`
        );
        DeviceAuthUI.displayWarning(
          `Retrying... (${attempt + 1}/${this.flowConfig.maxRetries})`
        );

        // Wait before retry
        await new Promise(resolve =>
          setTimeout(resolve, this.flowConfig.baseInterval * 1000)
        );
      }
    }

    // This should never be reached due to the loop logic, but TypeScript needs it
    throw lastError || new Error('Device flow authentication failed');
  }

  /**
   * Attempts a single authentication flow
   * @returns {Promise<TokenResponse>} OAuth tokens
   * @throws {Error} If authentication fails
   */
  private async attemptAuthentication(): Promise<TokenResponse> {
    try {
      // Step 1: Initiate device authorization
      const handler = new DeviceFlowHandler(this.config, this.metadata);
      const deviceAuth = await handler.initiateDeviceFlow();

      // Step 2: Display instructions to user
      DeviceAuthUI.displayAuthInstructions(deviceAuth);

      // Step 3: Poll for token
      const poller = new DeviceTokenPoller(this.config, this.metadata);
      const tokens = await poller.pollForToken(
        deviceAuth.device_code,
        deviceAuth.interval,
        deviceAuth.expires_in
      );

      // Step 4: Display success
      DeviceAuthUI.displaySuccess();

      return tokens;
    } catch (error) {
      // Display error
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      DeviceAuthUI.displayError(errorMessage);
      throw error;
    }
  }

  /**
   * Determines if an error is terminal (should not be retried)
   * @param {Error} error Error to check
   * @returns {boolean} True if error is terminal
   */
  private isTerminalError(error: Error): boolean {
    const terminalMessages = [
      'denied',
      'not available',
      'not support',
      'invalid client',
      'unauthorized_client',
    ];

    const message = error.message.toLowerCase();
    return terminalMessages.some(term => message.includes(term));
  }

  /**
   * Static method to check if device flow should be used
   * @returns {boolean} True if device flow is appropriate
   */
  static shouldUseDeviceFlow(): boolean {
    return DeviceFlowDetector.shouldUseDeviceFlow();
  }

  /**
   * Static method to check if environment is headless
   * @returns {boolean} True if headless environment detected
   */
  static isHeadlessEnvironment(): boolean {
    return DeviceFlowDetector.isHeadlessEnvironment();
  }
}
