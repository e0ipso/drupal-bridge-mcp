/**
 * Drupal JSON-RPC Client with Direct Token Pass-through
 *
 * This client provides direct communication with Drupal's JSON-RPC API endpoints
 * without session management complexity. It passes OAuth tokens directly to Drupal
 * for authentication and authorization.
 */

import type { AxiosInstance } from 'axios';
import axios, { AxiosResponse, AxiosError } from 'axios';
import { logger } from '@/utils/logger.js';
import { config } from '@/config/index.js';

/**
 * JSON-RPC request structure
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, any>;
  id: string | number;
}

/**
 * JSON-RPC response structure
 */
export interface JsonRpcResponse<T = any> {
  jsonrpc: '2.0';
  result?: T;
  error?: JsonRpcError;
  id: string | number;
}

/**
 * JSON-RPC error structure
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

/**
 * Drupal content search parameters
 */
export interface ContentSearchParams {
  query: string;
  content_type?: string;
  drupal_version?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
  sort?: 'relevance' | 'date' | 'title';
  access_level?: 'free' | 'subscriber' | 'all';
}

/**
 * Drupal tutorial content structure
 */
export interface TutorialContent {
  id: string;
  title: string;
  summary?: string;
  content?: string;
  content_type: string;
  tags: string[];
  drupal_version?: string;
  difficulty_level?: string;
  created: string;
  updated: string;
  access_level: 'free' | 'subscriber';
  url?: string;
  author?: {
    name: string;
    bio?: string;
  };
}

/**
 * Content search results
 */
export interface ContentSearchResult {
  results: TutorialContent[];
  total: number;
  limit: number;
  offset: number;
  query: string;
  took: number;
}

/**
 * Tutorial retrieval parameters
 */
export interface GetTutorialParams {
  id: string;
  include_content?: boolean;
  format?: 'html' | 'markdown';
}

/**
 * Drupal API error categories
 */
export enum DrupalErrorCode {
  // Authentication errors
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  INVALID_TOKEN = 40001,
  EXPIRED_TOKEN = 40002,
  INSUFFICIENT_SCOPE = 40003,

  // Request errors
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  METHOD_NOT_ALLOWED = 405,
  INVALID_PARAMS = 40401,

  // Server errors
  INTERNAL_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
  JSONRPC_ERROR = 50001,
}

/**
 * Configuration for the JSON-RPC client
 */
export interface JsonRpcClientConfig {
  baseUrl: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  userAgent?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<JsonRpcClientConfig, 'baseUrl'>> = {
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  userAgent: 'DrupalizeME-MCP-Server/1.0.0',
};

/**
 * Main JSON-RPC client for Drupal communication
 */
export class JsonRpcClient {
  private readonly axios: AxiosInstance;
  private readonly config: Required<JsonRpcClientConfig>;
  private requestCounter = 0;

