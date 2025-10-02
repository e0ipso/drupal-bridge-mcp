export {
  discoverTools,
  type ToolDefinition,
  type ToolDiscoveryResponse,
  type JSONSchema,
} from './tool-discovery.js';

export { getDiscoveredTools, clearToolCache } from './tool-cache.js';

export { registerDynamicTools, type Session } from './dynamic-handlers.js';
