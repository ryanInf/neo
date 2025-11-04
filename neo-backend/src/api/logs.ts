import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { validateArray } from '../utils/validation';
import type { ExecutionLog } from '../models/skill-types';

/**
 * 接收执行日志
 * POST /api/logs
 */
export async function receiveLogs(req: Request, res: Response): Promise<void> {
  try {
    const { logs } = req.body as { logs: ExecutionLog[] };
    
    // 输入验证
    validateArray(logs, 'logs');
    
    const results = [];
    
    for (const log of logs) {
      try {
        const executionLog = await prisma.executionLog.create({
          data: {
            skillId: log.skillId,
            skillVersion: log.skillVersion,
            domain: log.domain,
            timestamp: new Date(log.timestamp),
            status: log.status,
            steps: log.steps as unknown as Prisma.JsonValue,
            error: log.error,
          },
        });
        
        results.push({ id: executionLog.id, success: true });
      } catch (error) {
        console.error('Error saving log:', error);
        results.push({ error: 'Failed to save log' });
      }
    }
    
    res.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    throw error;
  }
}

