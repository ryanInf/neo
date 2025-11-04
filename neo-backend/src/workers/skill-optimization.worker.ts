import { skillOptimizationQueue } from '../queues';
import { optimizeSkill, optimizeSkills } from '../services/skill-optimization.service';

/**
 * 技能优化队列处理器
 */
export function startSkillOptimizationWorker(): void {
  console.log('[Worker] Starting skill optimization worker...');

  // 处理单个技能优化任务
  skillOptimizationQueue.process('optimize-single', async (job) => {
    const { skillId } = job.data;
    console.log(`[Worker] Processing skill optimization job for skill: ${skillId}`);
    
    try {
      await optimizeSkill(skillId);
      return { success: true, skillId };
    } catch (error) {
      console.error(`[Worker] Error processing skill optimization job ${job.id}:`, error);
      throw error;
    }
  });

  // 处理批量技能优化任务
  skillOptimizationQueue.process('optimize-batch', async (job) => {
    const { limit } = job.data;
    console.log(`[Worker] Processing batch skill optimization job with limit: ${limit}`);
    
    try {
      await optimizeSkills(limit);
      return { success: true, limit };
    } catch (error) {
      console.error(`[Worker] Error processing batch skill optimization job ${job.id}:`, error);
      throw error;
    }
  });

  console.log('[Worker] Skill optimization worker started');
}

