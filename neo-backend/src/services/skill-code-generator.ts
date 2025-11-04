import type { ApiCall, SkillDefinition, InputMapping } from '../models/skill-types';

/**
 * ApiDoc 信息映射类型
 */
export interface ApiDocInfo {
  url: string;
  method: string;
}

/**
 * 规范化输入映射（兼容新旧格式）
 */
function normalizeInputMapping(
  inputMapping?: InputMapping | Record<string, string>
): InputMapping | null {
  if (!inputMapping) {
    return null;
  }
  
  // 如果已经是新格式（InputMapping），直接返回
  if ('query' in inputMapping || 'path' in inputMapping || 'header' in inputMapping || 'body' in inputMapping) {
    return inputMapping as InputMapping;
  }
  
  // 如果是旧格式（Record<string, string>），转换为新格式
  // 默认将旧格式的参数放到 body 中（向后兼容）
  return {
    body: inputMapping as Record<string, string>,
  };
}

/**
 * 生成参数值的代码表达式
 */
function generateValueExpression(value: string): string {
  // 如果以 $ 开头，表示是变量引用
  if (value.startsWith('$')) {
    return value;
  }
  // 如果是数字，直接返回
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }
  // 如果是布尔值
  if (value === 'true' || value === 'false') {
    return value;
  }
  // 其他情况作为字符串处理
  return `'${value.replace(/'/g, "\\'")}'`;
}

/**
 * 生成参数映射代码
 */
function generateMappingCode(
  mapping: Record<string, string>,
  indent: string = '    '
): string {
  return Object.entries(mapping)
    .map(([key, value]) => `${indent}${key}: ${generateValueExpression(value)}`)
    .join(',\n');
}

/**
 * 根据技能定义生成 JavaScript 代码
 * @param skillName 技能名称
 * @param skillDescription 技能描述
 * @param apiSequence API 调用序列
 * @param apiDocMap ApiDoc ID 到 { url, method } 的映射
 */
export function generateSkillCode(
  skillName: string,
  skillDescription: string,
  apiSequence: ApiCall[],
  apiDocMap: Map<string, ApiDocInfo>
): string {
  // 生成 API 调用代码
  const apiCalls = apiSequence
    .sort((a, b) => a.order - b.order)
    .map((apiCall, index) => {
      // 从 ApiDoc 映射中获取 URL 和方法
      const apiDocInfo = apiDocMap.get(apiCall.apiDocId);
      if (!apiDocInfo) {
        throw new Error(`ApiDoc not found for id: ${apiCall.apiDocId}`);
      }
      
      const url = apiDocInfo.url;
      const method = apiDocInfo.method;
      
      // 规范化输入映射
      const normalizedMapping = normalizeInputMapping(apiCall.inputMapping);
      
      // 生成各个类型的参数映射代码
      const queryCode = normalizedMapping?.query
        ? `query: {\n${generateMappingCode(normalizedMapping.query, '      ')}\n    }`
        : '';
      const pathCode = normalizedMapping?.path
        ? `path: {\n${generateMappingCode(normalizedMapping.path, '      ')}\n    }`
        : '';
      const headerCode = normalizedMapping?.header
        ? `headers: {\n${generateMappingCode(normalizedMapping.header, '      ')}\n    }`
        : '';
      const bodyCode = normalizedMapping?.body
        ? `body: {\n${generateMappingCode(normalizedMapping.body, '      ')}\n    }`
        : '';
      
      // 组合参数代码
      const params: string[] = [];
      if (queryCode) params.push(queryCode);
      if (pathCode) params.push(pathCode);
      if (headerCode) params.push(headerCode);
      if (bodyCode) params.push(bodyCode);
      
      const paramsCode = params.length > 0 ? ',\n' + params.join(',\n') : '';
      
      // 生成输出映射代码
      const outputMappingCode = apiCall.outputMapping
        ? Object.entries(apiCall.outputMapping)
            .map(([key, value]) => {
              // 支持嵌套路径访问（例如 result.data.id）
              const accessPath = value.split('.').map((part, i) => 
                i === 0 ? `result${index}` : `?.${part}`
              ).join('');
              return `    state.set('${key}', ${accessPath});`;
            })
            .join('\n')
        : '';
      
      return `
  // 步骤 ${apiCall.order}: ${apiCall.apiDocId}
  ${apiCall.condition ? `if (${apiCall.condition}) {` : ''}
  const result${index} = await api.call({
    url: '${url}',
    method: '${method}'${paramsCode}
  });
  ${outputMappingCode ? `\n    ${outputMappingCode}` : ''}
  ${apiCall.condition ? '  }' : ''}`;
    })
    .join('');

  // 生成完整的技能代码
  const code = `// 技能：${skillName}
// ${skillDescription}

async function execute(context) {
  const { api, state } = context;
  ${apiCalls}
  
  return {
    success: true,
    message: '技能执行完成'
  };
}

// 导出技能元数据
export const skillMeta = {
  name: '${skillName}',
  description: '${skillDescription}',
  version: '1.0.0'
};

export default execute;
`;

  return code;
}

/**
 * 创建技能定义对象
 */
export function createSkillDefinition(
  apiSequence: ApiCall[],
  code: string
): SkillDefinition {
  return {
    format: 'javascript',
    content: code,
    apiSequence: apiSequence.sort((a, b) => a.order - b.order),
  };
}
