/**
 * Tests for validation utilities
 */

import {
  validateSearchToolParams,
  validateStringParam,
  validateArrayParam,
  sanitizeTag,
  ValidationError,
} from '@/utils/validation.js';

describe('Validation Utilities', () => {
  describe('validateSearchToolParams', () => {
    it('should validate complete valid parameters', () => {
      const params = {
        query: 'drupal configuration management',
        drupal_version: '10',
        tags: ['configuration', 'config-api', 'drupal-core'],
      };

      const result = validateSearchToolParams(params);

      expect(result).toEqual({
        query: 'drupal configuration management',
        drupal_version: '10',
        tags: ['configuration', 'config-api', 'drupal-core'],
      });
    });

    it('should handle minimum valid parameters', () => {
      const params = { query: 'ab' };
      const result = validateSearchToolParams(params);

      expect(result).toEqual({
        query: 'ab',
        drupal_version: null,
        tags: [],
      });
    });

    it('should normalize tags by removing duplicates and filtering', () => {
      const params = {
        query: 'test query',
        tags: ['Config', 'config', 'SETTINGS', 'settings', '', '  ', null, 123, 'valid-tag'],
      };

      const result = validateSearchToolParams(params);

      expect(result.tags).toEqual(['config', 'settings', 'valid-tag']);
    });

    it('should trim whitespace from query', () => {
      const params = { query: '  drupal modules  ' };
      const result = validateSearchToolParams(params);

      expect(result.query).toBe('drupal modules');
    });

    it('should validate drupal_version enum values', () => {
      const validVersions = ['9', '10', '11'];

      validVersions.forEach(version => {
        const params = { query: 'test', drupal_version: version };
        const result = validateSearchToolParams(params);
        expect(result.drupal_version).toBe(version);
      });
    });

    describe('Error Cases', () => {
      it('should throw ValidationError for invalid arguments type', () => {
        expect(() => validateSearchToolParams(null)).toThrow(ValidationError);
        expect(() => validateSearchToolParams('string')).toThrow(ValidationError);
        expect(() => validateSearchToolParams(123)).toThrow(ValidationError);
      });

      it('should throw ValidationError for missing query', () => {
        expect(() => validateSearchToolParams({})).toThrow(ValidationError);
        expect(() => validateSearchToolParams({ query: null })).toThrow(ValidationError);
        expect(() => validateSearchToolParams({ query: undefined })).toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid query type', () => {
        expect(() => validateSearchToolParams({ query: 123 })).toThrow(ValidationError);
        expect(() => validateSearchToolParams({ query: [] })).toThrow(ValidationError);
        expect(() => validateSearchToolParams({ query: {} })).toThrow(ValidationError);
      });

      it('should throw ValidationError for empty or too short query', () => {
        expect(() => validateSearchToolParams({ query: '' })).toThrow(ValidationError);
        expect(() => validateSearchToolParams({ query: '  ' })).toThrow(ValidationError);
        expect(() => validateSearchToolParams({ query: 'a' })).toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid drupal_version', () => {
        const invalidVersions = ['8', '12', 'invalid', '10.0', ''];

        invalidVersions.forEach(version => {
          expect(() => validateSearchToolParams({
            query: 'test',
            drupal_version: version,
          })).toThrow(ValidationError);
        });
      });

      it('should throw ValidationError for invalid drupal_version type', () => {
        expect(() => validateSearchToolParams({
          query: 'test',
          drupal_version: 10,
        })).toThrow(ValidationError);

        expect(() => validateSearchToolParams({
          query: 'test',
          drupal_version: null,
        })).toThrow(ValidationError);
      });

      it('should throw ValidationError for invalid tags type', () => {
        expect(() => validateSearchToolParams({
          query: 'test',
          tags: 'not-array',
        })).toThrow(ValidationError);

        expect(() => validateSearchToolParams({
          query: 'test',
          tags: 123,
        })).toThrow(ValidationError);
      });

      it('should provide field-specific error messages', () => {
        try {
          validateSearchToolParams({ query: '' });
        } catch (error) {
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as ValidationError).field).toBe('query');
        }

        try {
          validateSearchToolParams({ query: 'test', drupal_version: 'invalid' });
        } catch (error) {
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as ValidationError).field).toBe('drupal_version');
        }

        try {
          validateSearchToolParams({ query: 'test', tags: 'invalid' });
        } catch (error) {
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as ValidationError).field).toBe('tags');
        }
      });
    });
  });

  describe('validateStringParam', () => {
    it('should validate required string parameters', () => {
      const result = validateStringParam('test value', 'testField', { required: true });
      expect(result).toBe('test value');
    });

    it('should validate optional string parameters', () => {
      const result = validateStringParam(undefined, 'testField', { required: false });
      expect(result).toBeNull();
    });

    it('should trim whitespace', () => {
      const result = validateStringParam('  test  ', 'testField');
      expect(result).toBe('test');
    });

    it('should validate minimum length', () => {
      const result = validateStringParam('test', 'testField', { minLength: 3 });
      expect(result).toBe('test');

      expect(() => validateStringParam('ab', 'testField', { minLength: 3 }))
        .toThrow(ValidationError);
    });

    it('should validate maximum length', () => {
      const result = validateStringParam('test', 'testField', { maxLength: 5 });
      expect(result).toBe('test');

      expect(() => validateStringParam('toolong', 'testField', { maxLength: 5 }))
        .toThrow(ValidationError);
    });

    it('should validate pattern matching', () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const result = validateStringParam('test@example.com', 'email', { pattern: emailPattern });
      expect(result).toBe('test@example.com');

      expect(() => validateStringParam('invalid-email', 'email', { pattern: emailPattern }))
        .toThrow(ValidationError);
    });
  });

  describe('validateArrayParam', () => {
    const stringValidator = (item: unknown, index: number): string => {
      if (typeof item !== 'string') {
        throw new ValidationError(`item at index ${index} must be a string`);
      }
      return item.trim();
    };

    it('should validate array with valid items', () => {
      const result = validateArrayParam(['item1', 'item2'], 'testArray', stringValidator);
      expect(result).toEqual(['item1', 'item2']);
    });

    it('should return empty array for undefined when not required', () => {
      const result = validateArrayParam(undefined, 'testArray', stringValidator);
      expect(result).toEqual([]);
    });

    it('should validate minimum length', () => {
      const result = validateArrayParam(['item1', 'item2'], 'testArray', stringValidator, { minLength: 2 });
      expect(result).toEqual(['item1', 'item2']);

      expect(() => validateArrayParam(['item1'], 'testArray', stringValidator, { minLength: 2 }))
        .toThrow(ValidationError);
    });

    it('should validate maximum length', () => {
      const result = validateArrayParam(['item1'], 'testArray', stringValidator, { maxLength: 1 });
      expect(result).toEqual(['item1']);

      expect(() => validateArrayParam(['item1', 'item2'], 'testArray', stringValidator, { maxLength: 1 }))
        .toThrow(ValidationError);
    });

    it('should throw error for invalid array type', () => {
      expect(() => validateArrayParam('not-array', 'testArray', stringValidator))
        .toThrow(ValidationError);
    });

    it('should throw error for required array when undefined', () => {
      expect(() => validateArrayParam(undefined, 'testArray', stringValidator, { required: true }))
        .toThrow(ValidationError);
    });
  });

  describe('sanitizeTag', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeTag('CONFIGURATION')).toBe('configuration');
      expect(sanitizeTag('Config-API')).toBe('config-api');
    });

    it('should remove special characters', () => {
      expect(sanitizeTag('config@#$%api')).toBe('config-api');
      expect(sanitizeTag('drupal!core')).toBe('drupal-core');
    });

    it('should replace spaces with hyphens', () => {
      expect(sanitizeTag('drupal configuration management')).toBe('drupal-configuration-management');
    });

    it('should handle multiple spaces and hyphens', () => {
      expect(sanitizeTag('drupal   configuration---management')).toBe('drupal-configuration-management');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(sanitizeTag('--drupal-config--')).toBe('drupal-config');
    });

    it('should handle empty and whitespace strings', () => {
      expect(sanitizeTag('')).toBe('');
      expect(sanitizeTag('   ')).toBe('');
      expect(sanitizeTag('---')).toBe('');
    });

    it('should preserve underscores', () => {
      expect(sanitizeTag('drupal_api_client')).toBe('drupal_api_client');
    });

    it('should handle mixed cases correctly', () => {
      expect(sanitizeTag('Drupal 10 Configuration API!')).toBe('drupal-10-configuration-api');
    });
  });
});

describe('ValidationError', () => {
  it('should create error with message only', () => {
    const error = new ValidationError('Test error message');
    
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Test error message');
    expect(error.field).toBeUndefined();
  });

  it('should create error with message and field', () => {
    const error = new ValidationError('Test error message', 'testField');
    
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Test error message');
    expect(error.field).toBe('testField');
  });

  it('should be instance of Error', () => {
    const error = new ValidationError('Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
  });
});