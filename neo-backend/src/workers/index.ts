import { startApiAnalysisWorker } from './api-analysis.worker';
import { startSkillOptimizationWorker } from './skill-optimization.worker';

/**
 * 启动所有队列处理器
 */
export function startAllWorkers(): void {
  console.log('[Workers] Starting all queue workers...');
  
  startApiAnalysisWorker();
  startSkillOptimizationWorker();
  
  console.log('[Workers] All workers started');
}

