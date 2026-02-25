import { CapturedRequest, MAX_CAPTURE_BODY_BYTES, NEO_CAPTURE_MESSAGE_TYPE } from '../types';
import { normalizeCaptureValue } from '../db';

const STATIC_RESOURCE_EXTENSIONS = /\.(?:js|css|png|jpe?g|gif|webp|ico|svg|woff2?|eot|ttf|otf|map)(?:[?#].*)?$/i;
const ANALYTICS_KEYWORDS = ['google-analytics', 'sentry', 'hotjar', 'mixpanel', 'segment'];

// Dedup: track recent URL patterns to suppress high-frequency duplicates
const recentCaptures = new Map<string, { count: number; lastTime: number }>();
const DEDUP_WINDOW_MS = 60_000; // 1 minute window
const DEDUP_MAX_PER_WINDOW = 3;  // Allow max 3 captures per URL pattern per window

function getCaptureKey(method: string, url: string): string {
  try {
    const u = new URL(url, location.href);
    return `${method} ${u.pathname}`;
  } catch {
    return `${method} ${url}`;
  }
}

function shouldThrottle(method: string, url: string): boolean {
  const key = getCaptureKey(method, url);
  const now = Date.now();
  const entry = recentCaptures.get(key);
  
  if (!entry || (now - entry.lastTime > DEDUP_WINDOW_MS)) {
    recentCaptures.set(key, { count: 1, lastTime: now });
    return false;
  }
  
  entry.count++;
  entry.lastTime = now;
  
  if (entry.count > DEDUP_MAX_PER_WINDOW) {
    return true; // Throttle: too many of the same pattern
  }
  
  return false;
}

declare global {
  interface Window {
    __neoInterceptorInstalled?: boolean;
  }
}

if (!window.__neoInterceptorInstalled) {
  window.__neoInterceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);
  const originalXHRProto = XMLHttpRequest.prototype;
  const originalXHRopen = originalXHRProto.open;
  const originalXHRsend = originalXHRProto.send;
  const originalXHRsetHeader = originalXHRProto.setRequestHeader;

  const XHR_META_KEY = '__neo_meta';

  function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `neo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function truncateText(value: string): string {
    if (value.length <= MAX_CAPTURE_BODY_BYTES) {
      return value;
    }

    return `${value.slice(0, MAX_CAPTURE_BODY_BYTES)}\n[truncated ${value.length - MAX_CAPTURE_BODY_BYTES} bytes]`;
  }

  function toAbsoluteUrl(url: string | URL): string {
    try {
      return new URL(url, location.href).toString();
    } catch {
      return String(url);
    }
  }

  function deriveDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  function shouldSkipRequest(url: string, headers: Record<string, string> = {}): boolean {
    try {
      const parsed = new URL(url, location.href);
      const href = parsed.href.toLowerCase();
      const pathname = parsed.pathname.toLowerCase();
      const hostname = parsed.hostname.toLowerCase();

      if (['chrome-extension:', 'moz-extension:', 'safari-extension:'].includes(parsed.protocol)) {
        return true;
      }

      if (STATIC_RESOURCE_EXTENSIONS.test(pathname)) {
        return true;
      }

      const combined = `${href} ${hostname} ${JSON.stringify(headers).toLowerCase()}`;
      return ANALYTICS_KEYWORDS.some((keyword) => combined.includes(keyword));
    } catch {
      return true;
    }
  }

  function parseHeaders(headers?: Headers | Record<string, string>): Record<string, string> {
    const result: Record<string, string> = {};

    if (!headers) {
      return result;
    }

    const entries = headers instanceof Headers ? headers.entries() : Object.entries(headers);

    for (const [key, value] of entries) {
      result[key] = value;
    }

    return result;
  }

  function parseTextBody(raw: string, contentType?: string): unknown {
    const normalized = truncateText(raw);
    const lowerType = (contentType || '').toLowerCase();
    const looksJson = lowerType.includes('application/json') ||
      ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']')));

    if (looksJson) {
      try {
        return JSON.parse(raw);
      } catch {
        return normalized;
      }
    }

    return normalized;
  }

  async function normalizeRequestBody(value: unknown): Promise<unknown> {
    if (value == null) {
      return undefined;
    }

    if (typeof value === 'string') {
      return truncateText(value);
    }

    if (value instanceof URLSearchParams) {
      return truncateText(value.toString());
    }

    if (value instanceof FormData) {
      const obj: Record<string, string> = {};
      value.forEach((item, key) => {
        obj[key] = String(item);
      });
      return obj;
    }

    if (value instanceof Blob) {
      try {
        const text = await value.text();
        return parseTextBody(text, value.type);
      } catch {
        return '[unreadable blob]';
      }
    }

    if (value instanceof ArrayBuffer) {
      const text = new TextDecoder().decode(new Uint8Array(value));
      return truncateText(text);
    }

    if (ArrayBuffer.isView(value)) {
      const text = new TextDecoder().decode(value as ArrayBufferView);
      return truncateText(text);
    }

    if (typeof value === 'object') {
      try {
        const json = JSON.stringify(value);
        return json ? truncateText(json) : '[object]';
      } catch {
        return '[unserializable body]';
      }
    }

    return truncateText(String(value));
  }

  function normalizeXHRBody(value: unknown): unknown {
    if (value == null) {
      return undefined;
    }

    if (typeof value === 'string') {
      return truncateText(value);
    }

    if (value instanceof URLSearchParams) {
      return truncateText(value.toString());
    }

    if (value instanceof FormData) {
      const obj: Record<string, string> = {};
      value.forEach((item, key) => {
        obj[key] = String(item);
      });
      return obj;
    }

    if (value instanceof Blob) {
      return '[blob body]';
    }

    if (value instanceof ArrayBuffer) {
      try {
        return truncateText(new TextDecoder().decode(new Uint8Array(value)));
      } catch {
        return '[arraybuffer body]';
      }
    }

    if (ArrayBuffer.isView(value)) {
      try {
        return truncateText(new TextDecoder().decode(value as ArrayBufferView));
      } catch {
        return '[view body]';
      }
    }

    if (typeof value === 'object') {
      try {
        return normalizeCaptureValue(value);
      } catch {
        return '[object body]';
      }
    }

    return truncateText(String(value));
  }

  function parseResponseHeaders(raw: string): Record<string, string> {
    const headers: Record<string, string> = {};

    for (const line of raw.split('\r\n')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex <= 0) {
        continue;
      }

      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();
      headers[key] = value;
    }

    return headers;
  }

  function emitCapture(payload: CapturedRequest): void {
    // Throttle high-frequency duplicate URLs
    if (shouldThrottle(payload.method, payload.url)) {
      return;
    }
    try {
      window.postMessage({ type: NEO_CAPTURE_MESSAGE_TYPE, payload }, '*');
    } catch {
      // ignore cross-context postMessage issues
    }
  }

  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const init = args[1];
    const input = args[0];
    const startedAt = Date.now();
    const startPerf = performance.now();
    const url = toAbsoluteUrl(input instanceof Request ? input.url : (input as string | URL));
    const method = ((typeof input !== 'string' && !(input instanceof URL) && init?.method)
      ? init.method
      : (input instanceof Request ? input.method : (init?.method || 'GET'))
    ).toUpperCase();
    const requestHeaders = parseHeaders(
      input instanceof Request ? input.headers : (init?.headers as Headers | Record<string, string> | undefined)
    );

    const reqHeaders = Object.keys(requestHeaders).length
      ? requestHeaders
      : init?.headers
        ? parseHeaders(init.headers as Headers | Record<string, string>)
        : {};

    if (shouldSkipRequest(url, reqHeaders)) {
      return originalFetch(input, init);
    }

    const requestBody = await normalizeRequestBody(
      input instanceof Request ? await input.clone().text() : init?.body
    );

    try {
      const response = await originalFetch(input, init);
      const duration = Math.max(0, Math.round(performance.now() - startPerf));
      let responseBody: unknown;

      try {
        const cloned = response.clone();
        const responseText = await cloned.text();
        responseBody = parseTextBody(responseText, response.headers.get('content-type') || undefined);
      } catch {
        responseBody = '[unreadable response body]';
      }

      const payload: CapturedRequest = {
        id: generateId(),
        timestamp: startedAt,
        domain: deriveDomain(url),
        url,
        method,
        requestHeaders: reqHeaders,
        requestBody,
        responseStatus: response.status,
        responseHeaders: parseHeaders(response.headers),
        responseBody,
        duration,
        tabId: -1,
        tabUrl: location.href,
        source: 'fetch',
      };

      emitCapture(payload);
      return response;
    } catch (error) {
      const duration = Math.max(0, Math.round(performance.now() - startPerf));
      const errorText = error instanceof Error ? error.message : String(error);

      const payload: CapturedRequest = {
        id: generateId(),
        timestamp: startedAt,
        domain: deriveDomain(url),
        url,
        method,
        requestHeaders: reqHeaders,
        requestBody,
        responseStatus: 0,
        responseHeaders: {},
        responseBody: truncateText(errorText),
        duration,
        tabId: -1,
        tabUrl: location.href,
        source: 'fetch',
      };

      emitCapture(payload);
      throw error;
    }
  };

  interface XHRSnapshot {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: unknown;
    startedAt: number;
    startPerf: number;
    skipped: boolean;
    finished: boolean;
  }

  function readXHRResponse(response: XMLHttpRequest): { statusText: number; headers: Record<string, string>; body: unknown } {
    const contentType = response.getResponseHeader('content-type') || undefined;
    let bodyText = '';

    try {
      if (
        response.responseType === '' ||
        response.responseType === 'text' ||
        response.responseType === 'json'
      ) {
        bodyText = typeof response.responseText === 'string' ? response.responseText : '';
      }
    } catch {
      bodyText = '';
    }

    return {
      statusText: response.status,
      headers: parseResponseHeaders(response.getAllResponseHeaders()),
      body: bodyText ? parseTextBody(bodyText, contentType) : undefined,
    };
  }

  originalXHRopen.call;

  originalXHRProto.open = function open(this: XMLHttpRequest, method: string, url: string | URL, ...rest: any[]) {
    const meta: XHRSnapshot = {
      method: method?.toUpperCase() || 'GET',
      url: toAbsoluteUrl(url),
      headers: {},
      body: undefined,
      startedAt: 0,
      startPerf: 0,
      skipped: false,
      finished: false,
    };

    (this as any)[XHR_META_KEY] = meta;
    return originalXHRopen.apply(this, [method, url, ...rest] as Parameters<typeof originalXHRopen>);
  } as typeof originalXHRopen;

  originalXHRProto.setRequestHeader = function setRequestHeader(this: XMLHttpRequest, name: string, value: string) {
    const meta = (this as any)[XHR_META_KEY] as XHRSnapshot | undefined;
    if (meta) {
      meta.headers[name] = value;
    }
    return originalXHRsetHeader.call(this, name, value);
  } as typeof originalXHRsetHeader;

  originalXHRProto.send = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const meta = (this as any)[XHR_META_KEY] as XHRSnapshot | undefined;
    const requestMeta = meta || ({
      method: 'GET',
      url: toAbsoluteUrl(''),
      headers: {},
      body: undefined,
      startedAt: 0,
      startPerf: 0,
      skipped: false,
      finished: false,
    } as XHRSnapshot);

    requestMeta.body = normalizeXHRBody(body as unknown);
    requestMeta.startedAt = Date.now();
    requestMeta.startPerf = performance.now();
    requestMeta.skipped = shouldSkipRequest(requestMeta.url, requestMeta.headers);
    requestMeta.finished = false;
    (this as any)[XHR_META_KEY] = requestMeta;

    const finalize = async () => {
      const current = (this as any)[XHR_META_KEY] as XHRSnapshot | undefined;
      if (!current || current.finished || current.skipped) {
        return;
      }

      current.finished = true;
      const { statusText, headers, body } = readXHRResponse(this);
      const duration = Math.max(0, Math.round(performance.now() - current.startPerf));
      const payload: CapturedRequest = {
        id: generateId(),
        timestamp: current.startedAt,
        domain: deriveDomain(current.url),
        url: current.url,
        method: current.method,
        requestHeaders: current.headers,
        requestBody: current.body,
        responseStatus: statusText,
        responseHeaders: headers,
        responseBody: body,
        duration,
        tabId: -1,
        tabUrl: location.href,
        source: 'xhr',
      };

      emitCapture(payload);
    };

    this.addEventListener('loadend', () => {
      void finalize();
    });

    this.addEventListener('error', () => {
      void finalize();
    });

    this.addEventListener('abort', () => {
      void finalize();
    });

    return originalXHRsend.call(this, body as any);
  } as typeof originalXHRsend;
}
