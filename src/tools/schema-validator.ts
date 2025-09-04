/**
 * JSON Schema Validation Engine for Tool Registry
 * 
 * Provides comprehensive schema validation for tool definitions, parameters,
 * and responses using JSON Schema specifications with TypeScript integration.
 */

import { logger } from '@/utils/logger';
import type {
  JSONSchema,
  ExtendedTool,
  SchemaValidationResult,
  ValidationError,
  ValidationWarning,
  ToolRegistryConfig
} from './types';

/**
 * Schema validation engine for tools
 */
export class SchemaValidator {
  private readonly config: ToolRegistryConfig;
  private readonly compiledSchemas = new Map<string, CompiledSchema>();

  constructor(config: ToolRegistryConfig) {
    this.config = config;
  }

  /**
   * Validate a tool definition against the tool schema
   */
  async validateToolDefinition(tool: ExtendedTool): Promise<SchemaValidationResult> {
    try {
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];

      // Validate required fields
      if (!tool.name || typeof tool.name !== 'string') {
        errors.push({
          path: 'name',
          message: 'Tool name is required and must be a string',
          value: tool.name,
          constraint: 'required'
        });
      }

      if (!tool.inputSchema || typeof tool.inputSchema !== 'object') {
        errors.push({
          path: 'inputSchema',
          message: 'Tool inputSchema is required and must be an object',
          value: tool.inputSchema,
          constraint: 'required'
        });
      }

      // Validate name constraints
      if (tool.name) {
        if (this.config.validation?.maxNameLength && 
            tool.name.length > this.config.validation.maxNameLength) {
          errors.push({
            path: 'name',
            message: `Tool name exceeds maximum length of ${this.config.validation.maxNameLength}`,
            value: tool.name,
            constraint: 'maxLength'
          });
        }

        if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(tool.name)) {
          errors.push({
            path: 'name',
            message: 'Tool name must start with a letter and contain only letters, numbers, underscores, dots, and hyphens',
            value: tool.name,
            constraint: 'pattern'
          });
        }
      }

      // Validate description
      if (this.config.validation?.requireDescription && !tool.description) {
        if (this.config.strictValidation) {
          errors.push({
            path: 'description',
            message: 'Tool description is required',
            constraint: 'required'
          });
        } else {
          warnings.push({
            path: 'description',
            message: 'Tool description is recommended for better usability',
            suggestion: 'Add a description to help users understand what this tool does'
          });
        }
      }

      if (tool.description && this.config.validation?.maxDescriptionLength &&
          tool.description.length > this.config.validation.maxDescriptionLength) {
        errors.push({
          path: 'description',
          message: `Tool description exceeds maximum length of ${this.config.validation.maxDescriptionLength}`,
          value: tool.description,
          constraint: 'maxLength'
        });
      }

      // Validate category
      if (tool.category && this.config.validation?.allowedCategories) {
        if (!this.config.validation.allowedCategories.includes(tool.category)) {
          errors.push({
            path: 'category',
            message: `Tool category '${tool.category}' is not allowed. Allowed categories: ${this.config.validation.allowedCategories.join(', ')}`,
            value: tool.category,
            constraint: 'enum'
          });
        }
      }

      // Validate input schema
      if (tool.inputSchema) {
        const schemaValidation = await this.validateJSONSchema(tool.inputSchema, 'inputSchema');
        errors.push(...schemaValidation.errors || []);
        warnings.push(...schemaValidation.warnings || []);
      }

      // Validate version format
      if (tool.version && !/^\d+\.\d+\.\d+(-[a-zA-Z0-9-]+)?$/.test(tool.version)) {
        warnings.push({
          path: 'version',
          message: 'Tool version should follow semantic versioning format (e.g., 1.0.0)',
          suggestion: 'Use semantic versioning for better version management'
        });
      }

      // Validate examples
      if (this.config.validation?.requireExamples && 
          (!tool.documentation?.examples || tool.documentation.examples.length === 0)) {
        if (this.config.strictValidation) {
          errors.push({
            path: 'documentation.examples',
            message: 'Tool examples are required',
            constraint: 'required'
          });
        } else {
          warnings.push({
            path: 'documentation.examples',
            message: 'Tool examples are recommended for better usability',
            suggestion: 'Add examples to help users understand how to use this tool'
          });
        }
      }

