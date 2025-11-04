import { Request, Response } from 'express';
import { skillOptimizationQueue } from '../queues';

/**
 * 优化单个技能
 * POST /api/skills/:id/optimize
 */
export async function optimizeSkillById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // 将任务加入队列，不阻塞响应
    const job = await skillOptimizationQueue.add('optimize-single', { skillId: id });
    
    res.json({
      success: true,
      message: 'Optimization started',
      jobId: job.id,
    });
  } catch (error) {
    console.error('Error starting optimization:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * 批量优化技能
 * POST /api/skills/optimize
 */
export async function optimizeAllSkills(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 10 } = req.body;
    
    // 将任务加入队列，不阻塞响应
    const job = await skillOptimizationQueue.add('optimize-batch', { limit: Number(limit) });
    
    res.json({
      success: true,
      message: 'Batch optimization started',
      jobId: job.id,
    });
  } catch (error) {
    console.error('Error starting batch optimization:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

