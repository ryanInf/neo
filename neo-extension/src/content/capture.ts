import { sanitizeHeaders, sanitizeBody, sanitizeUrl } from '../utils/sanitize';

/**
 * API 调用数据接口
 */
export interface ApiCaptureData {
  url: string;
  method: string;
  domain: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  responseHeaders: Record<string, string>;
  responseBody?: any;
  statusCode?: number;
  timestamp: number;
  duration?: number;
}

/**
 * 捕获的 API 调用队列
 */
const captureQueue: ApiCaptureData[] = [];

/**
 * 批量上报间隔（毫秒）
 */
const BATCH_INTERVAL = 5000; // 5秒

/**
 * 最大队列长度
 */
const MAX_QUEUE_SIZE = 100;

/**
 * 添加 API 调用数据到队列
 */
function addToQueue(data: ApiCaptureData): void {
  captureQueue.push(data);
  
  // 如果队列超过最大长度，移除最旧的数据
  if (captureQueue.length > MAX_QUEUE_SIZE) {
    captureQueue.shift();
  }
}

/**
 * 上报数据到后端
 */
async function reportToBackend(data: ApiCaptureData[]): Promise<void> {
  const { getBackendUrl } = await import('../utils/config');
  const backendUrl = await getBackendUrl();
  
  try {
    const response = await fetch(`${backendUrl}/api/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ captures: data }),
    });
    
    if (!response.ok) {
      console.error('[Neo] Failed to report API captures:', response.statusText);
    }
  } catch (error) {
    console.error('[Neo] Error reporting API captures:', error);
  }
}

/**
 * 批量上报定时器
 */
let batchTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 启动批量上报定时器
 */
function startBatchTimer(): void {
  if (batchTimer) {
    return;
  }
  
  batchTimer = setInterval(() => {
    if (captureQueue.length > 0) {
      const dataToSend = [...captureQueue];
      captureQueue.length = 0;
      reportToBackend(dataToSend);
    }
  }, BATCH_INTERVAL);
}

/**
 * 捕获 API 调用
 */
export function captureApiCall(data: Partial<ApiCaptureData>): void {
  const domain = new URL(data.url || '').hostname;
  
  const captureData: ApiCaptureData = {
    url: sanitizeUrl(data.url || ''),
    method: data.method || 'GET',
    domain,
    requestHeaders: sanitizeHeaders(data.requestHeaders || {}),
    requestBody: data.requestBody ? sanitizeBody(data.requestBody) : undefined,
    responseHeaders: sanitizeHeaders(data.responseHeaders || {}),
    responseBody: data.responseBody ? sanitizeBody(data.responseBody) : undefined,
    statusCode: data.statusCode,
    timestamp: Date.now(),
    duration: data.duration,
  };
  
  addToQueue(captureData);
  
  // 启动定时器（如果还没启动）
  startBatchTimer();
}

/**
 * 立即上报所有待上报的数据
 */
export async function flushQueue(): Promise<void> {
  if (captureQueue.length > 0) {
    const dataToSend = [...captureQueue];
    captureQueue.length = 0;
    await reportToBackend(dataToSend);
  }
}

