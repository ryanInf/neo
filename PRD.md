# Neo — 把任意 Web App 变成 AI 可调用的工具

## 一句话

浏览器插件被动学习用户访问的 Web App API，自动生成 API Schema，让 AI Agent 能直接调用任意 Web App 的能力——无需官方 API，无需浏览器自动化。

## 为什么

AI Agent 操作 Web App 现在有两条路，都有硬伤：

| 方案 | 问题 |
|------|------|
| 官方 API / MCP | 覆盖率极低，大多数 SaaS 没有或只暴露 10% 功能 |
| 浏览器自动化 (Playwright/browser-use) | 截图→识别→点击，慢、脆弱、不精确 |

**第三条路**：每个 Web App 的前端已经把 API 调通了——请求格式、认证方式、参数结构全在 network 层里。我们只需要"偷学"它。

## 核心洞察

1. **API 发现是被动的**。用户正常用网页，插件 always-on 捕获流量。不需要"录制"仪式。
2. **产出是 Schema，不是录像**。自动生成类 OpenAPI 的结构化描述——endpoint、参数、语义、依赖关系。
3. **执行在用户浏览器上下文**。fetch 调用自动带 cookie/token，认证零成本。
4. **AI 是大脑，插件是手脚**。插件只做捕获和执行，理解和决策全在 AI 侧。

## 差异化

- 对比 MCP：零配置，不需要每个 app 单独写 server。
- 对比 browser-use：在 API 层操作，快一个数量级，不受 UI 改版影响。
- 一句话：**装个插件，用几天，AI 就学会了你用的所有工具。**

## 当前状态 (v0.3.0)

### ✅ 已完成

**Capture Layer**
- fetch/XHR 拦截 + IndexedDB (Dexie.js) 本地存储
- WebSocket 捕获 (WS_OPEN/WS_SEND/WS_RECV/WS_CLOSE/WS_ERROR)
- EventSource/SSE 捕获 (SSE_OPEN/SSE_MSG/SSE_ERROR)
- DOM 触发关联 — click/submit 事件自动关联 2 秒内的 API 调用
- 智能过滤 — 跳过静态资源、analytics、tracker
- 捕获降频 — 同 URL 每分钟最多 3 条；WebSocket 每连接 10 秒最多 20 条
- 每 domain 500 条上限，超出自动清理最旧
- TypeScript strict mode，全类型安全

**Execute Layer**
- 浏览器上下文 API 执行 (`neo exec`)，自动继承认证
- `--auto-headers` 从 captures 自动提取认证 headers
- `--eval` 在页面上下文执行 JS
- `neo replay <id>` — 重放捕获的 API 调用

**Schema Generation**
- 自动分析流量生成 API Schema (endpoint/method/headers/body structure/query params)
- URL 参数化 — GraphQL hash 识别（熵检测）、UUID、数字 ID
- 触发感知 Schema — 聚合哪些 UI 元素触发哪些 API
- Request/Response body 结构提取（2 层深度，不存值）
- Schema 安全 — 只存 header 名称，不存值（Bearer token 等）

**CLI (统一 `neo.cjs`)**
- `neo status` — 扩展连接状态
- `neo capture list/count/detail/clear/watch/stats/search/export/import` — 完整捕获管理
- `neo schema generate/list/show` — Schema 生成和查看
- `neo exec` — API 执行
- `neo replay` — 捕获重放
- `neo eval` — JS 执行
- 友好的错误消息 — Chrome 未启动、扩展未安装等场景

**Popup UI**
- 按 domain 分组查看捕获记录
- 捕获详情展开（headers/body/response）
- Copy as curl / Copy as neo 按钮
- 实时计数更新

**OpenClaw Skill**
- `~/clawd/skills/neo/SKILL.md` — AI 可直接使用 Neo 工具链

**已生成 Schema**
- GitHub (17 endpoints), YouTube (14), Reddit (18), X/Twitter (GraphQL), Linear (1), Notion (2)

### 🔲 待做

**近期**
- [ ] WebSocket Bridge — 实时推送捕获数据到 OpenClaw（当前靠 CLI 轮询）
- [ ] Schema 增量更新 — 避免大数据量重新分析
- [ ] 更多网站实战测试和 schema 积累
- [ ] `neo capture export` 格式标准化（跨设备迁移）

**中期**
- [ ] 双通道自动切换 — Neo 优先 → browser-use fallback
- [ ] 多步 workflow 编排
- [ ] AI 语义标注 — LLM 分析 endpoint 业务含义
- [ ] API 依赖链发现 — A 的响应字段 → B 的参数

**不做（至少现在）**
- 签名/加密逆向
- 跨 tab workflow
- 可视化编排 UI
- 多用户/团队共享
- 自动脱敏

## 架构

```
┌─────────────────────────────────────────────┐
│  Chrome Extension (Neo)                      │
│                                              │
│  ① Capture Layer (always-on)                 │
│     ├─ Patch fetch/XHR/WebSocket/EventSource │
│     ├─ Record: URL, method, headers,         │
│     │   body, status, timing, trigger        │
│     └─ Store locally (IndexedDB/Dexie)       │
│                                              │
│  ② Execute Layer (on-demand)                 │
│     ├─ Execute fetch in page context         │
│     │   (inherits cookies/auth)              │
│     └─ Execute arbitrary JS (eval)           │
│                                              │
│  ③ Bridge (planned)                          │
│     ├─ WebSocket push to AI                  │
│     └─ Receive commands from AI              │
└──────────────────┬──────────────────────────┘
                   │ CDP (Chrome DevTools Protocol)
┌──────────────────┴──────────────────────────┐
│  CLI Layer (neo.cjs)                         │
│  Connects to extension service worker via    │
│  CDP WebSocket, queries IndexedDB, executes  │
│  commands, generates schemas                 │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────┴──────────────────────────┐
│  AI Layer (OpenClaw Skill)                   │
│  Uses CLI tools to query captures, generate  │
│  schemas, execute API calls, replay traffic  │
└──────────────────────────────────────────────┘
```

## 执行策略：双通道自动切换

Neo 不是独立工具，而是 **browser-use 的加速层**。

```
用户意图: "帮我在 X 上做 Y"
        │
        ▼
  Neo 有 X 的 API Schema？──── 有，且覆盖 Y ────→ API 直调 (快、精确)
        │                                              │
        │ 没有 / 不覆盖                                 │
        ▼                                              ▼
  Browser-use (截图→识别→点击)                     返回结果
        │
        │ 同时，Neo 后台捕获 API 流量
        ▼
  下次同类操作 → 自动升级为 API 直调
```

**飞轮效应**：browser-use 执行时 Neo 在学习 → 用得越多，API 覆盖越全 → browser-use 用得越少。

## 已知硬问题

1. **请求签名/加密**：部分 app（抖音、银行）的 API 带签名，纯 replay 会 403。
2. **前端状态依赖**：有些参数来自 JS runtime（Redux store），不在 API response 链中。可通过 eval 读取，但不完美。
3. **CORS**：执行层在页面上下文发 fetch，受同源策略限制。只能调用当前域的 API。
4. **Rate limiting**：自动化调用可能触发风控。需要支持 delay/throttle。

## 技术栈

- 插件：TypeScript (strict) + Vite (多入口 IIFE/ESM)
- Manifest V3
- 存储：IndexedDB (Dexie.js)
- CLI：Node.js + ws (CDP 连接)
- AI 侧：OpenClaw skill
