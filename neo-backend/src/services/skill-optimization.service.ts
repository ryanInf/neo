import OpenAI from 'openai';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { config } from '../utils/config';
import { NotFoundError, ExternalApiError } from '../utils/errors';
import type { ApiCall, SkillDefinition, ExecutionStep } from '../models/skill-types';
import { generateSkillCode, createSkillDefinition, type ApiDocInfo } from './skill-code-generator';

// SiliconFlow API 配置
const openai = new OpenAI({
  apiKey: config.siliconFlowApiKey,
  baseURL: config.siliconFlowBaseUrl,
});

/**
 * 分析执行日志并优化技能
 */
export async function optimizeSkill(skillId: string): Promise<void> {
  // 获取技能信息
  const skill = await prisma.skill.findUnique({
    where: { id: skillId },
  });

  if (!skill) {
    throw new NotFoundError('Skill', skillId);
  }

  // 获取最近的执行日志
  const logs = await prisma.executionLog.findMany({
    where: {
      skillId,
    },
    take: 50,
    orderBy: {
      timestamp: 'desc',
    },
  });

  if (logs.length === 0) {
    console.log(`No execution logs found for skill ${skillId}`);
    return;
  }

  // 分析日志
  const successRate = logs.filter(l => l.status === 'success').length / logs.length;
  const failureRate = logs.filter(l => l.status === 'failed').length / logs.length;

  // 如果成功率高，不需要优化
  if (successRate > 0.9) {
    console.log(`Skill ${skillId} has high success rate (${successRate}), skipping optimization`);
    return;
  }

  // 收集失败的步骤
  const failedSteps: ExecutionStep[] = [];
  logs.forEach(log => {
    if (log.status === 'failed') {
      const steps = (log.steps as unknown as ExecutionStep[]) || [];
      steps.forEach(step => {
        if (step.status === 'failed') {
          failedSteps.push({
            ...step,
            error: step.error || log.error || undefined,
          });
        }
      });
    }
  });

  // 生成优化 Prompt
  const definition = skill.definition as unknown as SkillDefinition;
  const prompt = generateOptimizationPrompt(
    skill.name,
    skill.description,
    definition.apiSequence,
    logs,
    failedSteps,
    successRate,
    failureRate
  );

  // 调用 AI 优化
  const completion = await openai.chat.completions.create({
    model: 'deepseek-ai/DeepSeek-V3.2-Exp',
    messages: [
      {
        role: 'system',
        content: '你是一个专业的 API 工作流优化专家，擅长分析执行日志并改进技能编排。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    temperature: 0.5,
    max_tokens: 2000,
  });

  const responseText = completion.choices[0]?.message?.content || '';
  
  if (!responseText) {
    throw new ExternalApiError('Empty response from OpenAI');
  }

  // 解析优化后的技能定义
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new ExternalApiError('Invalid JSON response from OpenAI');
  }

  let optimizedData;
  try {
    optimizedData = JSON.parse(jsonMatch[0]);
  } catch (error) {
    throw new ExternalApiError('Failed to parse JSON response from OpenAI', { error });
  }
  
  // 获取优化后的 API 序列
  const optimizedApiSequence = optimizedData.apiSequence || definition.apiSequence;
  
  // 查询所有相关的 ApiDoc 信息
  const apiDocIds = optimizedApiSequence.map((api: ApiCall) => api.apiDocId);
  const apiDocs = await prisma.apiDoc.findMany({
    where: {
      id: { in: apiDocIds },
      domain: skill.domain,
    },
    select: {
      id: true,
      url: true,
      method: true,
    },
  });

  // 创建 ApiDoc ID 到 { url, method } 的映射
  const apiDocMap = new Map<string, ApiDocInfo>();
  for (const apiDoc of apiDocs) {
    apiDocMap.set(apiDoc.id, {
      url: apiDoc.url,
      method: apiDoc.method,
    });
  }

  // 验证所有 ApiDoc 都已找到
  for (const apiCall of optimizedApiSequence) {
    if (!apiDocMap.has(apiCall.apiDocId)) {
      throw new NotFoundError('ApiDoc', apiCall.apiDocId);
    }
  }
  
  // 生成新的代码
  const newCode = generateSkillCode(
    optimizedData.name || skill.name,
    optimizedData.description || skill.description,
    optimizedApiSequence,
    apiDocMap
  );

  const newDefinition = createSkillDefinition(
    optimizedApiSequence,
    newCode
  );

  // 创建新版本技能
  const newVersion = skill.version + 1;
  
  await prisma.skill.create({
    data: {
      name: optimizedData.name || skill.name,
      description: optimizedData.description || skill.description,
      domain: skill.domain,
      version: newVersion,
      definition: newDefinition as unknown as Prisma.JsonValue,
    },
  });

  console.log(`Skill ${skillId} optimized, new version: ${newVersion}`);
}

/**
 * 生成优化 Prompt
 */
function generateOptimizationPrompt(
  name: string,
  description: string,
  apiSequence: ApiCall[],
  logs: Array<{ status: string; timestamp: Date }>,
  failedSteps: ExecutionStep[],
  successRate: number,
  failureRate: number
): string {
  return `请分析以下技能的执行日志，识别问题并优化技能编排。

技能信息：
- 名称: ${name}
- 描述: ${description}

当前 API 序列：
${apiSequence.map((api, index) => `
${index + 1}. ${api.apiDocId} (order: ${api.order})
`).join('')}

执行统计：
- 成功率: ${(successRate * 100).toFixed(1)}%
- 失败率: ${(failureRate * 100).toFixed(1)}%
- 总执行次数: ${logs.length}

失败的步骤：
${failedSteps.slice(0, 10).map(step => `
- ${step.apiCallId}: ${step.error || 'Unknown error'}
`).join('')}

请分析问题并提出优化方案：
1. 识别失败的常见原因
2. 优化 API 执行顺序
3. 改进参数映射规则
4. 添加错误处理或重试机制

请以 JSON 格式返回优化后的技能定义，格式如下：
{
  "name": "优化后的技能名称",
  "description": "优化后的技能描述",
  "apiSequence": [
    {
      "apiDocId": "API ID",
      "order": 1,
      "inputMapping": {},
      "outputMapping": {},
      "condition": "可选的条件"
    }
  ]
}

请直接返回 JSON，不要包含额外的说明文字。`;
}

/**
 * 批量优化技能
 */
export async function optimizeSkills(limit = 10): Promise<void> {
  // 获取需要优化的技能（失败率较高的）
  const skills = await prisma.skill.findMany({
    take: limit,
    orderBy: {
      updatedAt: 'desc',
    },
  });

  console.log(`Found ${skills.length} skills to optimize`);

  for (const skill of skills) {
    try {
      await optimizeSkill(skill.id);
    } catch (error) {
      console.error(`Failed to optimize skill ${skill.id}:`, error);
    }
  }

  console.log(`Completed optimizing ${skills.length} skills`);
}
