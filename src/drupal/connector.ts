import { JSONRPCClient, JSONRPCRequest } from 'json-rpc-2.0';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  Tutorial,
  TutorialSchema,
  SearchResponse,
  SearchResponseSchema,
} from './types.js';

/**
 * DrupalConnector handles JSON-RPC 2.0 communication with Drupal API
 * using OAuth Bearer token authentication for tutorial search and retrieval.
 *
 * Design principles:
 * - Stateless: OAuth token passed as parameter for each request
 * - Type-safe: Zod schemas validate all API responses
 * - Error-mapped: HTTP errors translated to MCP error codes
 */
export class DrupalConnector {
  private baseUrl: string;
  private jsonrpcEndpoint: string;

  constructor() {
    this.baseUrl = process.env.DRUPAL_BASE_URL || '';
    this.jsonrpcEndpoint = process.env.DRUPAL_JSONRPC_ENDPOINT || '/jsonrpc';

    if (!this.baseUrl) {
      throw new Error('DRUPAL_BASE_URL environment variable is required');
    }
  }

  /**
   * Create authenticated JSON-RPC client for a single request
   */
  private createClient(token: string): JSONRPCClient {
    // Using a placeholder variable to resolve circular reference
    const clientInstance: JSONRPCClient[] = [];

    const sendRequest = (jsonRPCRequest: JSONRPCRequest): Promise<void> => {
      return fetch(`${this.baseUrl}${this.jsonrpcEndpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(jsonRPCRequest),
      })
        .then(async response => {
          // Map HTTP errors to MCP errors
          if (!response.ok) {
            throw this.mapHttpErrorToMcpError(response.status);
          }

          if (response.status === 200) {
            // Parse JSON response and feed it back to the client
            return response
              .json()
              .then(jsonRPCResponse =>
                clientInstance[0].receive(jsonRPCResponse)
              );
          } else if (jsonRPCRequest.id !== undefined) {
            throw new McpError(
              ErrorCode.InternalError,
              `Drupal API error: HTTP ${response.status}`
            );
          }
        })
        .catch(error => {
          // Network or fetch errors
          if (error instanceof McpError) {
            throw error;
          }
          throw new McpError(
            ErrorCode.InternalError,
            `Drupal communication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        });
    };

    const client = new JSONRPCClient(sendRequest);
    clientInstance[0] = client;

    return client;
  }

  /**
   * Map HTTP status codes to MCP error codes
   */
  private mapHttpErrorToMcpError(status: number): McpError {
    switch (status) {
      case 401:
        return new McpError(ErrorCode.InvalidParams, 'Authentication required');
      case 403:
        return new McpError(
          ErrorCode.InvalidParams,
          'Insufficient permissions'
        );
      case 404:
        return new McpError(ErrorCode.InvalidRequest, 'Resource not found');
      default:
        return new McpError(
          ErrorCode.InternalError,
          `Drupal API error: HTTP ${status}`
        );
    }
  }

  /**
   * Search tutorials with keyword query
   *
   * @param query - Search keyword or phrase
   * @param token - OAuth Bearer token for authentication
   * @param limit - Maximum number of results to return (default: 10)
   * @returns SearchResponse containing matching tutorials
   * @throws McpError on authentication, permission, or network failures
   */
  async searchTutorial(
    query: string,
    token: string,
    limit = 10
  ): Promise<SearchResponse> {
    const client = this.createClient(token);

    try {
      const result = await client.request('tutorial.search', {
        query,
        limit,
      });

      // Validate response with Zod
      return SearchResponseSchema.parse(result);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Tutorial search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Retrieve tutorial by ID
   *
   * @param id - Tutorial unique identifier
   * @param token - OAuth Bearer token for authentication
   * @returns Tutorial object with full details
   * @throws McpError if tutorial not found or authentication fails
   */
  async getTutorial(id: string, token: string): Promise<Tutorial> {
    const client = this.createClient(token);

    try {
      const result = await client.request('tutorial.get', { id });

      // Validate response with Zod
      return TutorialSchema.parse(result);
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InvalidRequest, `Tutorial not found: ${id}`);
    }
  }
}
