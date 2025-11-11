#!/usr/bin/env node
/**
 * AI 智能技能生成脚本
 * 
 * 功能：
 * 1. 从neo后端获取指定域名的所有API数据
 * 2. 分两层调用LLM：
 *    - 第一层：让LLM选择需要的API
 *    - 第二层：让LLM生成详细的技能代码
 * 3. 考虑localStorage中的数据需求
 * 
 * 使用方法：
 * node scripts/ai-generate-skill.js <domain>
 * 
 * 例如：
 * node scripts/ai-generate-skill.js xiaohongshu.com
 */

const fs = require('fs');
const path = require('path');

// 动态加载 dotenv（从 neo-backend 的 node_modules）
let dotenv;
try {
  // 获取脚本所在目录的父目录（项目根目录）
  const projectRoot = path.resolve(__dirname, '..');
  const dotenvPath1 = path.join(projectRoot, 'node_modules/dotenv');
  const dotenvPath2 = path.join(projectRoot, 'neo-backend/node_modules/dotenv');
  
  if (fs.existsSync(dotenvPath1)) {
    dotenv = require(dotenvPath1);
  } else if (fs.existsSync(dotenvPath2)) {
    dotenv = require(dotenvPath2);
  } else {
    throw new Error('未找到 dotenv 包');
  }
} catch (e) {
  console.error('❌ 未找到 dotenv 包');
  console.error('   请先安装依赖: cd neo-backend && npm install');
  process.exit(1);
}

// 加载环境变量
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, 'neo-backend/.env');
dotenv.config({ path: envPath });

// 动态加载 OpenAI（从 neo-backend 的 node_modules）
let OpenAI;
try {
  // 获取项目根目录
  const projectRoot = path.resolve(__dirname, '..');
  const openaiPath1 = path.join(projectRoot, 'node_modules/openai');
  const openaiPath2 = path.join(projectRoot, 'neo-backend/node_modules/openai');
  
  if (fs.existsSync(openaiPath1)) {
    OpenAI = require(openaiPath1);
  } else if (fs.existsSync(openaiPath2)) {
    OpenAI = require(openaiPath2);
  } else {
    throw new Error('未找到 openai 包');
  }
} catch (e) {
  console.error('❌ 未找到 openai 包');
  console.error('   请先安装依赖: cd neo-backend && npm install');
  process.exit(1);
}

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000';
const SILICONFLOW_API_KEY = process.env.SILICONFLOW_API_KEY;
const SILICONFLOW_BASE_URL = process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1';

// 技能意图（固定为小红书搜索+点赞）
const SKILL_INTENT = {
  name: '小红书搜索并点赞',
  description: '搜索"激流金属"相关内容，然后给前100条内容点赞',
  task: '在小红书搜索"激流金属"关键词，获取搜索结果，然后依次给前100条搜索结果点赞'
};

/**
 * 初始化 OpenAI 客户端
 */
function initOpenAIClient() {
  if (!SILICONFLOW_API_KEY) {
    throw new Error('SILICONFLOW_API_KEY 未设置，请检查 neo-backend/.env 文件');
  }
  
  return new OpenAI({
    apiKey: SILICONFLOW_API_KEY,
    baseURL: SILICONFLOW_BASE_URL,
  });
}

/**
 * 从后端获取指定域名的所有API数据
 */
async function fetchApiDocs(domain) {
  console.log(`\n📡 正在从后端获取 ${domain} 的API数据...`);
  
  const response = await fetch(`${BACKEND_URL}/api/docs?domain=${encodeURIComponent(domain)}&limit=100`);
  
  if (!response.ok) {
    throw new Error(`获取API数据失败: ${response.status} ${response.statusText}`);
  }
  
  const data = await response.json();
  console.log(`✅ 获取到 ${data.data.length} 个API`);
  
  return data.data;
}

/**
 * 读取 localStorage 数据
 */
function loadLocalStorageData() {
  const siteEnvPath = path.join(__dirname, '.site_env');
  
  if (!fs.existsSync(siteEnvPath)) {
    console.warn(`⚠️  未找到 .site_env 文件: ${siteEnvPath}`);
    return {};
  }
  
  try {
    const content = fs.readFileSync(siteEnvPath, 'utf-8');
    const localStorage = JSON.parse(content);
    console.log(`✅ 读取到 ${Object.keys(localStorage).length} 个 localStorage 键`);
    return localStorage;
  } catch (error) {
    console.error(`❌ 读取 .site_env 文件失败:`, error.message);
    return {};
  }
}

