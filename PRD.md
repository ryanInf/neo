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

对比 MCP：零配置，不需要每个 app 单独写 server。
对比 browser-use：在 API 层操作，快一个数量级，不受 UI 改版影响。
一句话：**装个插件，用几天，AI 就学会了你用的所有工具。**

## 架构

```
┌─────────────────────────────────────────────┐
│  Chrome Extension (Neo)                      │
│                                              │
│  ① Capture Layer (always-on)                 │
│     ├─ Patch fetch/XHR in page context       │
│     ├─ Record: URL, method, headers,         │
│     │   request body, response body,         │
│     │   status, timing                       │
│     ├─ Correlate with DOM events             │
│     │   (which click/input triggered this)   │
│     └─ Store locally (IndexedDB)             │
│                                              │
│  ② Execute Layer (on-demand)                 │
│     ├─ Receive API call instructions         │
│     ├─ Execute fetch in page context         │
│     │   (inherits cookies/auth)              │
│     └─ Return results                        │
│                                              │
│  ③ Bridge (WebSocket)                        │
│     ├─ Push captured data to AI              │
│     └─ Receive execution commands from AI    │
└──────────────────┬──────────────────────────┘
                   │ WebSocket
┌──────────────────┴──────────────────────────┐
│  AI Layer (OpenClaw / any LLM)               │
│                                              │
│  ① Learn                                     │
│     ├─ Analyze raw API traffic               │
│     ├─ Infer semantics (what does this do?)  │
│     ├─ Map dependencies (A's response →      │
│     │   B's parameter)                       │
│     └─ Generate API Schema per domain        │
│                                              │
│  ② Plan                                      │
│     ├─ User says "帮我在 X 上做 Y"           │
│     ├─ Match intent to known API schema      │
│     └─ Generate execution plan               │
│                                              │
│  ③ Execute                                   │
│     ├─ Send API calls to extension           │
│     ├─ Handle responses, errors, retries     │
│     └─ Report results to user                │
└──────────────────────────────────────────────┘
```

## 插件设计

### Capture Layer

**拦截方式**：在页面上下文注入脚本，patch `window.fetch` 和 `XMLHttpRequest.prototype`。这是旧版 Neo 已验证可行的方案。

**捕获数据结构**：
```typescript
interface CapturedRequest {
  id: string;                    // uuid
  timestamp: number;
  domain: string;
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody?: any;
  duration: number;
  // DOM 关联
  trigger?: {
    event: 'click' | 'input' | 'submit' | 'navigation';
    selector: string;            // CSS selector of triggering element
    text?: string;               // element innerText (truncated)
  };
  // 上下文
  tabId: number;
  tabUrl: string;                // page URL at time of request
}
```

**DOM 事件关联**：content script 监听 click/input/submit，记录时间戳和元素选择器。当 API 调用在事件后 N ms 内发生，自动关联。这不是必须的，但能帮助 AI 理解"用户点了什么导致了这个 API 调用"。

**过滤**：
- 跳过：静态资源（.js/.css/.png/.woff）、analytics（google-analytics, sentry, hotjar）、插件自身请求
- 保留：一切 JSON/form API 调用

**存储**：IndexedDB，按 domain 分库。保留原始数据，不做脱敏（纯本地存储）。

**隐私**：数据默认不出本机。只有用户主动触发"同步到 AI"或 AI 通过 Bridge 请求时才传输。

### Execute Layer

**核心能力**：在指定 tab 的页面上下文中执行 `fetch()` 调用。

```typescript
interface ExecuteCommand {
  tabId?: number;               // 不指定则用当前 active tab
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: any;
  // 高级
  waitForNavigation?: boolean;  // 执行后等待页面导航
  extractFromPage?: string;     // 执行后从 DOM 提取数据 (CSS selector)
}
```

关键：fetch 在页面上下文执行，自动继承当前域的 cookie 和同源策略内的 auth header。对于非 cookie 认证（如 Authorization header from localStorage），插件也能从页面上下文中读取。

### Bridge

**协议**：WebSocket，连接到 OpenClaw Gateway（或任何支持的 AI backend）。

**消息类型**：
```
Extension → AI:
  - captured_requests: 批量推送捕获的 API 数据
  - execute_result: 执行结果返回
  - page_context: 当前页面信息（URL, title, DOM snapshot）

AI → Extension:
  - execute: 执行 API 调用
  - query_captures: 查询本地存储的捕获数据
  - get_page_context: 获取当前页面信息
```

