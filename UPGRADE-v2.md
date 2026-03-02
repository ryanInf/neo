# Neo v2 升级方案 — UI 操作层 + Electron 支持

## 目标

Neo 从「API 发现 & 执行工具」升级为 **「Web App 全栈控制工具」**：
- 保留现有 API 层（capture → schema → exec）
- 新增 UI 操作层（snapshot → click → fill），与 agent-browser 对齐
- 支持 Electron 桌面应用
- 统一 CLI 接口，coding agent 无缝调用

升级后 Neo = agent-browser 超集 + API 智能层。

---

## 新增命令设计

### 1. UI 操作命令族

```bash
# 连接
neo connect [port]                     # 连接 CDP 端口（默认 9222）
neo connect --electron <app-name>      # 自动发现并连接 Electron app

# 快照 (核心)
neo snapshot [-i] [-C] [--json]        # 获取 a11y tree + @ref 引用
  -i                                   # 只显示可交互元素
  -C                                   # 包含 cursor:pointer 元素
  --json                               # JSON 输出
  --selector <css>                     # 限定范围

# 交互
neo click @ref [--new-tab]             # 点击元素
neo fill @ref "text"                   # 清空并输入
neo type @ref "text"                   # 追加输入
neo press <key>                        # 按键（Enter, Tab, Ctrl+a）
neo select @ref "value"                # 下拉选择
neo hover @ref                         # 悬停
neo scroll <up|down|left|right> [px]   # 滚动
neo scroll <dir> [px] --selector <css> # 容器内滚动

# 截图
neo screenshot [path]                  # 截图
neo screenshot --full                  # 全页面
neo screenshot --annotate              # 标注元素编号

# 等待
neo wait @ref                          # 等待元素出现
neo wait --load networkidle            # 等待网络空闲
neo wait <ms>                          # 等待毫秒数

# 信息
neo get text @ref                      # 获取元素文本
neo get url                            # 获取当前 URL
neo get title                          # 获取页面标题

# Tab 管理
neo tab                                # 列出所有 target
neo tab <index|--url pattern>          # 切换 target
```

### 2. Electron 支持

```bash
# 自动发现本地 Electron 进程的 CDP 端口
neo discover                           # 扫描常见端口 9222-9299

# 启动 Electron app（带 CDP）
neo launch <app-name> [--port 9222]    # 自动查找可执行路径，加 --remote-debugging-port

# 已知 app 映射表（内置）
neo launch slack                       # → slack --remote-debugging-port=9222
neo launch vscode                      # → code --remote-debugging-port=9223
neo launch discord                     # → discord --remote-debugging-port=9224
neo launch notion                      # → notion --remote-debugging-port=9225
```

### 3. Session 管理（多应用并行）

```bash
neo --session slack connect 9222       # 命名 session
neo --session vscode connect 9223
neo --session slack snapshot -i        # 指定 session 操作
neo --session vscode click @e5
neo sessions                           # 列出活跃 sessions
```

---

## 实现方案

### 架构

```
neo.cjs
  ├── 现有 API 层 (capture/schema/exec/replay/workflow...)
  │     └── 通过 CDP → Extension Service Worker → IndexedDB
  │
  └── 新增 UI 层 (snapshot/click/fill/screenshot...)
        └── 通过 CDP → Page Target (直接 DOM 协议)
            ├── Accessibility.getFullAXTree → snapshot
            ├── DOM.querySelector + Input.dispatchMouseEvent → click/fill
            ├── Page.captureScreenshot → screenshot
            └── 无需扩展，纯 CDP 协议
```

**关键设计决策**：

1. **UI 层不依赖 Neo 扩展**。纯 CDP 协议，连 Electron app 也能用（Electron 没装 Neo 扩展）。
2. **API 层仍走扩展**。capture/schema/exec 需要扩展的 IndexedDB 和页面上下文执行。
3. **两层可独立使用**。只有 CDP？能做 UI 操作。有扩展？还能做 API 发现。

### CDP 协议使用

| 功能 | CDP Domain | 方法 |
|------|-----------|------|
| Snapshot | `Accessibility` | `getFullAXTree` |
| Click | `DOM` + `Input` | `querySelector` → `getBoxModel` → `dispatchMouseEvent` |
| Fill/Type | `DOM` + `Input` | `focus` → `dispatchKeyEvent` / `insertText` |
| Press | `Input` | `dispatchKeyEvent` |
| Screenshot | `Page` | `captureScreenshot` |
| Scroll | `Input` | `dispatchMouseEvent` (wheel) |
| Wait element | `DOM` | polling `querySelector` |
| Wait network | `Network` | `loadingFinished` event |
| Get text | `DOM` | `getOuterHTML` / `resolveNode` + `callFunctionOn` |
| Tab list | HTTP | `/json/list` |
| Tab switch | HTTP | `/json/activate/{id}` |

