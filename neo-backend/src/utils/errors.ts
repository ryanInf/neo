/**
 * 自定义错误类
 */
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 业务错误类
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      404,
      'NOT_FOUND'
    );
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

export class ExternalApiError extends AppError {
  constructor(message: string, details?: any) {
    super(message, 502, 'EXTERNAL_API_ERROR', details);
  }
}

/**
 * 错误响应格式
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: any;
  };
}

/**
 * 创建错误响应
 */
export function createErrorResponse(error: unknown): ErrorResponse {
  if (error instanceof AppError) {
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    };
  }
  
  if (error instanceof Error) {
    return {
      success: false,
      error: {
        message: error.message,
        code: 'INTERNAL_ERROR',
      },
    };
  }
  
  return {
    success: false,
    error: {
      message: 'An unknown error occurred',
      code: 'UNKNOWN_ERROR',
    },
  };
}

/**
 * 错误处理中间件
 */
import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errorResponse = createErrorResponse(error);
  
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  
  // 记录错误日志
  if (statusCode >= 500) {
    console.error('[Error Handler]', {
      url: req.url,
      method: req.method,
      error: error instanceof Error ? error.stack : error,
    });
  } else {
    console.warn('[Error Handler]', {
      url: req.url,
      method: req.method,
      error: error instanceof Error ? error.message : error,
    });
  }
  
  res.status(statusCode).json(errorResponse);
}

