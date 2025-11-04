# Neo 项目开发计划

## 总体进度：100% ✅

所有 Phase 1-5 的核心功能均已实现完成。

## 最新优化（2025-01-XX）

### 🚀 AI 学习能力增强
- ✅ 优化 API 文档生成 Prompt，让 AI 深入学习 API 的业务语义和使用模式
- ✅ 支持识别 API 的常见使用模式、最佳实践和常见错误
- ✅ 增强 API 关系学习，理解 API 之间的依赖关系和调用顺序

### 🎯 智能技能编排增强
- ✅ 优化技能编排 Prompt，支持迭代式编排（如不断迭代搜索、推荐）
- ✅ 支持循环、迭代、条件判断等复杂流程
- ✅ 增强功能生成：将简单的 API 调用组合成高级业务功能
- ✅ 更新类型定义，支持循环类型（loopType）、循环条件（loopCondition）等字段
- ✅ 提高 AI 温度参数和 token 限制，支持更创新的编排方式

---

## 已完成功能

### Phase 1: 基础数据收集 ✅ 100%

#### 1.1 项目初始化 ✅
- [x] 创建 `neo-extension` 目录和基础结构
- [x] 创建 `neo-backend` 目录和基础结构
- [x] 配置 TypeScript、构建工具（Vite）
- [x] 初始化 Git 仓库

#### 1.2 插件端：API 监听 ✅
- [x] 创建 `manifest.json`（Manifest V3）
- [x] 实现 Content Script 注入
- [x] 拦截 fetch/XHR 请求（监听、捕获请求/响应数据）
- [x] 实现数据脱敏（过滤敏感字段）
- [x] 实现 Service Worker 后台脚本
- [x] 实现数据上报到服务端（批量发送）

#### 1.3 后端：数据接收和存储 ✅
- [x] 初始化 Express 服务器
- [x] 配置 PostgreSQL + Prisma（ApiDoc 模型）
- [x] 创建 API 接收接口（`POST /api/capture`）
- [x] 数据去重和存储

---

### Phase 2: AI 文档生成（增强版：AI 学习 API）✅ 100%

#### 2.1 AI 服务集成 ✅
- [x] 创建 SiliconFlow API 客户端（DeepSeek-V3.2-Exp）
- [x] 设计 API 文档生成 Prompt（增强版：深入学习 API）
- [x] 实现错误处理和重试机制

#### 2.2 文档生成服务 ✅
- [x] 创建 `api-analysis.service.ts`
- [x] 批量处理未分析的 API 调用
- [x] **优化 Prompt**：增强业务语义理解、使用模式识别、API 关系学习

#### 2.3 文档查询接口 ✅
- [x] `GET /api/docs` - 查询 API 文档列表
- [x] `GET /api/docs/:id` - 获取单个 API 文档详情
- [x] `POST /api/docs/:id/analyze` - 触发 API 文档分析
- [x] `POST /api/docs/analyze-pending` - 批量分析待处理的 API

---

### Phase 3: 技能自动编排（增强版：智能编排）✅ 100%

#### 3.1 技能编排服务 ✅
- [x] 创建 `Skill` 数据模型（Prisma）
- [x] 创建 `skill-orchestration.service.ts`
- [x] AI 分析相关 API，识别工作流模式
- [x] **优化 Prompt**：支持迭代式编排、上下文感知、增强功能生成
- [x] **增强类型定义**：添加循环类型（loopType）、循环条件（loopCondition）等字段

#### 3.2 JavaScript 代码生成器 ✅
- [x] 创建 `skill-code-generator.ts`
- [x] 根据技能定义生成 JavaScript 代码
- [x] **支持复杂控制流**：循环、迭代、条件判断

#### 3.3 技能管理接口 ✅
- [x] `POST /api/skills` - 创建技能
- [x] `GET /api/skills` - 查询技能列表
- [x] `GET /api/skills/:id` - 获取技能详情
- [x] `GET /api/skills/:id/download` - 下载技能定义

---

### Phase 4: 技能下载和执行 ✅ 100%

#### 4.1 插件端：技能管理 ✅
- [x] 实现技能下载功能
- [x] 技能缓存和版本管理
- [x] 检测技能更新

