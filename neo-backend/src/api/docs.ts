import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { analyzeApiDoc, analyzePendingApiDocs } from '../services/api-analysis.service';
import { ValidationError, NotFoundError } from '../utils/errors';
import { validateRequired, validateNumberRange } from '../utils/validation';

/**
 * 查询 API 文档列表
 * GET /api/docs
 */
export async function getApiDocs(req: Request, res: Response): Promise<void> {
  try {
    const { domain, method, limit = 50, offset = 0 } = req.query;
    
    const where: Record<string, any> = {};
    
    if (domain) {
      where.domain = domain as string;
    }
    
    if (method) {
      where.method = (method as string).toUpperCase();
    }
    
    const limitNum = Number(limit);
    const offsetNum = Number(offset);
    
    // 验证分页参数
    validateNumberRange(limitNum, 'limit', 1, 100);
    validateNumberRange(offsetNum, 'offset', 0);
    
    const [docs, total] = await Promise.all([
      prisma.apiDoc.findMany({
        where,
        take: limitNum,
        skip: offsetNum,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.apiDoc.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: docs,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 获取单个 API 文档详情
 * GET /api/docs/:id
 */
export async function getApiDocById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    validateRequired(id, 'id');
    
    const doc = await prisma.apiDoc.findUnique({
      where: { id },
    });
    
    if (!doc) {
      throw new NotFoundError('API doc', id);
    }
    
    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 触发 API 文档分析
 * POST /api/docs/:id/analyze
 */
export async function analyzeApiDocById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    validateRequired(id, 'id');
    
    // 异步分析，不阻塞响应
    analyzeApiDoc(id).catch(error => {
      console.error(`Error analyzing doc ${id}:`, error);
    });
    
    res.json({
      success: true,
      message: 'Analysis started',
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 批量分析待处理的 API 文档
 * POST /api/docs/analyze-pending
 */
export async function analyzePendingDocs(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 10 } = req.body;
    
    const limitNum = Number(limit);
    validateNumberRange(limitNum, 'limit', 1, 50);
    
    // 异步分析，不阻塞响应
    analyzePendingApiDocs(limitNum).catch(error => {
      console.error('Error analyzing pending docs:', error);
    });
    
    res.json({
      success: true,
      message: 'Batch analysis started',
    });
  } catch (error) {
    throw error;
  }
}

