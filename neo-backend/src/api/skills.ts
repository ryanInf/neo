import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { orchestrateSkill } from '../ai/skill-orchestration';
import { generateSkillCode, createSkillDefinition, type ApiDocInfo } from '../services/skill-code-generator';
import { ValidationError, NotFoundError } from '../utils/errors';
import { validateRequired, validateArray } from '../utils/validation';

/**
 * 创建技能
 * POST /api/skills
 */
export async function createSkill(req: Request, res: Response): Promise<void> {
  try {
    const { domain, apiDocIds, name, description } = req.body;

    // 输入验证
    validateRequired(domain, 'domain');
    validateArray(apiDocIds, 'apiDocIds');

    // 使用 AI 编排技能
    const orchestration = await orchestrateSkill(domain, apiDocIds);

    // 使用提供的名称和描述，或使用 AI 生成的
    const finalName = name || orchestration.name;
    const finalDescription = description || orchestration.description;

    // 查询所有相关的 ApiDoc 信息
    const apiDocs = await prisma.apiDoc.findMany({
      where: {
        id: { in: orchestration.apiSequence.map(api => api.apiDocId) },
        domain,
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
    for (const apiCall of orchestration.apiSequence) {
      if (!apiDocMap.has(apiCall.apiDocId)) {
        throw new NotFoundError('ApiDoc', apiCall.apiDocId);
      }
    }

    // 生成 JavaScript 代码
    const code = generateSkillCode(finalName, finalDescription, orchestration.apiSequence, apiDocMap);

    // 创建技能定义
    const definition = createSkillDefinition(orchestration.apiSequence, code);

    // 保存到数据库
    const skill = await prisma.skill.create({
      data: {
        name: finalName,
        description: finalDescription,
        domain,
        version: 1,
        definition: definition as unknown as Prisma.JsonValue,
      },
    });

    res.json({
      success: true,
      data: skill,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 查询技能列表
 * GET /api/skills
 */
export async function getSkills(req: Request, res: Response): Promise<void> {
  try {
    const { domain, limit = 50, offset = 0 } = req.query;

    const where: Record<string, any> = {};
    if (domain) {
      where.domain = domain as string;
    }

    const limitNum = Number(limit);
    const offsetNum = Number(offset);
    
    // 验证分页参数
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new ValidationError('limit must be between 1 and 100');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new ValidationError('offset must be a non-negative number');
    }

    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where,
        take: limitNum,
        skip: offsetNum,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      prisma.skill.count({ where }),
    ]);

    res.json({
      success: true,
      data: skills,
      total,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 获取单个技能详情
 * GET /api/skills/:id
 */
export async function getSkillById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    validateRequired(id, 'id');

    const skill = await prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      throw new NotFoundError('Skill', id);
    }

    res.json({
      success: true,
      data: skill,
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 下载技能定义（JavaScript 格式）
 * GET /api/skills/:id/download
 */
export async function downloadSkill(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    validateRequired(id, 'id');

    const skill = await prisma.skill.findUnique({
      where: { id },
    });

    if (!skill) {
      throw new NotFoundError('Skill', id);
    }

    const definition = skill.definition as { content?: string };
    const code = definition.content || '';

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Content-Disposition', `attachment; filename="${skill.name}-v${skill.version}.js"`);
    res.send(code);
  } catch (error) {
    throw error;
  }
}

/**
 * 批量检查技能更新
 * POST /api/skills/check-updates
 * Body: { skillIds: string[] } - 技能ID数组，每个元素格式为 { id: string, version: number }
 */
export async function checkSkillUpdates(req: Request, res: Response): Promise<void> {
  try {
    const { skillIds } = req.body;

    if (!skillIds || !Array.isArray(skillIds)) {
      res.status(400).json({ error: 'Invalid request body: skillIds must be an array' });
      return;
    }

    // 提取所有技能ID
    const ids = skillIds.map((item: any) => 
      typeof item === 'string' ? item : item.id
    );

    if (ids.length === 0) {
      res.json({
        success: true,
        data: [],
      });
      return;
    }

    // 查询所有技能的最新版本
    const skills = await prisma.skill.findMany({
      where: {
        id: { in: ids },
      },
      select: {
        id: true,
        version: true,
        name: true,
      },
    });

    // 创建技能ID到版本的映射
    const skillMap = new Map(skills.map(s => [s.id, s]));

    // 构建更新列表
    const updates: Array<{
      id: string;
      hasUpdate: boolean;
      currentVersion?: number;
      latestVersion?: number;
      name?: string;
    }> = [];

    for (const item of skillIds) {
      const skillId = typeof item === 'string' ? item : item.id;
      const currentVersion = typeof item === 'object' && item.version 
        ? item.version 
        : undefined;

      const skill = skillMap.get(skillId);
      
      if (skill) {
        const hasUpdate = currentVersion !== undefined && skill.version > currentVersion;
        updates.push({
          id: skillId,
          hasUpdate,
          currentVersion,
          latestVersion: skill.version,
          name: skill.name,
        });
      } else {
        // 技能不存在，标记为需要更新
        updates.push({
          id: skillId,
          hasUpdate: false,
          currentVersion,
        });
      }
    }

    res.json({
      success: true,
      data: updates,
    });
  } catch (error) {
    console.error('Error checking skill updates:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

