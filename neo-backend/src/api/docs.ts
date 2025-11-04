import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { apiAnalysisQueue } from '../queues';

const prisma = new PrismaClient();

/**
 * 查询 API 文档列表
 * GET /api/docs
 */
export async function getApiDocs(req: Request, res: Response): Promise<void> {
  try {
    const { domain, method, limit = 50, offset = 0 } = req.query;
    
    const where: any = {};
    
    if (domain) {
      where.domain = domain as string;
    }
    
    if (method) {
      where.method = (method as string).toUpperCase();
    }
    
    const [docs, total] = await Promise.all([
      prisma.apiDoc.findMany({
        where,
        take: Number(limit),
        skip: Number(offset),
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
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('Error fetching API docs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * 获取单个 API 文档详情
 * GET /api/docs/:id
 */
export async function getApiDocById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    const doc = await prisma.apiDoc.findUnique({
      where: { id },
    });
    
    if (!doc) {
      res.status(404).json({ error: 'API doc not found' });
      return;
    }
    
    res.json({
      success: true,
      data: doc,
    });
  } catch (error) {
    console.error('Error fetching API doc:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * 触发 API 文档分析
 * POST /api/docs/:id/analyze
 */
export async function analyzeApiDocById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // 将任务加入队列，不阻塞响应
    const job = await apiAnalysisQueue.add('analyze-single', { apiDocId: id });
    
    res.json({
      success: true,
      message: 'Analysis started',
      jobId: job.id,
    });
  } catch (error) {
    console.error('Error starting analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * 批量分析待处理的 API 文档
 * POST /api/docs/analyze-pending
 */
export async function analyzePendingDocs(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 10 } = req.body;
    
    // 将任务加入队列，不阻塞响应
    const job = await apiAnalysisQueue.add('analyze-batch', { limit: Number(limit) });
    
    res.json({
      success: true,
      message: 'Batch analysis started',
      jobId: job.id,
    });
  } catch (error) {
    console.error('Error starting batch analysis:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

