/**
 * Schema 生成工具
 * 从 JSON 数据中推断 schema 结构
 */

/**
 * 解析 URL，提取路径参数和查询参数
 */
function parseUrl(url: string): {
  baseUrl: string;
  pathParams: Array<{ name: string; value: string; type: string }>;
  queryParams: Record<string, { value: string; type: string }>;
} {
  try {
    // 分离 URL 和查询字符串
    const [pathPart, queryPart] = url.split('?');
    
    // 解析查询参数
    const queryParams: Record<string, { value: string; type: string }> = {};
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      for (const [key, value] of params.entries()) {
        // 推断参数类型
        let type = 'string';
        if (/^-?\d+$/.test(value)) {
          type = 'integer';
        } else if (/^-?\d*\.\d+$/.test(value)) {
          type = 'number';
        } else if (value === 'true' || value === 'false') {
          type = 'boolean';
        }
        
        queryParams[key] = { value, type };
      }
    }
    
    // 解析路径参数
    // 识别路径中的动态部分（数字、UUID、或其他看起来像参数的值）
    const pathParts = pathPart.split('/');
    const pathParams: Array<{ name: string; value: string; type: string }> = [];
    
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const prevPart = i > 0 ? pathParts[i - 1] : '';
      
      // 跳过空字符串和协议/域名部分
      if (!part || part.includes(':') || part.includes('.')) {
        continue;
      }
      
      // 尝试从上一段路径推断参数名（如 /users/123 -> userId）
      let paramName = '';
      if (prevPart) {
        // 将复数形式转为单数（如 users -> user）
        const singular = prevPart.replace(/s$/, '');
        paramName = `${singular}Id`;
      }
      
      // 识别 UUID 格式
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) {
        pathParams.push({
          name: paramName || `param${pathParams.length + 1}`,
          value: part,
          type: 'string (uuid)',
        });
        pathParts[i] = `:${pathParams[pathParams.length - 1].name}`;
      }
      // 识别纯数字（可能是 ID）
      else if (/^\d+$/.test(part)) {
        pathParams.push({
          name: paramName || `id${pathParams.length + 1}`,
          value: part,
          type: 'integer',
        });
        pathParts[i] = `:${pathParams[pathParams.length - 1].name}`;
      }
      // 识别短字符串（可能是 slug 或标识符）
      else if (part.length > 0 && part.length < 50 && /^[a-zA-Z0-9_-]+$/.test(part)) {
        // 如果看起来不像资源名称（不以常见资源名结尾），可能是参数
        const isResourceName = /^(users?|posts?|items?|products?|orders?|comments?|articles?|pages?|files?|images?|videos?|tags?|categories?|groups?|teams?|projects?|tasks?|issues?|repos?|branches?|commits?)$/i.test(part);
        if (!isResourceName && part.length < 20) {
          pathParams.push({
            name: paramName || `param${pathParams.length + 1}`,
            value: part,
            type: 'string',
          });
          pathParts[i] = `:${pathParams[pathParams.length - 1].name}`;
        }
      }
    }
    
    // 重建基础 URL（将参数部分替换为占位符）
    const baseUrl = pathParts.join('/');
    
    return {
      baseUrl,
      pathParams,
      queryParams,
    };
  } catch (error) {
    // 如果解析失败，返回原始 URL
    return {
      baseUrl: url,
      pathParams: [],
      queryParams: {},
    };
  }
}

/**
 * 推断 JSON Schema 类型
 */
function inferSchemaType(value: any): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (typeof value === 'object') {
    return 'object';
  }
  return typeof value;
}

/**
 * 从值推断详细的类型信息
 */
function inferDetailedType(value: any): {
  type: string;
  format?: string;
  example?: any;
} {
  const type = inferSchemaType(value);
  
  if (type === 'string') {
    // 尝试识别特殊格式
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return { type: 'string', format: 'date', example: value };
      }
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        return { type: 'string', format: 'date-time', example: value };
      }
      if (/^https?:\/\//.test(value)) {
        return { type: 'string', format: 'uri', example: value };
      }
      if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(value)) {
        return { type: 'string', format: 'email', example: value };
      }
    }
    return { type: 'string', example: value };
  }
  
  if (type === 'number') {
    return { type: Number.isInteger(value) ? 'integer' : 'number', example: value };
  }
  
  if (type === 'boolean') {
    return { type: 'boolean', example: value };
  }
  
  if (type === 'array') {
    const itemType = value.length > 0 ? inferDetailedType(value[0]) : { type: 'unknown' };
    return { type: 'array', example: value };
  }
  
  if (type === 'object') {
    return { type: 'object', example: value };
  }
  
  return { type: 'unknown', example: value };
}

