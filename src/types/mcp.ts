/**
 * Model Context Protocol (MCP) type definitions
 */

/**
 * MCP resource definition
 */
export interface McpResource {
  readonly uri: string;
  readonly name: string;
  readonly description?: string;
  readonly mimeType?: string;
}

/**
 * MCP tool definition
 */
export interface McpTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/**
 * MCP prompt definition
 */
export interface McpPrompt {
  readonly name: string;
  readonly description: string;
  readonly arguments?: Array<{
    readonly name: string;
    readonly description: string;
    readonly required?: boolean;
  }>;
}

/**
 * MCP server capabilities
 */
export interface McpServerCapabilities {
  readonly resources?: {
    readonly subscribe?: boolean;
    readonly listChanged?: boolean;
  };
  readonly tools?: {
    readonly listChanged?: boolean;
  };
  readonly prompts?: {
    readonly listChanged?: boolean;
  };
  readonly logging?: Record<string, unknown>;
  readonly [key: string]: unknown;
}

/**
 * MCP server information
 */
export interface McpServerInfo {
  readonly name: string;
  readonly version: string;
  readonly protocolVersion: string;
  readonly capabilities: McpServerCapabilities;
}

/**
 * MCP initialization options
 */
export interface McpInitializationOptions {
  readonly serverInfo: McpServerInfo;
  readonly transport: 'stdio' | 'http' | 'websocket';
}

/**
 * MCP error types
 */
export const McpErrorType = {
  INVALID_REQUEST: 'InvalidRequest',
  METHOD_NOT_FOUND: 'MethodNotFound',
  INVALID_PARAMS: 'InvalidParams',
  INTERNAL_ERROR: 'InternalError',
} as const;

export type McpErrorType = (typeof McpErrorType)[keyof typeof McpErrorType];

/**
 * MCP error structure
 */
export interface McpError {
  readonly type: McpErrorType;
  readonly message: string;
  readonly data?: unknown;
}

/**
 * Search tutorials tool input parameters
 */
export interface SearchToolParams {
  readonly query: string;
  readonly drupal_version?: '9' | '10' | '11';
  readonly tags?: string[];
}

/**
 * Processed search parameters after validation
 */
export interface ProcessedSearchParams {
  readonly query: string;
  readonly drupal_version: string | null;
  readonly tags: string[];
}

/**
 * Tutorial search result item
 */
export interface TutorialSearchResult {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly description?: string;
  readonly drupal_version?: string[];
  readonly tags?: string[];
  readonly difficulty?: 'beginner' | 'intermediate' | 'advanced';
  readonly created: string;
  readonly updated?: string;
}

/**
 * Search tutorials response
 */
export interface SearchTutorialsResponse {
  readonly results: TutorialSearchResult[];
  readonly total: number;
  readonly page: number;
  readonly limit: number;
  readonly query: ProcessedSearchParams;
}
