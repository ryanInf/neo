// Content Script - 处理来自 background 的消息
import './api-interceptor';
import './ui-injector';
import { buildUrl } from '../utils/url-builder';

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXECUTE_API_CALL') {
    // 在页面上下文中执行 API 调用
    const { options } = message;
    
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
    
    fetch(fullUrl, {
      method: options.method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
      .then(async (response) => {
        const contentType = response.headers.get('content-type') || '';
        let data: any;
        if (contentType.includes('application/json')) {
          data = await response.json();
        } else {
          data = await response.text();
        }
        sendResponse({ data, status: response.status });
      })
      .catch((error) => {
        sendResponse({ error: error.message });
      });
    
    return true; // 保持消息通道开放
  }
  
  return false;
});

