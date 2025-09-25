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
import {
  IntegrationError,
  IntegrationErrorType,
  normalizeError,
  parseJsonRpcError,
} from '@/utils/error-handler.js';

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
  private requestCounter = 0;

  constructor(private readonly config: DrupalClientConfig) {
    this.baseUrl = new URL(config.endpoint, config.baseUrl).toString();
    this.timeout = config.timeout ?? 30000; // 30 second timeout for Drupal response times
    this.retries = config.retries ?? 3;
    this.headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...config.headers,
    };

    // Initialize JSON-RPC client with HTTP transport
    this.client = new JSONRPCClient(async jsonRPCRequest => {
      return this.makeHttpRequest(jsonRPCRequest);
    });
  }

  /**
   * Set access token for authenticated requests
   */
  setAccessToken(token: string): void {
    this.headers['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear access token
   */
  clearAccessToken(): void {
    delete this.headers['Authorization'];
  }

  /**
   * Create timeout controller with cleanup
   */
  private createTimeoutController(timeout: number): AbortController {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // Store timeout ID for cleanup
    (controller as any).timeoutId = timeoutId;

    return controller;
  }

  /**
   * Clear timeout for controller if it exists
   */
  private clearControllerTimeout(controller: AbortController): void {
    const timeoutId = (controller as any).timeoutId;
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Prepare HTTP request configuration
   */
  private prepareHttpRequest(
    jsonRPCRequest: unknown,
    controller: AbortController
  ): RequestInit {
    return {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(jsonRPCRequest),
      signal: controller.signal,
    };
  }

  /**
   * Map HTTP status code to appropriate error type
   */
  private mapHttpStatusToErrorType(status: number): IntegrationErrorType {
    if (status >= 500) {
      return IntegrationErrorType.SERVER_UNAVAILABLE;
    }
    if (status === 429) {
      return IntegrationErrorType.RATE_LIMIT_ERROR;
    }
    if (status === 401 || status === 403) {
      return IntegrationErrorType.AUTHENTICATION_ERROR;
    }
    return IntegrationErrorType.VALIDATION_ERROR;
  }

  /**
   * Validate JSON-RPC response format and content-type
   */
  private validateJsonRpcResponse(response: Response, jsonData: unknown): void {
    // Validate content-type
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('application/json')) {
      throw new IntegrationError(
        IntegrationErrorType.MALFORMED_RESPONSE,
        `Invalid content-type: expected application/json, got ${contentType}`,
        response.status,
        undefined,
        { expected: 'application/json', received: contentType },
        undefined,
        false
      );
    }

    // Validate JSON-RPC response format
    if (!jsonData || typeof jsonData !== 'object' || !('jsonrpc' in jsonData)) {
      throw new IntegrationError(
        IntegrationErrorType.MALFORMED_RESPONSE,
        'Invalid JSON-RPC response: missing jsonrpc field',
        undefined,
        undefined,
        { response: jsonData },
        undefined,
        false
      );
    }

    const rpcResponse = jsonData as JsonRpcResponse;
    if (rpcResponse.jsonrpc !== '2.0') {
      throw new IntegrationError(
        IntegrationErrorType.MALFORMED_RESPONSE,
        `Invalid JSON-RPC version: expected "2.0", got "${rpcResponse.jsonrpc}"`,
        undefined,
        undefined,
        { expected: '2.0', received: rpcResponse.jsonrpc },
        undefined,
        false
      );
    }
  }

  /**
   * Handle successful HTTP response
   */
  private async handleSuccessResponse(
    response: Response,
    requestId: string
  ): Promise<void> {
    let jsonRPCResponse: unknown;
    try {
      jsonRPCResponse = await response.json();
    } catch (parseError) {
      throw new IntegrationError(
        IntegrationErrorType.PARSE_ERROR,
        'Failed to parse JSON response',
        response.status,
        undefined,
        { parseError: String(parseError) },
        parseError,
        false
      );
    }

    this.validateJsonRpcResponse(response, jsonRPCResponse);

    const rpcResponse = jsonRPCResponse as JsonRpcResponse;

    // Check for JSON-RPC errors in the response
    if (isJsonRpcErrorResponse(rpcResponse)) {
      throw parseJsonRpcError(rpcResponse, requestId);
    }

    this.client.receive(rpcResponse as JsonRpcResponse);
  }

  /**
   * Handle HTTP error response
   */
  private async handleErrorResponse(response: Response): Promise<void> {
    let errorText = '';
    try {
      errorText = await response.text();
    } catch {
      errorText = 'Unable to read error response';
    }

    const errorType = this.mapHttpStatusToErrorType(response.status);

    throw new IntegrationError(
      errorType,
      `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      undefined,
      { statusText: response.statusText, responseBody: errorText },
      undefined,
      response.status >= 500 || response.status === 429
    );
  }

  /**
   * Execute HTTP request with retry logic and exponential backoff
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    maxRetries: number
  ): Promise<T> {
    let lastError: IntegrationError | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        // Normalize the error to IntegrationError
        if (error instanceof IntegrationError) {
          lastError = error;
        } else {
          lastError = normalizeError(
            error,
            `HTTP request attempt ${attempt}/${maxRetries}`,
            this.generateRequestId()
          );
        }

        // Don't retry on timeout/abort errors or non-retryable errors
        if (
          lastError.errorType === IntegrationErrorType.TIMEOUT_ERROR ||
          !lastError.retryable
        ) {
          throw lastError;
        }

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff for retryable errors
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (lastError) {
      // Wrap the final error with retry context
      throw new IntegrationError(
        lastError.errorType,
        `Failed after ${maxRetries} attempts: ${lastError.message}`,
        lastError.code,
        lastError.field,
        {
          ...lastError.details,
          attempts: maxRetries,
          originalError: lastError,
        },
        lastError,
        false // No more retries available
      );
    }

    throw new IntegrationError(
      IntegrationErrorType.NETWORK_ERROR,
      'Request failed without error details',
      undefined,
      undefined,
      { attempts: maxRetries },
      undefined,
      false
    );
  }

  /**
   * Make HTTP request with retry logic
   */
  private async makeHttpRequest(jsonRPCRequest: unknown): Promise<void> {
    const controller = this.createTimeoutController(this.timeout);
    const requestId = this.generateRequestId();

    try {
      await this.executeWithRetry(async () => {
        const requestInit = this.prepareHttpRequest(jsonRPCRequest, controller);
        const response = await fetch(this.baseUrl, requestInit);

        if (response.status === 200) {
          await this.handleSuccessResponse(response, requestId);
        } else {
          await this.handleErrorResponse(response);
        }
      }, this.retries);
    } finally {
      this.clearControllerTimeout(controller);
    }
  }

  /**
   * Generate unique request ID for tracing
   */
  private generateRequestId(): string {
    return `req-${Date.now()}-${++this.requestCounter}`;
  }

  /**
   * Make a JSON-RPC request with error handling
   */
  private async request<TResult = unknown>(
    method: DrupalJsonRpcMethod | string,
    params?: unknown
  ): Promise<TResult> {
    const requestId = this.generateRequestId();

    try {
      const result = await this.client.request(method, params);
      return result as TResult;
    } catch (error) {
      // The error has already been processed by makeHttpRequest, so we just need to normalize it
      if (error instanceof IntegrationError) {
        throw error;
      }

      // Handle any unexpected errors from the JSON-RPC client itself
      const normalizedError = normalizeError(
        error,
        `JSON-RPC method: ${method}`,
        requestId
      );

      // Check if this error contains JSON-RPC error information
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        'message' in error
      ) {
        const rpcError = error as {
          code: number;
          message: string;
          data?: unknown;
        };
        const jsonRpcErrorResponse = {
          jsonrpc: '2.0' as const,
          error: {
            code: rpcError.code,
            message: rpcError.message,
            data: rpcError.data,
          },
          id: null,
        };

        throw parseJsonRpcError(jsonRpcErrorResponse, requestId);
      }

      throw normalizedError;
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
   * Search tutorials using JSON-RPC dme_mcp.search_content method
   */
  async searchTutorials(params: {
    keywords: string;
    types?: string[];
    drupal_version?: string[];
    category?: string[];
    sort?: string;
    page?: { limit: number; offset: number };
  }): Promise<{
    results: Array<{
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
    facets?: Record<string, unknown>;
  }> {
    const requestParams = {
      keywords: params.keywords,
      types: params.types || ['tutorial', 'topic', 'course'],
      drupal_version: params.drupal_version,
      category: params.category,
      sort: params.sort || 'search_api_relevance',
      page: params.page || { limit: 10, offset: 0 },
    };

    return this.request<{
      results: Array<{
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
      facets?: Record<string, unknown>;
    }>('dme_mcp.search_content', requestParams);
  }

  /**
   * Get server configuration
   */
  getConfig(): DrupalClientConfig {
    return { ...this.config };
  }
}
