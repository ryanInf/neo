/**
 * API 拦截器 - Content Script 版本
 * 注入脚本到页面上下文，并监听来自注入脚本的消息
 */
import { captureApiCall } from './capture';

console.log('[Neo] ========================================');
console.log('[Neo] Content Script: API Interceptor Loading...');
console.log('[Neo] ========================================');
console.log('[Neo] window.location:', window.location.href);

/**
 * 注入拦截脚本到页面上下文
 */
function injectInterceptorScript() {
  // 检查是否已经注入
  if (document.getElementById('__neo_api_interceptor_script')) {
    console.log('[Neo] Script already injected, skipping');
    return;
  }

  try {
    const script = document.createElement('script');
    script.id = '__neo_api_interceptor_script';
    script.src = chrome.runtime.getURL('src/inject/api-interceptor-injected.js');
    script.onload = function() {
      console.log('[Neo] ✅ API interceptor script injected successfully');
    };
    script.onerror = function(error) {
      console.error('[Neo] ❌ Failed to inject API interceptor script:', error);
      console.error('[Neo] Script URL:', chrome.runtime.getURL('src/inject/api-interceptor-injected.js'));
    };
    
    // 在 document_start 时，document.head 可能还不存在，使用 document.documentElement
    (document.head || document.documentElement).appendChild(script);
    console.log('[Neo] 📤 Injecting script into page context...');
  } catch (error) {
    console.error('[Neo] ❌ Error injecting script:', error);
    console.error('[Neo] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

// 立即注入（在 document_start 时执行）
injectInterceptorScript();

// 如果 DOM 还没准备好，也监听 DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectInterceptorScript);
}

/**
 * 监听来自注入脚本的 API 调用消息
 */
window.addEventListener('message', (event) => {
  // 只处理来自当前窗口的消息
  if (event.source !== window) {
    return;
  }

  // 处理 API 调用消息
  if (event.data.type === '__neo.api_call') {
    const data = event.data.payload;
    
    console.log('[Neo] 📨 Received API call from injected script:', {
      url: data.url,
      method: data.method,
    });
    
    // 调用 captureApiCall 上报数据
    captureApiCall({
      url: data.url,
      method: data.method,
      requestHeaders: data.requestHeaders || {},
      requestBody: data.requestBody,
      responseHeaders: data.responseHeaders || {},
      responseBody: data.responseBody,
      statusCode: data.statusCode,
      duration: data.duration,
      timestamp: data.timestamp || Date.now(),
    });
  }
});

console.log('[Neo] ✅ Content script loaded, listening for API calls');
console.log('[Neo] ========================================');

