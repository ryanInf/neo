import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Redis 连接配置
 */
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * 创建 Redis 连接实例
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
 * 默认 Redis 连接实例
 */
export const redis = createRedisConnection();

