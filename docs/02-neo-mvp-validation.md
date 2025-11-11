# Neo MVP 验证策略

## 1. MVP 目标

MVP 阶段专注于验证核心业务价值，通过最小化实现验证以下三个核心问题：

1. **API 捕获** ✅ - 已验证
2. **技能编排** 🔄 - 可手工编排，形式稳定后自动化
3. **技能执行** ⏳ - 待实现

---

## 2. 当前实现状态

### 2.1 API 捕获（已实现 ✅）

**数据模型**：`ApiDoc`
- `id`: 唯一标识符
- `url`: API 端点 URL
- `method`: HTTP 方法
- `domain`: 所属域名
- `requestHeaders`: 请求头（JSON）
- `requestBody`: 请求体（JSON，可选）
- `responseBody`: 响应体（JSON，可选）
- `statusCode`: HTTP 状态码（可选）
- `docMarkdown`: AI 生成的文档（可选）
- `requestHash`: 请求哈希（用于去重，唯一索引）

**功能**：
- ✅ API 调用捕获（浏览器扩展）
- ✅ 批量上报到后端
- ✅ 去重机制（基于 requestHash）
- ✅ AI 文档生成（异步队列）

**简化点**：
- 暂不考虑模式抽象（ApiEndpoint），直接使用 ApiDoc
- 暂不考虑路径参数提取，保留完整 URL
- 暂不考虑 Schema 推断，保留原始 JSON

### 2.2 技能编排（部分实现 🔄）

**数据模型**：`Skill`
- `id`: 唯一标识符
- `name`: 技能名称
- `description`: 技能描述
- `domain`: 适用域名
- `version`: 版本号（默认 1）
- `definition`: 技能定义（JSON）
  - `format`: 'javascript'
  - `content`: JavaScript 代码
  - `apiSequence`: API 调用序列

**技能定义结构**（`SkillDefinition`）：
```typescript
{
  format: 'javascript',
  content: string,        // 可执行的 JavaScript 代码
  apiSequence: ApiCall[]  // API 调用序列（用于展示）
}
```

**API 调用结构**（`ApiCall`）：
- `apiDocId`: 引用的 ApiDoc ID
- `order`: 执行顺序
- `inputMapping`: 参数映射（支持 query、path、header、body）
- `outputMapping`: 输出映射（可选）
- `condition`: 执行条件表达式（可选）
- `loopType`: 循环类型（可选）
- `loopCondition`: 循环条件（可选）
- `maxIterations`: 最大迭代次数（可选）

**功能**：
- ✅ 技能创建 API（支持 AI 编排）
- ✅ 技能查询 API
- ✅ 技能代码生成（从编排定义生成 JavaScript）
- ✅ 技能下载 API

**简化点**：
- 暂不考虑声明式编排，使用 JavaScript 代码
- 暂不考虑版本管理（SkillVersion），只有一个 version 字段
- 暂不考虑状态管理（draft/active/deprecated），所有技能都是 active
- 暂不考虑元数据（tags、category 等）

### 2.3 技能执行（待实现 ⏳）

**数据模型**：`ExecutionLog`
- `id`: 唯一标识符
- `skillId`: 执行的技能 ID
- `skillVersion`: 执行的技能版本
- `domain`: 执行域名
- `timestamp`: 执行时间
- `status`: 执行状态（'success' | 'failed' | 'partial'）
- `steps`: 执行步骤列表（JSON）
- `error`: 错误信息（可选）

**执行步骤结构**（`ExecutionStep`）：
- `apiCallId`: API 调用 ID（对应 ApiDoc.id）
- `order`: 步骤顺序
- `status`: 步骤状态（'success' | 'failed' | 'skipped'）
- `requestData`: 实际请求数据（可选）
- `responseData`: 实际响应数据（可选）
- `error`: 错误信息（可选）
- `duration`: 步骤耗时（毫秒）
- `retryCount`: 重试次数（可选）
- `retryAttempts`: 重试记录（可选）

**功能目标**：
- ⏳ 在浏览器页面中执行技能
- ⏳ 记录执行日志到后端
- ⏳ 支持步骤级错误处理
- ⏳ 支持重试机制（可选）