      // Validate examples structure
      if (tool.documentation?.examples) {
        for (let i = 0; i < tool.documentation.examples.length; i++) {
          const example = tool.documentation.examples[i];
          if (!example) continue;
          
          const basePath = `documentation.examples[${i}]`;

          if (!example.title) {
            errors.push({
              path: `${basePath}.title`,
              message: 'Example title is required',
              constraint: 'required'
            });
          }

          if (!example.input || typeof example.input !== 'object') {
            errors.push({
              path: `${basePath}.input`,
              message: 'Example input is required and must be an object',
              constraint: 'required'
            });
          }

          // Validate example input against tool schema
          if (example.input && tool.inputSchema) {
            const inputValidation = await this.validateData(example.input, tool.inputSchema, `${basePath}.input`);
            if (!inputValidation.isValid) {
              warnings.push({
                path: `${basePath}.input`,
                message: 'Example input does not match tool input schema',
                suggestion: 'Ensure example inputs conform to the tool\'s input schema'
              });
            }
          }
        }
      }

      // Validate timeout
      if (tool.timeout !== undefined) {
        if (typeof tool.timeout !== 'number' || tool.timeout < 0) {
          errors.push({
            path: 'timeout',
            message: 'Tool timeout must be a non-negative number',
            value: tool.timeout,
            constraint: 'type'
          });
        } else if (tool.timeout > 300000) { // 5 minutes
          warnings.push({
            path: 'timeout',
            message: 'Tool timeout is very long (> 5 minutes), consider shorter timeouts for better user experience',
            suggestion: 'Use shorter timeouts where possible'
          });
        }
      }

