/**
 * OAuth Module Exports
 *
 * Provides OAuth 2.1 integration with Drupal Simple OAuth
 */

export {
  OAuthConfigManager,
  createOAuthConfigFromEnv,
  type OAuthConfig,
} from './config.js';

export { DrupalOAuthProvider, createDrupalOAuthProvider } from './provider.js';

export { DeviceFlow } from './device-flow.js';
export { DeviceFlowDetector } from './device-flow-detector.js';
export { DeviceFlowHandler } from './device-flow-handler.js';
export { DeviceTokenPoller } from './device-token-poller.js';
export { DeviceAuthUI } from './device-flow-ui.js';
export type {
  DeviceAuthResponse,
  TokenResponse,
  OAuthErrorResponse,
  DeviceFlowConfig,
} from './device-flow-types.js';
export {
  getDeviceFlowConfig,
  DEFAULT_DEVICE_FLOW_CONFIG,
} from './device-flow-types.js';
