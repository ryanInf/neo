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
   * 检查是否应该跳过此请求（扩展内部请求等）
   */
  function shouldSkipRequest(url) {
    if (!url) {
      return true;
    }
    // 跳过扩展内部请求
    if (url.startsWith('chrome-extension://') || url.startsWith('chrome://')) {
      return true;
    }
    // 跳过后端 API 请求
    if (isBackendApi(url)) {
      return true;
    }
    return false;
  }

  /**
   * 解析 URL，如果是相对路径则转为绝对路径
   */
  function resolveUrl(url) {
    if (!url) {
      return '';
    }
    try {
      const resolved = new URL(url, window.location.href).toString();
      return resolved;
    } catch (error) {
      console.warn('[Neo] ⚠️  Failed to resolve URL:', url, error);
      return '';
    }
  }

  /**
   * 将各种 headers 表示方式转换为普通对象
   */
  function headersToObject(headers) {
    const result = {};
    if (!headers) {
      return result;
    }

    try {
      if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        headers.forEach((value, key) => {
          result[key] = value;
        });
        return result;
      }

      if (Array.isArray(headers)) {
        headers.forEach((entry) => {
          if (!entry) {
            return;
          }
          const [key, value] = entry;
          if (key) {
            result[key] = value;
          }
        });
        return result;
      }

      if (typeof headers === 'object') {
        Object.keys(headers).forEach((key) => {
          result[key] = headers[key];
        });
      }
    } catch (error) {
      console.warn('[Neo] ⚠️  Failed to normalize headers:', error);
    }

    return result;
  }

  function mergeHeaders(target, source) {
    if (!source) {
      return;
    }
    const normalized = headersToObject(source);
    Object.keys(normalized).forEach((key) => {
      target[key] = normalized[key];
    });
  }

  function tryParseJsonString(text) {
    if (typeof text !== 'string') {
      return text;
    }
    if (!text.length) {
      return '';
    }
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  function serializeBody(body) {
    if (body === undefined || body === null) {
      return body;
    }

    if (typeof body === 'string') {
      return tryParseJsonString(body);
    }

    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      return body.toString();
    }

    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const formDataObj = {};
      try {
        body.forEach((value, key) => {
          let serializedValue;
          if (typeof File !== 'undefined' && value instanceof File) {
            serializedValue = `[File:${value.name ?? 'unknown'}]`;
          } else if (typeof Blob !== 'undefined' && value instanceof Blob) {
            serializedValue = `[Blob:${value.size ?? 'unknown'}]`;
          } else {
            serializedValue = value;
          }

          if (Object.prototype.hasOwnProperty.call(formDataObj, key)) {
            const existing = formDataObj[key];
            if (Array.isArray(existing)) {
              existing.push(serializedValue);
            } else {
              formDataObj[key] = [existing, serializedValue];
            }
          } else {
            formDataObj[key] = serializedValue;
          }
        });
      } catch (error) {
        console.warn('[Neo] ⚠️  Failed to iterate FormData:', error);
        return '[无法解析 FormData]';
      }
      return { __type: 'FormData', fields: formDataObj };
    }

    if (typeof Blob !== 'undefined' && body instanceof Blob) {
      return `[Blob:${body.size ?? 'unknown'}]`;
    }

    if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
      return `[ArrayBuffer:${body.byteLength}]`;
    }

    if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView && ArrayBuffer.isView(body)) {
      return `[TypedArray:${body.byteLength}]`;
    }

    return body;
  }

  async function extractRequestBody(input, init) {
    if (init?.body !== undefined) {
      return serializeBody(init.body);
    }

    if (typeof Request === 'undefined' || !(input instanceof Request)) {
      return undefined;
    }

    if (input.bodyUsed) {
      return '[请求体已被读取]';
    }

    try {
      const clonedRequest = input.clone();
      const text = await clonedRequest.text();
      if (text === '') {
        return undefined;
      }
      const headers = typeof input.headers?.get === 'function' ? input.headers : undefined;
      const contentType = headers ? (headers.get('content-type') || '').toLowerCase() : '';

      if (contentType.includes('multipart/form-data')) {
        return '[FormData]';
      }

      if (contentType.includes('application/x-www-form-urlencoded')) {
        try {
          const params = new URLSearchParams(text);
          const result = {};
          params.forEach((value, key) => {
            if (Object.prototype.hasOwnProperty.call(result, key)) {
              const existing = result[key];
              if (Array.isArray(existing)) {
                existing.push(value);
              } else {
                result[key] = [existing, value];
              }
            } else {
              result[key] = value;
            }
          });
          return result;
        } catch (error) {
          console.warn('[Neo] ⚠️  Failed to parse urlencoded request body:', error);
        }
      }

      if (contentType.includes('application/json') || contentType.includes('+json')) {
        return tryParseJsonString(text);
      }

      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        return tryParseJsonString(text);
      }

      return text;
    } catch (error) {
      console.warn('[Neo] ⚠️  Failed to read request body from Request:', error);
      return '[无法读取请求体]';
    }
  }

  async function readResponseBody(response) {
    try {
      const clonedResponse = response.clone();
      const contentType = (response.headers?.get?.('content-type') || '').toLowerCase();
      const text = await clonedResponse.text();

      if (text === '') {
        return '';
      }

      if (contentType.includes('application/json') || contentType.includes('+json')) {
        return tryParseJsonString(text);
      }

      const trimmed = text.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = tryParseJsonString(text);
        if (parsed !== text) {
          return parsed;
        }
      }

      return text;
    } catch (error) {
      console.warn('[Neo] ⚠️  Failed to read response body:', error);
      return '[无法读取响应体]';
    }
  }


  /**
   * 发送 API 调用数据到 content script
   */
  function sendApiCall(data, source) {
    const payload = source ? { ...data, source } : data;
    window.postMessage({
      type: '__neo.api_call',
      payload
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
      const rawUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (typeof Request !== 'undefined' && input instanceof Request ? input.url : input?.url ?? '');
      const resolvedUrl = resolveUrl(rawUrl);
      const captureUrl = resolvedUrl || '';
      const rawMethod = init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : undefined) || 'GET';
      const method = typeof rawMethod === 'string' ? rawMethod : String(rawMethod);

      // 立即打印检查到的 API
      console.log('[Neo] 🔍 API detected (fetch):', {
        rawUrl,
        resolvedUrl,
        method,
        timestamp: new Date().toISOString(),
      });

      // 跳过后端 API 请求和扩展内部请求（避免循环上报）
      if (shouldSkipRequest(resolvedUrl || rawUrl || '')) {
        console.log('[Neo] ⏭️  Skipping request:', resolvedUrl || rawUrl);
        return originalFetch(input, init);
      }

      // 捕获请求信息
      const requestHeaders = {};
      if (typeof Request !== 'undefined' && input instanceof Request) {
        mergeHeaders(requestHeaders, input.headers);
      }
      if (init?.headers) {
        mergeHeaders(requestHeaders, init.headers);
      }

      let requestBody = await extractRequestBody(input, init);
      if (requestBody === '') {
        requestBody = undefined;
      }

      try {
        // 执行原始 fetch
        const response = await originalFetch(input, init);

        const duration = Date.now() - startTime;
        console.log('[Neo] 📥 Fetch response:', resolvedUrl || rawUrl, response.status, duration + 'ms');

        if (!captureUrl) {
          console.warn('[Neo] ⚠️  Skipping capture due to unresolved URL:', {
            rawUrl,
            resolvedUrl,
          });
          return response;
        }

        readResponseBody(response).then((responseBody) => {
          const hasBody = responseBody !== undefined
            && responseBody !== null
            && responseBody !== '[无法读取响应体]'
            && !(typeof responseBody === 'string' && responseBody.length === 0);
          console.log('[Neo] 💾 Capturing API call (fetch):', captureUrl, {
            statusCode: response.status,
            duration,
            hasBody,
            bodyType: typeof responseBody,
          });

          sendApiCall({
            url: captureUrl,
            method,
            requestHeaders,
            requestBody,
            responseBody,
            statusCode: response.status,
            duration,
            timestamp: Date.now(),
          }, 'injected-fetch');
        }).catch((readError) => {
          const fallbackUrl = captureUrl || resolvedUrl || rawUrl || '';
          console.error('[Neo] ❌ Failed to read fetch response body:', fallbackUrl, readError);
          if (fallbackUrl) {
            sendApiCall({
              url: fallbackUrl,
              method,
              requestHeaders,
              requestBody,
              statusCode: response.status,
              duration,
              timestamp: Date.now(),
              error: 'Failed to read response body',
            }, 'injected-fetch');
          } else {
            console.warn('[Neo] ⚠️  Skipped fetch response body error capture due to unresolved URL:', {
              rawUrl,
              resolvedUrl,
            });
          }
        });

        return response;
      } catch (error) {
        const duration = Date.now() - startTime;

        const fallbackUrl = captureUrl || resolvedUrl || rawUrl || '';
        console.error('[Neo] ❌ Fetch error:', fallbackUrl, error);
        if (fallbackUrl) {
          sendApiCall({
            url: fallbackUrl,
            method,
            requestHeaders,
            requestBody,
            statusCode: 0,
            duration,
            timestamp: Date.now(),
            error: error.message,
          }, 'injected-fetch');
        } else {
          console.warn('[Neo] ⚠️  Skipped fetch error capture due to unresolved URL:', {
            rawUrl,
            resolvedUrl,
          });
        }

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
      const rawUrl = typeof url === 'string' ? url : url?.toString?.() ?? '';
      const resolvedUrl = resolveUrl(rawUrl);

      this._neoMethod = method;
      this._neoRawUrl = rawUrl;
      this._neoUrl = resolvedUrl || '';
      this._neoStartTime = Date.now();
      this._neoRequestHeaders = {};
      
      // 立即打印检查到的 API
      console.log('[Neo] 🔍 API detected (XHR):', {
        rawUrl,
        resolvedUrl,
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
      const rawUrl = xhr._neoRawUrl || '';
      const url = xhr._neoUrl || '';
      const startTime = xhr._neoStartTime || Date.now();
      const requestHeaders = xhr._neoRequestHeaders || {};
      
      console.log('[Neo] 🔍 XHR send called:', {
        rawUrl,
        resolvedUrl: url,
        method,
        readyState: xhr.readyState,
        headersCount: Object.keys(requestHeaders).length,
      });
      
      // 跳过后端 API 请求和扩展内部请求（避免循环上报）
      if (shouldSkipRequest(url || rawUrl)) {
        console.log('[Neo] ⏭️  Skipping request (XHR):', url || rawUrl);
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
      
      // 处理响应的函数
      const handleResponse = function () {
        const duration = Date.now() - startTime;
        console.log('[Neo] 📥 XHR response:', url || rawUrl, xhr.status, duration + 'ms', 'readyState:', xhr.readyState);

        if (!url) {
          console.warn('[Neo] ⚠️  Skipping XHR capture due to unresolved URL:', {
            rawUrl,
            resolvedUrl: url,
          });
          return;
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
        } catch (e) {
          console.warn('[Neo] ⚠️  Failed to parse response body:', e);
          responseBody = '[无法解析响应]';
        }
        
        console.log('[Neo] 💾 Capturing XHR API call:', url, {
          statusCode: xhr.status,
          hasBody: !!responseBody,
        });
        
        try {
          sendApiCall({
            url,
            method,
            requestHeaders,
            requestBody,
            responseBody,
            statusCode: xhr.status,
            duration,
            timestamp: Date.now(),
          }, 'injected-xhr');
          console.log('[Neo] ✅ XHR API call sent successfully');
        } catch (e) {
          console.error('[Neo] ❌ Failed to send XHR API call:', e);
        }
      };
      
      // 监听 readyState 变化
      const handleReadyStateChange = function () {
        console.log('[Neo] 📊 XHR readyState changed:', url, 'readyState:', xhr.readyState);
        if (xhr.readyState === 4) {
          handleResponse();
        }
      };
      
      // 使用 {once: true} 确保监听器只触发一次，避免累积
      xhr.addEventListener('readystatechange', handleReadyStateChange, { once: true });
      
      // 如果请求已经完成（可能在某些情况下发生），立即处理
      if (xhr.readyState === 4) {
        console.log('[Neo] ⚠️  XHR already completed, handling immediately');
        setTimeout(handleResponse, 0);
      }
      
      // 监听错误事件 - 使用 {once: true} 避免重复触发
      xhr.addEventListener('error', () => {
        console.error('[Neo] ❌ XHR error:', url || rawUrl);
        if (url) {
          sendApiCall({
            url,
            method,
            requestHeaders,
            requestBody,
            statusCode: 0,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
            error: 'Network error',
          }, 'injected-xhr');
        } else {
          console.warn('[Neo] ⚠️  Skipped XHR error capture due to unresolved URL:', {
            rawUrl,
          });
        }
      }, { once: true });
      
      // 监听超时事件 - 使用 {once: true} 避免重复触发
      xhr.addEventListener('timeout', () => {
        console.error('[Neo] ⏱️  XHR timeout:', url || rawUrl);
        if (url) {
          sendApiCall({
            url,
            method,
            requestHeaders,
            requestBody,
            statusCode: 0,
            duration: Date.now() - startTime,
            timestamp: Date.now(),
            error: 'Timeout',
          }, 'injected-xhr');
        } else {
          console.warn('[Neo] ⚠️  Skipped XHR timeout capture due to unresolved URL:', {
            rawUrl,
          });
        }
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

