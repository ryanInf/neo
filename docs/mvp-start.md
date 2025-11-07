# Neo MVP 启动指南

这是一个可以快速运行的 MVP 示例，帮助您快速体验 Neo 的核心功能。

## 前置要求

1. **Node.js** >= 18
   ```bash
   # 检查 Node.js 版本
   node --version
   
   # Mac 用户可以使用 Homebrew 安装
   # brew install node
   ```

2. **PostgreSQL** >= 14（或使用 Docker）
   ```bash
   # 检查 Docker 是否安装（推荐使用 Docker）
   docker --version
   
   # Mac 用户：如果未安装 Docker，请从 https://www.docker.com/products/docker-desktop 下载安装
   ```

3. **npm** 或 **yarn**（通常随 Node.js 一起安装）
   ```bash
   npm --version
   ```

4. **Chrome 浏览器**（用于加载插件）

## 快速启动步骤

### 方式 1: 使用快速设置脚本（Mac/Linux 推荐）

项目提供了自动化设置脚本，可以快速完成环境配置：

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

### 方式 2: 手动启动步骤

#### 1. 启动数据库（使用 Docker）

```bash
# 在项目根目录执行
docker-compose up -d

# 验证容器是否正常运行
docker ps
```

您应该看到 `neo-postgres` 和 `neo-redis` 两个容器正在运行。

**Mac 用户提示**：如果 Docker 未运行，请先启动 Docker Desktop 应用。

#### 2. 设置后端

```bash
cd neo-backend

# 安装依赖
npm install

# 创建环境变量文件
# 如果不存在 .env.example，可以手动创建 .env 文件
if [ ! -f .env ]; then
  cat > .env << 'EOF'
# 数据库配置
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/neo?schema=public"

# SiliconFlow API 配置（请替换为您的实际 API Key）
SILICONFLOW_API_KEY="your-siliconflow-api-key-here"

# Redis 配置（可选）
REDIS_URL="redis://localhost:6379"

# 服务器配置
PORT=3000
NODE_ENV=development
EOF
fi

# 编辑 .env 文件，填入您的 SiliconFlow API Key
# 如果没有 API Key，请访问 https://siliconflow.cn 注册获取

# 初始化数据库
npm run prisma:generate
npm run prisma:migrate

# 启动后端服务（开发模式）
npm run dev
```

后端服务将在 `http://localhost:3000` 启动。您应该看到类似以下的输出：

```
[Neo Backend] Server running on port 3000 (development)
```

**提示**：保持此终端窗口打开，后端服务需要持续运行。

#### 3. 构建和加载插件

打开**新的终端窗口**，执行以下命令：

```bash
cd neo-extension

# 安装依赖
npm install

# 构建插件
npm run build
```

构建成功后，会在 `neo-extension/dist` 目录生成插件文件。

**在 Chrome 中加载插件**：
1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"开关
4. 点击"加载已解压的扩展程序"
5. 选择项目中的 `neo-extension/dist` 目录

**Mac 用户快捷键**：打开开发者工具可以使用 `Cmd+Option+I`

#### 4. 创建插件图标（如果需要）

如果插件加载时提示缺少图标文件，可以使用以下方法创建：

**方法 1: 使用 ImageMagick**（如果已安装）
```bash
cd neo-extension/src/icons
convert -size 16x16 xc:#4A90E2 icon16.png
convert -size 48x48 xc:#4A90E2 icon48.png
convert -size 128x128 xc:#4A90E2 icon128.png
```

**方法 2: 使用 Python PIL**
```bash
# 创建临时 Python 脚本
cat > create_icons.py << 'EOF'
from PIL import Image

sizes = [16, 48, 128]
for size in sizes:
    img = Image.new('RGB', (size, size), color='#4A90E2')
    img.save(f'neo-extension/src/icons/icon{size}.png')
EOF

python3 create_icons.py
rm create_icons.py
```

**方法 3: 使用在线工具**

访问 https://www.favicon-generator.org/ 生成图标，然后下载并重命名到对应位置。

## MVP 使用示例

### 示例 1：测试 API 捕获

1. 加载插件后，访问任意网站（如 https://example.com）
2. 打开浏览器控制台（F12）
3. 查看是否有 Neo 相关的日志输出
4. 插件会自动捕获页面中的 API 调用并上报到后端

### 示例 2：测试 API 文档生成

```bash
# 使用 curl 触发 API 文档分析
curl -X POST http://localhost:3000/api/docs/analyze-pending \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

### 示例 3：创建技能

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

### 示例 4：查看技能列表

```bash
curl http://localhost:3000/api/skills?domain=example.com
```

## 验证 MVP 是否正常运行

### 1. 检查后端服务

```bash
curl http://localhost:3000/health
```

应该返回：`{"status":"ok","timestamp":"..."}`

### 2. 检查数据库连接

```bash
cd neo-backend
npm run prisma:studio
```

Prisma Studio 会在浏览器中打开（通常是 `http://localhost:5555`），您应该能看到数据库表结构。

