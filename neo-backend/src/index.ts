import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { captureApi } from './api/capture';
import { getApiDocs, getApiDocById, analyzeApiDocById, analyzePendingDocs } from './api/docs';
import { createSkill, getSkills, getSkillById, downloadSkill, checkSkillUpdates } from './api/skills';
import { receiveLogs } from './api/logs';
import { optimizeSkillById, optimizeAllSkills } from './api/skill-optimize';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
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

// 启动服务器
app.listen(PORT, () => {
  console.log(`[Neo Backend] Server running on port ${PORT}`);
});

