/**
 * 技能执行引擎
 * 在沙箱环境中执行技能代码
 * 
 * 注意：浏览器环境中无法使用 VM2，这里使用安全的执行方式
 */

import { buildUrl } from '../utils/url-builder';

export interface SkillContext {
  api: {
    call(options: ApiCallOptions): Promise<any>;
  };
  state: {
    get(key: string): any;
    set(key: string, value: any): void;
  };
  storage: {
    get(key: string): Promise<any>;
    set(key: string, value: any): Promise<void>;
  };
}

export interface ApiCallOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | string[] | number[]>;
  path?: Record<string, string | number>;
  body?: any;
}

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  steps?: ExecutionStep[];
}

export interface ExecutionStep {
  apiCallId: string;
  order: number;
  status: 'success' | 'failed' | 'skipped';
  requestData?: any;
  responseData?: any;
  error?: string;
  duration: number;
}

/**
 * 创建技能执行上下文
 */
function createSkillContext(
  domain: string,
  onApiCall: (options: ApiCallOptions) => Promise<any>,
  onStepComplete: (step: ExecutionStep) => void
): SkillContext {
  const state = new Map<string, any>();
  
  return {
    api: {
      async call(options: ApiCallOptions): Promise<any> {
        const startTime = Date.now();
        const step: ExecutionStep = {
          apiCallId: options.url,
          order: 0, // 将在执行时更新
          status: 'success',
          requestData: options,
          duration: 0,
        };
        
        try {
          const result = await onApiCall(options);
          step.duration = Date.now() - startTime;
          step.responseData = result;
          step.status = 'success';
          onStepComplete(step);
          return result;
        } catch (error) {
          step.duration = Date.now() - startTime;
          step.error = error instanceof Error ? error.message : String(error);
          step.status = 'failed';
          onStepComplete(step);
          throw error;
        }
      },
    },
    state: {
      get(key: string): any {
        return state.get(key);
      },
      set(key: string, value: any): void {
        state.set(key, value);
      },
    },
    storage: {
      async get(key: string): Promise<any> {
        const result = await chrome.storage.local.get([key]);
        return result[key];
      },
      async set(key: string, value: any): Promise<void> {
        await chrome.storage.local.set({ [key]: value });
      },
    },
  };
}

/**
 * 执行技能代码
 */
export async function executeSkill(
  skillCode: string,
  domain: string,
  onApiCall: (options: ApiCallOptions) => Promise<any>,
  onStepComplete?: (step: ExecutionStep) => void
): Promise<ExecutionResult> {
  const steps: ExecutionStep[] = [];
  let stepOrder = 0;
  
  const onStep = (step: ExecutionStep) => {
    step.order = stepOrder++;
    steps.push(step);
    if (onStepComplete) {
      onStepComplete(step);
    }
  };
  
  const context = createSkillContext(domain, onApiCall, onStep);
  
  try {
    // 在浏览器环境中，使用 Function 构造函数创建执行函数
    // 这是一个简化的方案，实际生产环境应该使用更安全的沙箱方案
    const executeFunction = new Function(
      'context',
      `
      ${skillCode}
      return execute(context);
    `
    );
    
    // 设置超时保护
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Execution timeout')), 30000);
    });
    
    // 调用 execute 函数
    const result = await Promise.race([
      executeFunction(context),
      timeoutPromise,
    ]) as any;
    
    const success = steps.every(s => s.status === 'success');
    
    return {
      success,
      result,
      steps,
    };
  } catch (error) {
    console.error('[Neo] Error executing skill:', error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      steps,
    };
  }
}

/**
 * 在页面上下文中执行 API 调用
 * 使用页面的认证信息（cookie、localStorage 等）
 */
export async function executeApiCallInPage(
  options: ApiCallOptions
): Promise<any> {
  // 在 content script 中直接执行，这样可以使用页面的认证信息
  try {
    // 构建完整的 URL
    const fullUrl = buildUrl(options.url, options.path, options.query);
    
    // 准备请求头
    const headers: Record<string, string> = {
      ...options.headers,
    };
    
    // 如果 body 存在且未设置 Content-Type，默认设置为 application/json
    if (options.body && !headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
    
    // 执行请求
    const response = await fetch(fullUrl, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    
    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`API call failed: ${response.status} ${response.statusText}. ${errorText}`);
    }
    
    // 根据响应类型解析响应体
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    throw error;
  }
}

