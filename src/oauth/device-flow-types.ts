/**
 * Device Flow Type Definitions
 *
 * Type definitions for RFC 8628 Device Authorization Grant flow
 */

/**
 * Device authorization response from OAuth server
 * RFC 8628 Section 3.2
 */
export interface DeviceAuthResponse {
  /** The device verification code */
  device_code: string;

  /** The end-user verification code */
  user_code: string;

  /** The end-user verification URI */
  verification_uri: string;

  /** Complete verification URI including user code (optional) */
  verification_uri_complete?: string;

  /** The lifetime in seconds of the device_code and user_code */
  expires_in: number;

  /** The minimum amount of time in seconds between polling requests */
  interval: number;
}

/**
 * Token response from successful device authorization
 * RFC 6749 Section 5.1
 */
export interface TokenResponse {
  /** The access token issued by the authorization server */
  access_token: string;

  /** The type of token issued (e.g., "Bearer") */
  token_type: string;

  /** The lifetime in seconds of the access token */
  expires_in: number;

  /** The refresh token (optional) */
  refresh_token?: string;

  /** The scope of the access token */
  scope: string;
}

/**
 * OAuth error response
 * RFC 6749 Section 5.2
 */
export interface OAuthErrorResponse {
  /** Error code */
  error: string;

  /** Human-readable error description (optional) */
  error_description?: string;

  /** URI with error information (optional) */
  error_uri?: string;
}

/**
 * Device flow configuration
 */
export interface DeviceFlowConfig {
  /** Maximum number of retry attempts for failed flows */
  maxRetries: number;

  /** Base polling interval in seconds */
  baseInterval: number;

  /** Maximum polling interval in seconds */
  maxInterval: number;

  /** Enable automatic retry on transient failures */
  enableAutoRetry: boolean;
}

/**
 * Default device flow configuration
 */
export const DEFAULT_DEVICE_FLOW_CONFIG: DeviceFlowConfig = {
  maxRetries: 3,
  baseInterval: 5,
  maxInterval: 30,
  enableAutoRetry: true,
};

/**
 * Gets device flow configuration from environment variables
 * @returns {DeviceFlowConfig} Device flow configuration
 */
export function getDeviceFlowConfig(): DeviceFlowConfig {
  return {
    maxRetries: parseInt(process.env.DEVICE_FLOW_MAX_RETRIES || '3', 10),
    baseInterval: parseInt(process.env.DEVICE_FLOW_BASE_INTERVAL || '5', 10),
    maxInterval: parseInt(process.env.DEVICE_FLOW_MAX_INTERVAL || '30', 10),
    enableAutoRetry: process.env.DEVICE_FLOW_AUTO_RETRY !== 'false',
  };
}
