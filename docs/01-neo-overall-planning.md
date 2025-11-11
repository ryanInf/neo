# Neo 整体规划和长期演进方向

## 1. 产品愿景

Neo 通过 AI 自动发现、理解和编排 Web API，将复杂的 API 调用转化为一键可执行的"技能"，降低技术门槛，提升生产力。技能在浏览器端执行，确保用户数据安全。

### 核心价值

- **自动化发现**：自动捕获和分析 Web API，无需手动编写文档
- **智能编排**：AI 理解 API 关系，自动生成可执行的技能
- **安全执行**：技能在浏览器端执行，用户数据不离开本地
- **持续优化**：通过执行反馈，AI 自动优化技能质量

---

## 2. 核心架构

### 2.1 浏览器插件层（Extension）

**职责**：监听、捕获、上报 API 调用；下载和执行技能；收集执行日志

**技术栈**：
- Chrome Extension Manifest V3
- Content Scripts（注入到页面）
- Service Worker（后台脚本）
- Web Request API（拦截网络请求）

**核心功能**：
- **API 监听**：监听 fetch/XHR 请求，捕获请求/响应数据，记录上下文信息
- **技能管理**：从服务端下载技能定义，技能缓存和版本管理
- **技能执行**：在页面中执行技能，处理参数传递和依赖关系
- **日志收集**：记录技能执行过程，批量上报日志到服务端

### 2.2 服务端层（Backend）

**职责**：接收数据、AI 分析、技能编排、技能优化

**技术栈**：
- Node.js + Express + TypeScript
- PostgreSQL + Prisma
- Redis（缓存、队列）
- SiliconFlow API（DeepSeek-V3.2-Exp）

**核心功能模块**：

#### 2.2.1 API 分析服务
- 接收插件上报的 API 调用数据（包含上下文信息）
- AI 深入学习 API：
  - 业务语义理解：理解 API 的业务用途和实际场景
  - 使用模式识别：识别常见使用模式、最佳实践和反模式
  - API 关系学习：学习 API 之间的依赖关系、调用顺序、数据流转
- 生成 Markdown 格式的 API 文档

#### 2.2.2 技能编排服务
- AI 分析 API 之间的关联性和业务逻辑
- 智能编排技能：
  - 上下文感知编排：基于 API 调用上下文和时序，识别真实的工作流模式
  - 迭代式编排：支持循环、迭代、条件判断等复杂流程
  - 增强功能生成：将简单的 API 调用组合成高级业务功能
- 生成技能定义代码（JavaScript）

#### 2.2.3 技能优化服务
- 接收插件上报的执行日志
- AI 分析日志，识别执行问题和优化点
- 自动改进技能编排，生成新版本

---

## 3. 领域驱动设计（DDD）

### 3.1 核心领域

Neo 系统包含四个核心领域：

#### 3.1.1 API 发现领域（API Discovery Domain）

**职责**：自动捕获、分析、抽象 Web API

**核心问题**：从多个具体的 API 调用（ApiCapture）中自动抽象出统一的 API 模式（ApiEndpoint）

**关键设计**：
- **ApiEndpoint（聚合根）**：代表一个可被调用的 API 端点模式
  - 路径模式（pathPattern）：支持参数占位符，如 `/api/users/:userId`
  - 参数定义：路径参数、查询参数、请求体 Schema、响应体 Schema
  - API 文档：AI 生成的业务语义文档

- **ApiCapture（实体）**：记录一次具体的 API 调用
  - 原始 URL、请求/响应数据
  - 调用上下文（页面 URL、调用时序、前后关联）

- **领域服务**：
  - `ApiEndpointAbstractionService`：从多个 ApiCapture 中抽象出 ApiEndpoint
  - `ApiCaptureMatchingService`：将新的 ApiCapture 匹配到现有的 ApiEndpoint
  - `ApiAnalysisService`：分析 ApiEndpoint，生成文档

#### 3.1.2 技能编排领域（Skill Orchestration Domain）

**职责**：智能编排 API 组合，生成技能定义

**核心设计理念**：声明式编排

**关键设计**：
- **Skill（聚合根）**：一个可执行的技能
  - 编排定义（SkillOrchestration）：纯数据，不包含代码
  - 执行引擎：统一的模板化 JavaScript，从编排数据动态加载

- **SkillOrchestration（值对象）**：
  - steps：API 调用序列
  - variables：全局变量定义
  - errorHandling：错误处理策略
  - timeout：总超时时间

- **OrchestrationStep（值对象）**：
  - apiEndpointId：引用的 API 端点
  - inputMapping：参数映射（从上下文变量到 API 参数）
  - outputMapping：输出映射（从 API 响应到上下文变量）
  - condition：执行条件（JavaScript 表达式）
  - loop：循环配置
  - retry：重试配置

- **领域服务**：
  - `SkillOrchestrationService`：编排技能，生成编排定义
  - `SkillExecutionEngine`：执行技能编排

