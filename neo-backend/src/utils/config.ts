import dotenv from 'dotenv';

dotenv.config();

/**
 * 环境变量配置
 */
export const config = {
  // 服务器配置
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // OpenAI/SiliconFlow 配置
  siliconFlowApiKey: process.env.SILICONFLOW_API_KEY || '',
  siliconFlowBaseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
  
  // 数据库配置
  databaseUrl: process.env.DATABASE_URL || '',
  
  // Redis 配置（如果使用）
  redisUrl: process.env.REDIS_URL || '',
  
  // API 配置
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
};

/**
 * 验证必需的配置项
 */
export function validateConfig(): void {
  const required = [
    { key: 'DATABASE_URL', value: config.databaseUrl, name: '数据库连接地址' },
    { key: 'SILICONFLOW_API_KEY', value: config.siliconFlowApiKey, name: 'SiliconFlow API Key' },
  ];
  
  const missing: string[] = [];
  
  for (const item of required) {
    if (!item.value) {
      missing.push(item.name);
    }
  }
  
  if (missing.length > 0) {
    throw new Error(
      `缺少必需的环境变量配置：${missing.join(', ')}\n` +
      `请检查以下环境变量：${required.map(r => r.key).join(', ')}`
    );
  }
}

// 启动时验证配置
if (config.nodeEnv !== 'test') {
  try {
    validateConfig();
  } catch (error) {
    console.error('配置验证失败:', error);
    process.exit(1);
  }
}

