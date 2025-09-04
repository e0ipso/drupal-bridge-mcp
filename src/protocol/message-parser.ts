/**
 * MCP Protocol Message Parser and Validator
 * 
 * Provides message parsing, validation, and type checking for all MCP protocol
 * messages using JSON Schema validation and TypeScript type guards.
 */

import { logger } from '@/utils/logger';
import type {
  BaseMessage,
  MCPRequest,
  MCPResponse,
  MCPNotification,
  MCPError,
  MCPErrorCode,
  MessageId,
  MessageValidationResult,
  InitializeParams,
  ListToolsParams,
  CallToolParams,
  LoggingMessageParams,
  ProgressParams
} from './types';

/**
 * JSON Schema definitions for MCP message validation
 */
const MESSAGE_SCHEMAS = {
  baseMessage: {
    type: 'object',
    required: ['jsonrpc'],
    properties: {
      jsonrpc: { const: '2.0' },
      id: {
        oneOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'null' }
        ]
      }
    }
  },

  request: {
    type: 'object',
    required: ['jsonrpc', 'method', 'id'],
    properties: {
      jsonrpc: { const: '2.0' },
      method: { type: 'string', minLength: 1 },
      params: { type: 'object' },
      id: {
        oneOf: [
          { type: 'string' },
          { type: 'number' }
        ]
      }
    },
    additionalProperties: false
  },

  response: {
    type: 'object',
    required: ['jsonrpc', 'id'],
    properties: {
      jsonrpc: { const: '2.0' },
      id: {
        oneOf: [
          { type: 'string' },
          { type: 'number' },
          { type: 'null' }
        ]
      },
      result: {},
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: { type: 'number' },
          message: { type: 'string' },
          data: {}
        },
        additionalProperties: false
      }
    },
    additionalProperties: false,
    oneOf: [
      { required: ['result'] },
      { required: ['error'] }
    ]
  },

  notification: {
    type: 'object',
    required: ['jsonrpc', 'method'],
    properties: {
      jsonrpc: { const: '2.0' },
      method: { type: 'string', minLength: 1 },
      params: { type: 'object' }
    },
    additionalProperties: false,
    not: { required: ['id'] }
  },

  initializeParams: {
    type: 'object',
    required: ['protocolVersion', 'capabilities', 'clientInfo'],
    properties: {
      protocolVersion: { type: 'string', pattern: '^\\d+\\.\\d+(\\.\\d+)?$' },
      capabilities: {
        type: 'object',
        properties: {
          experimental: { type: 'object' },
          sampling: { type: 'object' }
        },
        additionalProperties: false
      },
      clientInfo: {
        type: 'object',
        required: ['name', 'version'],
        properties: {
          name: { type: 'string', minLength: 1 },
          version: { type: 'string', minLength: 1 }
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  },

  listToolsParams: {
    type: 'object',
    properties: {
      cursor: { type: 'string' }
    },
    additionalProperties: false
  },

  callToolParams: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1 },
      arguments: { type: 'object' }
    },
    additionalProperties: false
  },

  loggingMessageParams: {
    type: 'object',
    required: ['level', 'data'],
    properties: {
      level: {
        type: 'string',
        enum: ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency']
      },
      data: {},
      logger: { type: 'string' }
    },
    additionalProperties: false
  },

  progressParams: {
    type: 'object',
    required: ['progressToken', 'progress'],
    properties: {
      progressToken: {
        oneOf: [
          { type: 'string' },
          { type: 'number' }
        ]
      },
      progress: { type: 'number', minimum: 0 },
      total: { type: 'number', minimum: 0 }
    },
    additionalProperties: false
  }
} as const;

/**
 * Simple JSON Schema validator implementation
 */
