/**
 * Parameter validation utilities for MCP tools
 */

import type { ProcessedSearchContentParams } from '@/types/index.js';

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
      `${fieldName} must be at least ${minLength} characters long`,
      fieldName
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

/**
 * Validate and process new search content parameters
 */
export function validateSearchContentParams(
  args: unknown
): ProcessedSearchContentParams {
  if (!args || typeof args !== 'object') {
    throw new ValidationError('Invalid arguments: must be an object');
  }

  const params = args as Record<string, unknown>;

  // Validate keywords parameter (required)
  const keywords = validateStringParam(params.keywords, 'keywords', {
    required: true,
    minLength: 2,
  });
  if (!keywords) {
    throw new ValidationError('Keywords parameter is required', 'keywords');
  }

  // Validate types parameter (optional array)
  const validTypes = ['tutorial', 'topic', 'course', 'video', 'guide'];
  const types = validateArrayParam(params.types, 'types', (item: unknown) => {
    if (typeof item !== 'string' || !validTypes.includes(item)) {
      throw new ValidationError(`must be one of: ${validTypes.join(', ')}`);
    }
    return item;
  });
  const finalTypes = types.length > 0 ? types : ['tutorial', 'topic', 'course'];

  // Validate drupal_version parameter (optional array)
  const validVersions = ['9', '10', '11'];
  const drupalVersions =
    params.drupal_version !== undefined
      ? validateArrayParam(
          params.drupal_version,
          'drupal_version',
          (item: unknown) => {
            if (typeof item !== 'string' || !validVersions.includes(item)) {
              throw new ValidationError(
                `must be one of: ${validVersions.join(', ')}`
              );
            }
            return item;
          }
        )
      : undefined;

  // Validate category parameter (optional array of strings)
  const categories =
    params.category !== undefined
      ? validateArrayParam(params.category, 'category', (item: unknown) => {
          if (typeof item !== 'string' || item.trim().length === 0) {
            throw new ValidationError('must be a non-empty string');
          }
          return sanitizeTag(item);
        }).filter((tag, index, array) => array.indexOf(tag) === index) // Remove duplicates
      : undefined;

  // Validate sort parameter (optional)
  const validSorts = ['search_api_relevance', 'created', 'changed', 'title'];
  let sort = 'search_api_relevance';
  if (params.sort !== undefined) {
    if (typeof params.sort !== 'string' || !validSorts.includes(params.sort)) {
      throw new ValidationError(
        `Invalid sort: must be one of ${validSorts.join(', ')}`,
        'sort'
      );
    }
    sort = params.sort;
  }

  // Validate page parameter (optional object)
  const page = { limit: 10, offset: 0 };
  if (params.page !== undefined) {
    if (!params.page || typeof params.page !== 'object') {
      throw new ValidationError(
        'Invalid page: must be an object with limit and offset',
        'page'
      );
    }

    const pageObj = params.page as Record<string, unknown>;

    if (pageObj.limit !== undefined) {
      if (
        typeof pageObj.limit !== 'number' ||
        pageObj.limit < 1 ||
        pageObj.limit > 100
      ) {
        throw new ValidationError(
          'Invalid page.limit: must be a number between 1 and 100',
          'page.limit'
        );
      }
      page.limit = pageObj.limit;
    }

    if (pageObj.offset !== undefined) {
      if (typeof pageObj.offset !== 'number' || pageObj.offset < 0) {
        throw new ValidationError(
          'Invalid page.offset: must be a non-negative number',
          'page.offset'
        );
      }
      page.offset = pageObj.offset;
    }
  }

  return {
    keywords,
    types: finalTypes,
    drupal_version: drupalVersions,
    category: categories,
    sort,
    page,
  };
}