/**
 * 从对象生成 Schema
 */
function generateObjectSchema(obj: any, depth = 0): Record<string, any> {
  if (depth > 5) {
    // 防止无限递归
    return { type: 'object', description: '...' };
  }
  
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return inferDetailedType(obj);
  }
  
  const schema: Record<string, any> = {
    type: 'object',
    properties: {},
    required: [],
  };
  
  for (const [key, value] of Object.entries(obj)) {
    const valueType = inferSchemaType(value);
    
    if (valueType === 'object' && !Array.isArray(value)) {
      schema.properties[key] = generateObjectSchema(value, depth + 1);
    } else if (valueType === 'array' && Array.isArray(value) && value.length > 0) {
      const itemSchema = generateObjectSchema(value[0], depth + 1);
      schema.properties[key] = {
        type: 'array',
        items: itemSchema,
      };
    } else {
      schema.properties[key] = inferDetailedType(value);
    }
    
    // 如果值不为 null/undefined，认为是必填
    if (value !== null && value !== undefined) {
      schema.required.push(key);
    }
  }
  
  return schema;
}

/**
 * 格式化示例值为字符串
 */
function formatExampleValue(value: any, maxLength = 50): string {
  if (value === null || value === undefined) {
    return '-';
  }
  if (typeof value === 'string') {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }
  if (typeof value === 'object') {
    const str = JSON.stringify(value);
    return str.length > maxLength ? `${str.slice(0, maxLength)}...` : str;
  }
  return String(value);
}

/**
 * 格式化 Schema 为 Markdown 表格
 */
function formatSchemaAsMarkdown(schema: any, title: string, indent = 0, parentKey = ''): string {
  if (!schema || schema.type === 'null' || schema.type === 'unknown') {
    return '';
  }
  
  if (schema.type === 'object' && schema.properties) {
    let markdown = '';
    if (indent === 0) {
      markdown += `### ${title}\n\n`;
    } else {
      markdown += `\n#### ${parentKey} (对象)\n\n`;
    }
    
    markdown += `| 字段 | 类型 | 格式 | 必填 | 示例 |\n`;
    markdown += `|------|------|------|------|------|\n`;
    
    for (const [key, prop] of Object.entries(schema.properties)) {
      const propSchema = prop as any;
      const isRequired = schema.required?.includes(key) ? '是' : '否';
      let type = propSchema.type || 'unknown';
      const format = propSchema.format || '-';
      
      // 处理数组类型
      if (type === 'array' && propSchema.items) {
        const itemType = propSchema.items.type || 'unknown';
        type = `array<${itemType}>`;
      }
      
      // 处理嵌套对象
      if (type === 'object' && propSchema.properties) {
        type = 'object';
      }
      
      const example = formatExampleValue(propSchema.example);
      
      markdown += `| \`${key}\` | \`${type}\` | ${format} | ${isRequired} | ${example} |\n`;
    }
    
    markdown += `\n`;
    
    // 递归处理嵌套对象
    for (const [key, prop] of Object.entries(schema.properties)) {
      const propSchema = prop as any;
      if (propSchema.type === 'object' && propSchema.properties) {
        markdown += formatSchemaAsMarkdown(propSchema, '', indent + 1, key);
      } else if (propSchema.type === 'array' && propSchema.items && propSchema.items.type === 'object' && propSchema.items.properties) {
        markdown += formatSchemaAsMarkdown(propSchema.items, '', indent + 1, `${key}[]`);
      }
    }
    
    return markdown;
  }
  
  if (schema.type === 'array' && schema.items) {
    let markdown = '';
    if (indent === 0) {
      markdown += `### ${title}\n\n`;
      markdown += `类型: \`array\`\n\n`;
    }
    
    if (schema.items.type === 'object' && schema.items.properties) {
      markdown += formatSchemaAsMarkdown(schema.items, '', indent + 1, 'items');
    } else {
      markdown += `元素类型: \`${schema.items.type || 'unknown'}\`\n\n`;
    }
    
    return markdown;
  }
  
  return '';
}

