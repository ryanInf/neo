import { Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { generateRequestHash } from '../utils/hash';
import { ValidationError, DatabaseError } from '../utils/errors';
import { validateArray, validateRequired, validateUrl, validateHttpMethod } from '../utils/validation';
import { apiAnalysisQueue } from '../queues';
import type { ApiCaptureRequest } from '../models/types';

/**
 * 接收插件上报的 API 调用数据
 * POST /api/capture
 */
export async function captureApi(req: Request, res: Response): Promise<void> {
  try {
    const { captures } = req.body as ApiCaptureRequest;
    
    // 输入验证
    validateArray(captures, 'captures');
    
    const results = [];
    
    for (const capture of captures) {
      try {
        // 验证必填字段
        validateRequired(capture.url, 'url');
        validateRequired(capture.method, 'method');
        validateRequired(capture.domain, 'domain');
        validateUrl(capture.url, 'url');
        validateHttpMethod(capture.method, 'method');
        
        // 生成请求哈希用于去重
        const requestHash = generateRequestHash(
          capture.url,
          capture.method,
          capture.requestBody
        );
        
        // 检查是否已存在相同的 API 调用
        const existing = await prisma.apiDoc.findFirst({
          where: {
            url: capture.url,
            method: capture.method,
            requestHash,
          },
        });
        
        if (existing) {
          // 更新现有记录
          await prisma.apiDoc.update({
            where: { id: existing.id },
            data: {
              requestHeaders: capture.requestHeaders,
              requestBody: capture.requestBody,
              responseHeaders: capture.responseHeaders,
              responseBody: capture.responseBody,
              statusCode: capture.statusCode,
              updatedAt: new Date(),
            },
          });
          
          // 如果还没有文档，自动触发文档生成
          if (!existing.docMarkdown) {
            console.log(`[Capture] Queueing analysis job for existing API doc without docMarkdown: ${existing.id}`);
            apiAnalysisQueue.add('analyze-single', { apiDocId: existing.id })
              .then(job => {
                console.log(`[Capture] Analysis job queued successfully: ${job.id} for doc ${existing.id}`);
              })
              .catch(error => {
                console.error(`[Capture] Failed to queue analysis job for doc ${existing.id}:`, error);
              });
          } else {
            console.log(`[Capture] API doc ${existing.id} already has docMarkdown, skipping`);
          }
          
          results.push({ id: existing.id, action: 'updated' });
        } else {
          // 创建新记录
          const apiDoc = await prisma.apiDoc.create({
            data: {
              url: capture.url,
              method: capture.method,
              domain: capture.domain,
              requestHeaders: capture.requestHeaders || {},
              requestBody: capture.requestBody,
              responseHeaders: capture.responseHeaders || {},
              responseBody: capture.responseBody,
              statusCode: capture.statusCode,
              requestHash,
            },
          });
          
          // 自动触发文档生成
          console.log(`[Capture] Queueing analysis job for new API doc: ${apiDoc.id}`);
          apiAnalysisQueue.add('analyze-single', { apiDocId: apiDoc.id })
            .then(job => {
              console.log(`[Capture] Analysis job queued successfully: ${job.id} for doc ${apiDoc.id}`);
            })
            .catch(error => {
              console.error(`[Capture] Failed to queue analysis job for doc ${apiDoc.id}:`, error);
            });
          
          results.push({ id: apiDoc.id, action: 'created' });
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          results.push({ error: error.message });
        } else {
          console.error('Error processing capture:', error);
          results.push({ error: 'Failed to process capture' });
        }
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