#### 4.2 插件端：技能执行引擎（核心）✅
- [x] 创建 JavaScript 执行环境
- [x] 实现技能上下文（SkillContext）
- [x] 实现技能执行逻辑（错误处理、参数传递）

#### 4.3 插件端：UI 注入 ✅
- [x] 在页面中注入技能按钮
- [x] 实现用户交互（执行、进度显示）

#### 4.4 插件端：日志收集 ✅
- [x] 记录技能执行过程
- [x] 实现日志批量上报

#### 4.5 后端：日志接收接口 ✅
- [x] 创建 `ExecutionLog` 数据模型
- [x] `POST /api/logs` - 接收执行日志

---

### Phase 5: 技能优化 ✅ 100%

#### 5.1 技能优化服务 ✅
- [x] 创建 `skill-optimization.service.ts`
- [x] AI 分析日志，识别问题和优化点
- [x] 自动改进技能编排

#### 5.2 技能版本更新 ✅
- [x] 实现技能版本管理
- [x] `POST /api/skills/:id/optimize` - 优化单个技能
- [x] `POST /api/skills/optimize` - 批量优化技能

---

## 待完成任务

### 🔴 必须修复（阻塞功能）

#### 1. 插件图标文件创建 ✅
- [x] 创建插件图标文件：
  - `neo-extension/src/icons/icon16.png`
  - `neo-extension/src/icons/icon48.png`
  - `neo-extension/src/icons/icon128.png`
- **状态**: 已完成
- **方法**: 从 `neo.png` (1024x1024) 源文件生成

#### 2. 技能代码生成器中的 URL 替换 ✅
- [x] 修复 `skill-code-generator.ts` 中的 TODO：
  - 当前：`url: '${apiCall.apiDocId}'` （使用 ID 而不是实际 URL）
  - 已修复：从 ApiDoc 中获取实际的 URL
- **位置**: `neo-backend/src/services/skill-code-generator.ts`
- **影响**: 生成的技能代码现在可以正确执行 API 调用

#### 3. API 调用方法硬编码问题 ✅
- [x] 修复 `skill-code-generator.ts` 中硬编码的 `method: 'GET'`
- [x] 现在从 ApiDoc 中获取实际的 HTTP 方法
- **位置**: `neo-backend/src/services/skill-code-generator.ts`
- **影响**: 生成的技能代码现在使用正确的 HTTP 方法

---

### 🟡 重要完善（影响体验）

#### 4. Redis/队列系统 ✅
- [x] Redis 连接配置 (`src/config/redis.ts`)
- [x] AI 分析任务队列 (`src/queues/index.ts` - `apiAnalysisQueue`)
- [x] 技能优化任务队列 (`src/queues/index.ts` - `skillOptimizationQueue`)
- [x] 队列处理器 (`src/workers/`)
  - API 分析处理器 (`api-analysis.worker.ts`)
  - 技能优化处理器 (`skill-optimization.worker.ts`)
- [x] API 路由已更新，使用队列处理异步任务
- **状态**: 已完成 ✅
- **实现细节**:
  - 使用 Bull 队列管理系统
  - 支持任务重试（最多3次，指数退避）
  - 自动清理已完成和失败的任务
  - 队列事件监听和日志记录

#### 5. 定时任务机制缺失 ⚠️
- [ ] 实现定时批量分析待处理的 API 文档
- [ ] 实现定时批量优化技能
- **影响**: 需要手动触发批量处理，无法自动化

#### 6. 技能执行错误重试机制
- [x] 在技能执行引擎中添加重试逻辑
- [x] 可配置的重试次数和退避策略
- **当前状态**: ✅ 已完成
  - 实现了 API 调用级别的重试机制
  - 支持指数退避、线性退避和固定延迟三种策略
  - 可配置最大重试次数、延迟时间等参数
  - 支持按 HTTP 状态码和错误类型判断是否可重试
  - UI 中显示重试信息和重试详情

