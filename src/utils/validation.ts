/**
 * Parameter validation utilities for MCP tools
 */

import type { SearchToolParams, ProcessedSearchParams } from '@/types/index.js';

/**
 * Custom validation error
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate and process search tutorial parameters
 */
export function validateSearchToolParams(args: unknown): ProcessedSearchParams {
  if (!args || typeof args !== 'object') {
    throw new ValidationError('Invalid arguments: must be an object');
  }

  const params = args as Record<string, unknown>;

  // Validate query parameter
  if (!params.query || typeof params.query !== 'string') {
    throw new ValidationError(
      'Invalid query: must be a non-empty string',
      'query'
    );
  }

  const query = params.query.trim();
  if (query.length < 2) {
    throw new ValidationError(
      'Invalid query: must be at least 2 characters long',
      'query'
    );
  }

  // Validate drupal_version parameter
  let drupal_version: string | null = null;
  if (params.drupal_version !== undefined) {
    if (typeof params.drupal_version !== 'string') {
      throw new ValidationError(
        'Invalid drupal_version: must be a string',
        'drupal_version'
      );
    }

    const validVersions = ['9', '10', '11'];
    if (!validVersions.includes(params.drupal_version)) {
      throw new ValidationError(
        `Invalid drupal_version: must be one of ${validVersions.join(', ')}`,
        'drupal_version'
      );
    }

    drupal_version = params.drupal_version;
  }

  // Validate tags parameter
  let tags: string[] = [];
  if (params.tags !== undefined) {
    if (!Array.isArray(params.tags)) {
      throw new ValidationError('Invalid tags: must be an array', 'tags');
    }

    tags = params.tags
      .filter(
        (tag): tag is string => typeof tag === 'string' && tag.trim().length > 0
      )
      .map(tag => tag.trim().toLowerCase())
      .filter((tag, index, array) => array.indexOf(tag) === index); // Remove duplicates
  }

  return {
    query,
    drupal_version,
    tags,
  };
}

/**
 * Validate string parameter with optional constraints
 */
export function validateStringParam(
  value: unknown,
  fieldName: string,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  } = {}
): string | null {
  const { required = false, minLength, maxLength, pattern } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`);
    }
    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  const trimmed = value.trim();

  if (required && trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }

  if (minLength !== undefined && trimmed.length < minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${minLength} characters long`
    );
  }

  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must be no more than ${maxLength} characters long`
    );
  }

  if (pattern && !pattern.test(trimmed)) {
    throw new ValidationError(`${fieldName} format is invalid`);
  }

  return trimmed;
}

/**
 * Validate array parameter with type checking
 */
export function validateArrayParam<T>(
  value: unknown,
  fieldName: string,
  itemValidator: (item: unknown, index: number) => T,
  options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
  } = {}
): T[] {
  const { required = false, minLength, maxLength } = options;

  if (value === undefined || value === null) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`);
    }
    return [];
  }

  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }

  if (minLength !== undefined && value.length < minLength) {
    throw new ValidationError(
      `${fieldName} must contain at least ${minLength} items`
    );
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must contain no more than ${maxLength} items`
    );
  }

  try {
    return value.map((item, index) => itemValidator(item, index));
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError(`${fieldName}[${error.message}]`);
    }
    throw error;
  }
}

/**
 * Sanitize tag strings for consistent processing
 */
export function sanitizeTag(tag: string): string {
  return tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s\-_]/g, '-') // Replace special characters with hyphens, except spaces, existing hyphens, underscores
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}
