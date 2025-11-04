import { Request, Response } from 'express';
import { optimizeSkill, optimizeSkills } from '../services/skill-optimization.service';
import { validateNumberRange, validateRequired } from '../utils/validation';

/**
 * 优化单个技能
 * POST /api/skills/:id/optimize
 */

export async function optimizeSkillById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    validateRequired(id, 'id');
    
    // 异步优化，不阻塞响应
    optimizeSkill(id).catch(error => {
      console.error(`Error optimizing skill ${id}:`, error);
    });
    
    res.json({
      success: true,
      message: 'Optimization started',
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 批量优化技能
 * POST /api/skills/optimize
 */
export async function optimizeAllSkills(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 10 } = req.body;
    
    const limitNum = Number(limit);
    validateNumberRange(limitNum, 'limit', 1, 50);
    
    // 异步优化，不阻塞响应
    optimizeSkills(limitNum).catch(error => {
      console.error('Error optimizing skills:', error);
    });
    
    res.json({
      success: true,
      message: 'Batch optimization started',
    });
  } catch (error) {
    throw error;
  }
}

