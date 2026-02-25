import { db } from '../db';
import { CapturedRequest } from '../types';

interface DomainSummary {
  domain: string;
  count: number;
}

const domainListEl = document.getElementById('domainList') as HTMLDivElement;
const requestListEl = document.getElementById('requestList') as HTMLDivElement;
const requestDetailEl = document.getElementById('requestDetail') as HTMLPreElement;
const requestTitleEl = document.getElementById('requestTitle') as HTMLHeadingElement;
const summaryEl = document.getElementById('summary') as HTMLSpanElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement;
const copyButtonsEl = document.getElementById('copyButtons') as HTMLDivElement;
const copyCurlBtn = document.getElementById('copyCurlBtn') as HTMLButtonElement;
const copyNeoBtn = document.getElementById('copyNeoBtn') as HTMLButtonElement;

let activeDomain: string | null = null;
let currentCalls: CapturedRequest[] = [];
let selectedCall: CapturedRequest | null = null;

refreshBtn.addEventListener('click', () => {
  void render();
});

copyCurlBtn.addEventListener('click', () => {
  if (selectedCall) copyToClipboard(toCurl(selectedCall), copyCurlBtn);
});

copyNeoBtn.addEventListener('click', () => {
  if (selectedCall) copyToClipboard(toNeoExec(selectedCall), copyNeoBtn);
});

void render();

async function render(): Promise<void> {
  const allCalls = await db.capturedRequests.orderBy('timestamp').reverse().toArray();
  summaryEl.textContent = `共 ${allCalls.length} 条记录`;
  renderDomainList(allCalls);

  if (activeDomain) {
    await renderCallsForDomain(activeDomain);
  } else if (allCalls.length > 0) {
    const latestDomain = allCalls[0]?.domain;
    if (latestDomain) {
      activeDomain = latestDomain;
      await renderCallsForDomain(latestDomain);
    }
  } else {
    requestListEl.innerHTML = '<p style="color: #94a3b8;">先访问页面并触发接口后会显示内容</p>';
    requestDetailEl.textContent = '请选择一条 API 调用查看详情';
    requestTitleEl.textContent = 'API Calls';
    activeDomain = null;
  }
}

function renderDomainList(allCalls: CapturedRequest[]): void {
  const grouped = new Map<string, number>();

  for (const item of allCalls) {
    grouped.set(item.domain, (grouped.get(item.domain) || 0) + 1);
  }

  const domainSummaries: DomainSummary[] = Array.from(grouped.entries())
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);

  domainListEl.innerHTML = '';

  if (domainSummaries.length === 0) {
    domainListEl.innerHTML = '<p style="color: #94a3b8;">暂无捕获到 API</p>';
    return;
  }

  for (const item of domainSummaries) {
    const button = document.createElement('button');
    button.className = `domain-item${activeDomain === item.domain ? ' active' : ''}`;
    button.innerHTML = `<div class="domain-line"><span class="domain-name">${escapeHtml(item.domain)}</span><span class="domain-count">${item.count}</span></div>`;

    button.addEventListener('click', () => {
      activeDomain = item.domain;
      void renderCallsForDomain(item.domain);
      render();
    });

    domainListEl.appendChild(button);
  }
}

async function renderCallsForDomain(domain: string): Promise<void> {
  requestTitleEl.textContent = `API Calls · ${domain}`;

  const calls = await db.capturedRequests.where('domain').equals(domain).toArray();
  currentCalls = calls.sort((a, b) => b.timestamp - a.timestamp);

  requestListEl.innerHTML = '';

  if (currentCalls.length === 0) {
    requestListEl.innerHTML = '<p style="color: #94a3b8;">该域名暂无请求</p>';
    requestDetailEl.textContent = '请选择一条 API 调用查看详情';
    return;
  }

  for (const call of currentCalls) {
    const button = document.createElement('button');
    button.className = 'call-item';
    const isWs = call.method.startsWith('WS_');
    const isSse = call.method.startsWith('SSE_');
    const isRealtime = isWs || isSse;
    const methodLabel = isRealtime ? `${isWs ? '🔌' : '📡'} ${call.method}` : call.method.toUpperCase();
    const statusLabel = isRealtime ? '' : `<span class="domain-count">${call.responseStatus || 0}</span>`;
    button.innerHTML = `
      <div>
        <strong${isWs ? ' style="color:#a78bfa"' : isSse ? ' style="color:#34d399"' : ''}>${escapeHtml(methodLabel)}</strong>
        ${statusLabel}
        <span style="float:right">${formatTime(call.timestamp)}</span>
      </div>
      <div class="call-url">${escapeHtml(call.url)}</div>
    `;

    button.addEventListener('click', () => {
      selectedCall = call;
      const isWsCall = call.method.startsWith('WS_');
      const isSseCall = call.method.startsWith('SSE_');
      copyButtonsEl.style.display = (isWsCall || isSseCall) ? 'none' : 'flex';
      requestDetailEl.textContent = JSON.stringify(formatForDisplay(call), null, 2);
      [...requestListEl.querySelectorAll('.call-item')].forEach((element) => {
        (element as HTMLButtonElement).style.background = '';
      });
      button.style.background = 'rgba(56, 189, 248, 0.2)';
    });

    requestListEl.appendChild(button);
  }

  requestDetailEl.textContent = JSON.stringify(formatForDisplay(currentCalls[0]), null, 2);
  selectedCall = currentCalls[0];
  copyButtonsEl.style.display = 'flex';
}

function formatForDisplay(call: CapturedRequest): Record<string, unknown> {
  return {
    id: call.id,
    timestamp: new Date(call.timestamp).toISOString(),
    domain: call.domain,
    method: call.method,
    url: call.url,
    source: call.source,
    durationMs: call.duration,
    status: call.responseStatus,
    tabUrl: call.tabUrl,
    tabId: call.tabId,
    trigger: call.trigger,
    requestHeaders: call.requestHeaders,
    requestBody: call.requestBody,
    responseHeaders: call.responseHeaders,
    responseBody: call.responseBody,
  };
}

function formatTime(time: number): string {
  return new Date(time).toLocaleTimeString();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9_\-./=:@]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function toCurl(call: CapturedRequest): string {
  const parts = ['curl'];
  if (call.method.toUpperCase() !== 'GET') {
    parts.push(`-X ${call.method.toUpperCase()}`);
  }
  parts.push(shellEscape(call.url));

  const skipHeaders = new Set(['host', 'content-length', 'connection']);
  for (const [k, v] of Object.entries(call.requestHeaders || {})) {
    if (!skipHeaders.has(k.toLowerCase())) {
      parts.push(`-H ${shellEscape(`${k}: ${v}`)}`);
    }
  }

  if (call.requestBody) {
    const body = typeof call.requestBody === 'string' ? call.requestBody : JSON.stringify(call.requestBody);
    parts.push(`-d ${shellEscape(body)}`);
  }

  return parts.join(' \\\n  ');
}

function toNeoExec(call: CapturedRequest): string {
  const parts = ['neo exec'];
  parts.push(call.method.toUpperCase());
  parts.push(shellEscape(call.url));
  parts.push('--auto-headers');

  if (call.requestBody) {
    const body = typeof call.requestBody === 'string' ? call.requestBody : JSON.stringify(call.requestBody);
    parts.push(`--body ${shellEscape(body)}`);
  }

  return parts.join(' \\\n  ');
}

function copyToClipboard(text: string, btn: HTMLButtonElement): void {
  void navigator.clipboard.writeText(text).then(() => {
    const original = btn.textContent;
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('copied');
    }, 1500);
  });
}
