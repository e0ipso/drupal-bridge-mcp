/**
 * MCP to JSON-RPC Bridge
 *
 * This module provides a bridge between JSON-RPC 2.0 protocol and MCP server,
 * converting JSON-RPC requests to MCP method calls and responses back to JSON-RPC format.
 */

import type { Logger } from 'pino';
import type { DrupalMcpServer } from '@/mcp/server.js';
import {
  type JsonRpcResponse,
  type McpJsonRpcContext,
  JsonRpcErrorCode,
  createJsonRpcSuccessResponse,
  createJsonRpcErrorResponse,
} from './jsonrpc-types.js';

/**
 * MCP method handler result
 */
interface McpMethodResult {
  success: boolean;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Bridge between JSON-RPC and MCP server
 */
export class McpJsonRpcBridge {
  constructor(
    private readonly mcpServer: DrupalMcpServer,
    private readonly logger: Logger
  ) {}

  /**
   * Route JSON-RPC method to MCP server and return formatted response
   */
  async routeToMcpMethod(
    method: string,
    params: unknown,
    context: McpJsonRpcContext,
    requestId: string | number | null
  ): Promise<JsonRpcResponse> {
    const methodLogger = this.logger.child({
      method,
      requestId: context.requestId,
      sessionId: context.session?.id,
    });

    try {
      const result = await this.executeMcpMethod(method, params, methodLogger);

      if (result.success) {
        return createJsonRpcSuccessResponse(result.result, requestId);
      } else {
        return createJsonRpcErrorResponse(
          result.error?.code || JsonRpcErrorCode.INTERNAL_ERROR,
          result.error?.message || 'MCP method execution failed',
          result.error?.data,
          requestId
        );
      }
    } catch (error) {
      methodLogger.error(
        { err: error },
        'Unexpected error in MCP method execution'
      );
      return createJsonRpcErrorResponse(
        JsonRpcErrorCode.INTERNAL_ERROR,
        'Unexpected error in method execution',
        undefined,
        requestId
      );
    }
  }

  /**
   * Execute MCP method based on JSON-RPC method name
   */
  private async executeMcpMethod(
    method: string,
    params: unknown,
    logger: Logger
  ): Promise<McpMethodResult> {
    switch (method) {
      case 'tools/list':
        return await this.handleToolsList(logger);

      case 'tools/call':
        return await this.handleToolsCall(params, logger);

      case 'resources/list':
        return await this.handleResourcesList(logger);

      case 'resources/read':
        return await this.handleResourcesRead(params, logger);

      case 'prompts/list':
        return await this.handlePromptsList(logger);

      case 'prompts/get':
        return await this.handlePromptsGet(params, logger);

      default:
        return {
          success: false,
          error: {
            code: JsonRpcErrorCode.METHOD_NOT_FOUND,
            message: `Method '${method}' not found`,
            data: {
              availableMethods: [
                'tools/list',
                'tools/call',
                'resources/list',
                'resources/read',
                'prompts/list',
                'prompts/get',
              ],
            },
          },
        };
    }
  }

