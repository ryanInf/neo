import OpenAI from 'openai';
import { prisma } from '../utils/prisma';
import { config } from '../utils/config';
import { NotFoundError, ExternalApiError } from '../utils/errors';
import type { ApiCall } from '../models/skill-types';

// SiliconFlow API 配置
const openai = new OpenAI({
  apiKey: config.siliconFlowApiKey,
  baseURL: config.siliconFlowBaseUrl,
});

/**
 * 生成技能编排的 Prompt
 */
function generateOrchestrationPrompt(apiDocs: Array<{
  id: string;
  url: string;
  method: string;
  docMarkdown?: string;
  requestBody?: any;
  responseBody?: any;
}>): string {
  const apiInfo = apiDocs.map((doc, index) => `
API ${index + 1}:
- ID: ${doc.id}
- URL: ${doc.url}
- Method: ${doc.method}
- 文档: ${doc.docMarkdown || '暂无文档'}
- 请求示例: ${doc.requestBody ? JSON.stringify(doc.requestBody, null, 2) : '无'}
- 响应示例: ${doc.responseBody ? JSON.stringify(doc.responseBody, null, 2) : '无'}
`).join('\n');

  return `请分析以下 API 列表，深入学习它们之间的关联性和业务逻辑，然后编排一个智能技能。

${apiInfo}

请深入分析：
1. **业务逻辑理解**：这些 API 在业务场景中的实际用途，它们组合起来能完成什么高级业务功能
2. **API 之间的逻辑关系**：
   - 依赖关系：哪些 API 依赖于其他 API 的输出
   - 执行顺序：合理的执行顺序是什么
   - 数据流转：数据如何在 API 之间传递和转换
3. **工作流模式识别**：
   - 线性流程：简单的顺序执行
   - 循环迭代：需要重复执行的模式（如分页查询、批量处理）
   - 条件分支：根据条件选择不同的执行路径
   - 增强功能：将简单 API 组合成高级业务功能（如"一键批量推荐"）
4. **参数传递关系**：
   - 一个 API 的响应数据如何传递给下一个 API
   - 需要如何提取和转换数据
   - 循环中的状态如何更新（如分页参数）

然后生成一个技能定义，包括：
- 技能名称（简洁明了，体现业务功能）
- 技能描述（详细说明这个技能做什么，能解决什么问题）
- API 执行顺序（order 字段）
- 参数映射规则（inputMapping 和 outputMapping）
- 如果是迭代式流程，需要指定循环类型（loopType）和循环条件（loopCondition）

请以 JSON 格式返回，格式如下：
{
  "name": "技能名称",
  "description": "技能描述（详细说明功能和用途）",
  "apiSequence": [
    {
      "apiDocId": "API ID",
      "order": 1,
      "inputMapping": {},
      "outputMapping": {},
      "condition": "可选：执行条件",
      "loopType": "可选：'for' | 'while' | 'forEach'",
      "loopCondition": "可选：循环条件表达式",
      "maxIterations": "可选：最大迭代次数"
    }
  ]
}

**重要提示**：
- 如果识别到迭代式模式（如分页查询、批量处理），请使用 loopType 和 loopCondition
- 确保循环有终止条件，避免无限循环
- 优先生成能解决实际业务问题的增强功能，而不是简单的 API 调用序列

请直接返回 JSON，不要包含额外的说明文字。`;
}

/**
 * AI 分析 API 并编排技能
 */
export async function orchestrateSkill(
  domain: string,
  apiDocIds: string[]
): Promise<{
  name: string;
  description: string;
  apiSequence: ApiCall[];
}> {
  try {
    // 获取 API 文档
    const apiDocs = await prisma.apiDoc.findMany({
      where: {
        id: { in: apiDocIds },
        domain,
      },
    });

    if (apiDocs.length === 0) {
      throw new NotFoundError('API docs', `domain: ${domain}`);
    }

    const prompt = generateOrchestrationPrompt(apiDocs);

    const completion = await openai.chat.completions.create({
      model: 'deepseek-ai/DeepSeek-V3.2-Exp',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的 API 工作流编排专家，擅长分析 API 之间的业务逻辑关系，设计合理的执行流程，并能识别迭代式模式（如分页查询、批量处理）。你善于将简单的 API 组合成高级业务功能，生成能解决实际问题的增强技能。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.7,  // 提高温度以支持更创新的编排
      max_tokens: 3000,  // 增加 token 数量以支持复杂编排
    });

    const responseText = completion.choices[0]?.message?.content || '';
    
    if (!responseText) {
      throw new ExternalApiError('Empty response from OpenAI');
    }

    // 解析 JSON 响应
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new ExternalApiError('Invalid JSON response from OpenAI');
    }

    let skillData;
    try {
      skillData = JSON.parse(jsonMatch[0]);
    } catch (error) {
      throw new ExternalApiError('Failed to parse JSON response from OpenAI', { error });
    }
    
    return {
      name: skillData.name || '未命名技能',
      description: skillData.description || '',
      apiSequence: skillData.apiSequence || [],
    };
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ExternalApiError) {
      throw error;
    }
    console.error('Error orchestrating skill:', error);
    throw new ExternalApiError('Failed to orchestrate skill', { originalError: error });
  }
}