  constructor(config: JsonRpcClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create axios instance with base configuration
    this.axios = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': this.config.userAgent,
        Accept: 'application/json',
      },
    });

    // Add request interceptor for logging
    this.axios.interceptors.request.use(
      requestConfig => {
        logger.debug('Drupal JSON-RPC Request', {
          url: requestConfig.url,
          method: requestConfig.method,
          headers: this.sanitizeHeaders(requestConfig.headers),
        });
        return requestConfig;
      },
      error => {
        logger.error('Drupal JSON-RPC Request Error', { error });
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging and error handling
    this.axios.interceptors.response.use(
      response => {
        logger.debug('Drupal JSON-RPC Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      error => {
        logger.error('Drupal JSON-RPC Response Error', {
          status: error.response?.status,
          url: error.config?.url,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );

    logger.info('Drupal JSON-RPC Client initialized', {
      baseUrl: this.config.baseUrl,
      timeout: this.config.timeout,
    });
  }

  /**
   * Execute a JSON-RPC method call with token authentication
   */
  async call<T = any>(
    method: string,
    params: Record<string, any> = {},
    userToken: string
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: requestId,
    };

    const headers = {
      Authorization: `Bearer ${userToken}`,
    };

    try {
      logger.debug('Executing JSON-RPC call', {
        method,
        requestId,
        paramKeys: Object.keys(params),
        tokenPreview: this.maskToken(userToken),
      });

      const response = await this.executeWithRetry(
        () => this.axios.post('', request, { headers }),
        method
      );

      return this.handleJsonRpcResponse<T>(response.data, requestId);
    } catch (error) {
      throw this.transformError(error, method, requestId);
    }
  }

  /**
   * Search for content in Drupalize.me
   */
  async searchContent(
    params: ContentSearchParams,
    userToken: string
  ): Promise<ContentSearchResult> {
    const searchParams = {
      query: params.query,
      content_type: params.content_type || 'all',
      drupal_version: params.drupal_version,
      tags: params.tags || [],
      limit: params.limit || 20,
      offset: params.offset || 0,
      sort: params.sort || 'relevance',
      access_level: params.access_level || 'all',
    };

    return this.call<ContentSearchResult>(
      'content.search',
      searchParams,
      userToken
    );
  }

  /**
   * Get specific tutorial content
   */
  async getTutorial(
    params: GetTutorialParams,
    userToken: string
  ): Promise<TutorialContent> {
    const tutorialParams = {
      id: params.id,
      include_content: params.include_content !== false, // Default to true
      format: params.format || 'markdown',
    };

    return this.call<TutorialContent>(
      'content.get_tutorial',
      tutorialParams,
      userToken
    );
  }

  /**
   * Discover available JSON-RPC methods (for debugging/development)
   */
  async discoverMethods(userToken: string): Promise<string[]> {
    return this.call<string[]>('system.listMethods', {}, userToken);
  }

  /**
   * Get method signature information
   */
  async getMethodSignature(method: string, userToken: string): Promise<any> {
    return this.call('system.methodSignature', { method }, userToken);
  }

  /**
   * Health check method
   */
  async healthCheck(
    userToken: string
  ): Promise<{ status: string; timestamp: number }> {
    return this.call('system.health', {}, userToken);
  }

  /**
   * Execute request with retry logic
   */
  private async executeWithRetry<T>(
    requestFn: () => Promise<T>,
    context: string
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error as Error;

        // Don't retry on authentication errors or client errors
        if (this.isNonRetryableError(error)) {
          throw error;
        }

        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * attempt; // Exponential backoff
          logger.warn(`JSON-RPC call failed, retrying in ${delay}ms`, {
            context,
            attempt,
            maxAttempts: this.config.retryAttempts,
            error: (error as Error).message,
          });

          await this.delay(delay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Check if error should not be retried
   */
  private isNonRetryableError(error: any): boolean {
    if (!error.response) return false;

    const { status } = error.response;
    return status >= 400 && status < 500; // Client errors
  }

  /**
   * Handle JSON-RPC response format
   */
  private handleJsonRpcResponse<T>(
    data: JsonRpcResponse<T>,
    requestId: string | number
  ): T {
    if (data.id !== requestId) {
      throw new Error(
        `JSON-RPC response ID mismatch: expected ${requestId}, got ${data.id}`
      );
    }

    if (data.error) {
      const error = new Error(`JSON-RPC Error: ${data.error.message}`);
      (error as any).code = data.error.code;
      (error as any).data = data.error.data;
      (error as any).jsonRpcError = data.error;
      throw error;
    }

    if (data.result === undefined) {
      throw new Error('JSON-RPC response missing result and error');
    }

    return data.result;
  }

  /**
   * Transform various errors into consistent format
   */
  private transformError(
    error: any,
    method: string,
    requestId: string | number
  ): Error {
    if (error.jsonRpcError) {
      // Already a JSON-RPC error, return as-is
      return error;
    }

    if (error.response) {
      // HTTP error
      const { status } = error.response;
      const { data } = error.response;

      switch (status) {
        case 401:
          return this.createDrupalError(
            DrupalErrorCode.UNAUTHORIZED,
            'Authentication required',
            { method, requestId, originalError: data }
          );
        case 403:
          return this.createDrupalError(
            DrupalErrorCode.FORBIDDEN,
            'Access denied - insufficient permissions',
            { method, requestId, originalError: data }
          );
        case 404:
          return this.createDrupalError(
            DrupalErrorCode.NOT_FOUND,
            `Endpoint not found: ${method}`,
            { method, requestId, originalError: data }
          );
        case 500:
          return this.createDrupalError(
            DrupalErrorCode.INTERNAL_ERROR,
            'Internal server error',
            { method, requestId, originalError: data }
          );
        default:
          return this.createDrupalError(
            status,
            `HTTP ${status}: ${error.message}`,
            { method, requestId, originalError: data }
          );
      }
    }

    if (error.request) {
      // Network error
      return this.createDrupalError(
        DrupalErrorCode.SERVICE_UNAVAILABLE,
        'Network error - unable to reach Drupal server',
        { method, requestId, originalError: error.message }
      );
    }

    // Unknown error
    return this.createDrupalError(
      DrupalErrorCode.INTERNAL_ERROR,
      `Unexpected error: ${error.message}`,
      { method, requestId, originalError: error }
    );
  }

  /**
   * Create consistent Drupal API error
   */
  private createDrupalError(code: number, message: string, data?: any): Error {
    const error = new Error(message);
    (error as any).code = code;
    (error as any).data = data;
    (error as any).isDrupalError = true;
    return error;
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${++this.requestCounter}`;
  }

  /**
   * Create masked token for logging (security)
   */
  private maskToken(token: string): string {
    if (!token || token.length < 16) return '[INVALID_TOKEN]';
    return `${token.slice(0, 8)}...${token.slice(-4)}`;
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: any): any {
    if (!headers) return headers;

    const sanitized = { ...headers };
    if (sanitized.Authorization) {
      sanitized.Authorization = `Bearer ${this.maskToken(sanitized.Authorization.replace('Bearer ', ''))}`;
    }
    return sanitized;
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create JsonRpcClient with configuration
 */
export function createJsonRpcClient(
  config?: Partial<JsonRpcClientConfig>
): JsonRpcClient {
  const clientConfig: JsonRpcClientConfig = {
    baseUrl:
      config?.baseUrl ||
      process.env.DRUPAL_JSONRPC_ENDPOINT ||
      'https://drupalize.me/jsonrpc',
    ...config,
  };

  return new JsonRpcClient(clientConfig);
}

/**
 * Utility functions for error handling
 */
export const DrupalErrorUtils = {
  /**
   * Check if error is from Drupal API
   */
  isDrupalError(error: any): boolean {
    return error && error.isDrupalError === true;
  },

  /**
   * Check if error is authentication related
   */
  isAuthError(error: any): boolean {
    if (!this.isDrupalError(error)) return false;
    const { code } = error;
    return (
      code === DrupalErrorCode.UNAUTHORIZED ||
      code === DrupalErrorCode.INVALID_TOKEN ||
      code === DrupalErrorCode.EXPIRED_TOKEN
    );
  },

  /**
   * Check if error is permission related
   */
  isPermissionError(error: any): boolean {
    if (!this.isDrupalError(error)) return false;
    const { code } = error;
    return (
      code === DrupalErrorCode.FORBIDDEN ||
      code === DrupalErrorCode.INSUFFICIENT_SCOPE
    );
  },

  /**
   * Get user-friendly error message
   */
  getUserMessage(error: any): string {
    if (!this.isDrupalError(error)) {
      return 'An unexpected error occurred';
    }

    switch (error.code) {
      case DrupalErrorCode.UNAUTHORIZED:
      case DrupalErrorCode.INVALID_TOKEN:
      case DrupalErrorCode.EXPIRED_TOKEN:
        return 'Authentication failed. Please check your access token.';
      case DrupalErrorCode.FORBIDDEN:
      case DrupalErrorCode.INSUFFICIENT_SCOPE:
        return 'You do not have permission to access this content.';
      case DrupalErrorCode.NOT_FOUND:
        return 'The requested content was not found.';
      case DrupalErrorCode.SERVICE_UNAVAILABLE:
        return 'The Drupalize.me service is temporarily unavailable.';
      default:
        return error.message || 'An error occurred while accessing content';
    }
  },
};