class JsonSchemaValidator {
  /**
   * Validate data against a schema
   */
  validate(data: any, schema: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    const validateObject = (obj: any, sch: any, path = ''): boolean => {
      if (sch.type === 'object') {
        if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
          errors.push(`${path}: Expected object, got ${typeof obj}`);
          return false;
        }

        // Check required properties
        if (sch.required) {
          for (const prop of sch.required) {
            if (!(prop in obj)) {
              errors.push(`${path}: Missing required property '${prop}'`);
              return false;
            }
          }
        }

        // Validate properties
        if (sch.properties) {
          for (const [key, value] of Object.entries(obj)) {
            const propSchema = sch.properties[key];
            if (propSchema) {
              if (!validateObject(value, propSchema, `${path}.${key}`)) {
                return false;
              }
            } else if (sch.additionalProperties === false) {
              errors.push(`${path}: Additional property '${key}' not allowed`);
              return false;
            }
          }
        }

        // Check oneOf constraints
        if (sch.oneOf) {
          const matchingSchemas = sch.oneOf.filter((subSchema: any) => {
            const tempErrors: string[] = [];
            const originalErrors = errors.length;
            const result = validateObject(obj, subSchema, path);
            if (!result) {
              // Restore errors state
              errors.splice(originalErrors);
            }
            return result;
          });

          if (matchingSchemas.length !== 1) {
            errors.push(`${path}: Must match exactly one schema (matched ${matchingSchemas.length})`);
            return false;
          }
        }

        // Check not constraints
        if (sch.not) {
          const tempErrors: string[] = [];
          const originalErrorsLength = errors.length;
          if (validateObject(obj, sch.not, path)) {
            errors.splice(originalErrorsLength);
            errors.push(`${path}: Must not match the 'not' schema`);
            return false;
          } else {
            // Restore errors state since 'not' validation should fail
            errors.splice(originalErrorsLength);
          }
        }

        return true;
      }

      if (sch.type === 'string') {
        if (typeof obj !== 'string') {
          errors.push(`${path}: Expected string, got ${typeof obj}`);
          return false;
        }
        if (sch.minLength && obj.length < sch.minLength) {
          errors.push(`${path}: String too short (minimum ${sch.minLength})`);
          return false;
        }
        if (sch.pattern && !new RegExp(sch.pattern).test(obj)) {
          errors.push(`${path}: String does not match pattern ${sch.pattern}`);
          return false;
        }
        return true;
      }

      if (sch.type === 'number') {
        if (typeof obj !== 'number') {
          errors.push(`${path}: Expected number, got ${typeof obj}`);
          return false;
        }
        if (sch.minimum !== undefined && obj < sch.minimum) {
          errors.push(`${path}: Number below minimum ${sch.minimum}`);
          return false;
        }
        return true;
      }

      if (sch.const !== undefined) {
        if (obj !== sch.const) {
          errors.push(`${path}: Expected constant value ${sch.const}, got ${obj}`);
          return false;
        }
        return true;
      }

      if (sch.enum) {
        if (!sch.enum.includes(obj)) {
          errors.push(`${path}: Value must be one of ${sch.enum.join(', ')}`);
          return false;
        }
        return true;
      }

      if (sch.oneOf) {
        const matchingSchemas = sch.oneOf.filter((subSchema: any) =>
          this.validate(obj, subSchema).valid
        );
        if (matchingSchemas.length !== 1) {
          errors.push(`${path}: Must match exactly one of the schemas`);
          return false;
        }
        return true;
      }

      return true;
    };

    const valid = validateObject(data, schema);
    return { valid, errors };
  }
}

/**
 * MCP Protocol Message Parser
 */
export class MCPMessageParser {
  private readonly validator = new JsonSchemaValidator();

