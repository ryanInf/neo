/**
 * CORS 错误处理工具
 */

/**
 * 检查是否是 CORS 错误
 */
export function isCorsError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || String(error);
  const errorName = error.name || '';
  
  // 常见的 CORS 错误标识
  return (
    errorName === 'TypeError' ||
    errorMessage.includes('CORS') ||
    errorMessage.includes('cross-origin') ||
    errorMessage.includes('Access-Control') ||
    errorMessage.includes('NetworkError') ||
    errorMessage.includes('Failed to fetch')
  );
}

/**
 * 获取 CORS 错误的友好提示
 */
export function getCorsErrorMessage(error: any, url?: string): string {
  if (isCorsError(error)) {
    return `跨域请求被阻止：${url || '未知地址'}。这可能是因为目标服务器未配置 CORS 或插件权限不足。`;
  }
  return error?.message || String(error);
}

/**
 * 使用 Chrome 扩展 API 发送请求（绕过 CORS）
 * 注意：这需要 host_permissions 权限
 */
export async function fetchWithExtension(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  try {
    // 首先尝试使用 fetch（如果 CORS 允许）
    return await fetch(url, options);
  } catch (error) {
    if (isCorsError(error)) {
      // 如果 CORS 失败，尝试使用 Chrome 扩展的 fetch
      // 注意：这需要 manifest.json 中配置相应的 host_permissions
      throw new Error(`跨域请求失败：${url}。请确保已在 manifest.json 中配置相应的 host_permissions。`);
    }
    throw error;
  }
}

