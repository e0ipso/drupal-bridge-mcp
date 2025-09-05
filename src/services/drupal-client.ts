/**
 * Drupal JSON-RPC client service using json-rpc-2.0 library
 */

import { JSONRPCClient } from 'json-rpc-2.0';
import {
  type DrupalClientConfig,
  type DrupalJsonRpcMethod,
  type EntityLoadParams,
  type EntityQueryParams,
  type NodeCreateParams,
  type DrupalNode,
  type JsonRpcResponse,
  isJsonRpcErrorResponse,
} from '@/types/index.js';

/**
 * Custom error for Drupal client operations
 */
export class DrupalClientError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'DrupalClientError';
  }
}

/**
 * Drupal JSON-RPC client implementation
 */
export class DrupalClient {
  private readonly client: JSONRPCClient;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly headers: Record<string, string>;

  constructor(private readonly config: DrupalClientConfig) {
    this.baseUrl = new URL(config.endpoint, config.baseUrl).toString();
    this.timeout = config.timeout ?? 30000; // 30 second timeout for Drupal response times
    this.retries = config.retries ?? 3;
    this.headers = { 
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...config.headers 
    };

    // Initialize JSON-RPC client with HTTP transport
    this.client = new JSONRPCClient(async (jsonRPCRequest) => {
      return this.makeHttpRequest(jsonRPCRequest);
    });
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeHttpRequest(jsonRPCRequest: unknown): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(this.baseUrl, {
          method: 'POST',
          headers: this.headers,
          body: JSON.stringify(jsonRPCRequest),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 200) {
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.includes('application/json')) {
            throw new DrupalClientError(
              `Invalid content-type: expected application/json, got ${contentType}`,
              response.status
            );
          }
          
          const jsonRPCResponse = await response.json();
          
          // Validate JSON-RPC response format
          if (!jsonRPCResponse.jsonrpc || jsonRPCResponse.jsonrpc !== '2.0') {
            throw new DrupalClientError(
              `Invalid JSON-RPC response: missing or invalid jsonrpc field`,
              undefined,
              jsonRPCResponse
            );
          }
          
          this.client.receive(jsonRPCResponse);
          return;
        } else if (response.status >= 400) {
          const errorText = await response.text();
          throw new DrupalClientError(
            `HTTP ${response.status}: ${response.statusText}. Response: ${errorText}`,
            response.status,
            errorText
          );
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on timeout/abort errors
        if (lastError.name === 'AbortError') {
          throw new DrupalClientError(
            `Request timed out after ${this.timeout}ms`,
            undefined,
            lastError
          );
        }
        
        if (attempt === this.retries) {
          break;
        }

        // Exponential backoff for retryable errors
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    clearTimeout(timeoutId);
    
    if (lastError) {
      throw new DrupalClientError(
        `Failed after ${this.retries} attempts: ${lastError.message}`,
        undefined,
        lastError
      );
    }
  }

  /**
   * Make a JSON-RPC request with error handling
   */
  private async request<TResult = unknown>(
    method: DrupalJsonRpcMethod | string,
    params?: unknown
  ): Promise<TResult> {
    try {
      const result = await this.client.request(method, params);
      return result as TResult;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error) {
        throw new DrupalClientError(
          String(error),
          error.code as number,
          error
        );
      }
      throw new DrupalClientError(
        `JSON-RPC request failed: ${String(error)}`,
        undefined,
        error
      );
    }
  }

  /**
   * Load an entity by type and ID
   */
  async loadEntity<T = unknown>(
    entityType: string,
    entityId: string | number
  ): Promise<T> {
    const params: EntityLoadParams = {
      entity_type: entityType,
      entity_id: entityId,
    };

    return this.request<T>('entity.load', params);
  }

  /**
   * Query entities with conditions
   */
  async queryEntities<T = unknown>(
    entityType: string,
    conditions?: Record<string, unknown>,
    options?: {
      limit?: number;
      offset?: number;
      sort?: Record<string, 'ASC' | 'DESC'>;
    }
  ): Promise<T[]> {
    const params: EntityQueryParams = {
      entity_type: entityType,
      conditions,
      ...options,
    };

    return this.request<T[]>('entity.query', params);
  }

  /**
   * Load a node by ID
   */
  async loadNode(nodeId: string | number): Promise<DrupalNode> {
    return this.loadEntity<DrupalNode>('node', nodeId);
  }

  /**
   * Create a new node
   */
  async createNode(params: NodeCreateParams): Promise<DrupalNode> {
    return this.request<DrupalNode>('node.create', params);
  }

  /**
   * Update an existing node
   */
  async updateNode(
    nodeId: string | number,
    updates: Partial<NodeCreateParams>
  ): Promise<DrupalNode> {
    const params = {
      nid: nodeId,
      ...updates,
    };

    return this.request<DrupalNode>('node.update', params);
  }

  /**
   * Delete a node
   */
  async deleteNode(nodeId: string | number): Promise<boolean> {
    const params = { nid: nodeId };
    return this.request<boolean>('node.delete', params);
  }

  /**
   * Get nodes with optional filtering
   */
  async getNodes(options?: {
    type?: string;
    status?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<DrupalNode[]> {
    const conditions: Record<string, unknown> = {};
    
    if (options?.type) conditions.type = options.type;
    if (options?.status !== undefined) conditions.status = options.status;

    return this.queryEntities<DrupalNode>('node', conditions, {
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  /**
   * Test connection to Drupal
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.request('system.connect');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Search tutorials using JSON-RPC content.search method
   */
  async searchTutorials(params: {
    query: string;
    drupal_version?: string | null;
    tags?: string[];
    limit?: number;
    page?: number;
  }): Promise<{
    tutorials: Array<{
      id: string;
      title: string;
      content: string;
      tags: string[];
      drupal_version: string[];
      url: string;
      description?: string;
      difficulty?: string;
      created: string;
      updated?: string;
    }>;
    total: number;
    page: number;
  }> {
    const requestParams = {
      query: params.query,
      ...(params.drupal_version && { drupal_version: params.drupal_version }),
      ...(params.tags && params.tags.length > 0 && { tags: params.tags }),
      limit: params.limit || 10,
      page: params.page || 1,
    };

    return this.request<{
      tutorials: Array<{
        id: string;
        title: string;
        content: string;
        tags: string[];
        drupal_version: string[];
        url: string;
        description?: string;
        difficulty?: string;
        created: string;
        updated?: string;
      }>;
      total: number;
      page: number;
    }>('content.search', requestParams);
  }

  /**
   * Get server configuration
   */
  getConfig(): DrupalClientConfig {
    return { ...this.config };
  }
}