### 3. 运行 API 测试脚本

```bash
# 在项目根目录执行
chmod +x scripts/test-api.sh
./scripts/test-api.sh
```

该脚本会测试以下端点：
- 健康检查
- API 文档列表
- 技能列表

### 4. 检查插件

- 在 Chrome 扩展管理页面，确认插件已加载
- 访问任意网站（如 `https://example.com`）
- 打开浏览器开发者工具（Mac: `Cmd+Option+I`，Windows/Linux: `F12`）
- 查看 Console 标签，应该能看到 Neo 相关的日志
- 查看 Network 标签，确认有请求发送到 `http://localhost:3000/api/capture`

## 常见问题排查

### 问题 1：Docker 容器无法启动

**症状**：`docker-compose up -d` 失败

**解决方案**：
```bash
# 检查 Docker Desktop 是否运行
docker ps

# Mac 用户：如果 Docker 未运行，请启动 Docker Desktop 应用

# 检查端口是否被占用
lsof -i :5432  # PostgreSQL (Mac/Linux)
netstat -ano | findstr :5432  # PostgreSQL (Windows)
lsof -i :6379  # Redis (Mac/Linux)
```

### 问题 2：后端无法连接数据库

**症状**：启动后端时出现数据库连接错误

**解决方案**：
```bash
# 检查数据库容器是否运行
docker ps | grep neo-postgres

# 检查 .env 文件中的 DATABASE_URL 配置
cat neo-backend/.env | grep DATABASE_URL

# 测试数据库连接
docker exec -it neo-postgres psql -U postgres -d neo -c "SELECT 1;"

# 如果数据库未初始化，运行迁移
cd neo-backend
npm run prisma:migrate
```

### 问题 3：Prisma 迁移失败

**症状**：`npm run prisma:migrate` 失败

**解决方案**：
```bash
# 重置数据库（注意：会删除所有数据）
cd neo-backend
npm run prisma:migrate reset

# 或者手动删除并重新创建数据库
docker exec -it neo-postgres psql -U postgres -c "DROP DATABASE IF EXISTS neo;"
docker exec -it neo-postgres psql -U postgres -c "CREATE DATABASE neo;"
npm run prisma:migrate
```

### 问题 4：插件无法加载

**症状**：Chrome 提示插件加载失败

**解决方案**：
- 检查 `neo-extension/dist` 目录是否存在
- 确认已运行 `npm run build`
- 检查 `manifest.json` 是否正确生成
- 查看 Chrome 扩展页面的错误信息
- 如果缺少图标文件，参考上方"创建插件图标"部分

### 问题 5：AI 分析失败

**症状**：AI 分析功能失败

**解决方案**：
```bash
# 检查 .env 文件中的 API Key
cat neo-backend/.env | grep SILICONFLOW_API_KEY

# 确认 API Key 有效且有余额
# 访问 https://siliconflow.cn 检查账户状态
```

### 问题 6：端口被占用

**症状**：后端无法启动，提示端口 3000 被占用

**解决方案**：
```bash
# Mac/Linux: 查找占用端口的进程
lsof -i :3000

# Windows: 查找占用端口的进程
netstat -ano | findstr :3000

# 杀死占用端口的进程（替换 PID 为实际进程 ID）
# Mac/Linux:
kill -9 <PID>
# Windows:
taskkill /PID <PID> /F

# 或者修改 .env 文件中的 PORT 配置
```

## 开发模式

### 后端开发模式

后端使用 `tsx watch` 实现热重载，修改代码后会自动重启。

### 插件开发模式

```bash
cd neo-extension

# 启动 watch 模式，自动重新构建
npm run dev
```

在 watch 模式下，修改代码后会自动重新构建。您需要在 Chrome 扩展页面点击"重新加载"按钮来加载新版本。

## 停止服务

```bash
# 停止后端服务：在运行 npm run dev 的终端按 Ctrl+C

# 停止数据库容器
docker-compose down

# 停止并删除数据卷（注意：会删除所有数据）
docker-compose down -v
```

## 下一步

MVP 运行成功后，您可以：

1. **浏览网站**：访问任意网站，让插件自动捕获 API 调用
2. **生成文档**：触发 API 文档分析，查看 AI 生成的文档
3. **创建技能**：基于 API 文档创建智能技能
4. **执行技能**：在页面上执行技能，查看执行结果

## 技术支持

如果遇到问题，请查看：
- [开发计划](./plan.md) - 了解项目进度和待办事项
- [架构文档](./architecture.md) - 了解系统架构