#### 7. 技能更新推送机制 ✅
- [x] 实现服务端到插件的推送通知（使用轮询机制 + Chrome Alarms API）
- [x] 插件检测到技能更新后自动下载新版本
- [x] 后端批量检查更新接口（`POST /api/skills/check-updates`）
- [x] 后台 Service Worker 定期检查更新（每 30 分钟）
- **状态**: 已完成

#### 8. 跨域请求处理（CORS）
- [ ] 增强插件端的 CORS 处理
- [ ] 处理跨域 API 调用场景

#### 9. 用户数据加密传输
- [ ] 实现敏感数据传输加密
- [ ] HTTPS 强制要求

#### 10. API 调用参数传递优化
- [ ] 改进技能代码生成器中的参数映射
- [ ] 支持更复杂的参数传递（嵌套对象、数组等）

---

### 🟢 可选功能（未来扩展）

#### 11. WebSocket 支持
- [ ] 支持监听 WebSocket 连接
- [ ] 捕获 WebSocket 消息
- **优先级**: 低

#### 12. 批量处理优化
- [ ] 实现后台任务调度系统
- [ ] 使用队列处理批量分析任务
- **优先级**: 中

#### 13. 插件性能优化
- [ ] 优化 API 拦截性能
- [ ] 减少对页面性能的影响
- [ ] 实现更智能的数据采样策略
- **优先级**: 中

#### 14. 技能执行调试工具
- [ ] 添加技能执行过程的详细日志
- [ ] 实时查看执行状态
- [ ] 错误诊断和修复建议
- **优先级**: 中

#### 15. 技能可视化编排
- [ ] 用户界面化编排 API
- [ ] 拖拽式工作流编辑器
- **优先级**: 低

---

### 📋 代码质量改进

#### 16. TypeScript 类型定义完善
- [ ] 检查并修复 lint 错误
- [ ] 完善类型定义

#### 17. 错误处理统一化
- [ ] 统一错误处理格式
- [ ] 添加错误码体系
- **优先级**: 中

#### 18. 单元测试和集成测试
- [ ] 添加单元测试
- [ ] 添加集成测试
- [ ] 添加端到端测试
- **优先级**: 高

#### 19. 日志系统完善
- [ ] 统一日志格式
- [ ] 日志级别管理
- [ ] 日志轮转和清理
- **优先级**: 中

---

### 🚀 发布官方插件商店任务清单

#### Phase 6: Chrome Web Store 发布准备

##### 6.1 插件商店材料准备
- [ ] **商店列表信息**
  - [ ] 插件名称（中文/英文）
  - [ ] 详细描述（突出核心功能）
  - [ ] 功能特性列表
  - [ ] 使用场景说明
  - [ ] 分类标签选择

- [ ] **视觉素材**
  - [ ] 商店图标（128x128 PNG，已有）
  - [ ] 推广横幅（920x680 或 1400x560 PNG）
  - [ ] 商店截图（1280x800 或 640x400，至少 1 张，最多 5 张）
  - [ ] 小型推广图（440x280 PNG）
  - [ ] 视频演示（可选，YouTube 链接）

- [ ] **隐私和安全**
  - [ ] 隐私政策页面（必须）
  - [ ] 数据收集声明
  - [ ] 权限使用说明
  - [ ] 用户数据处理方式说明

##### 6.2 代码审查和优化
- [ ] **权限最小化**
  - [ ] 审查 manifest.json 中的权限
  - [ ] 移除不必要的权限
  - [ ] 确保所有权限都有明确用途说明

- [ ] **代码质量**
  - [ ] 代码审查和安全审计
  - [ ] 移除调试代码和 console.log
  - [ ] 优化性能和资源占用
  - [ ] 确保无恶意代码

- [ ] **用户体验**
  - [ ] 错误处理完善
  - [ ] 用户提示和引导
  - [ ] 多语言支持（如需要）

##### 6.3 打包和签名
- [ ] **构建生产版本**
  - [ ] 配置生产环境构建
  - [ ] 优化代码体积
  - [ ] 压缩资源文件

- [ ] **版本管理**
  - [ ] 更新 version 号（遵循语义化版本）
  - [ ] 生成 changelog
  - [ ] 准备更新说明

