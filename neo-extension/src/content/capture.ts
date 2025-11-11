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
  responseBody?: any;
  statusCode?: number;
  timestamp: number;
  duration?: number;
  source?: string;
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
  console.log('[Neo] 📤 Reporting to backend:', data.length, 'captures');
  
  try {
    const { getBackendUrl } = await import('../utils/config');
    const backendUrl = await getBackendUrl();
    
    console.log('[Neo] Backend URL:', backendUrl);
    
    if (!backendUrl) {
      throw new Error('Backend URL is not configured');
    }

    const url = `${backendUrl}/api/capture`;
    console.log('[Neo] Request URL:', url);
    console.log('[Neo] Request payload:', {
      captureCount: data.length,
      sampleUrl: data[0]?.url,
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ captures: data }),
    });
    
    console.log('[Neo] 📥 Report response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      console.error('[Neo] ❌ Failed to report API captures:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    } else {
      const responseData = await response.json().catch(() => null);
      console.log('[Neo] ✅ Successfully reported', data.length, 'captures');
      if (responseData) {
        console.log('[Neo] Response data:', responseData);
      }
    }
  } catch (error) {
    console.error('[Neo] ❌ Error reporting API captures:', error);
    console.error('[Neo] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      captureCount: data.length,
    });
    
    // 检查是否是扩展上下文失效错误
    if (error instanceof Error && error.message.includes('Extension context invalidated')) {
      console.warn('[Neo] ⚠️  Extension context invalidated, skipping retry');
      return;
    }
    
    // 重新加入队列，稍后重试
    data.forEach(item => addToQueue(item));
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
  try {
    if (!data.url) {
      console.warn('[Neo] ⚠️  captureApiCall called without URL:', data);
      return;
    }

    const resolvedUrl = resolveCaptureUrl(data.url);
    if (!resolvedUrl) {
      console.warn('[Neo] ⚠️  captureApiCall received unresolved URL, skipping:', {
        url: data.url,
        context: window.location.href,
      });
      return;
    }

    console.log('[Neo] 📝 captureApiCall called:', {
      rawUrl: data.url,
      resolvedUrl,
      method: data.method || 'GET',
    });
    
    const domain = new URL(resolvedUrl).hostname;
    
    const captureTimestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();

    const captureData: ApiCaptureData = {
      url: sanitizeUrl(resolvedUrl),
      method: data.method || 'GET',
      domain,
      requestHeaders: sanitizeHeaders(data.requestHeaders || {}),
      requestBody: data.requestBody ? sanitizeBody(data.requestBody) : undefined,
      responseBody: data.responseBody ? sanitizeBody(data.responseBody) : undefined,
      statusCode: data.statusCode,
      timestamp: captureTimestamp,
      duration: data.duration,
      source: data.source,
    };

    console.log('[Neo] ➕ Adding to queue:', {
      url: captureData.url,
      method: captureData.method,
      statusCode: captureData.statusCode,
      source: captureData.source,
      queueLength: captureQueue.length,
    });
    addToQueue(captureData);
    
    // 启动定时器（如果还没启动）
    startBatchTimer();
  } catch (error) {
    console.error('[Neo] ❌ Error in captureApiCall:', error);
    try {
      console.error('[Neo] Error details:', JSON.stringify({
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        data,
        location: window.location.href,
      }, null, 2));
    } catch {
      console.error('[Neo] Error details: [unserializable data]', data);
    }
  }
}

function resolveCaptureUrl(url: string): string {
  if (!url) {
    return '';
  }

  try {
    return new URL(url).toString();
  } catch {
    try {
      return new URL(url, window.location.href).toString();
    } catch (error) {
      console.warn('[Neo] ⚠️  Failed to resolve capture URL:', url, error);
      return '';
    }
  }
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

