/**
 * 扩展配置
 */
export const config = {
  // 后端 API 地址
  backendUrl: (() => {
    // 优先使用环境变量或存储的设置
    if (typeof chrome !== 'undefined' && chrome.storage) {
      // 异步获取，这里先返回默认值
      // 实际使用时应该异步获取
      return 'http://localhost:3000';
    }
    return 'http://localhost:3000';
  })(),
  
  // 批量上报间隔（毫秒）
  batchInterval: 5000,
  
  // 最大队列长度
  maxQueueSize: 100,
};

/**
 * 获取后端 URL（支持异步获取用户配置）
 */
export async function getBackendUrl(): Promise<string> {
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(['backendUrl'], (result) => {
        resolve(result.backendUrl || config.backendUrl);
      });
    });
  }
  return config.backendUrl;
}