##### 6.4 提交到 Chrome Web Store
- [ ] **开发者账户**
  - [ ] 注册 Chrome Web Store 开发者账户（一次性费用 $5）
  - [ ] 完成开发者信息验证

- [ ] **提交审核**
  - [ ] 上传 .zip 打包文件
  - [ ] 填写商店信息表单
  - [ ] 上传所有视觉素材
  - [ ] 提供隐私政策链接
  - [ ] 提交审核请求

- [ ] **审核后续**
  - [ ] 响应审核反馈
  - [ ] 修复审核问题
  - [ ] 等待审核通过（通常 1-3 个工作日）

##### 6.5 发布后维护
- [ ] **版本更新流程**
  - [ ] 建立版本发布流程
  - [ ] 准备更新说明模板
  - [ ] 监控用户反馈

- [ ] **用户支持**
  - [ ] 准备常见问题（FAQ）
  - [ ] 建立反馈渠道
  - [ ] 响应用户评价

---

### 🌐 部署后端服务任务清单

#### Phase 7: 生产环境部署

##### 7.1 服务器和基础设施准备
- [ ] **服务器选择**
  - [ ] 选择云服务提供商（AWS/阿里云/腾讯云/其他）
  - [ ] 选择服务器规格（CPU、内存、存储）
  - [ ] 配置服务器安全组和防火墙规则

- [ ] **域名和 SSL**
  - [ ] 注册域名
  - [ ] 配置 DNS 解析
  - [ ] 申请 SSL 证书（Let's Encrypt/商业证书）
  - [ ] 配置 HTTPS 和证书自动续期

- [ ] **数据库服务**
  - [ ] 选择数据库托管服务（RDS/云数据库 PostgreSQL）
  - [ ] 或部署独立 PostgreSQL 实例
  - [ ] 配置数据库备份策略
  - [ ] 设置数据库连接池

- [ ] **Redis 服务（如需要）**
  - [ ] 部署 Redis 实例（云 Redis 或独立部署）
  - [ ] 配置 Redis 持久化
  - [ ] 配置 Redis 访问密码

##### 7.2 环境配置和安全
- [ ] **环境变量管理**
  - [ ] 创建生产环境 `.env` 文件
  - [ ] 配置生产环境变量：
    - `DATABASE_URL`（生产数据库连接）
    - `SILICONFLOW_API_KEY`（AI 服务密钥）
    - `PORT`（服务端口）
    - `NODE_ENV=production`
    - `REDIS_URL`（如使用）
  - [ ] 使用密钥管理服务（AWS Secrets Manager/云密钥管理）
  - [ ] 确保密钥不提交到代码仓库

- [ ] **安全加固**
  - [ ] 配置 CORS 白名单（限制允许的域名）
  - [ ] 实现 API 限流（rate limiting）
  - [ ] 配置请求大小限制
  - [ ] 实现 API 认证（如需要）
  - [ ] 配置安全响应头（Helmet.js）
  - [ ] 定期更新依赖包（npm audit）

##### 7.3 数据库迁移和初始化
- [ ] **数据库迁移**
  - [ ] 备份开发环境数据库（如有数据）
  - [ ] 在生产环境运行 Prisma 迁移
  - [ ] 验证数据库结构
  - [ ] 初始化必要数据（如需要）

- [ ] **备份策略**
  - [ ] 配置自动数据库备份
  - [ ] 设置备份保留策略
  - [ ] 测试备份恢复流程

##### 7.4 应用部署
- [ ] **部署方式选择**
  - [ ] Docker 容器化部署（推荐）
    - [ ] 创建 Dockerfile
    - [ ] 创建 docker-compose.yml（生产配置）
    - [ ] 配置容器编排（如 Docker Swarm/Kubernetes）
  - [ ] 或传统部署（PM2 + Nginx）
    - [ ] 安装 Node.js 和依赖
    - [ ] 配置 PM2 进程管理
    - [ ] 配置 Nginx 反向代理

- [ ] **CI/CD 流程**
  - [ ] 配置 GitHub Actions 工作流
  - [ ] 自动化构建和测试
  - [ ] 自动化部署流程
  - [ ] 配置回滚机制

##### 7.4.1 GitHub Actions 详细设计

