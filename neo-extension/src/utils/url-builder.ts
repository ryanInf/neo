/**
 * URL 构建工具
 * 用于构建包含查询参数和路径参数的完整 URL
 */

/**
 * 构建完整的 URL（包含查询参数和路径参数）
 * @param baseUrl 基础 URL
 * @param pathParams 路径参数（例如 { userId: '123' } 用于 /api/users/:userId）
 * @param queryParams 查询参数（例如 { page: 1, limit: 10 }）
 * @returns 构建后的完整 URL
 */
export function buildUrl(
  baseUrl: string,
  pathParams?: Record<string, string | number>,
  queryParams?: Record<string, string | number | boolean | string[] | number[]>
): string {
  let url = baseUrl;
  
  // 处理路径参数（例如 /api/users/:userId -> /api/users/123）
  if (pathParams) {
    Object.entries(pathParams).forEach(([key, value]) => {
      url = url.replace(`:${key}`, String(value));
      url = url.replace(`{${key}}`, String(value));
    });
  }
  
  // 处理查询参数
  if (queryParams && Object.keys(queryParams).length > 0) {
    try {
      // 尝试使用 URL 构造函数（适用于完整 URL）
      const urlObj = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
      Object.entries(queryParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          // 数组参数：多个同名参数
          value.forEach(v => urlObj.searchParams.append(key, String(v)));
        } else if (value !== undefined && value !== null) {
          urlObj.searchParams.set(key, String(value));
        }
      });
      url = urlObj.pathname + urlObj.search + urlObj.hash;
    } catch {
      // 如果 URL 构造函数失败，手动构建查询字符串
      const queryPairs: string[] = [];
      Object.entries(queryParams).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => queryPairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`));
        } else if (value !== undefined && value !== null) {
          queryPairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
        }
      });
      if (queryPairs.length > 0) {
        const separator = url.includes('?') ? '&' : '?';
        url = url + separator + queryPairs.join('&');
      }
    }
  }
  
  return url;
}