**简化点**：
- 暂不考虑执行会话（ExecutionSession），直接使用 ExecutionLog
- 暂不考虑执行上下文（ExecutionContext），简化上下文信息
- 暂不考虑执行分析（ExecutionAnalysis），后续迭代添加
- 暂不考虑优化建议（OptimizationSuggestion），后续迭代添加

---

## 3. MVP 数据模型（Prisma Schema）

```prisma
// ============================================
// API 发现领域（已实现）
// ============================================

model ApiDoc {
  id              String   @id @default(uuid())
  url             String
  method          String
  domain          String
  requestHeaders  Json
  requestBody     Json?
  responseBody    Json?
  statusCode      Int?
  docMarkdown     String?  // AI 生成的文档
  requestHash     String   @unique // 用于去重
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([domain])
  @@index([method])
  @@index([requestHash])
}

// ============================================
// 技能编排领域（部分实现）
// ============================================

model Skill {
  id          String   @id @default(uuid())
  name        String
  description String
  domain      String
  version     Int      @default(1)
  definition  Json     // SkillDefinition
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  executionLogs ExecutionLog[]

  @@index([domain])
  @@index([version])
}

// ============================================
// 技能执行领域（待实现）
// ============================================

model ExecutionLog {
  id           String   @id @default(uuid())
  skillId      String
  skillVersion Int
  domain       String
  timestamp    DateTime @default(now())
  status       String   // 'success' | 'failed' | 'partial'
  steps        Json     // ExecutionStep[]
  error        String?

  skill Skill @relation(fields: [skillId], references: [id])

  @@index([skillId])
  @@index([domain])
  @@index([timestamp])
}
```

---

## 4. MVP TODO 清单

### 4.1 Phase 1: 技能执行核心功能（高优先级）

#### 4.1.1 前端执行引擎完善

**完善技能执行器** (`neo-extension/src/content/skill-executor.ts`)：
- [ ] 实现完整的执行上下文（context）
- [ ] 实现步骤级错误处理
- [ ] 实现步骤状态追踪（pending → running → success/failed）
- [ ] 实现执行超时保护
- [ ] 实现执行结果收集

**实现 API 调用执行** (`executeApiCallInPage`)：
- [ ] 在页面上下文中执行 fetch 请求
- [ ] 支持路径参数替换
- [ ] 支持查询参数构建
- [ ] 支持请求头设置
- [ ] 支持请求体构建
- [ ] 处理响应数据解析

**实现状态管理** (`context.state`)：
- [ ] 实现变量存储和读取
- [ ] 实现输出映射（从 API 响应提取数据到状态）
- [ ] 实现条件判断（支持 JavaScript 表达式）

**实现循环支持**（可选，MVP 阶段可简化）：
- [ ] 支持 forEach 循环
- [ ] 支持 while 循环
- [ ] 实现最大迭代次数限制

#### 4.1.2 执行日志上报

**实现执行日志创建** (`neo-backend/src/api/logs.ts`)：
- [ ] 创建执行日志 API 端点（POST /api/logs）
- [ ] 验证执行日志数据格式
- [ ] 保存执行日志到数据库
- [ ] 返回执行日志 ID

**前端日志上报**：
- [ ] 在执行完成后上报日志
- [ ] 实现错误重试机制
- [ ] 实现批量上报（如果有多条日志）

#### 4.1.3 UI 集成

**完善技能执行 UI** (`neo-extension/src/content/ui-injector.ts`)：
- [ ] 显示执行进度（步骤级）
- [ ] 显示执行结果（成功/失败）
- [ ] 显示错误信息（如果有）
- [ ] 实现执行按钮状态管理（执行中禁用）

**执行日志展示**（可选，MVP 阶段可简化）：
- [ ] 在调试面板中显示执行日志
- [ ] 显示执行步骤详情

### 4.2 Phase 2: 技能编排优化（中优先级）

#### 4.2.1 手工编排支持

- [ ] 实现手工创建技能 API
  - [ ] 支持直接提供技能定义（不通过 AI）
  - [ ] 验证技能定义格式
  - [ ] 验证 API 序列的有效性

