// 技能定义相关的类型定义

/**
 * 参数映射规则
 * 支持不同类型的参数映射：query（查询参数）、path（路径参数）、header（请求头）、body（请求体）
 */
export interface InputMapping {
  query?: Record<string, string>;   // 查询参数映射
  path?: Record<string, string>;     // 路径参数映射
  header?: Record<string, string>;  // 请求头映射
  body?: Record<string, string>;    // 请求体映射
}

export interface ApiCall {
  apiDocId: string;
  order: number;
  inputMapping?: InputMapping | Record<string, string>;  // 参数映射规则（支持新旧两种格式）
  outputMapping?: Record<string, string>; // 输出映射规则
  condition?: string;                      // 执行条件（可选）
  loopType?: 'for' | 'while' | 'forEach'; // 循环类型（用于迭代式编排）
  loopCondition?: string;                 // 循环条件表达式
  maxIterations?: number;                  // 最大迭代次数（防止无限循环）
}

export interface SkillDefinition {
  format: 'javascript';
  content: string;       // JavaScript 代码
  apiSequence: ApiCall[]; // API 调用序列（用于展示）
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  domain: string;
  version: number;
  definition: SkillDefinition;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExecutionStep {
  apiCallId: string;
  order: number;
  status: 'success' | 'failed' | 'skipped';
  requestData?: any;
  responseData?: any;
  error?: string;
  duration: number;
  retryCount?: number; // 重试次数
  retryAttempts?: Array<{ attempt: number; error: string; duration: number }>; // 重试记录
}

export interface ExecutionLog {
  skillId: string;
  skillVersion: number;
  domain: string;
  timestamp: Date;
  status: 'success' | 'failed' | 'partial';
  steps: ExecutionStep[];
  error?: string;
}