### @ref 引用系统

Snapshot 返回 a11y tree 并自动编号：

```
@e1  [button] "Submit"
@e2  [textbox] "Search..."  
@e3  [link] "Home"
@e4  [combobox] "Select option"
```

引用存在内存中（session state），后续命令直接用 `@e1` 定位元素。

实现：
1. `Accessibility.getFullAXTree` 获取完整 a11y 树
2. 过滤可交互节点（role = button/textbox/link/combobox/checkbox/...）
3. 编号，存储 `backendDOMNodeId` 映射
4. 交互时：`@ref` → `backendDOMNodeId` → `DOM.resolveNode` → `getBoxModel` → 坐标 → `Input.dispatchMouseEvent`

### Annotated Screenshot

1. `Page.captureScreenshot` 获取截图
2. 对每个 @ref 元素，`getBoxModel` 获取坐标
3. 用 canvas (node-canvas 或 sharp) 在截图上绘制编号标签
4. 保存标注版截图

> 备选：轻量方案——不引入 canvas 依赖，直接在页面 DOM 上注入标注层（`eval` 注入 JS），然后截图，再清理。零依赖。

### Session 管理

```javascript
// sessions: Map<name, { wsUrl, pageWsUrl, tabId, refs }>
const sessions = new Map();
const DEFAULT_SESSION = '__default__';

// --session flag 选择 session，未指定用 default
```

Session 信息持久化到 `/tmp/neo-sessions.json`，支持跨命令保持连接。

---

## 文件变更

### neo.cjs 新增模块（估算）

| 模块 | 行数 | 说明 |
|------|------|------|
| CDP UI helpers | ~200 | `cdpSnapshot`, `cdpClick`, `cdpFill`, `cdpScreenshot` |
| @ref 管理 | ~80 | ref 编号、存储、解析 |
| Session 管理 | ~60 | 多连接、持久化 |
| Electron 发现 | ~80 | 进程扫描、app 映射、launch |
| annotate 截图 | ~60 | DOM 注入标注法 |
| 命令注册 | ~300 | `commands.snapshot/click/fill/...` |
| **合计** | ~780 | neo.cjs 从 3326 行 → ~4100 行 |

### 扩展（无需改动）

UI 操作层纯 CDP，不需要修改 Chrome 扩展。

### SKILL.md 更新

在现有 Neo skill 基础上，增加 UI 操作文档和 Electron 使用指南。

---

## 实现优先级

### P0 — 核心 UI 操作（让 Neo 能做 agent-browser 能做的一切）

1. `neo connect [port]` — 连接管理 + session 状态
2. `neo snapshot -i` — a11y tree + @ref
3. `neo click @ref` / `neo fill @ref "text"` / `neo press <key>`
4. `neo screenshot [path]`
5. `neo get text @ref` / `neo get url` / `neo get title`
6. `neo wait @ref` / `neo wait <ms>`
7. `neo tab` / `neo tab <index>`

### P1 — Electron 支持

8. `neo discover` — 扫描本地 CDP 端口
9. `neo launch <app>` — 内置 app 映射表
10. `neo connect --electron <app-name>`

### P2 — 增强

11. `neo screenshot --annotate` — 标注截图
12. `neo --session <name>` — 多 session 并行
13. `neo scroll` — 滚动支持
14. `neo hover` / `neo select` / `neo drag`

### P3 — 智能融合

15. **双通道自动路由**：`neo do <intent>` — 有 schema 走 API，没有走 UI
16. **Per-app skill 模板**：API schema + UI 导航地图合一

---

## 与 agent-browser 的差异化总结

| | agent-browser | Neo v2 |
|---|---|---|
| UI 操作 | ✅ Playwright 包装 | ✅ 纯 CDP（零依赖） |
| API 发现 | ❌ | ✅ 被动学习 |
| API 直调 | ❌ | ✅ schema + exec |
| Auth 处理 | 依赖浏览器 session | 浏览器上下文执行（自动继承） |
| Electron | ✅ | ✅ + 自动发现 + launch |
| 依赖 | Playwright + Chromium (~400MB) | ws 包（已有），零新依赖 |
| 体积 | 重 | 极轻 |
| 双通道融合 | ❌ | ✅ API 优先 → UI fallback |
| 飞轮效应 | ❌ | ✅ UI 操作时后台学 API |

**核心叙事**：agent-browser 是浏览器自动化工具，Neo 是 **Web App 理解引擎**——不只操作 UI，还理解应用在做什么。