/**
 * 第一层：让LLM选择需要的API
 */
async function selectApisWithLLM(openai, apiDocs, skillIntent) {
  console.log(`\n🤖 第一层：让LLM选择需要的API...`);
  
  // 构建API列表摘要
  const apiSummary = apiDocs.map((doc, index) => ({
    id: doc.id,
    index: index + 1,
    url: doc.url,
    method: doc.method,
    hasDoc: !!doc.docMarkdown,
  }));
  
  const prompt = `你是一个API工作流编排专家。现在需要完成以下任务：

**任务描述：**
${skillIntent.description}

**任务详情：**
${skillIntent.task}

**可用的API列表：**
${JSON.stringify(apiSummary, null, 2)}

**要求：**
1. 分析任务需求，选择完成这个任务所需的API
2. 确定API的执行顺序
3. 说明每个API的用途和如何组合使用

请返回JSON格式，包含以下字段：
- selectedApiIds: 选中的API ID数组（按执行顺序）
- apiUsage: 每个API的用途说明（数组，与selectedApiIds对应）
- executionFlow: 执行流程说明

只返回JSON，不要其他文字。`;

  const completion = await openai.chat.completions.create({
    model: 'deepseek-ai/DeepSeek-V3.2-Exp',
    messages: [
      {
        role: 'system',
        content: '你是一个专业的API工作流编排专家，擅长分析任务需求并选择合适的API组合。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
  });
  
  const responseText = completion.choices[0]?.message?.content || '';
  
  // 解析JSON响应
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('LLM返回的不是有效的JSON格式');
  }
  
  const selection = JSON.parse(jsonMatch[0]);
  console.log(`✅ LLM选择了 ${selection.selectedApiIds.length} 个API`);
  console.log(`   执行流程: ${selection.executionFlow}`);
  
  return selection;
}

/**
 * 分析header和localStorage的关系
 */
function analyzeHeadersAndLocalStorage(apiDocs, localStorage) {
  console.log(`\n📊 分析Header和LocalStorage关系...`);
  
  // 收集所有API的headers
  const allHeaders = new Map();
  apiDocs.forEach(doc => {
    if (doc.requestHeaders) {
      Object.entries(doc.requestHeaders).forEach(([key, value]) => {
        if (!allHeaders.has(key)) {
          allHeaders.set(key, new Set());
        }
        allHeaders.get(key).add(value);
      });
    }
  });
  
  // 分析哪些header值可能来自localStorage
  const localStorageKeys = Object.keys(localStorage);
  const headerAnalysis = {};
  
  allHeaders.forEach((values, headerKey) => {
    const valuesArray = Array.from(values);
    const analysis = {
      headerKey: headerKey,
      sampleValues: valuesArray.slice(0, 3), // 取前3个样本值
      source: 'fixed', // fixed | localStorage | dynamic
      localStorageKey: null,
      fixedValue: null,
    };
    
    // 检查header值是否匹配localStorage中的某个key
    // 或者header值是否包含localStorage中的某个值
    for (const [lsKey, lsValue] of Object.entries(localStorage)) {
      const lsValueStr = typeof lsValue === 'string' ? lsValue : JSON.stringify(lsValue);
      
      // 检查header值是否直接匹配localStorage的值
      if (valuesArray.some(v => v === lsValueStr || v.includes(lsValueStr))) {
        analysis.source = 'localStorage';
        analysis.localStorageKey = lsKey;
        break;
      }
    }
    
    // 检查header key是否暗示需要从localStorage读取（如cookie, token等）
    const headerKeyLower = headerKey.toLowerCase();
    
    // Cookie特殊处理：通常从document.cookie读取，但也可能从localStorage读取cookie字符串
    if (headerKeyLower === 'cookie') {
      // 检查localStorage中是否有cookie相关的key
      const cookieKeys = localStorageKeys.filter(k => 
        k.toLowerCase().includes('cookie') || 
        k.toLowerCase().includes('session') ||
        k.toLowerCase().includes('auth')
      );
      if (cookieKeys.length > 0) {
        analysis.source = 'localStorage';
        analysis.localStorageKey = cookieKeys[0];
      } else {
        // Cookie通常从document.cookie读取
        analysis.source = 'document.cookie';
      }
    } else if (headerKeyLower.includes('cookie') || 
               headerKeyLower.includes('token') || 
               headerKeyLower.includes('auth') ||
               headerKeyLower.includes('session') ||
               headerKeyLower.startsWith('x-s') ||
               headerKeyLower.startsWith('x-t')) {
      // 检查localStorage中是否有匹配的key
      const matchingKeys = localStorageKeys.filter(lsKey => {
        const lsKeyLower = lsKey.toLowerCase();
        // 检查key是否匹配或包含header的关键部分
        return lsKeyLower.includes(headerKeyLower.replace(/[^a-z]/g, '')) ||
               headerKeyLower.includes(lsKeyLower.replace(/[^a-z]/g, ''));
      });
      
      if (matchingKeys.length > 0) {
        analysis.source = 'localStorage';
        analysis.localStorageKey = matchingKeys[0];
      }
    }
    
    // 如果所有值都相同，可能是固定值
    if (valuesArray.length === 1 || new Set(valuesArray).size === 1) {
      analysis.fixedValue = valuesArray[0];
      if (analysis.source === 'fixed') {
        analysis.source = 'fixed';
      }
    } else if (analysis.source === 'fixed') {
      // 值不一致，可能是动态生成的
      analysis.source = 'dynamic';
    }
    
    headerAnalysis[headerKey] = analysis;
  });
  
  // 生成header构建说明
  const headerInstructions = Object.values(headerAnalysis).map(analysis => {
    const headerKeyLower = analysis.headerKey.toLowerCase();
    
    // Cookie特殊处理
    if (headerKeyLower === 'cookie') {
      if (analysis.source === 'localStorage' && analysis.localStorageKey) {
        return `- \`${analysis.headerKey}\`: 从localStorage读取cookie字符串，key为"${analysis.localStorageKey}"，使用 \`await context.storage.get("${analysis.localStorageKey}")\` 或 \`document.cookie\``;
      } else {
        return `- \`${analysis.headerKey}\`: 从document.cookie读取，使用 \`document.cookie\``;
      }
    }
    
    if (analysis.source === 'localStorage' && analysis.localStorageKey) {
      return `- \`${analysis.headerKey}\`: 从localStorage读取，key为"${analysis.localStorageKey}"，使用 \`await context.storage.get("${analysis.localStorageKey}")\``;
    } else if (analysis.source === 'document.cookie') {
      return `- \`${analysis.headerKey}\`: 从document.cookie读取，使用 \`document.cookie\``;
    } else if (analysis.source === 'fixed' && analysis.fixedValue) {
      // 对于固定值，如果值太长，只显示前100个字符
      const displayValue = analysis.fixedValue.length > 100 
        ? analysis.fixedValue.substring(0, 100) + '...'
        : analysis.fixedValue;
      return `- \`${analysis.headerKey}\`: 固定值，使用 \`"${displayValue.replace(/"/g, '\\"')}"\``;
    } else {
      return `- \`${analysis.headerKey}\`: 动态值，参考样本值 ${analysis.sampleValues.slice(0, 2).map(v => {
        const display = v.length > 50 ? v.substring(0, 50) + '...' : v;
        return `"${display.replace(/"/g, '\\"')}"`;
      }).join(', ')}`;
    }
  });
  
  // 构建所有header的合并列表（取最常见的值或第一个值）
  const mergedHeaders = {};
  allHeaders.forEach((values, headerKey) => {
    const valuesArray = Array.from(values);
    // 如果所有值相同，使用该值；否则使用第一个值作为示例
    mergedHeaders[headerKey] = valuesArray.length === 1 || new Set(valuesArray).size === 1
      ? valuesArray[0]
      : valuesArray[0]; // 使用第一个值作为示例
  });
  
  console.log(`✅ 分析完成，共 ${Object.keys(headerAnalysis).length} 个header`);
  console.log(`   - 固定值: ${Object.values(headerAnalysis).filter(a => a.source === 'fixed').length}`);
  console.log(`   - localStorage: ${Object.values(headerAnalysis).filter(a => a.source === 'localStorage').length}`);
  console.log(`   - 动态值: ${Object.values(headerAnalysis).filter(a => a.source === 'dynamic').length}`);
  
  return {
    analysis: headerAnalysis,
    instructions: headerInstructions,
    allHeaders: mergedHeaders,
  };
}

/**
 * 第二层：让LLM生成详细的技能代码
 */
async function generateSkillCodeWithLLM(openai, selectedApiDocs, skillIntent, localStorage, selection) {
  console.log(`\n🤖 第二层：让LLM生成详细的技能代码...`);
  
  // 分析header和localStorage的关系
  const headerInfo = analyzeHeadersAndLocalStorage(selectedApiDocs, localStorage);
  
  // 构建API详细信息（包含文档）
  const apiDetails = selectedApiDocs.map((doc, index) => {
    const usage = selection.apiUsage[index] || '未说明';
    return {
      id: doc.id,
      order: index + 1,
      url: doc.url,
      method: doc.method,
      usage: usage,
      docMarkdown: doc.docMarkdown || '暂无文档',
      requestHeaders: doc.requestHeaders,
      requestBody: doc.requestBody,
      responseBody: doc.responseBody,
    };
  });
  
  // 分析localStorage中可能需要的数据
  const localStorageKeys = Object.keys(localStorage);
  const localStorageSummary = localStorageKeys.length > 0
    ? `\n**目标站点的localStorage数据（部分）：**\n${JSON.stringify(Object.fromEntries(localStorageKeys.slice(0, 20).map(k => [k, typeof localStorage[k]])), null, 2)}\n\n注意：技能执行时可能需要从localStorage读取某些认证信息或配置。`
    : '\n注意：未提供localStorage数据，技能可能需要从页面的localStorage读取认证信息。';
  
  // 生成header构建说明
  const headerInstructionsText = headerInfo.instructions.length > 0
    ? `\n**Header构建说明（重要！必须完整还原所有header）：**\n${headerInfo.instructions.join('\n')}\n\n**完整的Header列表（所有API都需要）：**\n${JSON.stringify(headerInfo.allHeaders, null, 2)}\n`
    : '\n**注意：** 需要根据API记录中的requestHeaders完整还原所有header。\n';
  
  const prompt = `你是一个专业的JavaScript技能代码生成专家。现在需要生成一个技能代码。