###### 工作流结构
- [ ] **CI 工作流**（`.github/workflows/ci.yml`）
  - [ ] 触发条件：push 到 main/develop 分支，PR 创建/更新
  - [ ] 并行执行：后端测试、插件构建测试
  - [ ] 代码质量检查（lint、type-check）
  - [ ] 运行单元测试（如有）
  - [ ] 构建验证（确保构建成功）

- [ ] **后端部署工作流**（`.github/workflows/deploy-backend.yml`）
  - [ ] 触发条件：push 到 main 分支，手动触发
  - [ ] 环境：production/staging
  - [ ] 步骤：
    1. 检出代码
    2. 设置 Node.js 环境
    3. 安装依赖并缓存
    4. 运行 Prisma 生成
    5. 构建 TypeScript
    6. 运行数据库迁移（生产环境）
    7. 构建 Docker 镜像（如使用）
    8. 部署到服务器

- [ ] **插件构建和发布工作流**（`.github/workflows/build-extension.yml`）
  - [ ] 触发条件：push 到 main 分支，创建 release tag
  - [ ] 步骤：
    1. 检出代码
    2. 设置 Node.js 环境
    3. 安装依赖并缓存
    4. 构建插件（生产模式）
    5. 打包为 .zip 文件
    6. 创建 GitHub Release（如为 tag）
    7. 上传构建产物

###### GitHub Secrets 配置
- [ ] 配置以下 Secrets：
  - `SERVER_HOST`：服务器 SSH 地址
  - `SERVER_USER`：SSH 用户名
  - `SSH_PRIVATE_KEY`：SSH 私钥
  - `DATABASE_URL`：生产数据库连接字符串（或使用密钥管理服务）
  - `SILICONFLOW_API_KEY`：AI 服务 API Key
  - `DOCKER_REGISTRY_USERNAME`：Docker 镜像仓库用户名（如使用）
  - `DOCKER_REGISTRY_PASSWORD`：Docker 镜像仓库密码（如使用）

###### 部署策略
- [ ] **蓝绿部署**（推荐）
  - [ ] 准备两个相同的生产环境
  - [ ] 在新环境部署新版本
  - [ ] 验证新版本健康检查
  - [ ] 切换流量到新环境
  - [ ] 保留旧环境作为回滚准备

- [ ] **滚动部署**（可选）
  - [ ] 逐步替换实例
  - [ ] 确保至少一个实例始终在线
  - [ ] 自动健康检查

- [ ] **回滚机制**
  - [ ] 保留最近 N 个版本
  - [ ] 一键回滚脚本
  - [ ] 自动回滚（健康检查失败时）

###### 示例配置文件

**`.github/workflows/ci.yml`**:
```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./neo-backend
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: neo-backend/package-lock.json
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run type-check
      
      - name: Generate Prisma Client
        run: npm run prisma:generate
      
      - name: Build
        run: npm run build

  extension-build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./neo-extension
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: neo-extension/package-lock.json
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run type-check
      
      - name: Build extension
        run: npm run build
```

**`.github/workflows/deploy-backend.yml`**:
```yaml
name: Deploy Backend

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      environment:
        description: 'Deployment environment'
        required: true
        default: 'production'
        type: choice
        options:
          - production
          - staging

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ github.event.inputs.environment || 'production' }}
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: neo-backend/package-lock.json
      
      - name: Install dependencies
        working-directory: ./neo-backend
        run: npm ci
      
      - name: Generate Prisma Client
        working-directory: ./neo-backend
        run: npm run prisma:generate
      
      - name: Build
        working-directory: ./neo-backend
        run: npm run build
      
      - name: Setup SSH
        uses: webfactory/ssh-agent@v0.7.0
        with:
          ssh-private-key: ${{ secrets.SSH_PRIVATE_KEY }}
      
      - name: Deploy to server
        env:
          SERVER_HOST: ${{ secrets.SERVER_HOST }}
          SERVER_USER: ${{ secrets.SERVER_USER }}
        run: |
          # 创建部署目录
          ssh $SERVER_USER@$SERVER_HOST "mkdir -p /opt/neo-backend/releases"
          
          # 复制文件到服务器
          scp -r neo-backend/dist $SERVER_USER@$SERVER_HOST:/opt/neo-backend/releases/$(date +%Y%m%d%H%M%S)
          scp neo-backend/package.json neo-backend/package-lock.json $SERVER_USER@$SERVER_HOST:/opt/neo-backend/
          scp -r neo-backend/prisma $SERVER_USER@$SERVER_HOST:/opt/neo-backend/
          
          # 在服务器上执行部署脚本
          ssh $SERVER_USER@$SERVER_HOST << 'EOF'
            cd /opt/neo-backend
            npm ci --production
            npm run prisma:generate
            npm run prisma:migrate deploy
            
            # 重启服务（使用 PM2 或 systemd）
            pm2 restart neo-backend || pm2 start dist/index.js --name neo-backend
          EOF
      
      - name: Health check
        run: |
          sleep 10
          curl -f ${{ secrets.SERVER_HOST }}/health || exit 1
```

