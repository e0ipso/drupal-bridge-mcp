/**
 * Domain-specific type definitions (Drupal + Auth)
 * Consolidated for MVP simplification
 */

// =============================================================================
// Drupal API Types
// =============================================================================

/**
 * Drupal entity base structure
 */
export interface DrupalEntity {
  readonly id: string;
  readonly type: string;
  readonly attributes: Record<string, unknown>;
  readonly relationships?: Record<string, unknown>;
  readonly links?: Record<string, string>;
}

/**
 * Drupal node entity
 */
export interface DrupalNode extends DrupalEntity {
  readonly type: 'node--article' | 'node--page' | string;
  readonly attributes: DrupalNodeAttributes;
}

/**
 * Drupal node attributes
 */
export interface DrupalNodeAttributes {
  readonly nid: number;
  readonly title: string;
  readonly body?: {
    readonly value: string;
    readonly format: string;
    readonly processed: string;
  };
  readonly status: boolean;
  readonly created: string;
  readonly changed: string;
  readonly path?: {
    readonly alias: string;
    readonly pid: number;
  };
  readonly [key: string]: unknown;
}

/**
 * Drupal JSON-RPC method type
 */
export type DrupalJsonRpcMethod = string;

/**
 * Parameters for entity load operations
 */
export interface EntityLoadParams {
  readonly entity_type: string;
  readonly entity_id: string | number;
}

/**
 * Parameters for entity query operations
 */
export interface EntityQueryParams {
  readonly entity_type: string;
  readonly conditions?: Record<string, unknown>;
  readonly limit?: number;
  readonly offset?: number;
  readonly sort?: Record<string, 'ASC' | 'DESC'>;
}

/**
 * Parameters for node creation
 */
export interface NodeCreateParams {
  readonly type: string;
  readonly title: string;
  readonly body?: string;
  readonly status?: boolean;
  readonly [key: string]: unknown;
}

/**
 * Drupal API response wrapper
 */
export interface DrupalApiResponse<TData = unknown> {
  readonly data: TData;
  readonly included?: DrupalEntity[];
  readonly meta?: Record<string, unknown>;
  readonly links?: Record<string, string>;
}


/**
 * Configuration for Drupal JSON-RPC client
 */
export interface DrupalClientConfig {
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly timeout?: number;
  readonly retries?: number;
  readonly headers?: Record<string, string>;
}

// =============================================================================
// Authentication Types (consolidated from auth modules)
// =============================================================================