**连接管理**：插件启动时尝试连接。断线自动重连。未连接时数据暂存本地，连接后批量同步。

## AI 侧设计

### API Schema 生成

AI 从原始流量中提取结构化 schema：

```typescript
interface ApiSchema {
  domain: string;
  name: string;                  // AI 推断的 app 名称
  endpoints: ApiEndpoint[];
  workflows: ApiWorkflow[];      // 常见操作流程
}

interface ApiEndpoint {
  path: string;                  // URL pattern, 参数化 (e.g. /api/users/{id})
  method: string;
  description: string;           // AI 生成的语义描述
  parameters: ParameterSpec[];   // 路径参数、query、body 的结构
  response: ResponseSpec;
  auth: AuthSpec;                // 认证方式（cookie/bearer/custom header）
  examples: CapturedRequest[];   // 真实请求样本
}

interface ApiWorkflow {
  name: string;                  // e.g. "搜索并推荐候选人"
  description: string;
  steps: WorkflowStep[];         // 有序的 API 调用，含条件和循环
  variables: Variable[];         // 用户可自定义的参数
}
```

### 学习过程

1. **被动积累**：随着用户使用，同一 domain 的 API 调用越来越多
2. **模式识别**：AI 识别出同一 endpoint 的不同调用（参数不同、响应不同），推断出参数类型和可选值
3. **语义理解**：结合 URL 路径、参数名、响应结构，推断每个 API 的业务含义
4. **依赖分析**：识别 A 请求的响应中的某个字段是 B 请求的参数（数据流）
5. **Workflow 发现**：识别时间上临近、逻辑上相关的一组 API 调用为一个 workflow

### Schema 存储

OpenClaw 侧以文件形式存储（JSON/YAML），按 domain 组织。随着数据积累持续更新。类似 OpenClaw 的 memory 系统——schema 就是 AI 对这个 webapp 的"记忆"。

## MVP Scope

### V0.1 — 能抓能看

- [ ] 插件：always-on 捕获 fetch/XHR
- [ ] 插件：IndexedDB 本地存储
- [ ] 插件：Popup 页面，按 domain 查看捕获记录
- [ ] 过滤：跳过静态资源和 analytics

### V0.2 — 能传能懂

- [ ] Bridge：WebSocket 连接 OpenClaw
- [ ] AI：接收原始流量，生成单个 endpoint 描述
- [ ] AI：识别 URL pattern（参数化）

### V0.3 — 能用

- [ ] Execute Layer：AI 能通过插件执行 API 调用
- [ ] AI：生成 workflow，执行多步操作
- [ ] DOM 事件关联

### 不做（至少现在）

- 签名/加密逆向
- 跨 tab workflow
- 可视化编排 UI
- 多用户/团队共享
- 自动脱敏

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

**Agent 决策优先级**：
1. Neo API 直调（schema 完备且匹配当前意图）
2. Neo 部分 + browser-use 补充（schema 覆盖部分步骤）
3. 纯 browser-use fallback（未知 app 或新操作）

**飞轮效应**：browser-use 执行时 Neo 在学习 → 用得越多，API 覆盖越全 → browser-use 用得越少。

## 已知硬问题

1. **请求签名/加密**：部分 app（抖音、银行）的 API 带签名，纯 replay 会 403。→ 先不管，遇到了再说。
2. **前端状态依赖**：有些参数来自 JS runtime（Redux store），不在 API response 链中。→ 可通过 extractFromPage 从 DOM 读取，但不完美。
3. **CORS**：执行层在页面上下文发 fetch，受同源策略限制。→ 只能调用当前域的 API，跨域需要切 tab。这其实是个优势——和真实前端行为一致。
4. **WebSocket API**：有些 app 用 WebSocket 而非 REST。→ V1 先不支持。
5. **Rate limiting**：自动化调用可能触发风控。→ 需要支持 delay/throttle。

## 技术栈

- 插件：TypeScript + Vite（沿用旧版构建配置）
- Manifest V3
- 存储：IndexedDB（Dexie.js 封装）
- Bridge：原生 WebSocket
- AI 侧：OpenClaw skill（TypeScript）
