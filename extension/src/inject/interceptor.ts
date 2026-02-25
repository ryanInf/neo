import { CapturedRequest, MAX_CAPTURE_BODY_BYTES, NEO_CAPTURE_MESSAGE_TYPE } from '../types';
import { normalizeCaptureValue } from '../utils';

const STATIC_RESOURCE_EXTENSIONS = /\.(?:js|css|png|jpe?g|gif|webp|ico|svg|woff2?|eot|ttf|otf|map)(?:[?#].*)?$/i;
const ANALYTICS_KEYWORDS = [
  'google-analytics', 'googletagmanager', 'googlesyndication', 'doubleclick',
  'sentry.io', 'hotjar.com', 'mixpanel.com', 'segment.com', 'segment.io',
  'amplitude.com', 'fullstory.com', 'intercom.io', 'crisp.chat',
  'hubspot.com', 'clarity.ms', 'newrelic.com', 'datadoghq.com',
  'bugsnag.com', 'logrocket.io', 'heapanalytics.com', 'posthog.com',
  'connect.facebook.net', 'bat.bing.com', 'mc.yandex.ru',
  'splunkcloud.com', 'adora-cdn.com', 'transcend-cdn.com',
  'w3-reporting', 'proxsee.pscp.tv',
  // Media CDNs (not API calls)
  'video.twimg.com', 'abs.twimg.com', 'pbs.twimg.com',
  'googlevideo.com', 'ytimg.com',
];

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
    // Periodic cleanup: evict stale entries when map grows large
    if (recentCaptures.size > 200) {
      for (const [k, v] of recentCaptures) {
        if (now - v.lastTime > DEDUP_WINDOW_MS * 2) recentCaptures.delete(k);
      }
    }
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

  // ── DOM trigger tracking ────────────────────────────────────────
  // Track the last user interaction (click/submit) to correlate with API calls
  let lastTrigger: { event: string; selector: string; text?: string; timestamp: number } | null = null;
  const TRIGGER_WINDOW_MS = 2000; // Associate trigger with API calls within 2 seconds

  function getSelector(el: Element): string {
    if (el.id) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    const cls = el.className && typeof el.className === 'string'
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return tag + cls;
  }

  function getElementText(el: Element): string | undefined {
    const text = (el.textContent || '').trim().slice(0, 50);
    return text || undefined;
  }

  function consumeTrigger(): CapturedRequest['trigger'] | undefined {
    if (!lastTrigger) return undefined;
    if (Date.now() - lastTrigger.timestamp > TRIGGER_WINDOW_MS) {
      lastTrigger = null;
      return undefined;
    }
    const t = { ...lastTrigger, event: lastTrigger.event as 'click' | 'input' | 'submit' };
    // Don't null it — multiple API calls can share one trigger
    return t;
  }

  document.addEventListener('click', (e) => {
    const el = e.target as Element;
    if (!el || !el.tagName) return;
    lastTrigger = { event: 'click', selector: getSelector(el), text: getElementText(el), timestamp: Date.now() };
  }, true);

  document.addEventListener('submit', (e) => {
    const el = e.target as Element;
    if (!el) return;
    lastTrigger = { event: 'submit', selector: getSelector(el), text: undefined, timestamp: Date.now() };
  }, true);

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

      if (['chrome-extension:', 'moz-extension:', 'safari-extension:', 'data:', 'blob:'].includes(parsed.protocol)) {
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

  /**
   * Normalize request/response body into a serializable form.
   * When async=true (fetch), reads Blob contents. When sync (XHR), returns placeholder.
   */
  function normalizeBodySync(value: unknown): unknown {
    if (value == null) return undefined;
    if (typeof value === 'string') return truncateText(value);
    if (value instanceof URLSearchParams) return truncateText(value.toString());
    if (value instanceof FormData) {
      const obj: Record<string, string> = {};
      value.forEach((item, key) => { obj[key] = String(item); });
      return obj;
    }
    if (value instanceof Blob) return `[Blob ${value.size} bytes]`;
    if (value instanceof ArrayBuffer) {
      try { return truncateText(new TextDecoder().decode(new Uint8Array(value))); }
      catch { return '[arraybuffer body]'; }
    }
    if (ArrayBuffer.isView(value)) {
      try { return truncateText(new TextDecoder().decode(value as ArrayBufferView)); }
      catch { return '[typed array body]'; }
    }
    if (typeof value === 'object') {
      try { return normalizeCaptureValue(value); }
      catch { return '[unserializable body]'; }
    }
    return truncateText(String(value));
  }

  async function normalizeRequestBody(value: unknown): Promise<unknown> {
    if (value instanceof Blob) {
      try {
        const text = await value.text();
        return parseTextBody(text, value.type);
      } catch {
        return '[unreadable blob]';
      }
    }
    return normalizeBodySync(value);
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
        trigger: consumeTrigger(),
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
        trigger: consumeTrigger(),
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

    requestMeta.body = normalizeBodySync(body as unknown);
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
        trigger: consumeTrigger(),
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

  // ── WebSocket interception ──────────────────────────────────────────
  const OriginalWebSocket = window.WebSocket;
  const WS_META_KEY = '__neo_ws_meta';

  // Per-connection message throttling
  const WS_MSG_WINDOW_MS = 10_000; // 10 second window
  const WS_MSG_MAX_PER_WINDOW = 20; // max messages captured per connection per window

  interface WSMeta {
    url: string;
    domain: string;
    connectedAt: number;
    msgCount: number;
    msgWindowStart: number;
  }

  function wsMessageToString(data: unknown): string {
    if (typeof data === 'string') {
      return truncateText(data);
    }
    if (data instanceof Blob) {
      return `[Blob ${data.size} bytes]`;
    }
    if (data instanceof ArrayBuffer) {
      return `[ArrayBuffer ${data.byteLength} bytes]`;
    }
    if (ArrayBuffer.isView(data)) {
      return `[TypedArray ${data.byteLength} bytes]`;
    }
    return String(data);
  }

  function wsParseBody(raw: string): unknown {
    if ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']'))) {
      try { return JSON.parse(raw); } catch { /* fall through */ }
    }
    return raw;
  }

  function shouldThrottleWsMsg(meta: WSMeta): boolean {
    const now = Date.now();
    if (now - meta.msgWindowStart > WS_MSG_WINDOW_MS) {
      meta.msgCount = 0;
      meta.msgWindowStart = now;
    }
    meta.msgCount++;
    return meta.msgCount > WS_MSG_MAX_PER_WINDOW;
  }

  window.WebSocket = function NeoWebSocket(
    this: WebSocket,
    url: string | URL,
    protocols?: string | string[]
  ): WebSocket {
    const ws: WebSocket = protocols !== undefined
      ? new OriginalWebSocket(url, protocols)
      : new OriginalWebSocket(url);

    const wsUrl = typeof url === 'string' ? url : url.toString();
    const meta: WSMeta = {
      url: wsUrl,
      domain: deriveDomain(wsUrl.replace(/^ws(s)?:\/\//, 'http$1://')),
      connectedAt: Date.now(),
      msgCount: 0,
      msgWindowStart: Date.now(),
    };

    (ws as any)[WS_META_KEY] = meta;

    // Capture connection open
    ws.addEventListener('open', () => {
      const payload: CapturedRequest = {
        id: generateId(),
        timestamp: Date.now(),
        domain: meta.domain,
        url: meta.url,
        method: 'WS_OPEN',
        requestHeaders: {},
        requestBody: protocols ? { protocols: Array.isArray(protocols) ? protocols : [protocols] } : undefined,
        responseStatus: 101,
        responseHeaders: {},
        responseBody: undefined,
        duration: Date.now() - meta.connectedAt,
        tabId: -1,
        tabUrl: location.href,
        source: 'websocket',
      };
      emitCapture(payload);
    });

    // Capture incoming messages
    ws.addEventListener('message', (event: MessageEvent) => {
      if (shouldThrottleWsMsg(meta)) return;
      const raw = wsMessageToString(event.data);
      const payload: CapturedRequest = {
        id: generateId(),
        timestamp: Date.now(),
        domain: meta.domain,
        url: meta.url,
        method: 'WS_RECV',
        requestHeaders: {},
        requestBody: undefined,
        responseStatus: 200,
        responseHeaders: {},
        responseBody: wsParseBody(raw),
        duration: 0,
        tabId: -1,
        tabUrl: location.href,
        source: 'websocket',
      };
      emitCapture(payload);
    });

    // Capture close
    ws.addEventListener('close', (event: CloseEvent) => {
      const payload: CapturedRequest = {
        id: generateId(),
        timestamp: Date.now(),
        domain: meta.domain,
        url: meta.url,
        method: 'WS_CLOSE',
        requestHeaders: {},
        requestBody: undefined,
        responseStatus: event.code,
        responseHeaders: {},
        responseBody: event.reason || undefined,
        duration: Date.now() - meta.connectedAt,
        tabId: -1,
        tabUrl: location.href,
        source: 'websocket',
      };
      emitCapture(payload);
    });

    // Capture errors
    ws.addEventListener('error', () => {
      const payload: CapturedRequest = {
        id: generateId(),
        timestamp: Date.now(),
        domain: meta.domain,
        url: meta.url,
        method: 'WS_ERROR',
        requestHeaders: {},
        requestBody: undefined,
        responseStatus: 0,
        responseHeaders: {},
        responseBody: '[WebSocket error]',
        duration: Date.now() - meta.connectedAt,
        tabId: -1,
        tabUrl: location.href,
        source: 'websocket',
      };
      emitCapture(payload);
    });

    // Intercept send() for outgoing messages
    const originalWsSend = ws.send.bind(ws);
    ws.send = function neoWsSend(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
      if (!shouldThrottleWsMsg(meta)) {
        const raw = wsMessageToString(data);
        const payload: CapturedRequest = {
          id: generateId(),
          timestamp: Date.now(),
          domain: meta.domain,
          url: meta.url,
          method: 'WS_SEND',
          requestHeaders: {},
          requestBody: wsParseBody(raw),
          responseStatus: 0,
          responseHeaders: {},
          responseBody: undefined,
          duration: 0,
          tabId: -1,
          tabUrl: location.href,
          source: 'websocket',
        };
        emitCapture(payload);
      }
      return originalWsSend(data);
    };

    return ws;
  } as unknown as typeof WebSocket;

  // Preserve static properties
  window.WebSocket.prototype = OriginalWebSocket.prototype;
  Object.defineProperties(window.WebSocket, {
    CONNECTING: { value: OriginalWebSocket.CONNECTING },
    OPEN: { value: OriginalWebSocket.OPEN },
    CLOSING: { value: OriginalWebSocket.CLOSING },
    CLOSED: { value: OriginalWebSocket.CLOSED },
  });

  // ── EventSource (SSE) interception ───────────────────────────────
  const OriginalEventSource = window.EventSource;
  if (OriginalEventSource) {
    window.EventSource = function NeoEventSource(
      this: EventSource,
      url: string | URL,
      init?: EventSourceInit
    ): EventSource {
      const esUrl = typeof url === 'string' ? url : url.toString();
      const es = init ? new OriginalEventSource(url, init) : new OriginalEventSource(url);
      const domain = deriveDomain(esUrl);
      const connectedAt = Date.now();
      let messageCount = 0;
      const MSG_CAP = 30; // capture first N messages per connection

      // Capture connection open
      es.addEventListener('open', () => {
        emitCapture({
          id: generateId(),
          timestamp: Date.now(),
          domain,
          url: esUrl,
          method: 'SSE_OPEN',
          requestHeaders: {},
          requestBody: init?.withCredentials ? { withCredentials: true } : undefined,
          responseStatus: 200,
          responseHeaders: {},
          responseBody: undefined,
          duration: Date.now() - connectedAt,
          tabId: -1,
          tabUrl: location.href,
          source: 'eventsource',
        });
      });

      // Capture messages (throttled)
      es.addEventListener('message', (event: MessageEvent) => {
        messageCount++;
        if (messageCount > MSG_CAP) return;
        const data = typeof event.data === 'string' ? event.data : String(event.data);
        let parsed: unknown = data;
        if (data.startsWith('{') || data.startsWith('[')) {
          try { parsed = JSON.parse(data); } catch { /* keep as string */ }
        }
        emitCapture({
          id: generateId(),
          timestamp: Date.now(),
          domain,
          url: esUrl,
          method: 'SSE_MSG',
          requestHeaders: {},
          requestBody: undefined,
          responseStatus: 200,
          responseHeaders: {},
          responseBody: typeof parsed === 'string' ? truncateText(parsed) : parsed,
          duration: Date.now() - connectedAt,
          tabId: -1,
          tabUrl: location.href,
          source: 'eventsource',
        });
      });

      // Capture errors
      es.addEventListener('error', () => {
        emitCapture({
          id: generateId(),
          timestamp: Date.now(),
          domain,
          url: esUrl,
          method: 'SSE_ERROR',
          requestHeaders: {},
          requestBody: undefined,
          responseStatus: 0,
          responseHeaders: {},
          responseBody: '[EventSource error]',
          duration: Date.now() - connectedAt,
          tabId: -1,
          tabUrl: location.href,
          source: 'eventsource',
        });
      });

      return es;
    } as unknown as typeof EventSource;

    window.EventSource.prototype = OriginalEventSource.prototype;
    Object.defineProperties(window.EventSource, {
      CONNECTING: { value: OriginalEventSource.CONNECTING },
      OPEN: { value: OriginalEventSource.OPEN },
      CLOSED: { value: OriginalEventSource.CLOSED },
    });
  }
}
