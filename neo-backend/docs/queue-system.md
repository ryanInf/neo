# Redis/队列系统实现说明

## 概述

Redis/队列系统使用 Bull 和 ioredis 实现了异步任务队列，用于处理耗时的 AI 分析任务，避免阻塞 API 响应。

## 架构

### 核心组件

1. **Redis 连接配置** (`src/config/redis.ts`)
   - 创建和管理 Redis 连接
   - 支持自动重连和错误处理

2. **队列定义** (`src/queues/index.ts`)
   - `apiAnalysisQueue`: API 文档分析任务队列
   - `skillOptimizationQueue`: 技能优化任务队列
   - 队列事件监听和日志记录

3. **队列处理器** (`src/workers/`)
   - `api-analysis.worker.ts`: 处理 API 分析任务
   - `skill-optimization.worker.ts`: 处理技能优化任务

## 使用方式

### 环境变量配置

确保 `.env` 文件中包含 Redis 连接配置：

```env
REDIS_URL="redis://localhost:6379"
```

### 启动服务

服务启动时会自动：
1. 初始化 Redis 连接
2. 创建队列实例
3. 启动队列处理器
4. 监听队列事件

### API 端点

以下端点已更新为使用队列处理：

- `POST /api/docs/:id/analyze` - 分析单个 API 文档
- `POST /api/docs/analyze-pending` - 批量分析待处理的 API 文档
- `POST /api/skills/:id/optimize` - 优化单个技能
- `POST /api/skills/optimize` - 批量优化技能

响应示例：

```json
{
  "success": true,
  "message": "Analysis started",
  "jobId": "123"
}
```

## 队列特性

### 任务重试

- 默认最多重试 3 次
- 使用指数退避策略（初始延迟 2 秒）

### 任务清理

- 已完成任务：保留 1 小时或最多 1000 个
- 失败任务：保留 24 小时

### 队列监控

队列会记录以下事件：
- `completed`: 任务完成
- `failed`: 任务失败
- `error`: 队列错误

## 开发和调试

### 查看队列状态

可以使用 Redis CLI 查看队列状态：

```bash
redis-cli
> KEYS bull:*
> LLEN bull:api-analysis:waiting
> LLEN bull:api-analysis:active
```

### 日志

队列和处理器会输出详细的日志信息：
- `[Redis]`: Redis 连接状态
- `[Queue]`: 队列事件
- `[Worker]`: 任务处理状态

## 注意事项

1. **Redis 连接**: 确保 Redis 服务正在运行
2. **任务处理**: 队列处理器在主进程中运行，如需独立进程可以使用 PM2 等工具
3. **错误处理**: 任务失败会自动重试，超过重试次数后会被标记为失败

## 未来扩展

- 可以添加队列监控面板（如 Bull Board）
- 可以实现任务优先级
- 可以添加任务进度跟踪
- 可以实现分布式队列处理（多进程/多服务器）