- [ ] 实现技能编辑功能
  - [ ] 更新技能 API（PUT /api/skills/:id）
  - [ ] 版本号自动递增
  - [ ] 保留历史版本（可选，MVP 阶段可简化）

#### 4.2.2 编排定义标准化

- [ ] 定义标准编排格式
  - [ ] 确定 ApiCall 的完整结构
  - [ ] 确定参数映射规则
  - [ ] 确定输出映射规则
  - [ ] 确定条件表达式语法

- [ ] 代码生成优化
  - [ ] 优化代码生成逻辑（`skill-code-generator.ts`）
  - [ ] 支持更复杂的参数映射
  - [ ] 支持更复杂的输出映射
  - [ ] 支持条件判断代码生成
  - [ ] 支持循环代码生成

### 4.3 Phase 3: 后续迭代（低优先级）

- [ ] API 模式抽象（未来）
- [ ] 技能版本管理（未来）
- [ ] 执行分析（未来）

---

## 5. MVP 启动指南

### 5.1 前置要求

1. **Node.js** >= 18
2. **PostgreSQL** >= 14（或使用 Docker）
3. **npm** 或 **yarn**
4. **Chrome 浏览器**（用于加载插件）

### 5.2 快速启动步骤

#### 方式 1: 使用快速设置脚本（Mac/Linux 推荐）

```bash
# Mac 用户
chmod +x scripts/setup-mac.sh
./scripts/setup-mac.sh

# 或使用通用启动脚本
chmod +x scripts/start-mvp.sh
./scripts/start-mvp.sh
```

脚本会自动：
- 检查环境要求（Node.js、Docker）
- 启动数据库容器
- 创建 `.env` 文件
- 安装依赖
- 初始化数据库

**注意**：脚本执行后，请编辑 `neo-backend/.env` 文件，填入您的 SiliconFlow API Key。

#### 方式 2: 手动启动步骤

**1. 启动数据库（使用 Docker）**：
```bash
docker-compose up -d
```

**2. 设置后端**：
```bash
cd neo-backend
npm install
cp .env.example .env  # 编辑 .env 文件，填入 API Key
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

**3. 构建和加载插件**：
```bash
cd neo-extension
npm install
npm run build
```

**在 Chrome 中加载插件**：
1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"开关
4. 点击"加载已解压的扩展程序"
5. 选择项目中的 `neo-extension/dist` 目录

### 5.3 MVP 使用示例

**示例 1：测试 API 捕获**
1. 加载插件后，访问任意网站（如 https://example.com）
2. 打开浏览器控制台（F12）
3. 查看是否有 Neo 相关的日志输出
4. 插件会自动捕获页面中的 API 调用并上报到后端

**示例 2：测试 API 文档生成**
```bash
curl -X POST http://localhost:3000/api/docs/analyze-pending \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

**示例 3：创建技能**
```bash
# 先获取一些 API 文档 ID
curl http://localhost:3000/api/docs | jq '.data[0:3] | .[].id'

# 使用获取的 ID 创建技能
curl -X POST http://localhost:3000/api/skills \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "apiDocIds": ["api-doc-id-1", "api-doc-id-2"],
    "name": "示例技能",
    "description": "这是一个示例技能"
  }'
```

**示例 4：查看技能列表**
```bash
curl http://localhost:3000/api/skills?domain=example.com
```

### 5.4 验证 MVP 是否正常运行

**1. 检查后端服务**：
```bash
curl http://localhost:3000/health
```
应该返回：`{"status":"ok","timestamp":"..."}`

**2. 检查数据库连接**：
```bash
cd neo-backend
npm run prisma:studio
```

**3. 检查插件**：
- 在 Chrome 扩展管理页面，确认插件已加载
- 访问任意网站
- 打开浏览器开发者工具
- 查看 Console 标签，应该能看到 Neo 相关的日志
- 查看 Network 标签，确认有请求发送到 `http://localhost:3000/api/capture`

---

## 6. MVP 验证方法

### 6.1 API 捕获验证

**验证点**：
- [ ] 插件能够捕获页面中的 API 调用
- [ ] API 数据能够正确上报到后端
- [ ] 后端能够正确存储 API 数据
- [ ] 去重机制正常工作