      // Validate availability configuration
      if (tool.availability) {
        const availabilityValidation = await this.validateAvailabilityConfig(tool.availability);
        errors.push(...availabilityValidation.errors || []);
        warnings.push(...availabilityValidation.warnings || []);
      }

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      logger.error('Error validating tool definition', {
        toolName: tool.name,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        isValid: false,
        errors: [{
          path: 'root',
          message: 'Internal validation error occurred',
          constraint: 'internal'
        }]
      };
    }
  }

  /**
   * Validate data against a JSON schema
   */
  async validateData(
    data: any,
    schema: JSONSchema,
    path: string = 'root'
  ): Promise<SchemaValidationResult> {
    try {
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];

      // Get or compile schema
      const compiled = await this.getCompiledSchema(schema, path);
      
      // Perform validation
      const validationResult = this.validateAgainstCompiledSchema(data, compiled, path);
      
      errors.push(...validationResult.errors);
      warnings.push(...validationResult.warnings);

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      logger.error('Error validating data against schema', {
        path,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        isValid: false,
        errors: [{
          path,
          message: 'Schema validation error occurred',
          constraint: 'internal'
        }]
      };
    }
  }

  /**
   * Validate JSON schema itself
   */
  async validateJSONSchema(
    schema: JSONSchema,
    path: string = 'schema'
  ): Promise<SchemaValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Basic schema structure validation
      if (!schema.type) {
        errors.push({
          path: `${path}.type`,
          message: 'Schema type is required',
          constraint: 'required'
        });
      }

      // Validate type value
      const validTypes = ['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'];
      if (schema.type && !validTypes.includes(schema.type)) {
        errors.push({
          path: `${path}.type`,
          message: `Invalid schema type '${schema.type}'. Valid types: ${validTypes.join(', ')}`,
          value: schema.type,
          constraint: 'enum'
        });
      }

      // Validate properties for object types
      if (schema.type === 'object' && schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          const propPath = `${path}.properties.${propName}`;
          const propValidation = await this.validateJSONSchema(propSchema, propPath);
          
          if (propValidation.errors) {
            errors.push(...propValidation.errors);
          }
          if (propValidation.warnings) {
            warnings.push(...propValidation.warnings);
          }
        }
      }

      // Validate items for array types
      if (schema.type === 'array' && schema.items) {
        const itemsValidation = await this.validateJSONSchema(schema.items, `${path}.items`);
        if (itemsValidation.errors) {
          errors.push(...itemsValidation.errors);
        }
        if (itemsValidation.warnings) {
          warnings.push(...itemsValidation.warnings);
        }
      }

      // Validate numeric constraints
      if ((schema.type === 'number' || schema.type === 'integer') && 
          schema.minimum !== undefined && schema.maximum !== undefined) {
        if (schema.minimum >= schema.maximum) {
          errors.push({
            path: `${path}.minimum`,
            message: 'Schema minimum must be less than maximum',
            constraint: 'logical'
          });
        }
      }

      // Validate string constraints
      if (schema.type === 'string') {
        if (schema.minLength !== undefined && schema.maxLength !== undefined) {
          if (schema.minLength >= schema.maxLength) {
            errors.push({
              path: `${path}.minLength`,
              message: 'Schema minLength must be less than maxLength',
              constraint: 'logical'
            });
          }
        }

        if (schema.pattern) {
          try {
            new RegExp(schema.pattern);
          } catch (regexError) {
            errors.push({
              path: `${path}.pattern`,
              message: 'Invalid regex pattern in schema',
              value: schema.pattern,
              constraint: 'format'
            });
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };

    } catch (error) {
      logger.error('Error validating JSON schema', {
        path,
        error: error instanceof Error ? error.message : String(error)
      });

      return {
        isValid: false,
        errors: [{
          path,
          message: 'JSON schema validation error occurred',
          constraint: 'internal'
        }]
      };
    }
  }

  /**
   * Clear compiled schema cache
   */
  clearCache(): void {
    this.compiledSchemas.clear();
    logger.debug('Schema validation cache cleared');
  }

  /**
   * Get statistics about cached schemas
   */
  getCacheStats(): {
    cachedSchemas: number;
    cacheHitRate: number;
    memoryUsage: number;
  } {
    // Simple implementation - could be enhanced with actual metrics
    return {
      cachedSchemas: this.compiledSchemas.size,
      cacheHitRate: 0.85, // Placeholder
      memoryUsage: this.compiledSchemas.size * 1024 // Rough estimate
    };
  }

  /**
   * Get or compile schema for efficient reuse
   */
  private async getCompiledSchema(schema: JSONSchema, identifier: string): Promise<CompiledSchema> {
    const cacheKey = this.generateSchemaHash(schema);
    
    let compiled = this.compiledSchemas.get(cacheKey);
    if (!compiled) {
      compiled = this.compileSchema(schema, identifier);
      this.compiledSchemas.set(cacheKey, compiled);
    }
    
    return compiled;
  }

  /**
   * Compile schema for efficient validation
   */
  private compileSchema(schema: JSONSchema, identifier: string): CompiledSchema {
    return {
      schema,
      identifier,
      compiledAt: new Date(),
      validate: (data: any) => this.performSchemaValidation(data, schema)
    };
  }

  /**
   * Perform actual schema validation
   */
  private performSchemaValidation(data: any, schema: JSONSchema): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Type validation
    if (!this.validateType(data, schema.type)) {
      errors.push({
        path: 'root',
        message: `Expected type '${schema.type}', got '${typeof data}'`,
        value: data,
        constraint: 'type'
      });
      return { errors, warnings }; // Early return if type is wrong
    }

    // Object validation
    if (schema.type === 'object' && typeof data === 'object' && data !== null) {
      const objValidation = this.validateObject(data, schema);
      errors.push(...objValidation.errors);
      warnings.push(...objValidation.warnings);
    }

    // Array validation
    if (schema.type === 'array' && Array.isArray(data)) {
      const arrayValidation = this.validateArray(data, schema);
      errors.push(...arrayValidation.errors);
      warnings.push(...arrayValidation.warnings);
    }

    // String validation
    if (schema.type === 'string' && typeof data === 'string') {
      const stringValidation = this.validateString(data, schema);
      errors.push(...stringValidation.errors);
      warnings.push(...stringValidation.warnings);
    }

    // Number validation
    if ((schema.type === 'number' || schema.type === 'integer') && typeof data === 'number') {
      const numberValidation = this.validateNumber(data, schema);
      errors.push(...numberValidation.errors);
      warnings.push(...numberValidation.warnings);
    }

    return { errors, warnings };
  }

  /**
   * Validate data against compiled schema
   */
  private validateAgainstCompiledSchema(
    data: any,
    compiled: CompiledSchema,
    path: string
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    try {
      return compiled.validate(data);
    } catch (error) {
      return {
        errors: [{
          path,
          message: 'Validation error occurred',
          constraint: 'internal'
        }],
        warnings: []
      };
    }
  }

  /**
   * Validate availability configuration
   */
  private async validateAvailabilityConfig(availability: any): Promise<SchemaValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (typeof availability.available !== 'boolean') {
      errors.push({
        path: 'availability.available',
        message: 'availability.available must be a boolean',
        value: availability.available,
        constraint: 'type'
      });
    }

    if (availability.maxConcurrency !== undefined) {
      if (typeof availability.maxConcurrency !== 'number' || availability.maxConcurrency < 1) {
        errors.push({
          path: 'availability.maxConcurrency',
          message: 'availability.maxConcurrency must be a positive number',
          value: availability.maxConcurrency,
          constraint: 'minimum'
        });
      }
    }

    if (availability.rateLimit) {
      if (typeof availability.rateLimit.maxCalls !== 'number' || availability.rateLimit.maxCalls < 1) {
        errors.push({
          path: 'availability.rateLimit.maxCalls',
          message: 'rate limit maxCalls must be a positive number',
          value: availability.rateLimit.maxCalls,
          constraint: 'minimum'
        });
      }

      if (typeof availability.rateLimit.windowMs !== 'number' || availability.rateLimit.windowMs < 1000) {
        errors.push({
          path: 'availability.rateLimit.windowMs',
          message: 'rate limit windowMs must be at least 1000 milliseconds',
          value: availability.rateLimit.windowMs,
          constraint: 'minimum'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  // Helper validation methods
  private validateType(data: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string': return typeof data === 'string';
      case 'number': return typeof data === 'number';
      case 'integer': return typeof data === 'number' && Number.isInteger(data);
      case 'boolean': return typeof data === 'boolean';
      case 'object': return typeof data === 'object' && data !== null && !Array.isArray(data);
      case 'array': return Array.isArray(data);
      case 'null': return data === null;
      default: return false;
    }
  }

  private validateObject(data: Record<string, any>, schema: JSONSchema): {
    errors: ValidationError[]; warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Check required properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in data)) {
          errors.push({
            path: requiredProp,
            message: `Required property '${requiredProp}' is missing`,
            constraint: 'required'
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [propName, propValue] of Object.entries(data)) {
        const propSchema = schema.properties[propName];
        if (propSchema) {
          const propValidation = this.performSchemaValidation(propValue, propSchema);
          // Prefix paths with property name
          errors.push(...propValidation.errors.map(err => ({
            ...err,
            path: `${propName}.${err.path}`.replace(/^(.+)\.root$/, '$1')
          })));
          warnings.push(...propValidation.warnings.map(warn => ({
            ...warn,
            path: `${propName}.${warn.path}`.replace(/^(.+)\.root$/, '$1')
          })));
        } else if (schema.additionalProperties === false) {
          warnings.push({
            path: propName,
            message: `Unexpected property '${propName}'`,
            suggestion: 'Remove unexpected properties or allow additionalProperties in schema'
          });
        }
      }
    }

    return { errors, warnings };
  }

  private validateArray(data: any[], schema: JSONSchema): {
    errors: ValidationError[]; warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        const itemValidation = this.performSchemaValidation(data[i], schema.items);
        // Prefix paths with array index
        errors.push(...itemValidation.errors.map(err => ({
          ...err,
          path: `[${i}].${err.path}`.replace(/\[(\d+)\]\.root$/, '[$1]')
        })));
        warnings.push(...itemValidation.warnings.map(warn => ({
          ...warn,
          path: `[${i}].${warn.path}`.replace(/\[(\d+)\]\.root$/, '[$1]')
        })));
      }
    }

    return { errors, warnings };
  }

  private validateString(data: string, schema: JSONSchema): {
    errors: ValidationError[]; warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push({
        path: 'root',
        message: `String is too short (${data.length} < ${schema.minLength})`,
        value: data,
        constraint: 'minLength'
      });
    }

    if (schema.maxLength !== undefined && data.length > schema.maxLength) {
      errors.push({
        path: 'root',
        message: `String is too long (${data.length} > ${schema.maxLength})`,
        value: data,
        constraint: 'maxLength'
      });
    }

    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(data)) {
        errors.push({
          path: 'root',
          message: `String does not match pattern: ${schema.pattern}`,
          value: data,
          constraint: 'pattern'
        });
      }
    }

    if (schema.enum && !schema.enum.includes(data)) {
      errors.push({
        path: 'root',
        message: `String is not one of allowed values: ${schema.enum.join(', ')}`,
        value: data,
        constraint: 'enum'
      });
    }

    return { errors, warnings };
  }

  private validateNumber(data: number, schema: JSONSchema): {
    errors: ValidationError[]; warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (schema.minimum !== undefined && data < schema.minimum) {
      errors.push({
        path: 'root',
        message: `Number is too small (${data} < ${schema.minimum})`,
        value: data,
        constraint: 'minimum'
      });
    }

    if (schema.maximum !== undefined && data > schema.maximum) {
      errors.push({
        path: 'root',
        message: `Number is too large (${data} > ${schema.maximum})`,
        value: data,
        constraint: 'maximum'
      });
    }

    return { errors, warnings };
  }

  private generateSchemaHash(schema: JSONSchema): string {
    // Simple hash generation - could be improved with actual hashing
    return JSON.stringify(schema);
  }
}

/**
 * Compiled schema interface for efficient validation
 */
interface CompiledSchema {
  readonly schema: JSONSchema;
  readonly identifier: string;
  readonly compiledAt: Date;
  readonly validate: (data: any) => { errors: ValidationError[]; warnings: ValidationWarning[] };
}