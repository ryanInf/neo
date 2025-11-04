import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { captureApi } from './api/capture';
import { getApiDocs, getApiDocById, analyzeApiDocById, analyzePendingDocs } from './api/docs';
import { createSkill, getSkills, getSkillById, downloadSkill, checkSkillUpdates } from './api/skills';
import { receiveLogs } from './api/logs';
import { optimizeSkillById, optimizeAllSkills } from './api/skill-optimize';
import { initializeQueueEvents, closeQueues } from './queues';
import { startAllWorkers } from './workers';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 配置
const isDevelopment = process.env.NODE_ENV !== 'production';
const corsOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : [];

// 配置 CORS
const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // 开发环境：允许所有来源
    if (isDevelopment) {
      callback(null, true);
      return;
    }
    
    // 生产环境：使用白名单
    if (corsOrigins.length === 0) {
      // 如果没有配置，默认允许所有（但不推荐）
      console.warn('[Neo] Warning: CORS_ORIGIN not configured, allowing all origins');
      callback(null, true);
      return;
    }
    
    // 检查是否在白名单中
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    }
  },
  credentials: true, // 允许携带凭证（cookie、authorization header 等）
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // 24小时预检请求缓存
};

// 中间件
app.use(cors(corsOptions));
app.use(express.json());

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
app.post('/api/skills/check-updates', checkSkillUpdates);
app.post('/api/skills/:id/optimize', optimizeSkillById);
app.post('/api/skills/optimize', optimizeAllSkills);
app.post('/api/logs', receiveLogs);

// 初始化队列系统和处理器
initializeQueueEvents();
startAllWorkers();

// 启动服务器
const server = app.listen(PORT, () => {
  console.log(`[Neo Backend] Server running on port ${PORT}`);
});

// 优雅关闭处理
process.on('SIGTERM', async () => {
  console.log('[Neo Backend] SIGTERM received, shutting down gracefully...');
  await closeQueues();
  server.close(() => {
    console.log('[Neo Backend] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Neo Backend] SIGINT received, shutting down gracefully...');
  await closeQueues();
  server.close(() => {
    console.log('[Neo Backend] Server closed');
    process.exit(0);
  });
});