/**
 * 从请求和响应数据生成 Markdown 文档
 */
export function generateDocMarkdownFromSchema(data: {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody?: any;
  responseBody?: any;
  statusCode?: number;
}): string {
  const { url, method, requestHeaders, requestBody, responseBody, statusCode } = data;
  
  // 解析 URL
  const urlInfo = parseUrl(url);
  
  let markdown = `# API 文档\n\n`;
  
  // 基本信息
  markdown += `## 基本信息\n\n`;
  markdown += `- **完整 URL**: \`${url}\`\n`;
  if (urlInfo.baseUrl !== url) {
    markdown += `- **基础 URL**: \`${urlInfo.baseUrl}\`\n`;
  }
  markdown += `- **Method**: \`${method}\`\n`;
  if (statusCode) {
    markdown += `- **Status Code**: \`${statusCode}\`\n`;
  }
  markdown += `\n`;
  
  // 路径参数
  if (urlInfo.pathParams.length > 0) {
    markdown += `## 路径参数 (Path Parameters)\n\n`;
    markdown += `| 参数名 | 类型 | 示例值 |\n`;
    markdown += `|--------|------|--------|\n`;
    for (const param of urlInfo.pathParams) {
      markdown += `| \`${param.name}\` | \`${param.type}\` | \`${param.value}\` |\n`;
    }
    markdown += `\n`;
  }
  
  // 查询参数
  if (Object.keys(urlInfo.queryParams).length > 0) {
    markdown += `## 查询参数 (Query Parameters)\n\n`;
    markdown += `| 参数名 | 类型 | 示例值 |\n`;
    markdown += `|--------|------|--------|\n`;
    for (const [key, param] of Object.entries(urlInfo.queryParams)) {
      markdown += `| \`${key}\` | \`${param.type}\` | \`${param.value}\` |\n`;
    }
    markdown += `\n`;
  }
  
  // 请求头
  markdown += `## 请求头 (Request Headers)\n\n`;
  if (Object.keys(requestHeaders).length === 0) {
    markdown += `无请求头\n\n`;
  } else {
    markdown += `| 字段 | 值 |\n`;
    markdown += `|------|------|\n`;
    for (const [key, value] of Object.entries(requestHeaders)) {
      // 隐藏敏感信息
      const displayValue = key.toLowerCase().includes('token') || key.toLowerCase().includes('authorization')
        ? '`***`'
        : `\`${value}\``;
      markdown += `| \`${key}\` | ${displayValue} |\n`;
    }
    markdown += `\n`;
  }
  
  // 请求体 Schema
  markdown += `## 请求体 Schema (Request Body Schema)\n\n`;
  if (!requestBody) {
    markdown += `无请求体\n\n`;
  } else {
    try {
      const requestSchema = generateObjectSchema(requestBody);
      markdown += formatSchemaAsMarkdown(requestSchema, 'Request Body');
      markdown += `\n`;
      
      // 添加原始示例
      markdown += `### 请求体示例\n\n`;
      markdown += `\`\`\`json\n`;
      markdown += `${JSON.stringify(requestBody, null, 2)}\n`;
      markdown += `\`\`\`\n\n`;
    } catch (error) {
      markdown += `无法解析请求体 Schema\n\n`;
      markdown += `\`\`\`json\n`;
      markdown += `${JSON.stringify(requestBody, null, 2)}\n`;
      markdown += `\`\`\`\n\n`;
    }
  }
  
  // 响应体 Schema
  markdown += `## 响应体 Schema (Response Body Schema)\n\n`;
  if (!responseBody) {
    markdown += `无响应体\n\n`;
  } else {
    try {
      const responseSchema = generateObjectSchema(responseBody);
      markdown += formatSchemaAsMarkdown(responseSchema, 'Response Body');
      markdown += `\n`;
      
      // 添加原始示例
      markdown += `### 响应体示例\n\n`;
      markdown += `\`\`\`json\n`;
      markdown += `${JSON.stringify(responseBody, null, 2)}\n`;
      markdown += `\`\`\`\n\n`;
    } catch (error) {
      markdown += `无法解析响应体 Schema\n\n`;
      markdown += `\`\`\`json\n`;
      markdown += `${JSON.stringify(responseBody, null, 2)}\n`;
      markdown += `\`\`\`\n\n`;
    }
  }
  
  return markdown;
}

