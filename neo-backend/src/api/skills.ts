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
 * 
 * Body 参数：
 * - domain: 域名（必需）
 * - apiDocIds: API文档ID数组（AI编排时使用）
 * - name: 技能名称（可选，AI编排时会自动生成）
 * - description: 技能描述（可选，AI编排时会自动生成）
 * - definition: 技能定义（手工创建时使用，包含 apiSequence 和 content）
 */
export async function createSkill(req: Request, res: Response): Promise<void> {
  try {
    const { domain, apiDocIds, name, description, definition } = req.body;

    // 输入验证
    validateRequired(domain, 'domain');

    // 如果提供了 definition，则使用手工创建模式
    if (definition) {
      // 手工创建模式
      validateRequired(name, 'name');
      validateRequired(description, 'description');
      
      // 验证 definition 格式
      if (!definition.format || definition.format !== 'javascript') {
        throw new ValidationError('definition.format must be "javascript"');
      }
      if (!definition.content || typeof definition.content !== 'string') {
        throw new ValidationError('definition.content must be a string');
      }
      if (!definition.apiSequence || !Array.isArray(definition.apiSequence)) {
        throw new ValidationError('definition.apiSequence must be an array');
      }

      // 验证 apiSequence 中的 apiDocId 是否存在（仅验证非占位符的ID）
      const apiDocIdsInSequence = definition.apiSequence
        .map((api: any) => api.apiDocId)
        .filter((id: string) => id && !id.startsWith('manual-') && !id.startsWith('placeholder-'));
      
      if (apiDocIdsInSequence.length > 0) {
        const apiDocs = await prisma.apiDoc.findMany({
          where: {
            id: { in: apiDocIdsInSequence },
            domain,
          },
          select: {
            id: true,
          },
        });
        
        const existingIds = new Set(apiDocs.map(doc => doc.id));
        for (const apiCall of definition.apiSequence) {
          const apiDocId = apiCall.apiDocId;
          if (apiDocId && 
              !apiDocId.startsWith('manual-') && 
              !apiDocId.startsWith('placeholder-') &&
              !existingIds.has(apiDocId)) {
            throw new NotFoundError('ApiDoc', apiDocId);
          }
        }
      }

      // 直接保存技能定义
      const skill = await prisma.skill.create({
        data: {
          name,
          description,
          domain,
          version: 1,
          definition: definition as any,
        },
      });

      res.json({
        success: true,
        data: skill,
      });
      return;
    }

    // AI 编排模式（原有逻辑）
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
    const skillDefinition = createSkillDefinition(orchestration.apiSequence, code);

    // 保存到数据库
    const skill = await prisma.skill.create({
      data: {
        name: finalName,
        description: finalDescription,
        domain,
        version: 1,
        definition: skillDefinition as any,
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
/**
 * 提取主域名（去除 www 等子域名前缀）
 */
function getMainDomain(hostname: string): string {
  // 移除 www. 前缀
  let domain = hostname.replace(/^www\./, '');
  
  // 提取主域名（例如：www.xiaohongshu.com -> xiaohongshu.com）
  const parts = domain.split('.');
  if (parts.length >= 2) {
    // 取最后两部分作为主域名（例如：xiaohongshu.com）
    domain = parts.slice(-2).join('.');
  }
  
  return domain;
}

export async function getSkills(req: Request, res: Response): Promise<void> {
  try {
    const { domain, limit = 50, offset = 0 } = req.query;

    const where: Record<string, any> = {};
    if (domain) {
      const mainDomain = getMainDomain(domain as string);
      // 支持精确匹配或主域名匹配
      where.OR = [
        { domain: domain as string },
        { domain: mainDomain }
      ];
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

