import { ValidationError } from './errors';

/**
 * 验证字符串非空
 */
export function validateRequired(value: any, fieldName: string): asserts value is string {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new ValidationError(`${fieldName} is required`);
  }
}

/**
 * 验证数组非空
 */
export function validateArray(value: any, fieldName: string): asserts value is any[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${fieldName} must be a non-empty array`);
  }
}

/**
 * 验证数字范围
 */
export function validateNumberRange(
  value: any,
  fieldName: string,
  min?: number,
  max?: number
): asserts value is number {
  const num = Number(value);
  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }
  if (min !== undefined && num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }
  if (max !== undefined && num > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`);
  }
}

/**
 * 验证 URL 格式
 */
export function validateUrl(value: any, fieldName: string): asserts value is string {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }
  try {
    new URL(value);
  } catch {
    throw new ValidationError(`${fieldName} must be a valid URL`);
  }
}

/**
 * 验证 HTTP 方法
 */
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = typeof HTTP_METHODS[number];

export function validateHttpMethod(value: any, fieldName: string): asserts value is HttpMethod {
  if (!HTTP_METHODS.includes(value?.toUpperCase() as HttpMethod)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${HTTP_METHODS.join(', ')}`
    );
  }
}