  /**
   * Parse raw message data into structured format
   */
  parseMessage(rawData: string | Buffer): {
    success: boolean;
    data?: any;
    error?: string;
  } {
    try {
      const messageStr = typeof rawData === 'string' ? rawData : rawData.toString('utf8');
      const data = JSON.parse(messageStr);
      
      return {
        success: true,
        data
      };
    } catch (error) {
      logger.warn('Failed to parse JSON message', {
        error: error instanceof Error ? error.message : String(error),
        rawDataLength: rawData.length
      });
      
      return {
        success: false,
        error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Validate message structure and determine message type
   */
  validateMessage(data: any): MessageValidationResult {
    if (!data || typeof data !== 'object') {
      return {
        isValid: false,
        error: 'Message must be an object'
      };
    }

    // Check if it's a basic MCP message
    const baseValidation = this.validator.validate(data, MESSAGE_SCHEMAS.baseMessage);
    if (!baseValidation.valid) {
      return {
        isValid: false,
        error: `Invalid base message: ${baseValidation.errors.join(', ')}`
      };
    }

    // Determine message type and validate accordingly
    if (this.isRequest(data)) {
      const requestValidation = this.validator.validate(data, MESSAGE_SCHEMAS.request);
      return {
        isValid: requestValidation.valid,
        error: requestValidation.valid ? undefined : requestValidation.errors.join(', '),
        messageType: 'request'
      };
    }

    if (this.isResponse(data)) {
      const responseValidation = this.validator.validate(data, MESSAGE_SCHEMAS.response);
      return {
        isValid: responseValidation.valid,
        error: responseValidation.valid ? undefined : responseValidation.errors.join(', '),
        messageType: 'response'
      };
    }

    if (this.isNotification(data)) {
      const notificationValidation = this.validator.validate(data, MESSAGE_SCHEMAS.notification);
      return {
        isValid: notificationValidation.valid,
        error: notificationValidation.valid ? undefined : notificationValidation.errors.join(', '),
        messageType: 'notification'
      };
    }

    return {
      isValid: false,
      error: 'Message does not match any known MCP message type'
    };
  }

  /**
   * Validate method-specific parameters
   */
  validateParams<T = any>(method: string, params: any): {
    isValid: boolean;
    error?: string;
    validatedParams?: T;
  } {
    const schema = this.getParamsSchema(method);
    if (!schema) {
      return {
        isValid: true,
        validatedParams: params
      };
    }

    const validation = this.validator.validate(params, schema);
    return {
      isValid: validation.valid,
      error: validation.valid ? undefined : validation.errors.join(', '),
      validatedParams: validation.valid ? params : undefined
    };
  }

  /**
   * Type guard to check if message is a request
   */
  isRequest(data: any): data is MCPRequest {
    return (
      data &&
      data.jsonrpc === '2.0' &&
      typeof data.method === 'string' &&
      data.id !== undefined
    );
  }

  /**
   * Type guard to check if message is a response
   */
  isResponse(data: any): data is MCPResponse {
    return (
      data &&
      data.jsonrpc === '2.0' &&
      data.id !== undefined &&
      (data.result !== undefined || data.error !== undefined)
    );
  }

  /**
   * Type guard to check if message is a notification
   */
  isNotification(data: any): data is MCPNotification {
    return (
      data &&
      data.jsonrpc === '2.0' &&
      typeof data.method === 'string' &&
      data.id === undefined
    );
  }

  /**
   * Create a properly formatted MCP error
   */
  createError(code: MCPErrorCode, message: string, data?: any): MCPError {
    return {
      code,
      message,
      ...(data && { data })
    };
  }

  /**
   * Create a properly formatted error response
   */
  createErrorResponse(id: MessageId, code: MCPErrorCode, message: string, data?: any): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: this.createError(code, message, data)
    };
  }

  /**
   * Create a properly formatted success response
   */
  createSuccessResponse(id: MessageId, result: any): MCPResponse {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  /**
   * Get parameter validation schema for a specific method
   */
  private getParamsSchema(method: string): any {
    switch (method) {
      case 'initialize':
        return MESSAGE_SCHEMAS.initializeParams;
      case 'tools/list':
        return MESSAGE_SCHEMAS.listToolsParams;
      case 'tools/call':
        return MESSAGE_SCHEMAS.callToolParams;
      case 'logging/setLevel':
        return MESSAGE_SCHEMAS.loggingMessageParams;
      case 'notifications/progress':
        return MESSAGE_SCHEMAS.progressParams;
      default:
        return null;
    }
  }
}

/**
 * Default message parser instance
 */
export const messageParser = new MCPMessageParser();