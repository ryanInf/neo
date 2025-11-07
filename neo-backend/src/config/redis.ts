import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis 连接配置
 */
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * 创建 Redis 连接实例（通用）
 */
export function createRedisConnection(): Redis {
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError: (err) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  });

  redis.on('connect', () => {
    console.log('[Redis] Connected to Redis');
  });

  redis.on('error', (err) => {
    console.error('[Redis] Redis connection error:', err);
  });

  redis.on('close', () => {
    console.log('[Redis] Redis connection closed');
  });

  return redis;
}

/**
 * 为 Bull 队列创建 Redis 连接
 * Bull 对 Redis 连接有特殊要求，不能使用 maxRetriesPerRequest 等选项
 */
export function createBullRedisConnection(type: 'client' | 'subscriber' | 'bclient'): Redis {
  // Bull 需要的配置：移除 maxRetriesPerRequest 和 enableReadyCheck
  const config: any = {
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    reconnectOnError: (err: Error) => {
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  };

  // 对于 subscriber 和 bclient，必须禁用这些选项
  if (type === 'subscriber' || type === 'bclient') {
    config.maxRetriesPerRequest = null;
    config.enableReadyCheck = false;
  }

  const redis = new Redis(redisUrl, config);

  redis.on('connect', () => {
    console.log(`[Redis] Bull ${type} connected`);
  });

  redis.on('error', (err) => {
    console.error(`[Redis] Bull ${type} connection error:`, err);
  });

  return redis;
}

/**
 * 默认 Redis 连接实例
 */
export const redis = createRedisConnection();