#### 3.1.3 技能执行领域（Skill Execution Domain）

**职责**：执行技能、收集反馈、持续优化

**核心机制**：自反馈优化循环

**关键设计**：
- **ExecutionSession（聚合根）**：一次技能执行的完整会话
  - 执行状态：pending → running → success/failed/partial
  - 执行步骤：ExecutionStep 列表
  - 执行结果：ExecutionResult

- **ExecutionAnalysis（聚合）**：执行分析
  - 执行统计：成功率、平均耗时、步骤级统计
  - 问题识别：高失败率、性能问题、参数错误、逻辑错误
  - 优化建议：LLM 生成的优化建议

- **领域服务**：
  - `SkillOptimizationService`：分析执行日志并生成优化建议
  - `ContinuousOptimizationService`：定期分析并优化技能

#### 3.1.4 技能生成领域（Skill Generation Domain）

**职责**：LLM 自动生成技能提案，专家审核反馈

**核心机制**：LLM 自动生成 + 专家审核反馈循环

**关键设计**：
- **SkillProposal（聚合根）**：LLM 生成的技能提案
  - 提议的编排定义
  - LLM 生成理由
  - 审核状态：pending → approved/rejected/modified

- **GenerationFeedback（实体）**：生成反馈
  - 反馈类型：rejection、modification、approval
  - 反馈原因和改进建议

- **领域服务**：
  - `SkillGenerationService`：从 ApiEndpoint 自动生成 Skill 提案
  - `SkillReviewService`：专家审核技能提案
  - `SkillDiscoveryService`：自动发现潜在的技能组合

---

## 4. 数据模型设计（最终版）

### 4.1 核心实体

**ApiEndpoint**：
- 模式定义：pathPattern、method、domain、patternHash
- 参数定义：pathParams、queryParams（JSON）
- Schema 定义：requestBodySchema、responseBodySchema（JSON Schema）
- API 文档：docMarkdown、businessPurpose、usagePatterns、bestPractices

**ApiCapture**：
- 原始信息：originalUrl、method、domain
- 提取的参数值：pathParams、queryParams（JSON）
- 请求和响应快照：requestHeaders、requestBody、responseBody
- 调用上下文：pageUrl、userAgent、sessionId、sequenceOrder

**Skill**：
- 基本信息：name、description、domain
- 状态管理：status（draft、active、deprecated）
- 元数据：createdBy、aiModel、tags、category

**SkillVersion**：
- 版本信息：version
- 编排定义：orchestration（JSON，SkillOrchestration）
- 版本信息：createdReason、optimizationNotes、parentVersionId

**ExecutionSession**：
- 执行信息：skillId、skillVersion、domain、status
- 上下文：pageUrl、userAgent、sessionId、triggerType
- 结果：resultData、resultMessage、error

**ExecutionStep**：
- 基本信息：order、apiEndpointId
- 执行状态：status（pending、running、success、failed、skipped）
- 请求和响应：requestData、responseData、error
- 重试信息：retryCount、retryAttempts

**SkillProposal**：
- 提案信息：name、description、domain
- 基于的 API 端点：sourceApiEndpointIds
- 提议的编排：proposedOrchestration
- 审核状态：status、reviewedBy、reviewedAt、reviewNotes

### 4.2 关键算法

**URL 模式提取算法**：
- 从多个 URL 中提取路径模式
- 使用最长公共子序列算法识别路径段中的变体部分
- 替换为参数占位符

**JSON Schema 推断算法**：
- 从多个 JSON 对象中推断 JSON Schema
- 考虑类型合并、可选字段识别、数组元素类型推断

**技能发现算法**：
- 找出经常一起调用的 API
- 使用关联规则挖掘算法（如 Apriori）
- 识别频繁项集

---

## 5. 技术选型

### 5.1 前端（插件）

- **运行时**：Chrome Extension Manifest V3
- **语言**：TypeScript 5.3.3
- **构建工具**：Vite 5.0.11 + @crxjs/vite-plugin
- **核心功能**：
  - Content Scripts（API 拦截）
  - Service Worker（后台脚本）
  - Storage API（数据缓存）
  - Web Request API（网络请求拦截）

### 5.2 后端服务

- **运行时**：Node.js >= 18
- **语言**：TypeScript 5.3.3
- **框架**：Express 4.18.2
- **ORM**：Prisma 5.7.1
- **数据库**：PostgreSQL 15+
- **AI 服务**：SiliconFlow API (DeepSeek-V3.2-Exp)
- **队列系统**：Bull 4.12.0 + ioredis 5.3.2

### 5.3 基础设施

- **容器化**：Docker + Docker Compose
- **数据库容器**：PostgreSQL 15-alpine
- **缓存容器**：Redis 7-alpine

---

## 6. 关键技术挑战

### 6.1 API 监听精度
- 需要准确捕获所有网络请求
- 处理动态加载的内容
- 处理 WebSocket 等非 HTTP 协议

