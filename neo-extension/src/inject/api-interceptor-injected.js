/**
 * API 拦截器 - 注入脚本版本
 * 在页面上下文中运行，拦截 fetch 和 XMLHttpRequest
 * 通过 postMessage 发送到 content script
 */
(function () {
  'use strict';

  // 检查是否已经注入
  if (window.__neo_api_interceptor_injected) {
    console.log('[Neo] API interceptor already injected, skipping');
    return;
  }
  window.__neo_api_interceptor_injected = true;

  console.log('[Neo] ========================================');
  console.log('[Neo] 🔧 Injected Script: API Interceptor Loading...');
  console.log('[Neo] ========================================');
  console.log('[Neo] window.fetch type:', typeof window.fetch);
  console.log('[Neo] XMLHttpRequest type:', typeof XMLHttpRequest);
  console.log('[Neo] window.location:', window.location.href);

  /**
   * 检查是否是 Neo 后端 API 请求（需要跳过，避免循环上报）
   */
  function isBackendApi(url) {
    try {
      const urlObj = new URL(url, window.location.origin);
      const hostname = urlObj.hostname.toLowerCase();
      const port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80');
      // 检查是否是 localhost:3000（Neo 后端默认地址）
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * 发送 API 调用数据到 content script
   */
  function sendApiCall(data) {
    window.postMessage({
      type: '__neo.api_call',
      payload: data
    }, '*');
  }

  let fetchInterceptorInstalled = false;
  let xhrInterceptorInstalled = false;

  /**
   * 拦截 fetch API
   */
  try {
    const originalFetch = window.fetch;
    console.log('[Neo] Original fetch:', originalFetch);
    
    if (!originalFetch) {
      throw new Error('window.fetch is not available');
    }

    window.fetch = async function (input, init) {
      const startTime = Date.now();
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method || 'GET';
      
      // 立即打印检查到的 API
      console.log('[Neo] 🔍 API detected (fetch):', {
        url,
        method,
        timestamp: new Date().toISOString(),
      });
      
      // 跳过后端 API 请求（避免循环上报）
      if (isBackendApi(url)) {
        console.log('[Neo] ⏭️  Skipping backend API:', url);
        return originalFetch(input, init);
      }
      
      // 捕获请求信息
      const requestHeaders = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            requestHeaders[key] = value;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([key, value]) => {
            requestHeaders[key] = value;
          });
        } else {
          Object.assign(requestHeaders, init.headers);
        }
      }
      
      let requestBody = undefined;
      if (init?.body) {
        if (typeof init.body === 'string') {
          try {
            requestBody = JSON.parse(init.body);
          } catch {
            requestBody = init.body;
          }
        } else {
          requestBody = init.body;
        }
      }
      
      try {
        // 执行原始 fetch
        const response = await originalFetch(input, init);
        
        const duration = Date.now() - startTime;
        console.log('[Neo] 📥 Fetch response:', url, response.status, duration + 'ms');
        
        // 克隆响应以便读取 body
        const clonedResponse = response.clone();
        
        // 异步读取响应体
        clonedResponse.json().then((responseBody) => {
          const responseHeaders = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          
          console.log('[Neo] 💾 Capturing API call (JSON):', url);
          sendApiCall({
            url,
            method,
            requestHeaders,
            requestBody,
            responseHeaders,
            responseBody,
            statusCode: response.status,
            duration,
            timestamp: Date.now(),
          });
        }).catch(() => {
          // 如果响应不是 JSON，尝试读取文本
          clonedResponse.text().then((responseText) => {
            const responseHeaders = {};
            response.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });
            
            console.log('[Neo] 💾 Capturing API call (text):', url);
            sendApiCall({
              url,
              method,
              requestHeaders,
              requestBody,
              responseHeaders,
              responseBody: responseText,
              statusCode: response.status,
              duration,
              timestamp: Date.now(),
            });
          }).catch(() => {
            // 无法读取响应体，只记录基本信息
            const responseHeaders = {};
            response.headers.forEach((value, key) => {
              responseHeaders[key] = value;
            });
            
            console.log('[Neo] 💾 Capturing API call (no body):', url);
            sendApiCall({
              url,
              method,
              requestHeaders,
              requestBody,
              responseHeaders,
              statusCode: response.status,
              duration,
              timestamp: Date.now(),
            });
          });
        });
        
        return response;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        console.error('[Neo] ❌ Fetch error:', url, error);
        sendApiCall({
          url,
          method,
          requestHeaders,
          requestBody,
          statusCode: 0,
          duration,
          timestamp: Date.now(),
          error: error.message,
        });
        
        throw error;
      }
    };
    
    fetchInterceptorInstalled = true;
    console.log('[Neo] ✅ Fetch interceptor installed successfully');
  } catch (error) {
    console.error('[Neo] ❌ Failed to install fetch interceptor:', error);
    console.error('[Neo] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      fetchAvailable: typeof window.fetch,
    });
  }

  /**
   * 拦截 XMLHttpRequest
   */
  try {
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

    console.log('[Neo] Installing XHR interceptor...');
    console.log('[Neo] Original XHR methods:', {
      open: typeof originalXHROpen,
      send: typeof originalXHRSend,
      setRequestHeader: typeof originalXHRSetRequestHeader,
    });

    if (!originalXHROpen || !originalXHRSend || !originalXHRSetRequestHeader) {
      throw new Error('XMLHttpRequest prototype methods are not available');
    }

    XMLHttpRequest.prototype.open = function (method, url, async, username, password) {
      this._neoMethod = method;
      this._neoUrl = typeof url === 'string' ? url : url.toString();
      this._neoStartTime = Date.now();
      this._neoRequestHeaders = {};
      
      // 立即打印检查到的 API
      console.log('[Neo] 🔍 API detected (XHR):', {
        url: typeof url === 'string' ? url : url.toString(),
        method,
        timestamp: new Date().toISOString(),
      });
      
      return originalXHROpen.call(this, method, url, async ?? true, username ?? null, password ?? null);
    };

    XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
      if (!this._neoRequestHeaders) {
        this._neoRequestHeaders = {};
      }
      this._neoRequestHeaders[name] = value;
      return originalXHRSetRequestHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function (body) {
      const xhr = this;
      const method = xhr._neoMethod || 'GET';
      const url = xhr._neoUrl || '';
      const startTime = xhr._neoStartTime || Date.now();
      const requestHeaders = xhr._neoRequestHeaders || {};
      
      // 跳过后端 API 请求（避免循环上报）
      if (isBackendApi(url)) {
        console.log('[Neo] ⏭️  Skipping backend API (XHR):', url);
        return originalXHRSend.call(this, body);
      }
      
      let requestBody = undefined;
      if (body) {
        if (typeof body === 'string') {
          try {
            requestBody = JSON.parse(body);
          } catch {
            requestBody = body;
          }
        } else if (body instanceof FormData) {
          requestBody = '[FormData]';
        } else if (body instanceof Blob) {
          requestBody = '[Blob]';
        } else {
          requestBody = body;
        }
      }
      
      // 监听 readyState 变化
      const handleReadyStateChange = function () {
        if (xhr.readyState === 4) {
          const duration = Date.now() - startTime;
          console.log('[Neo] 📥 XHR response:', url, xhr.status, duration + 'ms');
          
          const responseHeaders = {};
          const headers = xhr.getAllResponseHeaders();
          if (headers) {
            headers.split('\r\n').forEach((line) => {
              const [key, ...valueParts] = line.split(': ');
              if (key && valueParts.length > 0) {
                responseHeaders[key.trim()] = valueParts.join(': ').trim();
              }
            });
          }
          
          let responseBody = undefined;
          try {
            if (xhr.responseType === '' || xhr.responseType === 'text') {
              try {
                responseBody = JSON.parse(xhr.responseText);
              } catch {
                responseBody = xhr.responseText;
              }
            } else {
              responseBody = xhr.response;
            }
          } catch {
            responseBody = '[无法解析响应]';
          }
          
          console.log('[Neo] 💾 Capturing XHR API call:', url);
          sendApiCall({
            url,
            method,
            requestHeaders,
            requestBody,
            responseHeaders,
            responseBody,
            statusCode: xhr.status,
            duration,
            timestamp: Date.now(),
          });
        }
      };
      
      // 使用 {once: true} 确保监听器只触发一次，避免累积
      xhr.addEventListener('readystatechange', handleReadyStateChange, { once: true });
      
      // 监听错误事件 - 使用 {once: true} 避免重复触发
      xhr.addEventListener('error', () => {
        console.error('[Neo] ❌ XHR error:', url);
        sendApiCall({
          url,
          method,
          requestHeaders,
          requestBody,
          statusCode: 0,
          duration: Date.now() - startTime,
          timestamp: Date.now(),
          error: 'Network error',
        });
      }, { once: true });
      
      // 监听超时事件 - 使用 {once: true} 避免重复触发
      xhr.addEventListener('timeout', () => {
        console.error('[Neo] ⏱️  XHR timeout:', url);
        sendApiCall({
          url,
          method,
          requestHeaders,
          requestBody,
          statusCode: 0,
          duration: Date.now() - startTime,
          timestamp: Date.now(),
          error: 'Timeout',
        });
      }, { once: true });
      
      return originalXHRSend.call(this, body);
    };

    xhrInterceptorInstalled = true;
    console.log('[Neo] ✅ XHR interceptor installed successfully');
  } catch (error) {
    console.error('[Neo] ❌ Failed to install XHR interceptor:', error);
    console.error('[Neo] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      xhrAvailable: typeof XMLHttpRequest,
      xhrPrototype: XMLHttpRequest.prototype ? 'available' : 'not available',
    });
  }

  // 最终状态报告
  const interceptorInstalled = fetchInterceptorInstalled && xhrInterceptorInstalled;

  console.log('[Neo] ========================================');
  console.log('[Neo] 🔧 Injected Script: Installation Summary');
  console.log('[Neo] ========================================');
  console.log('[Neo] Fetch Interceptor:', fetchInterceptorInstalled ? '✅ INSTALLED' : '❌ FAILED');
  console.log('[Neo] XHR Interceptor:', xhrInterceptorInstalled ? '✅ INSTALLED' : '❌ FAILED');
  console.log('[Neo] Overall Status:', interceptorInstalled ? '✅ READY' : '❌ PARTIAL/FAILED');
  console.log('[Neo] ========================================');

  if (!interceptorInstalled) {
    console.warn('[Neo] ⚠️  WARNING: Some interceptors failed to install!');
    console.warn('[Neo] API interception may not work correctly.');
  }
})();

