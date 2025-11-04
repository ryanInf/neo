import { apiAnalysisQueue } from '../queues';
import { analyzeApiDoc, analyzePendingApiDocs } from '../services/api-analysis.service';

/**
 * API 分析队列处理器
 */
export function startApiAnalysisWorker(): void {
  console.log('[Worker] Starting API analysis worker...');

  // 处理单个 API 文档分析任务
  apiAnalysisQueue.process('analyze-single', async (job) => {
    const { apiDocId } = job.data;
    console.log(`[Worker] Processing API analysis job for doc: ${apiDocId}`);
    
    try {
      await analyzeApiDoc(apiDocId);
      return { success: true, apiDocId };
    } catch (error) {
      console.error(`[Worker] Error processing API analysis job ${job.id}:`, error);
      throw error;
    }
  });

  // 处理批量 API 文档分析任务
  apiAnalysisQueue.process('analyze-batch', async (job) => {
    const { limit } = job.data;
    console.log(`[Worker] Processing batch API analysis job with limit: ${limit}`);
    
    try {
      await analyzePendingApiDocs(limit);
      return { success: true, limit };
    } catch (error) {
      console.error(`[Worker] Error processing batch API analysis job ${job.id}:`, error);
      throw error;
    }
  });

  console.log('[Worker] API analysis worker started');
}

