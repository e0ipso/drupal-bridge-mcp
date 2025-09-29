/**
 * Device Flow User Interface
 *
 * Provides user-friendly console output for device authorization flow
 */

import type { DeviceAuthResponse } from './device-flow-types.js';

/**
 * Console UI for device authentication flow
 */
export class DeviceAuthUI {
  /**
   * Displays authentication instructions to the user
   * @param {DeviceAuthResponse} deviceAuth Device authorization response
   */
  static displayAuthInstructions(deviceAuth: DeviceAuthResponse): void {
    const {
      user_code,
      verification_uri,
      verification_uri_complete,
      expires_in,
    } = deviceAuth;

    // Calculate expiry time in minutes
    const expiryMinutes = Math.floor(expires_in / 60);

    // Display formatted authentication box
    console.log('\n╭──────────────────────────────────────────────────────╮');
    console.log('│              🔐 MCP Server Authentication            │');
    console.log('├──────────────────────────────────────────────────────┤');
    console.log('│                                                      │');
    console.log('│  Please complete authentication in your browser:    │');
    console.log('│                                                      │');

    // Pad the URL to fit the box width
    const urlPadded = verification_uri.padEnd(34);
    const codePadded = user_code.padEnd(34);

    console.log(`│  📱 Visit: ${urlPadded} │`);
    console.log(`│  🔑 Code:  ${codePadded} │`);
    console.log('│                                                      │');

    // Display complete URI if available
    if (verification_uri_complete) {
      console.log('│  Or use this direct link:                           │');
      const completePadded = verification_uri_complete.padEnd(44);
      console.log(`│  🔗 ${completePadded} │`);
      console.log('│                                                      │');
    }

    console.log(
      `│  ⏰ Code expires in ${expiryMinutes} minutes                        │`
    );
    console.log('│                                                      │');
    console.log('│  ⏳ Waiting for authorization...                     │');
    console.log('╰──────────────────────────────────────────────────────╯\n');
  }

  /**
   * Updates polling status with animated dots
   * @param {number} attempt Current polling attempt number
   * @param {number} interval Current polling interval in seconds
   */
  static updatePollingStatus(attempt: number, interval: number): void {
    const dots = '.'.repeat((attempt % 3) + 1);
    const message = `⏳ Checking authorization${dots.padEnd(3)} (attempt ${attempt}, interval ${interval}s)`;
    process.stdout.write(`\r${message}`);
  }

  /**
   * Displays successful authentication message
   */
  static displaySuccess(): void {
    console.log('\n\n✅ Authentication successful! MCP server is now ready.\n');
  }

  /**
   * Displays authentication error message
   * @param {string} error Error message to display
   */
  static displayError(error: string): void {
    console.log('\n\n❌ Authentication failed:');
    console.log(`   ${error}\n`);
  }

  /**
   * Displays warning message
   * @param {string} message Warning message to display
   */
  static displayWarning(message: string): void {
    console.log(`\n⚠️  ${message}`);
  }
}
