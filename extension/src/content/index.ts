import { CapturedRequest, NEO_CAPTURE_MESSAGE_TYPE, NEO_MESSAGE_PREFIX, TriggerEventType, TriggerInfo } from '../types';

type WindowWithNeo = Window & {
  __neoContentScriptInstalled?: boolean;
};

interface TrackedEvent {
  event: TriggerEventType;
  selector: string;
  text?: string;
  timestamp: number;
}

const TRACKED_EVENTS_LIMIT = 150;
const EVENT_CORRELATION_WINDOW_MS = 500;
const EVENT_KEEP_WINDOW_MS = 8000;
const trackedEvents: TrackedEvent[] = [];

const windowState = window as WindowWithNeo;

if (!windowState.__neoContentScriptInstalled) {
  windowState.__neoContentScriptInstalled = true;
  // inject.js now runs via world: "MAIN" content script — no manual injection needed
  attachDomListeners();
  window.addEventListener('message', onPageCaptureMessage, false);
}

function injectInterceptorScript(): void {
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('inject.js');
  script.type = 'text/javascript';
  script.dataset.neoInterceptor = 'true';

  (document.documentElement || document.documentElement || document.body || document.head)?.appendChild(script);
}

function attachDomListeners(): void {
  document.addEventListener('click', (event) => handleDomEvent('click', event), true);
  document.addEventListener('input', (event) => handleDomEvent('input', event), true);
  document.addEventListener('submit', (event) => handleDomEvent('submit', event), true);
}

function handleDomEvent(type: TriggerEventType, event: Event): void {
  const target = event.target instanceof Element ? event.target : null;
  const selector = target ? getCssSelector(target) : 'unknown';
  const text = target ? normalizeText(target.textContent || target.getAttribute('aria-label')) : undefined;

  trackedEvents.push({
    event: type,
    selector,
    text,
    timestamp: Date.now(),
  });

  if (trackedEvents.length > TRACKED_EVENTS_LIMIT) {
    trackedEvents.shift();
  }

  pruneOldEvents();
}

function pruneOldEvents(): void {
  const cutoff = Date.now() - EVENT_KEEP_WINDOW_MS;
  while (trackedEvents.length > 0 && trackedEvents[0].timestamp < cutoff) {
    trackedEvents.shift();
  }
}

function onPageCaptureMessage(event: MessageEvent): void {
  if (event.source !== window || !event.data || typeof event.data !== 'object') {
    return;
  }

  if (typeof event.data.type !== 'string' || !event.data.type.startsWith(NEO_MESSAGE_PREFIX)) {
    return;
  }

  if (event.data.type !== NEO_CAPTURE_MESSAGE_TYPE) {
    return;
  }

  const payload = event.data.payload as CapturedRequest | undefined;
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const enriched: CapturedRequest = {
    ...payload,
    tabId: -1,
    tabUrl: payload.tabUrl || window.location.href,
    trigger: payload.trigger || findTriggerForTimestamp(payload.timestamp),
  };

  chrome.runtime.sendMessage({ type: NEO_CAPTURE_MESSAGE_TYPE, payload: enriched }).catch(() => {});
}

function findTriggerForTimestamp(timestamp: number): TriggerInfo | undefined {
  pruneOldEvents();
  for (let i = trackedEvents.length - 1; i >= 0; i--) {
    const item = trackedEvents[i];
    const diff = timestamp - item.timestamp;
    if (diff >= 0 && diff <= EVENT_CORRELATION_WINDOW_MS) {
      return {
        event: item.event,
        selector: item.selector,
        text: item.text,
        timestamp: item.timestamp,
      };
    }
  }

  return undefined;
}

function getCssSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }

  const path: string[] = [];
  let node: Element | null = element;
  let depth = 0;

  while (node && node.nodeType === Node.ELEMENT_NODE && depth < 8) {
    let selector = node.nodeName.toLowerCase();
    const parentEl: Element | null = node.parentElement;

    if (node.className && typeof node.className === 'string') {
      const classes = node.className.split(' ').filter(Boolean).slice(0, 2);
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
    }

    if (parentEl) {
      const currentNode = node;
      const sameTypeNodes = [...parentEl.children].filter((child) => child.nodeName === currentNode.nodeName);
      if (sameTypeNodes.length > 1) {
        const index = sameTypeNodes.indexOf(node);
        selector += `:nth-child(${index + 1})`;
      }
    }

    path.unshift(selector);
    node = parentEl;
    depth += 1;
  }

  return path.join(' > ');
}

function normalizeText(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.slice(0, 120);
}
