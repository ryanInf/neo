import express from 'express';
import cors from 'cors';
import { config, validateConfig } from './utils/config';
import { errorHandler } from './utils/errors';
import { captureApi } from './api/capture';
import { getApiDocs, getApiDocById, analyzeApiDocById, analyzePendingDocs } from './api/docs';
import { createSkill, getSkills, getSkillById, downloadSkill } from './api/skills';
import { receiveLogs } from './api/logs';
import { optimizeSkillById, optimizeAllSkills } from './api/skill-optimize';

// 验证配置
validateConfig();

const app = express();

// 中间件
app.use(cors());
app.use(express.json({ limit: '10mb' })); // 限制请求体大小

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API 路由
app.post('/api/capture', captureApi);
app.get('/api/docs', getApiDocs);
app.get('/api/docs/:id', getApiDocById);
app.post('/api/docs/:id/analyze', analyzeApiDocById);
app.post('/api/docs/analyze-pending', analyzePendingDocs);
app.post('/api/skills', createSkill);
app.get('/api/skills', getSkills);
app.get('/api/skills/:id', getSkillById);
app.get('/api/skills/:id/download', downloadSkill);
app.post('/api/skills/:id/optimize', optimizeSkillById);
app.post('/api/skills/optimize', optimizeAllSkills);
app.post('/api/logs', receiveLogs);

// 全局错误处理中间件（必须放在最后）
app.use(errorHandler);

// 启动服务器
app.listen(config.port, () => {
  console.log(`[Neo Backend] Server running on port ${config.port} (${config.nodeEnv})`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

