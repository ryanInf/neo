import OpenAI from 'openai';
import { config } from '../utils/config';
import { ExternalApiError } from '../utils/errors';

// SiliconFlow API 配置
const openai = new OpenAI({
  apiKey: config.siliconFlowApiKey,
  baseURL: config.siliconFlowBaseUrl,
});

/**
 * 生成 API 文档的 Prompt
 */
function generateApiDocPrompt(apiData: {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  responseHeaders: Record<string, string>;
  responseBody?: any;
  statusCode?: number;
}): string {
  return `请分析以下 API 调用数据，生成一份详细的 Markdown 格式文档。

API 信息：
- URL: ${apiData.url}
- 方法: ${apiData.method}
- 状态码: ${apiData.statusCode || 'N/A'}

请求头：
\`\`\`json
${JSON.stringify(apiData.requestHeaders, null, 2)}
\`\`\`

请求体：
\`\`\`json
${apiData.requestBody ? JSON.stringify(apiData.requestBody, null, 2) : '无'}
\`\`\`

响应头：
\`\`\`json
${JSON.stringify(apiData.responseHeaders, null, 2)}
\`\`\`

响应体：
\`\`\`json
${apiData.responseBody ? JSON.stringify(apiData.responseBody, null, 2) : '无'}
\`\`\`

请深入学习这个 API，生成包含以下内容的 Markdown 文档：

1. **API 用途和功能描述**
   - 业务语义：这个 API 在业务场景中的实际用途
   - 功能说明：具体完成什么功能

2. **请求参数说明**
   - URL 参数、请求头、请求体的详细说明
   - 每个参数的业务含义、数据类型、是否必填
   - 参数的默认值、验证规则、取值范围

3. **响应格式说明**
   - 响应数据的结构和字段含义
   - 每个字段的业务含义和数据类型
   - 可能的响应状态

4. **状态码说明**
   - 各种状态码的含义和处理方式

5. **使用模式和学习内容**
   - **常见使用模式**：这个 API 通常如何被使用
   - **最佳实践**：推荐的使用方式和技巧
   - **常见错误**：使用时容易犯的错误和如何避免
   - **组合使用**：通常与哪些其他 API 一起使用，形成工作流

6. **使用示例**
   - 基础使用示例
   - 复杂场景示例
   - 与其他 API 组合使用的示例

请直接返回 Markdown 文档内容，不要包含额外的说明文字。`;
}

/**
 * 调用 OpenAI API 生成文档
 */
export async function generateApiDoc(apiData: {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  responseHeaders: Record<string, string>;
  responseBody?: any;
  statusCode?: number;
}): Promise<string> {
  try {
    const prompt = generateApiDocPrompt(apiData);
    
    const completion = await openai.chat.completions.create({
      model: 'deepseek-ai/DeepSeek-V3.2-Exp',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的 API 文档编写专家，擅长分析 API 调用数据并生成清晰、准确的文档。',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });
    
    const docMarkdown = completion.choices[0]?.message?.content || '';
    
    if (!docMarkdown) {
      throw new ExternalApiError('Empty response from OpenAI');
    }
    
    return docMarkdown;
  } catch (error) {
    if (error instanceof ExternalApiError) {
      throw error;
    }
    console.error('Error generating API doc:', error);
    throw new ExternalApiError('Failed to generate API doc', { originalError: error });
  }
}

/**
 * 重试机制包装函数
 */
export async function generateApiDocWithRetry(
  apiData: {
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody?: any;
    responseHeaders: Record<string, string>;
    responseBody?: any;
    statusCode?: number;
  },
  maxRetries = 3
): Promise<string> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await generateApiDoc(apiData);
    } catch (error) {
      lastError = error as Error;
      console.warn(`Attempt ${i + 1} failed, retrying...`);
      
      // 指数退避
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
    }
  }
  
  throw lastError || new ExternalApiError('Failed to generate API doc after retries');
}

