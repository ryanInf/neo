import { createHash } from 'crypto';

/**
 * 生成请求的唯一标识符（用于去重）
 */
export function generateRequestHash(
  url: string,
  method: string,
  requestBody?: any
): string {
  const bodyString = requestBody ? JSON.stringify(requestBody) : '';
  const content = `${method}:${url}:${bodyString}`;
  return createHash('sha256').update(content).digest('hex');
}