**验证步骤**：
1. 加载插件
2. 访问一个包含 API 调用的网站
3. 检查浏览器控制台日志
4. 检查后端数据库（使用 Prisma Studio）
5. 检查是否有重复的 API 调用被正确去重

### 6.2 技能编排验证

**验证点**：
- [ ] 能够通过 API 创建技能
- [ ] AI 编排功能正常工作（如果使用）
- [ ] 技能代码生成正确
- [ ] 技能能够正确下载

**验证步骤**：
1. 确保已有一些 API 文档
2. 调用创建技能 API
3. 检查技能是否正确创建
4. 下载技能定义，检查代码格式
5. 验证代码中的 API 调用是否正确

### 6.3 技能执行验证（待实现）

**验证点**：
- [ ] 技能能够在页面中执行
- [ ] API 调用能够正确执行
- [ ] 参数映射正确工作
- [ ] 输出映射正确工作
- [ ] 执行日志能够正确上报

**验证步骤**：
1. 在页面上触发技能执行
2. 观察执行过程
3. 检查每个步骤的执行结果
4. 检查执行日志是否正确上报
5. 检查后端数据库中的执行日志

---

## 7. MVP 与最终设计的差异

| 功能 | MVP 版本 | 最终设计 |
|------|---------|---------|
| API 抽象 | ApiDoc（完整 URL） | ApiEndpoint（路径模式） |
| 技能定义 | JavaScript 代码 | 声明式编排数据 |
| 版本管理 | 单一 version 字段 | SkillVersion 实体 |
| 执行追踪 | ExecutionLog（简化） | ExecutionSession + ExecutionStep |
| 执行分析 | 无 | ExecutionAnalysis + 优化建议 |
| 技能生成 | AI 编排（可选） | LLM 生成 + 专家审核 |

---

## 8. 关键设计决策

### 8.1 为什么 MVP 阶段使用 JavaScript 代码而非声明式编排？

- **快速验证**：JavaScript 代码可以直接执行，无需复杂的执行引擎
- **灵活性**：支持复杂的业务逻辑，不受编排格式限制
- **简化实现**：减少数据模型复杂度，专注于核心功能验证

### 8.2 为什么暂不考虑 API 模式抽象？

- **MVP 阶段**：直接使用完整 URL 更简单，模式抽象可以在后续迭代中实现
- **验证核心价值**：先验证技能编排和执行的价值，再优化 API 抽象

### 8.3 为什么暂不考虑执行分析？

- **MVP 阶段**：先实现基本的执行功能，执行分析可以在有足够数据后进行
- **迭代优化**：执行分析需要大量的执行日志，MVP 阶段数据不足

---

## 9. 下一步行动

1. **立即开始**：技能执行核心功能实现
2. **并行进行**：手工编排支持（如果 AI 编排不够稳定）
3. **后续迭代**：根据 MVP 验证结果，决定是否引入声明式编排

---

## 10. 常见问题排查

### 问题 1：Docker 容器无法启动

**解决方案**：
```bash
# 检查 Docker Desktop 是否运行
docker ps

# 检查端口是否被占用
lsof -i :5432  # PostgreSQL (Mac/Linux)
lsof -i :6379  # Redis (Mac/Linux)
```

### 问题 2：后端无法连接数据库

**解决方案**：
```bash
# 检查数据库容器是否运行
docker ps | grep neo-postgres

# 检查 .env 文件中的 DATABASE_URL 配置
cat neo-backend/.env | grep DATABASE_URL

# 测试数据库连接
docker exec -it neo-postgres psql -U postgres -d neo -c "SELECT 1;"
```

### 问题 3：插件无法加载

**解决方案**：
- 检查 `neo-extension/dist` 目录是否存在
- 确认已运行 `npm run build`
- 检查 `manifest.json` 是否正确生成
- 查看 Chrome 扩展页面的错误信息

### 问题 4：AI 分析失败

**解决方案**：
```bash
# 检查 .env 文件中的 API Key
cat neo-backend/.env | grep SILICONFLOW_API_KEY

# 确认 API Key 有效且有余额
# 访问 https://siliconflow.cn 检查账户状态
```

---

## 11. 参考文档

- **整体规划**：`docs/01-neo-overall-planning.md` - Neo 的整体规划和长期演进方向