**`.github/workflows/build-extension.yml`**:
```yaml
name: Build Extension

on:
  push:
    branches: [main]
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: neo-extension/package-lock.json
      
      - name: Install dependencies
        working-directory: ./neo-extension
        run: npm ci
      
      - name: Build extension
        working-directory: ./neo-extension
        run: npm run build
      
      - name: Package extension
        working-directory: ./neo-extension
        run: |
          cd dist
          zip -r ../neo-extension-${{ github.sha }}.zip .
          cd ..
      
      - name: Upload artifact
        uses: actions/upload-artifact@v3
        with:
          name: neo-extension
          path: neo-extension/neo-extension-${{ github.sha }}.zip
      
      - name: Create Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v1
        with:
          files: neo-extension/neo-extension-${{ github.sha }}.zip
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**部署脚本示例**（`scripts/deploy.sh`）:
```bash
#!/bin/bash
set -e

RELEASE_DIR="/opt/neo-backend/releases/$(date +%Y%m%d%H%M%S)"
CURRENT_DIR="/opt/neo-backend/current"

# 创建发布目录
mkdir -p $RELEASE_DIR

# 复制文件
cp -r dist $RELEASE_DIR/
cp package.json package-lock.json $RELEASE_DIR/
cp -r prisma $RELEASE_DIR/

# 安装生产依赖
cd $RELEASE_DIR
npm ci --production

# 生成 Prisma Client
npm run prisma:generate

# 运行数据库迁移
npm run prisma:migrate deploy

# 切换当前版本
ln -sfn $RELEASE_DIR $CURRENT_DIR

# 重启服务
pm2 restart neo-backend || pm2 start $CURRENT_DIR/dist/index.js --name neo-backend --update-env

# 健康检查
sleep 5
curl -f http://localhost:3000/health || (echo "Health check failed" && exit 1)

