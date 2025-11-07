#!/bin/bash

# Neo Mac 快速设置脚本
# 用于自动配置环境变量和初始化项目

echo "===================================="
echo "Neo Mac 快速设置"
echo "===================================="
echo ""

# 检查是否在项目根目录
if [ ! -f "docker-compose.yml" ]; then
    echo "[错误] 请在项目根目录执行此脚本"
    exit 1
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "[错误] 未找到 Node.js，请先安装 Node.js >= 18"
    echo "可以使用 Homebrew 安装: brew install node"
    exit 1
fi

echo "[1/6] 检查 Docker..."
if ! docker ps &> /dev/null; then
    echo "[警告] Docker 未运行，请先启动 Docker Desktop"
    echo "然后重新运行此脚本"
    exit 1
fi

echo "[2/6] 启动数据库容器..."
docker-compose up -d

# 等待数据库就绪
echo "等待数据库就绪..."
sleep 5

echo "[3/6] 配置后端环境变量..."
cd neo-backend

if [ ! -f .env ]; then
    echo "创建 .env 文件..."
    cat > .env << 'EOF'
# 数据库配置
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/neo?schema=public"

# SiliconFlow API 配置
# 请访问 https://siliconflow.cn 注册并获取 API Key
SILICONFLOW_API_KEY="your-siliconflow-api-key-here"

# Redis 配置（可选）
REDIS_URL="redis://localhost:6379"

# 服务器配置
PORT=3000
NODE_ENV=development
EOF
    echo "✅ .env 文件已创建"
    echo ""
    echo "⚠️  重要：请编辑 neo-backend/.env 文件，填入您的 SiliconFlow API Key"
    echo "   如果没有 API Key，请访问 https://siliconflow.cn 注册获取"
    echo ""
    read -p "按 Enter 继续（请确保已配置 API Key）..."
else
    echo "✅ .env 文件已存在"
fi

echo "[4/6] 安装后端依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "[错误] 后端依赖安装失败"
    exit 1
fi

echo "[5/6] 初始化数据库..."
npm run prisma:generate
if [ $? -ne 0 ]; then
    echo "[错误] Prisma Client 生成失败"
    exit 1
fi

npm run prisma:migrate
if [ $? -ne 0 ]; then
    echo "[错误] 数据库迁移失败"
    exit 1
fi

echo "[6/6] 设置插件..."
cd ../neo-extension

if [ ! -d "node_modules" ]; then
    echo "安装插件依赖..."
    npm install
    if [ $? -ne 0 ]; then
        echo "[错误] 插件依赖安装失败"
        exit 1
    fi
fi

echo ""
echo "===================================="
echo "✅ 设置完成！"
echo "===================================="
echo ""
echo "下一步："
echo ""
echo "1. 启动后端服务："
echo "   cd neo-backend"
echo "   npm run dev"
echo ""
echo "2. 构建插件（在新终端）："
echo "   cd neo-extension"
echo "   npm run build"
echo ""
echo "3. 加载插件到 Chrome："
echo "   - 打开 chrome://extensions/"
echo "   - 开启开发者模式"
echo "   - 加载 neo-extension/dist 目录"
echo ""
echo "4. 测试部署："
echo "   ./scripts/test-api.sh"
echo ""
echo "详细说明请查看: docs/mac-deployment.md"
echo ""

