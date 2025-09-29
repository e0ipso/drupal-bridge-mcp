/**
 * Device Flow Environment Detection
 *
 * Detects whether the application is running in a headless environment
 * where device authorization grant flow should be used instead of
 * browser-based OAuth flows.
 */

/**
 * Detects if the application is running in a headless environment
 */
export class DeviceFlowDetector {
  /**
   * Checks if the current environment is headless (no browser available)
   * @returns {boolean} True if headless environment detected
   */
  static isHeadlessEnvironment(): boolean {
    // Check for Docker environment
    if (
      process.env.CONTAINER === 'true' ||
      process.env.IS_DOCKER === 'true' ||
      process.env.DOCKER_CONTAINER === 'true'
    ) {
      return true;
    }

    // Check if running in CI/CD
    if (
      process.env.CI === 'true' ||
      process.env.CONTINUOUS_INTEGRATION === 'true'
    ) {
      return true;
    }

    // Check if display is available (Linux/Unix)
    if (process.platform !== 'win32' && !process.env.DISPLAY) {
      return true;
    }

    // Check if terminal only (no GUI)
    if (process.env.TERM && !process.env.DESKTOP_SESSION) {
      return true;
    }

    return false;
  }

  /**
   * Determines if device flow should be used based on environment
   * Respects manual override environment variables
   * @returns {boolean} True if device flow should be used
   */
  static shouldUseDeviceFlow(): boolean {
    // Allow manual override
    if (process.env.OAUTH_FORCE_DEVICE_FLOW === 'true') {
      return true;
    }

    if (process.env.OAUTH_FORCE_BROWSER_FLOW === 'true') {
      return false;
    }

    return this.isHeadlessEnvironment();
  }
}