### 6.2 数据隐私安全
- 敏感信息脱敏（token、密码等）
- 用户数据加密传输
- 合规性考虑（GDPR、数据保护）

### 6.3 AI 分析准确性
- Prompt 工程优化
- 上下文理解能力
- 处理复杂 API 场景

### 6.4 插件端技能执行
- JavaScript 代码沙箱执行（安全性）
- API 调用顺序控制
- 错误处理和重试
- 依赖关系处理
- 用户认证 token 的安全处理
- 跨域请求处理（CORS）

### 6.5 技能优化机制
- 执行日志收集的完整性和准确性
- AI 分析日志的有效性
- 技能版本管理和更新策略
- 增量优化 vs 全量重构

### 6.6 性能优化
- 大量 API 数据的存储和查询
- AI 调用成本控制
- 插件性能影响最小化
- 技能缓存的更新策略

---

## 7. 未来扩展方向

### 7.1 多种触发方式
- 快捷键触发
- 语音命令
- 定时任务
- 条件触发（页面元素变化）

### 7.2 技能可视化编排
- 用户界面化编排 API
- 拖拽式工作流编辑器
- 参数配置界面

### 7.3 执行日志和调试
- 实时查看技能执行过程
- 每个 API 调用的详细日志
- 错误诊断和修复建议

### 7.4 技能优化和改进
- 用户反馈收集
- AI 自动优化技能
- A/B 测试不同技能版本

### 7.5 技能市场
- 用户分享技能
- 技能评分和推荐
- 社区生态建设

### 7.6 API 模式抽象演进
- 从 ApiDoc 演进到 ApiEndpoint
- 路径参数自动提取
- JSON Schema 自动推断
- ApiCapture 到 ApiEndpoint 的自动匹配

### 7.7 声明式编排演进
- 从 JavaScript 代码演进到声明式编排数据
- 统一的执行引擎模板化
- 编排数据的独立验证

### 7.8 执行分析演进
- 从简单日志演进到 ExecutionAnalysis 聚合
- 执行统计分析
- 问题识别和优化建议生成
- 持续优化循环

---

## 8. 演进路径

### Phase 1: MVP 验证（当前阶段）
- ✅ API 捕获（已验证）
- 🔄 技能编排（可手工编排）
- ⏳ 技能执行（待实现）

**简化点**：
- 使用 ApiDoc 而非 ApiEndpoint（暂不考虑模式抽象）
- 使用 JavaScript 代码而非声明式编排
- 使用简化的 ExecutionLog 而非完整的执行会话模型

### Phase 2: 核心功能完善
- API 模式抽象（ApiEndpoint）
- 声明式编排（SkillOrchestration）
- 执行会话管理（ExecutionSession）
- 执行分析（ExecutionAnalysis）

### Phase 3: 智能化增强
- 技能自动生成（SkillProposal）
- 专家审核反馈循环
- 持续优化机制
- 技能发现算法

### Phase 4: 生态建设
- 技能市场
- 可视化编排
- 多种触发方式
- 社区生态

---

## 9. 设计原则

### 9.1 DDD 原则应用

1. **聚合根保护**：
   - ApiEndpoint、Skill、ExecutionSession、SkillProposal 作为聚合根
   - 外部只能通过聚合根访问内部实体

2. **值对象不可变性**：
   - Domain、Version、ApiPattern 等值对象不可变
   - 修改值对象需要创建新实例

3. **领域服务封装业务逻辑**：
   - 复杂的业务逻辑封装在领域服务中
   - 仓储只负责数据持久化

4. **领域事件解耦**：
   - 使用领域事件解耦不同聚合之间的交互
   - 支持异步处理和最终一致性

### 9.2 性能优化建议

1. **读写分离**：
   - 写操作通过聚合根
   - 读操作可以使用专门的查询模型（CQRS）

2. **缓存策略**：
   - ApiEndpoint 文档可以缓存
   - Skill 定义可以缓存

3. **批量操作**：
   - API 捕获批量处理
   - 执行日志批量写入

### 9.3 扩展性考虑

1. **多租户支持**：
   - 可以添加 `tenantId` 字段支持多租户

2. **技能市场**：
   - 可以添加 `isPublic` 字段支持技能分享

3. **AI 模型切换**：
   - 通过 `aiModel` 字段记录使用的 AI 模型
   - 支持不同 AI 模型的对比分析

---

## 10. 总结

Neo 系统的长期演进方向：

1. **从简单到复杂**：从 MVP 的简化实现，逐步演进到完整的 DDD 设计
2. **从代码到数据**：从 JavaScript 代码，演进到声明式编排数据
3. **从手动到自动**：从手工编排，演进到 AI 自动生成和优化
4. **从单点到生态**：从单一功能，演进到完整的技能生态

这个设计为 Neo 系统的长期演进提供了坚实的基础，支持：
- 更好的数据一致性和可扩展性
- 更清晰的业务逻辑和领域模型
- 更容易的维护和优化
- 更强大的自动化和学习能力