  /**
   * Handle tools/list method
   */
  private async handleToolsList(logger: Logger): Promise<McpMethodResult> {
    try {
      // Use reflection to call the private getTools method or recreate the logic
      const tools = this.getToolsFromMcpServer();

      return {
        success: true,
        result: { tools },
      };
    } catch (error) {
      logger.error({ err: error }, 'Error listing tools');
      return {
        success: false,
        error: {
          code: JsonRpcErrorCode.MCP_TOOL_ERROR,
          message: 'Failed to list tools',
          data: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handle tools/call method
   */
  private async handleToolsCall(
    params: unknown,
    logger: Logger
  ): Promise<McpMethodResult> {
    try {
      if (!params || typeof params !== 'object') {
        return {
          success: false,
          error: {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message: 'Tool call requires params object with name and arguments',
          },
        };
      }

      const { name, arguments: args } = params as {
        name: string;
        arguments?: unknown;
      };

      if (!name) {
        return {
          success: false,
          error: {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message: 'Tool name is required',
          },
        };
      }

      // Call the tool execution method on the MCP server
      const result = await this.executeToolOnMcpServer(name, args);

      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error({ err: error, params }, 'Error calling tool');
      return {
        success: false,
        error: {
          code: JsonRpcErrorCode.MCP_TOOL_ERROR,
          message: 'Tool execution failed',
          data: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handle resources/list method
   */
  private async handleResourcesList(logger: Logger): Promise<McpMethodResult> {
    try {
      const resources = await this.getResourcesFromMcpServer();

      return {
        success: true,
        result: { resources },
      };
    } catch (error) {
      logger.error({ err: error }, 'Error listing resources');
      return {
        success: false,
        error: {
          code: JsonRpcErrorCode.MCP_RESOURCE_ERROR,
          message: 'Failed to list resources',
          data: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handle resources/read method
   */
  private async handleResourcesRead(
    params: unknown,
    logger: Logger
  ): Promise<McpMethodResult> {
    try {
      if (!params || typeof params !== 'object') {
        return {
          success: false,
          error: {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message: 'Resource read requires params object with uri',
          },
        };
      }

      const { uri } = params as { uri: string };

      if (!uri) {
        return {
          success: false,
          error: {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message: 'Resource URI is required',
          },
        };
      }

      const result = await this.readResourceFromMcpServer(uri);

      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error({ err: error, params }, 'Error reading resource');
      return {
        success: false,
        error: {
          code: JsonRpcErrorCode.MCP_RESOURCE_ERROR,
          message: 'Resource read failed',
          data: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handle prompts/list method
   */
  private async handlePromptsList(logger: Logger): Promise<McpMethodResult> {
    try {
      const prompts = this.getPromptsFromMcpServer();

      return {
        success: true,
        result: { prompts },
      };
    } catch (error) {
      logger.error({ err: error }, 'Error listing prompts');
      return {
        success: false,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Failed to list prompts',
          data: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Handle prompts/get method
   */
  private async handlePromptsGet(
    params: unknown,
    logger: Logger
  ): Promise<McpMethodResult> {
    try {
      if (!params || typeof params !== 'object') {
        return {
          success: false,
          error: {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message:
              'Prompt get requires params object with name and optional arguments',
          },
        };
      }

      const { name, arguments: args } = params as {
        name: string;
        arguments?: Record<string, unknown>;
      };

      if (!name) {
        return {
          success: false,
          error: {
            code: JsonRpcErrorCode.INVALID_PARAMS,
            message: 'Prompt name is required',
          },
        };
      }

      const result = await this.getPromptFromMcpServer(name, args);

      return {
        success: true,
        result,
      };
    } catch (error) {
      logger.error({ err: error, params }, 'Error getting prompt');
      return {
        success: false,
        error: {
          code: JsonRpcErrorCode.INTERNAL_ERROR,
          message: 'Prompt get failed',
          data: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Get tools from MCP server
   */
  private getToolsFromMcpServer(): unknown[] {
    return this.mcpServer.getTools();
  }

  /**
   * Execute tool on MCP server
   */
  private async executeToolOnMcpServer(
    name: string,
    args: unknown
  ): Promise<unknown> {
    return await this.mcpServer.executeToolWithAuth(name, args);
  }

  /**
   * Get resources from MCP server
   */
  private async getResourcesFromMcpServer(): Promise<unknown[]> {
    return await this.mcpServer.getResources();
  }

  /**
   * Read resource from MCP server
   */
  private async readResourceFromMcpServer(uri: string): Promise<unknown> {
    return await this.mcpServer.readResource(uri);
  }

  /**
   * Get prompts from MCP server
   */
  private getPromptsFromMcpServer(): unknown[] {
    return this.mcpServer.getPrompts();
  }

  /**
   * Get prompt from MCP server
   */
  private async getPromptFromMcpServer(
    name: string,
    args?: Record<string, unknown>
  ): Promise<unknown> {
    return await this.mcpServer.getPrompt(name, args);
  }
}
