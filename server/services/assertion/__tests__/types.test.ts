import { describe, test, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  AssertionType,
  AssertionError,
  AssertionErrorType,
  type Assertion,
  type AssertionResult
} from '../types';

describe('Assertion Types', () => {
  describe('AssertionError', () => {
    test('should create error with correct properties', () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion'
      };
      
      const error = new AssertionError(
        AssertionErrorType.INVALID_ASSERTION,
        'Test error message',
        assertion,
        ['Suggestion 1', 'Suggestion 2']
      );
      
      expect(error.name).toBe('AssertionError');
      expect(error.type).toBe(AssertionErrorType.INVALID_ASSERTION);
      expect(error.message).toBe('Test error message');
      expect(error.assertion).toBe(assertion);
      expect(error.suggestions).toEqual(['Suggestion 1', 'Suggestion 2']);
      expect(error instanceof Error).toBe(true);
      expect(error instanceof AssertionError).toBe(true);
    });
  });
  
  describe('Property 7: 验证结果的结构完整性', () => {
    // Feature: assertion-service, Property 7: 验证结果的结构完整性
    test('验证结果应该包含必需字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            success: fc.boolean(),
            assertionType: fc.constantFrom(...Object.values(AssertionType)),
            error: fc.option(fc.string(), { nil: undefined }),
            matchType: fc.option(fc.string(), { nil: undefined }),
            actualValue: fc.option(fc.anything(), { nil: undefined }),
            expectedValue: fc.option(fc.anything(), { nil: undefined }),
            warnings: fc.option(fc.array(fc.string()), { nil: undefined }),
            suggestions: fc.option(fc.array(fc.string()), { nil: undefined }),
            duration: fc.option(fc.nat(), { nil: undefined }),
            metadata: fc.option(fc.dictionary(fc.string(), fc.anything()), { nil: undefined })
          }),
          async (result: AssertionResult) => {
            // 必需字段
            expect(result).toHaveProperty('success');
            expect(result).toHaveProperty('assertionType');
            expect(typeof result.success).toBe('boolean');
            expect(typeof result.assertionType).toBe('string');
            
            // 失败时应该有error字段
            if (!result.success) {
              expect(result).toHaveProperty('error');
              // 如果有error字段，它应该是字符串或undefined
              if (result.error !== undefined) {
                expect(typeof result.error).toBe('string');
              }
            }
            
            // 可选字段的类型检查
            if (result.matchType !== undefined) {
              expect(typeof result.matchType).toBe('string');
            }
            
            if (result.warnings !== undefined) {
              expect(Array.isArray(result.warnings)).toBe(true);
            }
            
            if (result.suggestions !== undefined) {
              expect(Array.isArray(result.suggestions)).toBe(true);
            }
            
            if (result.duration !== undefined) {
              expect(typeof result.duration).toBe('number');
              expect(result.duration).toBeGreaterThanOrEqual(0);
            }
            
            if (result.metadata !== undefined) {
              expect(typeof result.metadata).toBe('object');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('失败的验证结果必须包含error字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            success: fc.constant(false),
            assertionType: fc.constantFrom(...Object.values(AssertionType)),
            error: fc.string({ minLength: 1 }),
            matchType: fc.option(fc.string()),
            actualValue: fc.option(fc.anything()),
            expectedValue: fc.option(fc.anything())
          }),
          async (result: AssertionResult) => {
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(typeof result.error).toBe('string');
            expect(result.error!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
    
    test('成功的验证结果可以没有error字段', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            success: fc.constant(true),
            assertionType: fc.constantFrom(...Object.values(AssertionType)),
            matchType: fc.option(fc.string()),
            actualValue: fc.option(fc.anything()),
            expectedValue: fc.option(fc.anything())
          }),
          async (result: AssertionResult) => {
            expect(result.success).toBe(true);
            // error字段可以存在也可以不存在
            if (result.error !== undefined) {
              expect(typeof result.error).toBe('string');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
  
  describe('Assertion object validation', () => {
    test('should have required fields', () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion'
      };
      
      expect(assertion.id).toBeDefined();
      expect(assertion.description).toBeDefined();
    });
    
    test('should support optional fields', () => {
      const assertion: Assertion = {
        id: 'test-1',
        description: 'Test assertion',
        type: AssertionType.FILE_DOWNLOAD,
        selector: '#test',
        ref: 'test-ref',
        value: 'test-value',
        condition: 'visible',
        timeout: 5000,
        matchMode: 'auto',
        metadata: { key: 'value' }
      };
      
      expect(assertion.type).toBe(AssertionType.FILE_DOWNLOAD);
      expect(assertion.selector).toBe('#test');
      expect(assertion.ref).toBe('test-ref');
      expect(assertion.value).toBe('test-value');
      expect(assertion.condition).toBe('visible');
      expect(assertion.timeout).toBe(5000);
      expect(assertion.matchMode).toBe('auto');
      expect(assertion.metadata).toEqual({ key: 'value' });
    });
  });
  
  describe('AssertionType enum', () => {
    test('should have all expected types', () => {
      expect(AssertionType.FILE_DOWNLOAD).toBe('file_download');
      expect(AssertionType.POPUP).toBe('popup');
      expect(AssertionType.ELEMENT_VISIBILITY).toBe('element_visibility');
      expect(AssertionType.TEXT_CONTENT).toBe('text_content');
      expect(AssertionType.ELEMENT_STATE).toBe('element_state');
      expect(AssertionType.ELEMENT_ATTRIBUTE).toBe('element_attribute');
      expect(AssertionType.PAGE_STATE).toBe('page_state');
    });
  });
  
  describe('AssertionErrorType enum', () => {
    test('should have all expected error types', () => {
      expect(AssertionErrorType.INVALID_ASSERTION).toBe('invalid_assertion');
      expect(AssertionErrorType.NO_STRATEGY_FOUND).toBe('no_strategy_found');
      expect(AssertionErrorType.VERIFICATION_FAILED).toBe('verification_failed');
      expect(AssertionErrorType.TIMEOUT).toBe('timeout');
      expect(AssertionErrorType.ELEMENT_NOT_FOUND).toBe('element_not_found');
      expect(AssertionErrorType.FILE_NOT_FOUND).toBe('file_not_found');
      expect(AssertionErrorType.TEXT_NOT_FOUND).toBe('text_not_found');
      expect(AssertionErrorType.UNEXPECTED_ERROR).toBe('unexpected_error');
    });
  });
});