echo "Deployment successful: $RELEASE_DIR"
```

##### 7.5 监控和日志
- [ ] **应用监控**
  - [ ] 配置应用性能监控（APM）
  - [ ] 监控 CPU、内存、磁盘使用率
  - [ ] 监控 API 响应时间
  - [ ] 监控错误率

- [ ] **日志管理**
  - [ ] 配置结构化日志（Winston/Pino）
  - [ ] 配置日志收集（ELK Stack/云日志服务）
  - [ ] 设置日志轮转和清理策略
  - [ ] 配置日志告警规则

- [ ] **告警系统**
  - [ ] 配置健康检查告警
  - [ ] 配置错误率告警
  - [ ] 配置服务器资源告警
  - [ ] 配置数据库连接告警
  - [ ] 配置 AI API 调用失败告警

##### 7.6 性能优化
- [ ] **应用性能**
  - [ ] 启用 HTTP 压缩（gzip）
  - [ ] 配置静态资源缓存
  - [ ] 优化数据库查询索引
  - [ ] 实现 API 响应缓存（Redis）

- [ ] **扩展性**
  - [ ] 配置负载均衡（如需要）
  - [ ] 配置多实例部署
  - [ ] 实现横向扩展方案

##### 7.7 文档和运维
- [ ] **部署文档**
  - [ ] 编写部署步骤文档
  - [ ] 编写环境变量说明
  - [ ] 编写故障排查指南
  - [ ] 编写回滚流程文档

- [ ] **运维工具**
  - [ ] 配置数据库管理工具（Prisma Studio）
  - [ ] 配置服务器 SSH 访问
  - [ ] 准备运维脚本

---

### 🎯 部署和运维（原有任务）

#### 20. 环境配置验证
- [ ] 启动时验证环境变量
- [ ] 数据库连接检查
- [ ] API Key 有效性检查
- **优先级**: 高

#### 21. 监控和告警
- [ ] 添加健康检查端点（已有 `/health`）
- [ ] 性能监控
- [ ] 错误告警机制
- **优先级**: 中

#### 22. 文档完善
- [ ] API 文档（Swagger/OpenAPI）
- [ ] 部署文档
- [ ] 开发指南
- **优先级**: 中

---

## 技术栈

### 前端插件（neo-extension）

- **运行时**: Chrome Extension Manifest V3
- **语言**: TypeScript 5.3.3
- **构建工具**: Vite 5.0.11 + @crxjs/vite-plugin 2.0.0-beta.24
- **核心功能**:
  - Content Scripts（API 拦截）
  - Service Worker（后台脚本）
  - Storage API（数据缓存）
  - Web Request API（网络请求拦截）
  - Scripting API（页面注入）

### 后端服务（neo-backend）

- **运行时**: Node.js >= 18
- **语言**: TypeScript 5.3.3
- **框架**: Express 4.18.2
- **ORM**: Prisma 5.7.1
- **数据库**: PostgreSQL 15+ (通过 Docker)
- **AI 服务**: SiliconFlow API (DeepSeek-V3.2-Exp) - 通过 OpenAI SDK 4.20.1
- **队列系统**: Bull 4.12.0 + ioredis 5.3.2（已安装，待实现）
- **其他依赖**:
  - cors 2.8.5（跨域处理）
  - dotenv 16.3.1（环境变量管理）
  - crypto 1.0.1（数据加密）

### 基础设施

- **容器化**: Docker + Docker Compose
- **数据库容器**: PostgreSQL 15-alpine
- **缓存容器**: Redis 7-alpine（可选，用于队列）
- **开发工具**: tsx 4.7.0（TypeScript 执行器）

---

## MVP 快速启动指南

### 🚀 一键启动（推荐）

**Windows**:
```bash
scripts\start-mvp.bat
```

**Linux/Mac**:
```bash
chmod +x scripts/start-mvp.sh
./scripts/start-mvp.sh
```

### 手动启动步骤

1. **启动数据库**（使用 Docker）:
   ```bash
   docker-compose up -d
   ```

2. **启动后端**:
   ```bash
   cd neo-backend
   npm install
   cp .env.example .env
   npm run prisma:generate
   npm run prisma:migrate
   npm run dev
   ```

3. **构建插件**:
   ```bash
   cd neo-extension
   npm install
   npm run build
   ```

4. **加载插件到 Chrome**:
   - 打开 `chrome://extensions/`
   - 开启"开发者模式"
   - 加载 `neo-extension/dist` 目录

### MVP 测试示例

```bash
# 测试健康检查
curl http://localhost:3000/health

# 测试 API 文档列表
curl http://localhost:3000/api/docs

# 测试技能列表
curl http://localhost:3000/api/skills

# 触发 API 分析
curl -X POST http://localhost:3000/api/docs/analyze-pending \
  -H "Content-Type: application/json" \
  -d '{"limit": 3}'
```

详细启动说明请查看 [启动指南](./mvp-start.md)。

---

## 优先级总结

### 🔴 立即修复（阻塞功能）
（当前无阻塞问题）

### 🟡 重要完善（影响体验）
2. Redis/队列系统实现
3. 定时任务机制
4. 技能执行错误重试机制
5. 技能更新推送机制

### 🟢 后续优化（提升质量）
6. 单元测试和集成测试
7. 监控和告警
8. 文档完善

---

**最后更新**: 2025-01-XX  
**项目状态**: 核心功能已实现 ✅，待修复阻塞问题

