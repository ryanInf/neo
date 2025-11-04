import Queue from 'bull';
import { createRedisConnection } from '../config/redis';

/**
 * 队列配置选项
 */
const queueOptions = {
  createClient: (type: string) => {
    // 为每个队列创建独立的 Redis 连接
    const redis = createRedisConnection();
    return redis;
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600, // 保留1小时
      count: 1000, // 最多保留1000个已完成任务
    },
    removeOnFail: {
      age: 86400, // 保留24小时
    },
  },
};

/**
 * AI 分析任务队列
 * 用于处理 API 文档的 AI 分析任务，避免阻塞主线程
 */
export const apiAnalysisQueue = new Queue('api-analysis', queueOptions);

/**
 * 技能优化任务队列
 * 用于处理技能优化任务，避免阻塞主线程
 */
export const skillOptimizationQueue = new Queue('skill-optimization', queueOptions);

/**
 * 初始化队列事件监听
 */
export function initializeQueueEvents(): void {
  // API 分析队列事件
  apiAnalysisQueue.on('completed', (job) => {
    console.log(`[Queue] API analysis job ${job.id} completed`);
  });

  apiAnalysisQueue.on('failed', (job, err) => {
    console.error(`[Queue] API analysis job ${job?.id} failed:`, err);
  });

  apiAnalysisQueue.on('error', (error) => {
    console.error('[Queue] API analysis queue error:', error);
  });

  // 技能优化队列事件
  skillOptimizationQueue.on('completed', (job) => {
    console.log(`[Queue] Skill optimization job ${job.id} completed`);
  });

  skillOptimizationQueue.on('failed', (job, err) => {
    console.error(`[Queue] Skill optimization job ${job?.id} failed:`, err);
  });

  skillOptimizationQueue.on('error', (error) => {
    console.error('[Queue] Skill optimization queue error:', error);
  });

  console.log('[Queue] Queue events initialized');
}

/**
 * 清理队列资源
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    apiAnalysisQueue.close(),
    skillOptimizationQueue.close(),
  ]);
  console.log('[Queue] All queues closed');
}

