# AI 智能技能生成脚本使用指南

## 功能说明

这个脚本使用 AI（SiliconFlow/DeepSeek）自动生成技能代码，流程如下：

1. **从后端获取API数据**：查询指定域名的所有API文档
2. **第一层LLM调用**：让AI分析任务需求，选择需要的API
3. **第二层LLM调用**：让AI根据选中的API和文档，生成详细的技能代码
4. **考虑localStorage**：读取 `scripts/.site_env` 文件，让AI考虑需要从localStorage读取的数据
5. **创建技能**：将生成的代码保存到后端

## 使用方法

### 1. 确保环境配置

确保 `neo-backend/.env` 文件中配置了 `SILICONFLOW_API_KEY`：

```bash
cd neo-backend
cat .env | grep SILICONFLOW_API_KEY
```

### 2. 准备localStorage数据（可选）

将目标网站的localStorage数据保存到 `scripts/.site_env` 文件（JSON格式）：

```bash
# 在浏览器控制台执行，获取localStorage数据
JSON.stringify(localStorage, null, 2)
# 然后将结果保存到 scripts/.site_env
```

### 3. 确保已捕获API数据

使用Neo扩展在目标网站捕获必要的API调用。

### 4. 运行脚本

```bash
# 从项目根目录运行
node scripts/ai-generate-skill.js <domain>

# 例如：为小红书生成技能
node scripts/ai-generate-skill.js xiaohongshu.com
```

## 脚本流程

```
1. 获取API数据
   ↓
2. 读取localStorage数据（.site_env文件）
   ↓
3. 第一层LLM：选择需要的API
   ↓
4. 第二层LLM：生成详细代码
   ↓
5. 创建技能并保存到后端
```

## 输出示例

```
🚀 开始生成技能: 小红书搜索并点赞
   目标域名: xiaohongshu.com
   任务: 在小红书搜索"激流金属"关键词，获取搜索结果，然后依次给前100条搜索结果点赞

📡 正在从后端获取 xiaohongshu.com 的API数据...
✅ 获取到 15 个API

✅ 读取到 25 个 localStorage 键

🤖 第一层：让LLM选择需要的API...
✅ LLM选择了 2 个API
   执行流程: 先调用搜索API获取结果，然后循环调用点赞API

🤖 第二层：让LLM生成详细的技能代码...
✅ 代码生成完成，长度: 1234 字符

💾 正在创建技能...
✅ 技能创建成功！
   技能ID: abc123-def456-...
   技能名称: 小红书搜索并点赞

✨ 完成！技能已创建，可以在 xiaohongshu.com 网站上使用此技能了！
```

## 注意事项

1. **API文档**：确保API已经有文档（通过 `/api/docs/analyze-pending` 分析生成）
2. **localStorage**：`.site_env` 文件是可选的，但提供它可以提高代码质量
3. **技能意图**：当前固定为"小红书搜索+点赞"，如需修改请编辑脚本中的 `SKILL_INTENT`
4. **API Key**：确保 `SILICONFLOW_API_KEY` 有效且有余额

## 故障排查

### 问题1: 找不到 openai 包

```bash
cd neo-backend
npm install
```

### 问题2: API Key 未设置

检查 `neo-backend/.env` 文件，确保有 `SILICONFLOW_API_KEY`。

### 问题3: 未找到API数据

先使用Neo扩展在目标网站捕获API调用。

### 问题4: LLM返回格式错误

脚本会尝试解析JSON，如果失败会报错。可以查看LLM的原始响应进行调试。