**任务描述：**
${skillIntent.description}

**任务详情：**
${skillIntent.task}

**选中的API及其文档：**
${JSON.stringify(apiDetails, null, 2)}

**执行流程：**
${selection.executionFlow}
${localStorageSummary}
${headerInstructionsText}

**技能代码框架要求：**
1. 使用 async function execute(context) 作为入口函数
2. context 包含：
   - api.call(options): 调用API的方法
   - state.get(key) / state.set(key, value): 状态管理
   - storage.get(key) / storage.set(key, value): localStorage访问（通过chrome.storage.local）
3. 代码需要：
   - 先搜索"激流金属"关键词
   - 获取搜索结果（前100条）
   - 循环给每条结果点赞
   - 添加适当的延迟避免请求过快
   - 处理错误和异常情况
   - 返回执行结果统计
4. **重要：Header构建**
   - 必须完整还原API记录中的所有requestHeaders
   - 根据Header构建说明，从localStorage读取需要的值
   - 固定值的header直接写死
   - 动态值的header需要根据实际情况生成或从localStorage读取
   - 每个API调用都必须包含完整的headers对象
5. 如果需要从localStorage读取数据，使用 \`await context.storage.get(key)\`
6. 代码要健壮，处理各种边界情况

**重要提示：**
- API调用使用 context.api.call({ url, method, headers, query, body })
- **headers必须完整，包含所有API记录中的requestHeaders字段**
- 响应数据通过返回值获取
- 需要从响应中提取数据并保存到state
- 循环遍历数组时使用 for...of 或 forEach
- 添加适当的延迟（setTimeout）避免请求过快

**Header构建示例：**
\`\`\`javascript
// 示例：构建完整的headers
const headers = {
  'accept': 'application/json, text/plain, */*',
  'content-type': 'application/json;charset=UTF-8',
  // 从localStorage读取的值
  'cookie': await context.storage.get('cookie') || '',
  'x-s': await context.storage.get('x-s') || '',
  // 固定值
  'user-agent': 'Mozilla/5.0 ...',
  // ... 其他所有header
};

const result = await context.api.call({
  url: '...',
  method: 'POST',
  headers: headers, // 必须包含完整的headers
  body: {...}
});
\`\`\`

请生成完整的JavaScript代码，只返回代码，不要其他说明文字。代码应该可以直接执行，并且必须包含完整的headers。`;

  const completion = await openai.chat.completions.create({
    model: 'deepseek-ai/DeepSeek-V3.2-Exp',
    messages: [
      {
        role: 'system',
        content: '你是一个专业的JavaScript代码生成专家，擅长生成健壮、可执行的技能代码。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.5,
    max_tokens: 4000,
  });
  
  const code = completion.choices[0]?.message?.content || '';
  
  // 清理代码（移除markdown代码块标记）
  const cleanedCode = code
    .replace(/```javascript\n?/g, '')
    .replace(/```typescript\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  
  console.log(`✅ 代码生成完成，长度: ${cleanedCode.length} 字符`);
  
  return cleanedCode;
}

/**
 * 创建技能定义并保存到后端
 */
async function createSkill(domain, skillCode, selectedApiDocs, selection) {
  console.log(`\n💾 正在创建技能...`);
  
  // 构建 apiSequence
  const apiSequence = selectedApiDocs.map((doc, index) => ({
    apiDocId: doc.id,
    order: index + 1,
    inputMapping: {}, // LLM生成的代码中已经包含了参数，这里可以留空或让LLM生成
    outputMapping: {}, // 同上
  }));
  
  const skillDefinition = {
    format: 'javascript',
    content: skillCode,
    apiSequence: apiSequence,
  };
  
  const skillData = {
    domain: domain,
    name: SKILL_INTENT.name,
    description: SKILL_INTENT.description,
    definition: skillDefinition,
  };
  
  const response = await fetch(`${BACKEND_URL}/api/skills`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(skillData),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`创建技能失败: ${response.status} ${response.statusText}\n${errorText}`);
  }
  
  const result = await response.json();
  console.log(`✅ 技能创建成功！`);
  console.log(`   技能ID: ${result.data.id}`);
  console.log(`   技能名称: ${result.data.name}`);
  
  return result.data;
}

/**
 * 主函数
 */
async function main() {
  try {
    // 获取命令行参数
    const domain = process.argv[2];
    
    if (!domain) {
      console.error('❌ 请提供域名参数');
      console.log('\n使用方法:');
      console.log('  node scripts/ai-generate-skill.js <domain>');
      console.log('\n例如:');
      console.log('  node scripts/ai-generate-skill.js xiaohongshu.com');
      process.exit(1);
    }
    
    console.log(`\n🚀 开始生成技能: ${SKILL_INTENT.name}`);
    console.log(`   目标域名: ${domain}`);
    console.log(`   任务: ${SKILL_INTENT.task}`);
    
    // 初始化OpenAI客户端
    const openai = initOpenAIClient();
    
    // 获取API数据
    const apiDocs = await fetchApiDocs(domain);
    
    if (apiDocs.length === 0) {
      console.error(`❌ 未找到 ${domain} 的API数据，请先使用Neo扩展捕获API`);
      process.exit(1);
    }
    
    // 读取localStorage数据
    const localStorage = loadLocalStorageData();
    
    // 第一层：选择API
    const selection = await selectApisWithLLM(openai, apiDocs, SKILL_INTENT);
    
    // 获取选中的API详细信息
    const selectedApiDocs = selection.selectedApiIds
      .map(id => apiDocs.find(doc => doc.id === id))
      .filter(Boolean);
    
    if (selectedApiDocs.length === 0) {
      throw new Error('未找到选中的API数据');
    }
    
    // 第二层：生成代码
    const skillCode = await generateSkillCodeWithLLM(
      openai,
      selectedApiDocs,
      SKILL_INTENT,
      localStorage,
      selection
    );
    
    // 创建技能
    const skill = await createSkill(domain, skillCode, selectedApiDocs, selection);
    
    console.log(`\n✨ 完成！技能已创建，可以在 ${domain} 网站上使用此技能了！`);
    
  } catch (error) {
    console.error(`\n❌ 错误:`, error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { main };

