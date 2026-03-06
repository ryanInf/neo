#!/usr/bin/env node
// Minimal test suite for neo.cjs pure functions
// Run: node tools/neo.test.cjs

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
let pass = 0, fail = 0;
const pendingTests = [];

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      pendingTests.push(
        result
          .then(() => {
            pass++;
            console.log(`  ✓ ${name}`);
          })
          .catch((e) => {
            fail++;
            console.log(`  ✗ ${name}: ${e.message}`);
          })
      );
      return;
    }
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${name}: ${e.message}`);
  }
}

// ─── Extract functions (copy-paste to keep neo.cjs untouched) ───

const AUTH_HEADER_PATTERNS = [
  'authorization', 'x-csrf-token', 'x-twitter-auth-type', 'x-twitter-active-user',
  'x-twitter-client-language', 'x-client-transaction-id', 'x-requested-with',
  'github-verified-fetch', 'x-fetch-nonce', 'x-github-client-version',
  'x-api-key', 'api-key',
];

const REDACTED_HEADER_VALUE = '[REDACTED]';
const AUTH_HEADER_REGEX = /token|auth|key|secret|session/i;
const CDP_URL = 'http://localhost:9222';
const NEO_EXTENSION_ID = null;
const EXTENSION_ID_CACHE_FILE = path.join(os.tmpdir(), `neo-ext-id-test-${process.pid}`);
const SESSION_FILE = path.join(os.tmpdir(), `neo-sessions-test-${process.pid}.json`);
const DEFAULT_SESSION_NAME = '__default__';
const ELECTRON_APPS = Object.freeze({
  slack: Object.freeze(['/usr/bin/slack', 'slack']),
  code: Object.freeze(['/usr/bin/code', 'code']),
  vscode: Object.freeze(['/usr/bin/code', 'code']),
  discord: Object.freeze(['/usr/bin/discord', 'discord']),
  notion: Object.freeze(['/usr/bin/notion', 'notion']),
  figma: Object.freeze([]),
  feishu: Object.freeze(['/opt/bytedance/feishu/feishu', 'feishu']),
});

function isAuthHeader(name) {
  const lk = String(name || '').toLowerCase();
  if (!lk) return false;
  if (lk === 'authorization' || lk === 'cookie' || lk === 'x-csrf-token') return true;
  return AUTH_HEADER_PATTERNS.includes(lk)
    || lk.startsWith('x-csrf')
    || lk.startsWith('x-api')
    || lk.startsWith('x-twitter')
    || AUTH_HEADER_REGEX.test(lk);
}

function findHeaderKey(headers, name) {
  const target = String(name || '').toLowerCase();
  for (const key of Object.keys(headers || {})) {
    if (key.toLowerCase() === target) return key;
  }
  return null;
}

function redactAuthHeaders(headers) {
  const redacted = {};
  for (const [name, value] of Object.entries(headers || {})) {
    redacted[name] = isAuthHeader(name) ? REDACTED_HEADER_VALUE : String(value);
  }
  return redacted;
}

function extractAuthHeaders(headers) {
  const selected = {};
  for (const [name, value] of Object.entries(headers || {})) {
    if (!isAuthHeader(name)) continue;
    if (String(value) === REDACTED_HEADER_VALUE) continue;
    selected[name] = String(value);
  }
  return selected;
}

function applyExportAuthPolicy(capture, liveHeadersByDomain = {}, includeAuth = false) {
  const headers = { ...(capture.requestHeaders || {}) };
  const live = extractAuthHeaders(liveHeadersByDomain[capture.domain] || {});
  const merged = {};

  for (const [name, value] of Object.entries(headers)) {
    if (!isAuthHeader(name)) {
      merged[name] = String(value);
      continue;
    }

    if (!includeAuth) {
      merged[name] = REDACTED_HEADER_VALUE;
      continue;
    }

    const liveKey = findHeaderKey(live, name);
    merged[name] = liveKey ? live[liveKey] : REDACTED_HEADER_VALUE;
  }

  if (includeAuth) {
    for (const [name, value] of Object.entries(live)) {
      if (!findHeaderKey(merged, name)) {
        merged[name] = value;
      }
    }
  }

  return {
    ...capture,
    requestHeaders: merged,
  };
}

function parseDuration(str) {
  const m = String(str).match(/^(\d+)\s*(s|m|h|d)$/);
  if (!m) return parseInt(str) || 0;
  const n = parseInt(m[1]);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2]];
  return n * unit;
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  let sessionName = DEFAULT_SESSION_NAME;
  for (let i = 0; i < argv.length; i++) {
    const current = argv[i];
    if (current.startsWith('--')) {
      const eqIndex = current.indexOf('=');
      const hasInlineValue = eqIndex > 2;
      const key = hasInlineValue ? current.slice(2, eqIndex) : current.slice(2);
      const inlineValue = hasInlineValue ? current.slice(eqIndex + 1) : null;
      const next = argv[i + 1];
      if (key === 'session') {
        if (hasInlineValue) {
          sessionName = inlineValue || DEFAULT_SESSION_NAME;
        } else if (next && !next.startsWith('--')) {
          sessionName = next;
          i++;
        } else {
          sessionName = DEFAULT_SESSION_NAME;
        }
        continue;
      }
      if (hasInlineValue) {
        flags[key] = inlineValue;
      } else if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(current);
    }
  }
  return { positional, flags, sessionName };
}

function stripGlobalSessionFlag(argv) {
  const clean = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--session') {
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) i++;
      continue;
    }
    if (arg.startsWith('--session=')) continue;
    clean.push(arg);
  }
  return clean;
}

function loadSessions() {
  if (!fs.existsSync(SESSION_FILE)) return {};
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  const safeSessions = (!sessions || typeof sessions !== 'object' || Array.isArray(sessions))
    ? {}
    : sessions;
  fs.writeFileSync(SESSION_FILE, `${JSON.stringify(safeSessions, null, 2)}\n`, 'utf8');
}

function getSession(name = DEFAULT_SESSION_NAME) {
  const sessions = loadSessions();
  return sessions[name] || null;
}

function setSession(name = DEFAULT_SESSION_NAME, data = {}) {
  const sessions = loadSessions();
  sessions[name] = (!data || typeof data !== 'object' || Array.isArray(data)) ? {} : data;
  saveSessions(sessions);
  return sessions[name];
}

function shellEscape(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

function resolveCommandPath(commandName, deps = {}) {
  const execSyncFn = typeof deps.execSync === 'function' ? deps.execSync : () => '';
  const name = String(commandName || '').trim();
  if (!name || name.includes('/')) return null;
  try {
    const output = String(execSyncFn(`command -v ${shellEscape(name)}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      shell: '/bin/sh',
    }) || '');
    const resolved = output.trim().split('\n')[0];
    return resolved || null;
  } catch {
    return null;
  }
}

function detectChromeBinaryPath(deps = {}) {
  const resolveCommandPathFn = typeof deps.resolveCommandPath === 'function' ? deps.resolveCommandPath : resolveCommandPath;
  const existsSyncFn = typeof deps.existsSync === 'function' ? deps.existsSync : () => false;
  const platform = deps.platform || process.platform;
  const candidates = ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium'];

  for (const candidate of candidates) {
    const resolved = resolveCommandPathFn(candidate);
    if (resolved) return resolved;
  }

  if (platform === 'darwin') {
    const macChromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (existsSyncFn(macChromePath)) return macChromePath;
  }

  return null;
}

function copyDirectoryRecursive(sourceDir, destinationDir, deps = {}) {
  const existsSyncFn = typeof deps.existsSync === 'function' ? deps.existsSync : fs.existsSync;
  const mkdirSyncFn = typeof deps.mkdirSync === 'function' ? deps.mkdirSync : fs.mkdirSync;
  const readdirSyncFn = typeof deps.readdirSync === 'function' ? deps.readdirSync : fs.readdirSync;
  const copyFileSyncFn = typeof deps.copyFileSync === 'function' ? deps.copyFileSync : fs.copyFileSync;
  if (!existsSyncFn(sourceDir)) {
    throw new Error(`Missing extension source directory: ${sourceDir}`);
  }

  mkdirSyncFn(destinationDir, { recursive: true });
  const entries = readdirSyncFn(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(destinationDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath, deps);
      continue;
    }
    if (entry.isFile()) {
      copyFileSyncFn(srcPath, destPath);
    }
  }
}

function parseExtensionIdFromUrl(url) {
  const match = String(url || '').match(/^chrome-extension:\/\/([a-z]{32})\//i);
  if (!match) return null;
  return match[1].toLowerCase();
}

function findServiceWorkerByExtensionId(serviceWorkers, extensionId) {
  const expected = String(extensionId || '').trim().toLowerCase();
  if (!expected) return null;
  const workers = Array.isArray(serviceWorkers) ? serviceWorkers : [];
  for (const worker of workers) {
    const found = parseExtensionIdFromUrl(worker && worker.url);
    if (found === expected) return worker;
  }
  return null;
}

async function findExtensionServiceWorker(deps = {}) {
  const fetchFn = typeof deps.fetch === 'function' ? deps.fetch : async () => ({ ok: false, json: async () => [] });
  const cdpEvalFn = typeof deps.cdpEval === 'function' ? deps.cdpEval : async () => null;
  const existsSyncFn = typeof deps.existsSync === 'function' ? deps.existsSync : () => false;
  const readFileSyncFn = typeof deps.readFileSync === 'function' ? deps.readFileSync : () => '';
  const writeFileSyncFn = typeof deps.writeFileSync === 'function' ? deps.writeFileSync : () => {};
  const cdpUrl = deps.cdpUrl || CDP_URL;
  const extensionId = deps.extensionId !== undefined ? deps.extensionId : NEO_EXTENSION_ID;
  const extensionIdCacheFile = deps.extensionIdCacheFile || EXTENSION_ID_CACHE_FILE;
  try {
    const resp = await fetchFn(`${cdpUrl}/json/list`);
    if (!resp || !resp.ok) return null;
    const tabs = await resp.json();
    const serviceWorkers = (Array.isArray(tabs) ? tabs : [])
      .filter(t => t && t.type === 'service_worker' && typeof t.webSocketDebuggerUrl === 'string' && t.webSocketDebuggerUrl.trim());

    if (extensionId) {
      return findServiceWorkerByExtensionId(serviceWorkers, extensionId);
    }

    let cachedExtensionId = '';
    try {
      if (existsSyncFn(extensionIdCacheFile)) {
        cachedExtensionId = String(readFileSyncFn(extensionIdCacheFile, 'utf8') || '').trim();
      }
    } catch {}

    if (cachedExtensionId) {
      const cachedWorker = findServiceWorkerByExtensionId(serviceWorkers, cachedExtensionId);
      if (cachedWorker) return cachedWorker;
    }

    for (const worker of serviceWorkers) {
      try {
        const manifestName = await cdpEvalFn(worker.webSocketDebuggerUrl, 'chrome.runtime.getManifest().name', 5000);
        if (manifestName !== 'Neo') continue;
        const discoveredId = parseExtensionIdFromUrl(worker.url);
        if (discoveredId) {
          try {
            writeFileSyncFn(extensionIdCacheFile, `${discoveredId}\n`, 'utf8');
          } catch {}
        }
        return worker;
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

async function findExtensionWs(deps = {}) {
  const worker = await findExtensionServiceWorker(deps);
  if (!worker || !worker.webSocketDebuggerUrl) return null;
  return worker.webSocketDebuggerUrl;
}

async function isSessionMode(sessionName = DEFAULT_SESSION_NAME, deps = {}) {
  const getSessionFn = typeof deps.getSession === 'function' ? deps.getSession : getSession;
  const findExtensionWsFn = typeof deps.findExtensionWs === 'function' ? deps.findExtensionWs : findExtensionWs;
  const normalizedSessionName = sessionName || DEFAULT_SESSION_NAME;
  const session = getSessionFn(normalizedSessionName);
  if (!session || typeof session.pageWsUrl !== 'string' || !session.pageWsUrl.trim()) {
    return false;
  }
  if (deps.extensionWsUrl !== undefined) {
    return !deps.extensionWsUrl;
  }
  const cdpUrl = deps.cdpUrl || session.cdpUrl || CDP_URL;
  const extensionWsUrl = await findExtensionWsFn({ cdpUrl });
  return !extensionWsUrl;
}

function applySessionCaptureFilters(captures, filters = {}) {
  if (!Array.isArray(captures)) return [];
  const config = (filters && typeof filters === 'object' && !Array.isArray(filters)) ? filters : {};
  let rows = captures.slice();

  if (config.domain) {
    const expected = String(config.domain);
    rows = rows.filter(item => String(item && item.domain || '') === expected);
  }
  if (config.method) {
    const expectedMethod = String(config.method).toUpperCase();
    rows = rows.filter(item => String(item && item.method || '').toUpperCase() === expectedMethod);
  }
  if (config.status !== undefined && config.status !== null && config.status !== '') {
    const expectedStatus = Number(config.status);
    rows = rows.filter(item => Number(item && item.responseStatus) === expectedStatus);
  }
  if (config.query) {
    const needle = String(config.query);
    rows = rows.filter((item) => {
      const url = String(item && item.url || '');
      const domain = String(item && item.domain || '');
      return url.includes(needle) || domain.includes(needle);
    });
  }
  if (config.id) {
    const targetId = String(config.id);
    rows = rows.filter(item => String(item && item.id || '') === targetId);
  }
  if (config.idPrefix) {
    const targetPrefix = String(config.idPrefix);
    rows = rows.filter(item => String(item && item.id || '').startsWith(targetPrefix));
  }
  if (config.since) {
    const sinceTs = Number(config.since) || 0;
    rows = rows.filter(item => (Number(item && item.timestamp) || 0) >= sinceTs);
  }
  if (config.sort === 'timestamp-desc') {
    rows.sort((a, b) => (Number(b && b.timestamp) || 0) - (Number(a && a.timestamp) || 0));
  }

  const limit = Number(config.limit);
  if (Number.isFinite(limit) && limit > 0) {
    rows = rows.slice(0, limit);
  }

  return rows;
}

function normalizeElectronAppName(appName) {
  const normalized = String(appName || '').trim().toLowerCase();
  if (normalized === 'vscode') return 'code';
  return normalized;
}

function resolveElectronExecutable(appName, deps = {}) {
  const existsSyncFn = typeof deps.existsSync === 'function' ? deps.existsSync : () => false;
  const commandExistsFn = typeof deps.commandExists === 'function' ? deps.commandExists : () => false;
  const normalizedName = normalizeElectronAppName(appName);
  if (!normalizedName || !Object.prototype.hasOwnProperty.call(ELECTRON_APPS, normalizedName)) {
    return {
      app: normalizedName,
      executable: null,
      error: 'unknown-app',
      candidates: [],
    };
  }
  const candidates = Array.isArray(ELECTRON_APPS[normalizedName]) ? ELECTRON_APPS[normalizedName] : [];
  if (!candidates.length) {
    return {
      app: normalizedName,
      executable: null,
      error: 'unsupported-on-linux',
      candidates,
    };
  }
  for (const candidate of candidates) {
    if (candidate.includes('/')) {
      if (existsSyncFn(candidate)) {
        return { app: normalizedName, executable: candidate, error: null, candidates };
      }
      continue;
    }
    if (commandExistsFn(candidate)) {
      return { app: normalizedName, executable: candidate, error: null, candidates };
    }
  }
  return {
    app: normalizedName,
    executable: null,
    error: 'executable-not-found',
    candidates,
  };
}

function shellEscape(value) {
  return `'${String(value || '').replace(/'/g, `'\\''`)}'`;
}

function extractRemoteDebugPort(text) {
  const input = String(text || '');
  const match = input.match(/--remote-debugging-port(?:=|\s+)(\d{1,5})/);
  if (!match) return null;
  const port = parseInt(match[1], 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return port;
}

function findElectronDebugPort(appName, deps = {}) {
  const execSyncFn = typeof deps.execSync === 'function' ? deps.execSync : () => {
    throw new Error('execSync stub required');
  };
  const normalized = String(appName || '').trim();
  if (!normalized) return null;
  const command = `ps aux | grep ${shellEscape(normalized)} | grep -- '--remote-debugging-port' | grep -v grep`;
  try {
    const output = String(execSyncFn(command) || '');
    return extractRemoteDebugPort(output);
  } catch {
    return null;
  }
}

function parseTabTargets(targets) {
  const source = Array.isArray(targets) ? targets : [];
  return source.map((target, index) => {
    const item = target && typeof target === 'object' ? target : {};
    const id = item.id || item.targetId || '';
    return {
      index,
      type: String(item.type || 'unknown'),
      id: String(id || ''),
      title: String(item.title || ''),
      url: String(item.url || ''),
      webSocketDebuggerUrl: String(item.webSocketDebuggerUrl || ''),
    };
  });
}

function findTabTargetByUrlPattern(targets, pattern) {
  const list = Array.isArray(targets) ? targets : [];
  const input = String(pattern || '');
  if (!input) return null;
  return list.find(target => target.url.includes(input)) || null;
}

function loadInjectScriptSource(deps = {}) {
  const existsSyncFn = typeof deps.existsSync === 'function' ? deps.existsSync : () => false;
  const readFileSyncFn = typeof deps.readFileSync === 'function' ? deps.readFileSync : () => '';
  const rootDir = deps.rootDir || '/tmp/project';
  const primary = path.join(rootDir, 'extension', 'inject.js');
  const fallback = path.join(rootDir, 'extension-dist', 'content.js');

  if (existsSyncFn(primary)) {
    return { sourcePath: primary, source: readFileSyncFn(primary, 'utf8') };
  }
  if (existsSyncFn(fallback)) {
    return { sourcePath: fallback, source: readFileSyncFn(fallback, 'utf8') };
  }
  throw new Error(`Inject script not found. Tried: ${primary} and ${fallback}`);
}

function buildInjectScript(sourceCode) {
  const raw = String(sourceCode || '');
  return `(function() {
  try {
    if (!Array.isArray(globalThis.__NEO_CAPTURES__)) {
      globalThis.__NEO_CAPTURES__ = [];
    }
    if (!globalThis.__NEO_CAPTURE_MESSAGE_LISTENER__) {
      globalThis.__NEO_CAPTURE_MESSAGE_LISTENER__ = function(event) {
        try {
          var data = event && event.data;
          if (!data || data.type !== '__neo_capture_request' || !data.payload) return;
          globalThis.__NEO_CAPTURES__.push(data.payload);
          if (globalThis.__NEO_CAPTURES__.length > 500) {
            globalThis.__NEO_CAPTURES__.shift();
          }
        } catch {}
      };
      window.addEventListener('message', globalThis.__NEO_CAPTURE_MESSAGE_LISTENER__);
    }
    if (typeof globalThis.__neoMiniReporter !== 'function') {
      globalThis.__neoMiniReporter = function(event, payload) {
        try {
          console.debug('[neo:inject]', event, payload || {});
        } catch {}
      };
    }
    globalThis.__neoMiniReporter('inject:start', { captures: globalThis.__NEO_CAPTURES__.length });
    (function() {
${raw}
    }).call(globalThis);
    globalThis.__neoMiniReporter('inject:ready', { captures: globalThis.__NEO_CAPTURES__.length });
    return { ok: true, captures: globalThis.__NEO_CAPTURES__.length };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message ? error.message : error),
    };
  }
})();`;
}

function resetSessionFile() {
  try { fs.unlinkSync(SESSION_FILE); } catch {}
}

function axValueToString(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'object' && value.value !== undefined && value.value !== null) {
    return String(value.value);
  }
  return '';
}

function assignRefs(axTreeNodes) {
  const sourceNodes = Array.isArray(axTreeNodes) ? axTreeNodes.filter(node => node && typeof node === 'object') : [];
  const nodeById = new Map();
  const childIds = new Set();

  for (const node of sourceNodes) {
    if (node.nodeId === undefined || node.nodeId === null) continue;
    nodeById.set(String(node.nodeId), node);
  }

  for (const node of sourceNodes) {
    for (const childId of Array.isArray(node.childIds) ? node.childIds : []) {
      childIds.add(String(childId));
    }
  }

  const roots = sourceNodes.filter((node) => {
    if (node.nodeId === undefined || node.nodeId === null) return true;
    return !childIds.has(String(node.nodeId));
  });

  const visited = new Set();
  const nodes = [];
  const refs = {};
  let nextRef = 1;

  function visit(node, depth) {
    if (!node || typeof node !== 'object') return;
    if (visited.has(node)) return;
    visited.add(node);

    const ref = `@e${nextRef++}`;
    const role = axValueToString(node.role).trim().toLowerCase() || 'unknown';
    const name = axValueToString(node.name).replace(/\s+/g, ' ').trim();
    const backendDOMNodeId = Number.isInteger(node.backendDOMNodeId) ? node.backendDOMNodeId : null;
    const bounds = node.bounds && typeof node.bounds === 'object' ? node.bounds : null;

    nodes.push({ ref, depth, role, name, backendDOMNodeId, bounds });
    refs[ref] = { backendDOMNodeId, role, name, bounds };

    for (const childId of Array.isArray(node.childIds) ? node.childIds : []) {
      const childNode = nodeById.get(String(childId));
      if (childNode) visit(childNode, depth + 1);
    }
  }

  for (const root of roots) visit(root, 0);
  for (const node of sourceNodes) {
    if (!visited.has(node)) visit(node, 0);
  }

  return { nodes, refs };
}

function formatSnapshot(nodes) {
  const rows = [];
  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (!node || typeof node !== 'object') continue;
    const depth = Number.isInteger(node.depth) && node.depth > 0 ? node.depth : 0;
    const indent = '  '.repeat(depth);
    const ref = String(node.ref || '@e?');
    const role = String(node.role || 'unknown');
    const name = String(node.name || '').replace(/\s+/g, ' ').trim().replace(/"/g, '\\"');
    rows.push(`${indent}${ref}  [${role}] "${name}"`);
  }
  return rows.join('\n');
}

function getBackendNodeIdFromRef(session, ref) {
  const normalizedRef = String(ref || '');
  if (!normalizedRef.startsWith('@')) {
    throw new Error(`Invalid ref: ${ref}`);
  }
  const refs = session && typeof session === 'object' && session.refs && typeof session.refs === 'object'
    ? session.refs
    : {};
  const backendDOMNodeId = refs[normalizedRef] && Number.isInteger(refs[normalizedRef].backendDOMNodeId)
    ? refs[normalizedRef].backendDOMNodeId
    : null;
  if (!backendDOMNodeId) {
    throw new Error(`Unknown ref: ${normalizedRef}. Run neo snapshot first`);
  }
  return backendDOMNodeId;
}

function centerFromQuad(quad) {
  if (!Array.isArray(quad) || quad.length < 8) return null;
  const xs = [quad[0], quad[2], quad[4], quad[6]].map(Number).filter(Number.isFinite);
  const ys = [quad[1], quad[3], quad[5], quad[7]].map(Number).filter(Number.isFinite);
  if (xs.length !== 4 || ys.length !== 4) return null;
  const x = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const y = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  return { x, y };
}

async function resolveRef(sessionName, ref, deps = {}) {
  const getSessionFn = typeof deps.getSession === 'function' ? deps.getSession : getSession;
  const sendFn = typeof deps.cdpSend === 'function' ? deps.cdpSend : (() => Promise.reject(new Error('Missing cdpSend stub')));
  const normalizedSessionName = sessionName || DEFAULT_SESSION_NAME;
  const session = getSessionFn(normalizedSessionName);
  if (!session || !session.pageWsUrl) {
    throw new Error('Run neo connect [port] first');
  }

  const backendDOMNodeId = getBackendNodeIdFromRef(session, ref);
  const resolved = await sendFn(session.pageWsUrl, 'DOM.resolveNode', { backendNodeId: backendDOMNodeId });
  const objectId = resolved && resolved.object && resolved.object.objectId;
  if (!objectId) {
    throw new Error(`Failed to resolve node for ${ref}`);
  }

  const boxModel = await sendFn(session.pageWsUrl, 'DOM.getBoxModel', { objectId });
  const quad = boxModel && boxModel.model && boxModel.model.content;
  const center = centerFromQuad(quad);
  if (!center) {
    throw new Error(`Failed to get box model for ${ref}`);
  }

  return {
    objectId,
    x: center.x,
    y: center.y,
    backendDOMNodeId,
  };
}

const PRESS_KEY_MAP = {
  enter: { key: 'Enter', code: 'Enter' },
  tab: { key: 'Tab', code: 'Tab' },
  escape: { key: 'Escape', code: 'Escape' },
  esc: { key: 'Escape', code: 'Escape' },
  backspace: { key: 'Backspace', code: 'Backspace' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp' },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown' },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft' },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight' },
  space: { key: ' ', code: 'Space', text: ' ' },
  delete: { key: 'Delete', code: 'Delete' },
  home: { key: 'Home', code: 'Home' },
  end: { key: 'End', code: 'End' },
  pageup: { key: 'PageUp', code: 'PageUp' },
  pagedown: { key: 'PageDown', code: 'PageDown' },
};

function parsePressKey(rawKey) {
  const input = String(rawKey || '').trim();
  if (!input) return null;

  const parts = input.split('+').map(part => part.trim()).filter(Boolean);
  if (!parts.length) return null;

  const keyPart = parts.pop();
  const lowerKey = String(keyPart || '').toLowerCase();
  let mapped = PRESS_KEY_MAP[lowerKey] ? { ...PRESS_KEY_MAP[lowerKey] } : null;

  if (!mapped && /^[a-z]$/i.test(keyPart)) {
    const char = keyPart.toLowerCase();
    mapped = { key: char, code: `Key${char.toUpperCase()}` };
  }

  if (!mapped) return null;

  let modifiers = 0;
  for (const token of parts) {
    const lower = token.toLowerCase();
    if (lower === 'ctrl' || lower === 'control') {
      modifiers |= 2;
      continue;
    }
    if (lower === 'alt') {
      modifiers |= 1;
      continue;
    }
    if (lower === 'meta' || lower === 'cmd' || lower === 'command') {
      modifiers |= 4;
      continue;
    }
    if (lower === 'shift') {
      modifiers |= 8;
      continue;
    }
    return null;
  }

  if (modifiers) mapped.modifiers = modifiers;
  return mapped;
}

// ─── Tests ──────────────────────────────────────────────────────

console.log('\nisAuthHeader:');
test('recognizes authorization', () => assert(isAuthHeader('Authorization')));
test('recognizes x-csrf-token', () => assert(isAuthHeader('X-CSRF-Token')));
test('recognizes x-api-key', () => assert(isAuthHeader('x-api-key')));
test('recognizes x-twitter-* prefix', () => assert(isAuthHeader('x-twitter-something')));
test('recognizes cookie', () => assert(isAuthHeader('Cookie')));
test('matches token regex', () => assert(isAuthHeader('x-access-token')));
test('matches auth regex', () => assert(isAuthHeader('x-service-auth')));
test('matches key regex', () => assert(isAuthHeader('client-key')));
test('matches secret regex', () => assert(isAuthHeader('x-secret-value')));
test('matches session regex', () => assert(isAuthHeader('session-id')));
test('rejects content-type', () => assert(!isAuthHeader('Content-Type')));
test('rejects accept', () => assert(!isAuthHeader('Accept')));
test('rejects user-agent', () => assert(!isAuthHeader('User-Agent')));

console.log('\nredactAuthHeaders:');
test('redacts known auth headers and keeps normal headers', () => {
  const headers = redactAuthHeaders({
    Authorization: 'Bearer abc',
    Cookie: 'session=123',
    Accept: 'application/json',
  });
  assert.strictEqual(headers.Authorization, REDACTED_HEADER_VALUE);
  assert.strictEqual(headers.Cookie, REDACTED_HEADER_VALUE);
  assert.strictEqual(headers.Accept, 'application/json');
});
test('redacts regex-matched auth headers', () => {
  const headers = redactAuthHeaders({
    'x-session-id': 's1',
    'x-secret-key': 'k1',
    'x-custom-token': 't1',
  });
  assert.strictEqual(headers['x-session-id'], REDACTED_HEADER_VALUE);
  assert.strictEqual(headers['x-secret-key'], REDACTED_HEADER_VALUE);
  assert.strictEqual(headers['x-custom-token'], REDACTED_HEADER_VALUE);
});

console.log('\nexport auth policy:');
test('export redacts auth headers by default', () => {
  const cap = {
    domain: 'api.example.com',
    requestHeaders: {
      Authorization: 'Bearer legacy',
      'x-csrf-token': 'csrf-legacy',
      Accept: 'application/json',
    }
  };
  const out = applyExportAuthPolicy(cap, {}, false);
  assert.strictEqual(out.requestHeaders.Authorization, REDACTED_HEADER_VALUE);
  assert.strictEqual(out.requestHeaders['x-csrf-token'], REDACTED_HEADER_VALUE);
  assert.strictEqual(out.requestHeaders.Accept, 'application/json');
});
test('export include-auth uses live headers (not stored values)', () => {
  const cap = {
    domain: 'api.example.com',
    requestHeaders: {
      Authorization: 'Bearer old-token',
      'x-csrf-token': REDACTED_HEADER_VALUE,
      Accept: 'application/json',
    }
  };
  const out = applyExportAuthPolicy(cap, {
    'api.example.com': {
      Authorization: 'Bearer live-token',
      'x-csrf-token': 'live-csrf',
      Cookie: 'session=live',
    }
  }, true);
  assert.strictEqual(out.requestHeaders.Authorization, 'Bearer live-token');
  assert.strictEqual(out.requestHeaders['x-csrf-token'], 'live-csrf');
  assert.strictEqual(out.requestHeaders.Cookie, 'session=live');
  assert.strictEqual(out.requestHeaders.Accept, 'application/json');
});
test('export include-auth keeps auth headers redacted when no live headers', () => {
  const cap = {
    domain: 'api.example.com',
    requestHeaders: {
      Authorization: 'Bearer old-token',
      'x-session-id': 'abc',
    }
  };
  const out = applyExportAuthPolicy(cap, {}, true);
  assert.strictEqual(out.requestHeaders.Authorization, REDACTED_HEADER_VALUE);
  assert.strictEqual(out.requestHeaders['x-session-id'], REDACTED_HEADER_VALUE);
});

console.log('\nparseDuration:');
test('parses seconds', () => assert.strictEqual(parseDuration('30s'), 30000));
test('parses minutes', () => assert.strictEqual(parseDuration('5m'), 300000));
test('parses hours', () => assert.strictEqual(parseDuration('2h'), 7200000));
test('parses days', () => assert.strictEqual(parseDuration('7d'), 604800000));
test('handles bare number', () => assert.strictEqual(parseDuration('1000'), 1000));
test('handles invalid string', () => assert.strictEqual(parseDuration('abc'), 0));
test('handles 1h', () => assert.strictEqual(parseDuration('1h'), 3600000));

console.log('\nparseArgs:');
test('positional args', () => {
  const r = parseArgs(['capture', 'list', 'github.com']);
  assert.deepStrictEqual(r.positional, ['capture', 'list', 'github.com']);
  assert.deepStrictEqual(r.flags, {});
});
test('flags with values', () => {
  const r = parseArgs(['--limit', '10', '--method', 'POST']);
  assert.strictEqual(r.flags.limit, '10');
  assert.strictEqual(r.flags.method, 'POST');
});
test('boolean flags', () => {
  const r = parseArgs(['--dry-run', '--json']);
  assert.strictEqual(r.flags['dry-run'], true);
  assert.strictEqual(r.flags.json, true);
});
test('mixed positional and flags', () => {
  const r = parseArgs(['capture', 'list', '--limit', '5', 'github.com']);
  assert.deepStrictEqual(r.positional, ['capture', 'list', 'github.com']);
  assert.strictEqual(r.flags.limit, '5');
});
test('supports global --session with separated value', () => {
  const r = parseArgs(['--session', 'team-a', 'connect', '9225']);
  assert.strictEqual(r.sessionName, 'team-a');
  assert.deepStrictEqual(r.positional, ['connect', '9225']);
});
test('supports global --session with inline value', () => {
  const r = parseArgs(['--session=team-b', 'discover']);
  assert.strictEqual(r.sessionName, 'team-b');
  assert.deepStrictEqual(r.positional, ['discover']);
});
test('stripGlobalSessionFlag removes session arguments only', () => {
  const cleaned = stripGlobalSessionFlag(['--session', 'dev', 'connect', '--json', '9222']);
  assert.deepStrictEqual(cleaned, ['connect', '--json', '9222']);
});

console.log('\nElectron app mapping:');
test('ELECTRON_APPS includes expected Linux candidates', () => {
  assert.deepStrictEqual(ELECTRON_APPS.slack, ['/usr/bin/slack', 'slack']);
  assert.deepStrictEqual(ELECTRON_APPS.code, ['/usr/bin/code', 'code']);
  assert.deepStrictEqual(ELECTRON_APPS.vscode, ['/usr/bin/code', 'code']);
  assert.deepStrictEqual(ELECTRON_APPS.discord, ['/usr/bin/discord', 'discord']);
  assert.deepStrictEqual(ELECTRON_APPS.notion, ['/usr/bin/notion', 'notion']);
  assert.deepStrictEqual(ELECTRON_APPS.feishu, ['/opt/bytedance/feishu/feishu', 'feishu']);
  assert.deepStrictEqual(ELECTRON_APPS.figma, []);
});

test('normalizeElectronAppName maps vscode to code', () => {
  assert.strictEqual(normalizeElectronAppName('vscode'), 'code');
  assert.strictEqual(normalizeElectronAppName('code'), 'code');
});

test('resolveElectronExecutable prefers existing absolute paths', () => {
  const out = resolveElectronExecutable('slack', {
    existsSync: (p) => p === '/usr/bin/slack',
    commandExists: () => false,
  });
  assert.strictEqual(out.executable, '/usr/bin/slack');
  assert.strictEqual(out.error, null);
});

test('resolveElectronExecutable falls back to command lookup', () => {
  const out = resolveElectronExecutable('feishu', {
    existsSync: () => false,
    commandExists: (name) => name === 'feishu',
  });
  assert.strictEqual(out.executable, 'feishu');
  assert.strictEqual(out.error, null);
});

test('resolveElectronExecutable reports unsupported app', () => {
  const out = resolveElectronExecutable('figma', {
    existsSync: () => false,
    commandExists: () => false,
  });
  assert.strictEqual(out.executable, null);
  assert.strictEqual(out.error, 'unsupported-on-linux');
});

console.log('\nElectron connect parsing:');
test('extractRemoteDebugPort parses --remote-debugging-port with equals', () => {
  const text = 'feishu --remote-debugging-port=9225 --foo bar';
  assert.strictEqual(extractRemoteDebugPort(text), 9225);
});

test('extractRemoteDebugPort parses --remote-debugging-port with space', () => {
  const text = 'feishu --remote-debugging-port 9226';
  assert.strictEqual(extractRemoteDebugPort(text), 9226);
});

test('findElectronDebugPort extracts port from ps output', () => {
  let captured = '';
  const port = findElectronDebugPort('feishu', {
    execSync: (cmd) => {
      captured = cmd;
      return 'fourier  123  1.2  feishu --remote-debugging-port=9225';
    },
  });
  assert.strictEqual(port, 9225);
  assert.ok(captured.includes('ps aux | grep'));
  assert.ok(captured.includes("'feishu'"));
});

test('findElectronDebugPort returns null when no debug flag is found', () => {
  const port = findElectronDebugPort('feishu', {
    execSync: () => 'fourier  123  1.2  feishu --flag without-port',
  });
  assert.strictEqual(port, null);
});

console.log('\nTab list parsing:');
test('parseTabTargets normalizes target fields and preserves order', () => {
  const targets = parseTabTargets([
    {
      type: 'page',
      id: 'tab-1',
      title: 'Home',
      url: 'https://example.com',
      webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/tab-1',
    },
    {
      type: 'service_worker',
      targetId: 'worker-1',
      title: '',
      url: 'chrome-extension://id/bg.js',
    },
  ]);
  assert.strictEqual(targets.length, 2);
  assert.deepStrictEqual(targets[0], {
    index: 0,
    type: 'page',
    id: 'tab-1',
    title: 'Home',
    url: 'https://example.com',
    webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/tab-1',
  });
  assert.deepStrictEqual(targets[1], {
    index: 1,
    type: 'service_worker',
    id: 'worker-1',
    title: '',
    url: 'chrome-extension://id/bg.js',
    webSocketDebuggerUrl: '',
  });
});

test('parseTabTargets handles invalid input defensively', () => {
  assert.deepStrictEqual(parseTabTargets(null), []);
  const one = parseTabTargets([null])[0];
  assert.deepStrictEqual(one, {
    index: 0,
    type: 'unknown',
    id: '',
    title: '',
    url: '',
    webSocketDebuggerUrl: '',
  });
});

test('findTabTargetByUrlPattern matches first URL include', () => {
  const targets = parseTabTargets([
    { type: 'page', id: '1', url: 'https://example.com/home' },
    { type: 'page', id: '2', url: 'https://example.com/settings' },
  ]);
  const matched = findTabTargetByUrlPattern(targets, '/settings');
  assert.strictEqual(matched.id, '2');
});

console.log('\nInject script loading:');
test('loadInjectScriptSource prefers extension/inject.js', () => {
  const loaded = loadInjectScriptSource({
    rootDir: '/repo',
    existsSync: (p) => p === '/repo/extension/inject.js',
    readFileSync: (p) => `from:${p}`,
  });
  assert.strictEqual(loaded.sourcePath, '/repo/extension/inject.js');
  assert.strictEqual(loaded.source, 'from:/repo/extension/inject.js');
});

test('loadInjectScriptSource falls back to extension-dist/content.js', () => {
  const loaded = loadInjectScriptSource({
    rootDir: '/repo',
    existsSync: (p) => p === '/repo/extension-dist/content.js',
    readFileSync: (p) => `from:${p}`,
  });
  assert.strictEqual(loaded.sourcePath, '/repo/extension-dist/content.js');
  assert.strictEqual(loaded.source, 'from:/repo/extension-dist/content.js');
});

test('buildInjectScript wraps source with reporter and capture array', () => {
  const script = buildInjectScript('globalThis.__NEO_CAPTURES__.push({ ok: true });');
  assert.ok(script.includes('__NEO_CAPTURES__'));
  assert.ok(script.includes('__NEO_CAPTURE_MESSAGE_LISTENER__'));
  assert.ok(script.includes('__neo_capture_request'));
  assert.ok(script.includes('__neoMiniReporter'));
  assert.ok(script.includes('inject:ready'));
});

console.log('\nsession store:');
test('loadSessions returns empty object when session file is missing', () => {
  resetSessionFile();
  assert.deepStrictEqual(loadSessions(), {});
});
test('saveSessions and loadSessions keep object payload', () => {
  resetSessionFile();
  saveSessions({ a: { cdpUrl: 'http://localhost:9222' } });
  assert.deepStrictEqual(loadSessions(), { a: { cdpUrl: 'http://localhost:9222' } });
});
test('setSession writes default session when name is omitted', () => {
  resetSessionFile();
  const payload = {
    cdpUrl: 'http://localhost:9222',
    pageWsUrl: 'ws://localhost:9222/devtools/page/1',
    tabId: 'tab-1',
    refs: {},
  };
  setSession(undefined, payload);
  const sessions = loadSessions();
  assert.deepStrictEqual(sessions[DEFAULT_SESSION_NAME], payload);
});
test('setSession keeps existing sessions and getSession resolves by name', () => {
  resetSessionFile();
  setSession('alpha', { cdpUrl: 'http://localhost:9222', refs: {} });
  setSession('beta', { cdpUrl: 'http://localhost:9223', refs: {} });
  const alpha = getSession('alpha');
  const beta = getSession('beta');
  assert.strictEqual(alpha.cdpUrl, 'http://localhost:9222');
  assert.strictEqual(beta.cdpUrl, 'http://localhost:9223');
});
test('getSession returns null for unknown session name', () => {
  resetSessionFile();
  saveSessions({ alpha: { cdpUrl: 'http://localhost:9222' } });
  assert.strictEqual(getSession('missing'), null);
});
test('saveSessions normalizes invalid input to empty object', () => {
  resetSessionFile();
  saveSessions(null);
  assert.deepStrictEqual(loadSessions(), {});
});

console.log('\nextension/session mode:');
test('findExtensionWs returns null when CDP fetch throws', async () => {
  const wsUrl = await findExtensionWs({
    fetch: async () => {
      throw new Error('connection refused');
    },
  });
  assert.strictEqual(wsUrl, null);
});

test('findExtensionWs selects matching extension service worker via manifest probe', async () => {
  const wsUrl = await findExtensionWs({
    fetch: async () => ({
      ok: true,
      json: async () => ([
        { type: 'page', url: 'https://example.com', webSocketDebuggerUrl: 'ws://page' },
        { type: 'service_worker', url: 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/background.js', webSocketDebuggerUrl: 'ws://sw-neo' },
        { type: 'service_worker', url: 'chrome-extension://otherotherotherotherotherotheroo/background.js', webSocketDebuggerUrl: 'ws://sw-other' },
      ]),
    }),
    cdpEval: async (wsUrl) => {
      if (wsUrl === 'ws://sw-neo') return 'Neo';
      return 'Other Extension';
    },
    existsSync: () => false,
    readFileSync: () => '',
    writeFileSync: () => {},
    extensionIdCacheFile: '/tmp/neo-ext-id-test-' + process.pid,
  });
  assert.strictEqual(wsUrl, 'ws://sw-neo');
});

test('findExtensionWs selects by explicit extension ID when set', async () => {
  const wsUrl = await findExtensionWs({
    extensionId: 'abcdefghijklmnopqrstuvwxyzabcdef',
    fetch: async () => ({
      ok: true,
      json: async () => ([
        { type: 'service_worker', url: 'chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef/background.js', webSocketDebuggerUrl: 'ws://sw-neo' },
        { type: 'service_worker', url: 'chrome-extension://otherotherotherotherotherotheroo/background.js', webSocketDebuggerUrl: 'ws://sw-other' },
      ]),
    }),
  });
  assert.strictEqual(wsUrl, 'ws://sw-neo');
});

test('isSessionMode is true when session exists and extension is missing', async () => {
  const mode = await isSessionMode('team-a', {
    getSession: () => ({ pageWsUrl: 'ws://page', cdpUrl: 'http://localhost:9225' }),
    findExtensionWs: async () => null,
  });
  assert.strictEqual(mode, true);
});

test('isSessionMode is false when extension service worker exists', async () => {
  const mode = await isSessionMode('team-a', {
    getSession: () => ({ pageWsUrl: 'ws://page', cdpUrl: 'http://localhost:9225' }),
    findExtensionWs: async () => 'ws://sw',
  });
  assert.strictEqual(mode, false);
});

test('isSessionMode is false without active session', async () => {
  const mode = await isSessionMode('missing', {
    getSession: () => null,
    findExtensionWs: async () => null,
  });
  assert.strictEqual(mode, false);
});

test('applySessionCaptureFilters filters by domain, method, status, and query', () => {
  const filtered = applySessionCaptureFilters([
    { id: 'a1', domain: 'a.com', method: 'GET', responseStatus: 200, url: 'https://a.com/feed' },
    { id: 'a2', domain: 'a.com', method: 'POST', responseStatus: 201, url: 'https://a.com/post' },
    { id: 'b1', domain: 'b.com', method: 'GET', responseStatus: 200, url: 'https://b.com/feed' },
  ], {
    domain: 'a.com',
    method: 'POST',
    status: 201,
    query: '/post',
  });
  assert.deepStrictEqual(filtered.map(item => item.id), ['a2']);
});

test('applySessionCaptureFilters supports timestamp sorting and limit', () => {
  const filtered = applySessionCaptureFilters([
    { id: 'x1', timestamp: 1000 },
    { id: 'x2', timestamp: 3000 },
    { id: 'x3', timestamp: 2000 },
  ], {
    sort: 'timestamp-desc',
    limit: 2,
  });
  assert.deepStrictEqual(filtered.map(item => item.id), ['x2', 'x3']);
});

console.log('\nassignRefs + formatSnapshot:');
test('assignRefs traverses tree in preorder with depth and refs map', () => {
  const tree = [
    {
      nodeId: '1',
      role: { value: 'RootWebArea' },
      name: { value: 'Main App' },
      childIds: ['2', '3'],
      backendDOMNodeId: 101,
    },
    {
      nodeId: '2',
      role: { value: 'button' },
      name: { value: ' Submit ' },
      backendDOMNodeId: 102,
      childIds: [],
      bounds: { x: 10, y: 20, width: 30, height: 40 },
    },
    {
      nodeId: '3',
      role: { value: 'link' },
      name: { value: 'Home' },
      backendDOMNodeId: 103,
      childIds: ['4'],
    },
    {
      nodeId: '4',
      role: { value: 'textbox' },
      name: { value: 'Search' },
      backendDOMNodeId: 104,
      childIds: [],
    },
  ];
  const result = assignRefs(tree);
  assert.strictEqual(result.nodes.length, 4);
  assert.deepStrictEqual(result.nodes.map(n => n.ref), ['@e1', '@e2', '@e3', '@e4']);
  assert.deepStrictEqual(result.nodes.map(n => n.depth), [0, 1, 1, 2]);
  assert.strictEqual(result.refs['@e1'].backendDOMNodeId, 101);
  assert.strictEqual(result.refs['@e2'].role, 'button');
  assert.strictEqual(result.refs['@e2'].name, 'Submit');
  assert.deepStrictEqual(result.refs['@e2'].bounds, { x: 10, y: 20, width: 30, height: 40 });
});

test('assignRefs includes disconnected nodes and normalizes missing fields', () => {
  const result = assignRefs([
    { nodeId: '1', role: null, name: null, childIds: ['2'] },
    { nodeId: '2', role: { value: 'Button' }, name: { value: 'Click' }, childIds: [] },
    { nodeId: '3', role: { value: 'Link' }, name: { value: 'More' }, childIds: [] },
  ]);
  assert.strictEqual(result.nodes.length, 3);
  assert.strictEqual(result.nodes[0].role, 'unknown');
  assert.strictEqual(result.nodes[2].role, 'link');
  assert.strictEqual(result.refs['@e3'].name, 'More');
});

test('formatSnapshot renders indented lines and escapes quotes', () => {
  const text = formatSnapshot([
    { ref: '@e1', depth: 0, role: 'button', name: 'Save "Now"' },
    { ref: '@e2', depth: 1, role: 'textbox', name: 'Search' },
  ]);
  assert.strictEqual(
    text,
    '@e1  [button] "Save \\"Now\\""\n  @e2  [textbox] "Search"'
  );
});

test('formatSnapshot ignores invalid nodes and falls back to defaults', () => {
  const text = formatSnapshot([null, { depth: -1, name: 'X' }]);
  assert.strictEqual(text, '@e?  [unknown] "X"');
});

console.log('\nresolveRef:');
test('resolveRef returns objectId + center coordinates', async () => {
  const calls = [];
  const fakeSession = {
    ui: {
      pageWsUrl: 'ws://localhost:9222/devtools/page/1',
      refs: {
        '@e1': { backendDOMNodeId: 1234 },
      },
    },
  };
  const fakeSend = async (wsUrl, method, params) => {
    calls.push({ wsUrl, method, params });
    if (method === 'DOM.resolveNode') {
      return { object: { objectId: 'obj-1' } };
    }
    if (method === 'DOM.getBoxModel') {
      return { model: { content: [10, 20, 30, 20, 30, 40, 10, 40] } };
    }
    throw new Error(`Unexpected method: ${method}`);
  };

  const result = await resolveRef('ui', '@e1', {
    getSession: (name) => fakeSession[name] || null,
    cdpSend: fakeSend,
  });
  assert.deepStrictEqual(result, {
    objectId: 'obj-1',
    x: 20,
    y: 30,
    backendDOMNodeId: 1234,
  });
  assert.deepStrictEqual(
    calls.map(call => call.method),
    ['DOM.resolveNode', 'DOM.getBoxModel']
  );
});

test('resolveRef throws when ref is missing from session refs', async () => {
  const fakeSession = {
    ui: {
      pageWsUrl: 'ws://localhost:9222/devtools/page/1',
      refs: {},
    },
  };
  await assert.rejects(
    resolveRef('ui', '@e9', {
      getSession: (name) => fakeSession[name] || null,
      cdpSend: async () => ({}),
    }),
    /Unknown ref/
  );
});

console.log('\npress key mapping:');
test('maps Enter to CDP key payload', () => {
  assert.deepStrictEqual(parsePressKey('Enter'), { key: 'Enter', code: 'Enter' });
});

test('maps ArrowDown to CDP key payload', () => {
  assert.deepStrictEqual(parsePressKey('ArrowDown'), { key: 'ArrowDown', code: 'ArrowDown' });
});

test('maps Space with text payload', () => {
  assert.deepStrictEqual(parsePressKey('Space'), { key: ' ', code: 'Space', text: ' ' });
});

test('maps Ctrl+a with modifiers=2', () => {
  assert.deepStrictEqual(parsePressKey('Ctrl+a'), { key: 'a', code: 'KeyA', modifiers: 2 });
});

test('returns null for unsupported key', () => {
  assert.strictEqual(parsePressKey('Ctrl+F13'), null);
});

// ─── Interceptor utils (extracted pure functions) ───────────────

const STATIC_RESOURCE_EXTENSIONS = /\.(?:js|css|png|jpe?g|gif|webp|ico|svg|woff2?|eot|ttf|otf|map)(?:[?#].*)?$/i;
const ANALYTICS_KEYWORDS = [
  'google-analytics', 'googletagmanager', 'sentry.io', 'mixpanel.com',
  'hdslb.com', 'bilivideo.com', 'api.honeycomb.io',
  'fonts.googleapis.com', 'cdn.jsdelivr.net',
];
const SKIP_PROTOCOLS = new Set(['chrome-extension:', 'moz-extension:', 'data:', 'blob:']);

function shouldSkipUrl(url, headers = {}, baseHref) {
  try {
    const parsed = new URL(url, baseHref || 'http://localhost');
    if (SKIP_PROTOCOLS.has(parsed.protocol)) return true;
    if (STATIC_RESOURCE_EXTENSIONS.test(parsed.pathname.toLowerCase())) return true;
    const combined = `${parsed.href.toLowerCase()} ${parsed.hostname.toLowerCase()} ${JSON.stringify(headers).toLowerCase()}`;
    return ANALYTICS_KEYWORDS.some(k => combined.includes(k));
  } catch { return true; }
}

function getCaptureKey(method, url, baseHref) {
  try { return `${method} ${new URL(url, baseHref || 'http://localhost').pathname}`; }
  catch { return `${method} ${url}`; }
}

function truncateText(value, maxBytes = 102400) {
  if (value.length <= maxBytes) return value;
  return `${value.slice(0, maxBytes)}\n[truncated ${value.length - maxBytes} bytes]`;
}

function parseTextBody(raw, contentType) {
  const lowerType = (contentType || '').toLowerCase();
  const looksJson = lowerType.includes('application/json') ||
    ((raw.startsWith('{') && raw.endsWith('}')) || (raw.startsWith('[') && raw.endsWith(']')));
  if (looksJson) { try { return JSON.parse(raw); } catch { return truncateText(raw); } }
  return truncateText(raw);
}

function parseResponseHeaders(raw) {
  const headers = {};
  for (const line of raw.split('\r\n')) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return headers;
}

function deriveDomain(url) {
  try { return new URL(url).hostname; } catch { return 'unknown'; }
}

function getSelector(el) {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const cls = el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  return tag + cls;
}

console.log('\nshouldSkipUrl:');
test('skips static resources', () => assert(shouldSkipUrl('https://example.com/app.js')));
test('skips images', () => assert(shouldSkipUrl('https://example.com/logo.png')));
test('skips chrome-extension URLs', () => assert(shouldSkipUrl('chrome-extension://abc/page.html')));
test('skips data URLs', () => assert(shouldSkipUrl('data:text/plain,hello')));
test('skips analytics domains', () => assert(shouldSkipUrl('https://sentry.io/api/report')));
test('skips CDN fonts', () => assert(shouldSkipUrl('https://fonts.googleapis.com/css2?family=Inter')));
test('allows API calls', () => assert(!shouldSkipUrl('https://api.github.com/repos')));
test('allows bilibili API', () => assert(!shouldSkipUrl('https://api.bilibili.com/x/web-interface/popular')));
test('skips bilibili CDN', () => assert(shouldSkipUrl('https://s1.hdslb.com/bfs/static/123.js')));
test('resolves empty URL against base', () => assert(!shouldSkipUrl('', {}, 'https://api.github.com')));

console.log('\ngetCaptureKey:');
test('extracts method + pathname', () => assert.strictEqual(getCaptureKey('GET', 'https://api.github.com/repos?page=2'), 'GET /repos'));
test('handles relative URLs', () => assert.strictEqual(getCaptureKey('POST', '/api/data', 'https://example.com'), 'POST /api/data'));
test('handles relative URLs as paths', () => assert.strictEqual(getCaptureKey('GET', 'not-a-url'), 'GET /not-a-url'));

console.log('\ntruncateText:');
test('returns short strings unchanged', () => assert.strictEqual(truncateText('hello', 100), 'hello'));
test('truncates long strings', () => {
  const result = truncateText('abcdef', 3);
  assert(result.startsWith('abc'));
  assert(result.includes('[truncated'));
});

console.log('\nparseTextBody:');
test('parses JSON objects', () => assert.deepStrictEqual(parseTextBody('{"a":1}'), { a: 1 }));
test('parses JSON arrays', () => assert.deepStrictEqual(parseTextBody('[1,2]'), [1, 2]));
test('returns text for non-JSON', () => assert.strictEqual(parseTextBody('hello world'), 'hello world'));
test('parses with content-type hint', () => assert.deepStrictEqual(parseTextBody('{"a":1}', 'application/json'), { a: 1 }));
test('handles invalid JSON gracefully', () => assert.strictEqual(typeof parseTextBody('{bad json}'), 'string'));

console.log('\nparseResponseHeaders:');
test('parses HTTP headers', () => {
  const h = parseResponseHeaders('Content-Type: application/json\r\nX-Request-Id: abc123');
  assert.strictEqual(h['Content-Type'], 'application/json');
  assert.strictEqual(h['X-Request-Id'], 'abc123');
});
test('handles empty string', () => assert.deepStrictEqual(parseResponseHeaders(''), {}));

console.log('\nderiveDomain:');
test('extracts hostname', () => assert.strictEqual(deriveDomain('https://api.github.com/repos'), 'api.github.com'));
test('returns unknown for invalid', () => assert.strictEqual(deriveDomain('not-a-url'), 'unknown'));

console.log('\ngetSelector:');
test('uses id when present', () => assert.strictEqual(getSelector({ id: 'btn', tagName: 'BUTTON', className: 'primary' }), '#btn'));
test('uses tag + class', () => assert.strictEqual(getSelector({ tagName: 'DIV', className: 'card main' }), 'div.card.main'));
test('uses tag only', () => assert.strictEqual(getSelector({ tagName: 'SPAN' }), 'span'));
test('limits to 2 classes', () => assert.strictEqual(getSelector({ tagName: 'DIV', className: 'a b c d' }), 'div.a.b'));

// ─── HAR conversion helpers ─────────────────────────────────────

console.log('\nHAR export helpers:');

function captureToHarEntry(cap) {
  const reqHeaders = Object.entries(cap.requestHeaders || {}).map(([n, v]) => ({ name: n, value: String(v) }));
  const respHeaders = Object.entries(cap.responseHeaders || {}).map(([n, v]) => ({ name: n, value: String(v) }));
  let queryString = [];
  try {
    const u = new URL(cap.url);
    queryString = [...u.searchParams].map(([n, v]) => ({ name: n, value: v }));
  } catch {}
  return {
    startedDateTime: new Date(cap.timestamp).toISOString(),
    time: cap.duration || 0,
    request: { method: cap.method, url: cap.url, headers: reqHeaders, queryString },
    response: { status: cap.responseStatus || 0, headers: respHeaders },
  };
}

test('converts capture to HAR entry', () => {
  const entry = captureToHarEntry({
    url: 'https://api.example.com/data?page=1',
    method: 'GET',
    timestamp: 1700000000000,
    duration: 250,
    responseStatus: 200,
    requestHeaders: { 'Accept': 'application/json' },
    responseHeaders: { 'content-type': 'application/json' },
  });
  assert.strictEqual(entry.request.method, 'GET');
  assert.strictEqual(entry.response.status, 200);
  assert.strictEqual(entry.time, 250);
  assert.strictEqual(entry.request.queryString.length, 1);
  assert.strictEqual(entry.request.queryString[0].name, 'page');
});

test('handles missing headers gracefully', () => {
  const entry = captureToHarEntry({ url: 'https://x.com/api', method: 'POST', timestamp: 0 });
  assert.strictEqual(entry.request.headers.length, 0);
  assert.strictEqual(entry.response.status, 0);
});

// ─── OpenAPI conversion helpers ─────────────────────────────────

console.log('\nOpenAPI helpers:');

function neoToJsonSchema(struct) {
  if (!struct || typeof struct !== 'object') return { type: 'object' };
  if (Array.isArray(struct)) {
    return { type: 'array', items: struct.length ? neoToJsonSchema(struct[0]) : {} };
  }
  const properties = {};
  for (const [k, v] of Object.entries(struct)) {
    if (typeof v === 'string') {
      properties[k] = v === 'null' ? {} : { type: v };
    } else if (typeof v === 'object') {
      properties[k] = neoToJsonSchema(v);
    }
  }
  return { type: 'object', properties };
}

test('converts flat structure', () => {
  const schema = neoToJsonSchema({ id: 'number', name: 'string' });
  assert.strictEqual(schema.type, 'object');
  assert.strictEqual(schema.properties.id.type, 'number');
  assert.strictEqual(schema.properties.name.type, 'string');
});

test('converts nested structure', () => {
  const schema = neoToJsonSchema({ user: { id: 'number', name: 'string' } });
  assert.strictEqual(schema.properties.user.type, 'object');
  assert.strictEqual(schema.properties.user.properties.id.type, 'number');
});

test('converts array structure', () => {
  const schema = neoToJsonSchema([{ id: 'number' }]);
  assert.strictEqual(schema.type, 'array');
  assert.strictEqual(schema.items.properties.id.type, 'number');
});

test('handles null type', () => {
  const schema = neoToJsonSchema({ field: 'null' });
  assert.deepStrictEqual(schema.properties.field, {});
});

test('handles empty/null input', () => {
  assert.strictEqual(neoToJsonSchema(null).type, 'object');
  assert.strictEqual(neoToJsonSchema(undefined).type, 'object');
});

// ─── Mock value generation ──────────────────────────────────────

function mockValue(type, key) {
  if (type === 'number') return key.includes('count') || key.includes('total') ? 42 : 3.14;
  if (type === 'boolean') return true;
  if (type === 'array') return [];
  if (type === 'object') return {};
  if (type === 'null') return null;
  if (key.includes('id')) return 'mock-id-' + Math.random().toString(36).slice(2, 8);
  if (key.includes('url') || key.includes('href')) return 'https://example.com/mock';
  if (key.includes('name')) return 'Mock Name';
  if (key.includes('email')) return 'mock@example.com';
  if (key.includes('date') || key.includes('time') || key.includes('At')) return new Date().toISOString();
  if (key.includes('text') || key.includes('body') || key.includes('content')) return 'Mock content';
  if (key.includes('title')) return 'Mock Title';
  return 'mock-' + key;
}

function buildMockBody(structure) {
  if (!structure || typeof structure !== 'object') return { ok: true };
  const result = {};
  for (const [key, type] of Object.entries(structure)) {
    if (typeof type === 'object' && type !== null) {
      result[key] = buildMockBody(type);
    } else {
      result[key] = mockValue(String(type), key);
    }
  }
  return result;
}

console.log('\n── Mock value generation ──');

test('mockValue returns number for count fields', () => {
  assert.strictEqual(mockValue('number', 'totalCount'), 42);
  assert.strictEqual(mockValue('number', 'price'), 3.14);
});

test('mockValue returns boolean', () => {
  assert.strictEqual(mockValue('boolean', 'active'), true);
});

test('mockValue returns typed strings', () => {
  assert.ok(mockValue('string', 'user_id').startsWith('mock-id-'));
  assert.strictEqual(mockValue('string', 'profile_url'), 'https://example.com/mock');
  assert.strictEqual(mockValue('string', 'display_name'), 'Mock Name');
  assert.strictEqual(mockValue('string', 'email'), 'mock@example.com');
  assert.strictEqual(mockValue('string', 'title'), 'Mock Title');
});

test('mockValue returns null for null type', () => {
  assert.strictEqual(mockValue('null', 'field'), null);
});

test('buildMockBody handles flat structure', () => {
  const body = buildMockBody({ count: 'number', active: 'boolean', name: 'string' });
  assert.strictEqual(body.count, 42);
  assert.strictEqual(body.active, true);
  assert.strictEqual(body.name, 'Mock Name');
});

test('buildMockBody handles nested structure', () => {
  const body = buildMockBody({ user: { name: 'string', id: 'string' } });
  assert.strictEqual(body.user.name, 'Mock Name');
  assert.ok(body.user.id.startsWith('mock-id-'));
});

test('buildMockBody handles null/undefined input', () => {
  assert.deepStrictEqual(buildMockBody(null), { ok: true });
  assert.deepStrictEqual(buildMockBody(undefined), { ok: true });
});

// ─── URL normalization (used in flows/deps) ─────────────────────

function normEndpoint(url, method) {
  try {
    const u = new URL(url);
    let p = u.pathname;
    p = p.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':uuid');
    p = p.replace(/\/\d{4,}\b/g, '/:id');
    p = p.replace(/\/[0-9a-f]{24,}/gi, '/:hash');
    return `${method} ${p}`;
  } catch { return `${method} ${url}`; }
}

console.log('\nnormEndpoint:');
test('parameterizes UUIDs', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/users/550e8400-e29b-41d4-a716-446655440000/posts', 'GET'),
    'GET /users/:uuid/posts'
  );
});
test('parameterizes numeric IDs (4+ digits)', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/posts/12345', 'GET'),
    'GET /posts/:id'
  );
});
test('leaves short numbers alone', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/v2/posts', 'GET'),
    'GET /v2/posts'
  );
});
test('parameterizes hex hashes (24+ chars)', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/objects/507f1f77bcf86cd799439011', 'GET'),
    'GET /objects/:hash'
  );
});
test('handles multiple parameterizations', () => {
  assert.strictEqual(
    normEndpoint('https://api.example.com/users/12345/posts/67890', 'POST'),
    'POST /users/:id/posts/:id'
  );
});
test('handles malformed URL gracefully', () => {
  assert.strictEqual(normEndpoint('not-a-url', 'GET'), 'GET not-a-url');
});

// ─── Label heuristics (inspired by neo.cjs) ─────────────────

function pathWords(raw) {
  return String(raw || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_\s]+/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function cleanGraphqlOperation(rawSegment) {
  const seg = String(rawSegment || '').replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  if (!seg) return '';
  return pathWords(seg).join(' ');
}

function extractGraphQLOperation(pathText) {
  const normalized = String(pathText || '').split('?')[0];
  const segments = normalized.split('/').filter(Boolean);
  for (const seg of [...segments].reverse()) {
    const cleaned = cleanGraphqlOperation(seg);
    if (!cleaned) continue;
    const parts = cleaned.split(' ');
    if (parts.length > 1 || /[A-Z]/.test(seg) || seg.includes('_') || seg.includes('-')) {
      return cleaned;
    }
  }
  return '';
}

function inferVerbFromMethod(method) {
  const m = String(method || '').toUpperCase();
  if (m.startsWith('WS_') || m.startsWith('SSE_')) return 'Stream';
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'Get';
  if (m === 'POST') return 'Create';
  if (m === 'PUT' || m === 'PATCH') return 'Update';
  if (m === 'DELETE') return 'Delete';
  return 'Process';
}

function extractMeaningfulPathWord(pathText) {
  const segments = String(pathText || '').split('?')[0].split('/').filter(Boolean);
  const picked = [...segments].reverse().find(s => !s.startsWith(':') && s.length > 2) || segments[segments.length - 1] || 'endpoint';
  const cleaned = cleanGraphqlOperation(picked);
  return (cleaned || 'endpoint').replace(/^v\d+$/, '').trim() || 'endpoint';
}

function inferEndpointLabel(endpoint) {
  if (!endpoint || !endpoint.path) return 'Unknown endpoint';
  const gql = extractGraphQLOperation(endpoint.path);
  if (gql) {
    const lower = gql.toLowerCase();
    if (lower.startsWith('delete ') || lower.startsWith('remove ')) {
      return `Delete ${gql.split(' ').slice(1).join(' ')}`.trim();
    }
    return `${inferVerbFromMethod(endpoint.method)} ${gql}`;
  }

  const triggerText = Array.isArray(endpoint.triggers) && endpoint.triggers[0]?.text;
  if (triggerText) {
    const lower = triggerText.toLowerCase();
    if (lower.includes('post')) return `Post ${extractMeaningfulPathWord(endpoint.path)}`;
    if (lower.includes('upload')) return `Upload ${extractMeaningfulPathWord(endpoint.path)}`;
    if (lower.includes('save')) return `Save ${extractMeaningfulPathWord(endpoint.path)}`;
    if (lower.includes('delete') || lower.includes('remove')) return `Delete ${extractMeaningfulPathWord(endpoint.path)}`;
    if (lower.includes('search') || lower.includes('query')) return `Search ${extractMeaningfulPathWord(endpoint.path)}`;
    if (lower.includes('follow') || lower.includes('subscribe')) return `Follow ${extractMeaningfulPathWord(endpoint.path)}`;
    if (lower.includes('like') || lower.includes('favorite') || lower.includes('bookmark')) return `Like ${extractMeaningfulPathWord(endpoint.path)}`;
    if (lower.includes('message') || lower.includes('chat') || lower.includes('reply') || lower.includes('comment')) return `Create ${extractMeaningfulPathWord(endpoint.path)}`;
  }

  const segments = String(endpoint.path).split('?')[0].split('/').filter(Boolean);
  const last = segments[segments.length - 1] || '';
  const cleaned = cleanGraphqlOperation(last);
  if (cleaned) {
    const parts = cleaned.split(' ');
    const verbs = ['create', 'post', 'delete', 'remove', 'update', 'patch', 'send', 'reply', 'comment', 'search', 'query', 'upload', 'attach', 'save', 'follow', 'like', 'bookmark', 'get', 'read', 'fetch'];
    if (verbs.includes(parts[0])) {
      return `${parts[0].charAt(0).toUpperCase() + parts[0].slice(1)} ${parts.slice(1).join(' ')}`.trim();
    }
    if (parts.includes('list') || parts.includes('history')) return `Get ${parts.join(' ')}`;
  }

  return `${inferVerbFromMethod(endpoint.method)} ${extractMeaningfulPathWord(endpoint.path)}`.trim();
}

console.log('\nLabel heuristics:');
test('extracts GraphQL operation name from path', () => {
  assert.strictEqual(extractGraphQLOperation('/i/api/graphql/abc/CreateTweet'), 'create tweet');
});
test('infers label from GraphQL path for POST', () => {
  assert.strictEqual(inferEndpointLabel({ method: 'POST', path: '/i/api/graphql/abc/CreateTweet' }), 'Create create tweet');
});
test('uses trigger wording when present', () => {
  assert.strictEqual(
    inferEndpointLabel({ method: 'POST', path: '/api/upload', triggers: [{ text: 'Upload image' }] }),
    'Upload upload'
  );
});
test('uses method+path fallback when no trigger or GraphQL', () => {
  assert.strictEqual(
    inferEndpointLabel({ method: 'GET', path: '/v1/posts/list' }),
    'Get list'
  );
});
test('extractGraphQLOperation handles snake_case and hyphenated path segments', () => {
  assert.strictEqual(extractGraphQLOperation('/api/get_user_profile'), 'get user profile');
  assert.strictEqual(extractGraphQLOperation('/api/upload-file'), 'upload file');
});
test('falls back to method-based fallback label', () => {
  assert.strictEqual(
    inferEndpointLabel({ method: 'PUT', path: '/v1/posts/item' }),
    'Update item'
  );
});
test('labels delete-like endpoints as Delete', () => {
  assert.strictEqual(
    inferEndpointLabel({ method: 'POST', path: '/api/delete_post' }),
    'Delete post'
  );
});

function discoverWorkflowChains(dependencyLinks, minSteps, maxSteps, minEvidence) {
  const eligibleLinks = dependencyLinks.filter(link => (link.count || 0) >= minEvidence);
  if (!eligibleLinks.length) return [];

  const byFrom = new Map();
  for (const link of eligibleLinks) {
    const arr = byFrom.get(link.producerEndpoint) || [];
    arr.push(link);
    byFrom.set(link.producerEndpoint, arr);
  }

  const endpointPath = (key) => String(key || '').split(' ').slice(1).join(' ');
  const consumers = new Set(eligibleLinks.map(link => endpointPath(link.consumerEndpoint)));
  const starts = eligibleLinks.filter(link => !consumers.has(endpointPath(link.producerEndpoint)));
  if (!starts.length) return [];

  const chains = [];

  function dfs(endpoint, path, visited) {
    if (path.length >= maxSteps - 1) {
      if (path.length >= minSteps - 1) chains.push([...path]);
      return;
    }

    const nextLinks = byFrom.get(endpoint) || [];
    const candidates = nextLinks.filter(link => !visited.has(link.consumerEndpoint));
    if (!candidates.length) {
      if (path.length >= minSteps - 1) chains.push([...path]);
      return;
    }

    for (const link of candidates) {
      path.push(link);
      visited.add(link.consumerEndpoint);
      dfs(link.consumerEndpoint, path, visited);
      visited.delete(link.consumerEndpoint);
      path.pop();
    }
  }

  for (const link of starts) {
    dfs(link.consumerEndpoint, [link], new Set([link.producerEndpoint, link.consumerEndpoint]));
  }

  const dedup = new Map();
  for (const chain of chains) {
    const key = chain.map(c => `${c.producerEndpoint}→${c.consumerEndpoint}#${c.respField}:${c.reqField}`).join('|');
    dedup.set(key, chain);
  }
  return [...dedup.values()];
}

function toWorkflowNameFromChain(domain, chain) {
  const endpoints = [chain[0].producerEndpoint];
  for (const link of chain) endpoints.push(link.consumerEndpoint);
  const nounParts = endpoints.map((ep) => {
    const split = ep.split(' ').pop().split('/').filter(Boolean);
    return split[split.length - 1] || 'api';
  });
  return `${domain}-${nounParts.join('-to-')}`.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/-$/, '').slice(0, 60);
}

function buildWorkflowFromChains(domain, chains, schema) {
  const endpointMap = new Map((schema.endpoints || []).map(ep => [`${ep.method} ${ep.path}`, ep]));
  const workflows = [];
  for (const chain of chains) {
    const stepKeys = [chain[0].producerEndpoint, ...chain.map((link) => link.consumerEndpoint)];
    const steps = [];
    for (const key of stepKeys) {
      const ep = endpointMap.get(key);
      const [method, path] = key.split(' ');
      steps.push({
        endpointKey: key,
        method,
        path,
        label: (ep && ep.label) || inferEndpointLabel(ep || { method, path }),
      });
    }
    workflows.push({
      name: toWorkflowNameFromChain(domain, chain),
      domain,
      steps,
      transitions: chain.map((link, i) => ({
        from: i,
        to: i + 1,
        fields: [{ sourceField: link.respField, targetField: link.reqField, count: link.count }],
      })),
    });
  }
  return workflows;
}

console.log('\nWorkflow discovery:');
test('discovers a linear dependency chain', () => {
  const links = [
    { producerEndpoint: 'GET /users', consumerEndpoint: 'POST /posts', respField: 'id', reqField: 'author_id', count: 3 },
    { producerEndpoint: 'POST /posts', consumerEndpoint: 'GET /timeline', respField: 'post_id', reqField: 'id', count: 2 },
  ];
  const chains = discoverWorkflowChains(links, 2, 4, 2);
  assert.strictEqual(chains.length, 1);
  assert.strictEqual(chains[0].length, 2);
  assert.strictEqual(chains[0][1].consumerEndpoint, 'GET /timeline');
});

test('respects minEvidence when discovering chains', () => {
  const chains = discoverWorkflowChains([
    { producerEndpoint: 'GET /users', consumerEndpoint: 'POST /posts', respField: 'id', reqField: 'author_id', count: 1 },
  ], 2, 4, 2);
  assert.strictEqual(chains.length, 0);
});

test('deduplicates identical chains', () => {
  const links = [
    { producerEndpoint: 'GET /users', consumerEndpoint: 'POST /posts', respField: 'id', reqField: 'author_id', count: 3 },
    { producerEndpoint: 'GET /users', consumerEndpoint: 'POST /posts', respField: 'id', reqField: 'author_id', count: 3 },
  ];
  const chains = discoverWorkflowChains(links, 2, 4, 2);
  assert.strictEqual(chains.length, 1);
});

test('builds workflow steps with labels', () => {
  const links = [
    { producerEndpoint: 'POST /uploadMedia', consumerEndpoint: 'POST /CreateTweet', respField: 'media_id', reqField: 'mediaId', count: 2 },
  ];
  const workflows = buildWorkflowFromChains('x.com', discoverWorkflowChains(links, 2, 4, 1), { endpoints: [{ method: 'POST', path: '/uploadMedia', label: 'Upload media' }] });
  assert.strictEqual(workflows.length, 1);
  assert.strictEqual(workflows[0].steps[0].label, 'Upload media');
  assert.strictEqual(workflows[0].steps[1].endpointKey, 'POST /CreateTweet');
});
test('respects max steps when discovering chains', () => {
  const links = [
    { producerEndpoint: 'GET /a', consumerEndpoint: 'POST /b', respField: 'id', reqField: 'a', count: 2 },
    { producerEndpoint: 'POST /b', consumerEndpoint: 'GET /c', respField: 'id', reqField: 'b', count: 2 },
    { producerEndpoint: 'GET /c', consumerEndpoint: 'POST /d', respField: 'id', reqField: 'c', count: 2 },
  ];
  const chains = discoverWorkflowChains(links, 2, 2, 1);
  const longChains = chains.filter(chain => chain.length > 1);
  assert.strictEqual(longChains.length, 0);
});
test('avoids endpoint loops in workflow chains', () => {
  const links = [
    { producerEndpoint: 'GET /a', consumerEndpoint: 'POST /b', respField: 'id', reqField: 'a', count: 2 },
    { producerEndpoint: 'POST /b', consumerEndpoint: 'GET /c', respField: 'id', reqField: 'b', count: 2 },
    { producerEndpoint: 'GET /c', consumerEndpoint: 'POST /a', respField: 'id', reqField: 'c', count: 2 },
  ];
  const chains = discoverWorkflowChains(links, 2, 4, 1);
  assert.ok(chains.every(chain => {
    const seen = new Set();
    for (const link of chain) {
      if (seen.has(link.producerEndpoint) || seen.has(link.consumerEndpoint)) return false;
      seen.add(link.producerEndpoint);
      seen.add(link.consumerEndpoint);
    }
    return true;
  }));
});

// ─── Edge cases ─────────────────────────────────────────────────

console.log('\nedge cases:');
test('shouldSkipUrl handles relative path', () => {
  // Relative URLs resolve against baseHref, so they're valid
  assert(!shouldSkipUrl('/api/data', {}, 'http://example.com'));
});
test('parseDuration handles zero', () => {
  assert.strictEqual(parseDuration('0s'), 0);
});
test('parseArgs handles empty array', () => {
  const r = parseArgs([]);
  assert.deepStrictEqual(r.positional, []);
  assert.deepStrictEqual(r.flags, {});
  assert.strictEqual(r.sessionName, DEFAULT_SESSION_NAME);
});
test('getCaptureKey normalizes method+url', () => {
  const k1 = getCaptureKey('GET', '/api/test', 'http://example.com');
  const k2 = getCaptureKey('POST', '/api/test', 'http://example.com');
  assert.notStrictEqual(k1, k2);
});
test('getSelector returns tag for plain elements', () => {
  const el = { tagName: 'BUTTON', id: '', className: '' };
  assert.strictEqual(getSelector(el), 'button');
});
test('getSelector returns #id when present', () => {
  const el = { tagName: 'DIV', id: 'main', className: '' };
  assert.strictEqual(getSelector(el), '#main');
});

// ─── parseSnapshotArgs ──────────────────────────────────
function parseSnapshotArgs(argv) {
  const options = {
    interactiveOnly: false,
    includeCursorPointer: false,
    json: false,
    diff: false,
    selector: null,
  };
  const unknown = [];
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i++) {
    const current = args[i];
    if (current === '-i') { options.interactiveOnly = true; continue; }
    if (current === '-C') { options.includeCursorPointer = true; continue; }
    if (current === '--json') { options.json = true; continue; }
    if (current === '--diff') { options.diff = true; continue; }
    if (current === '--selector') {
      if (args[i + 1] && !args[i + 1].startsWith('-')) { options.selector = args[i + 1]; i++; }
      else { unknown.push(current); }
      continue;
    }
    if (current.startsWith('--selector=')) { options.selector = current.slice('--selector='.length); continue; }
    unknown.push(current);
  }
  return { options, unknown };
}

console.log('\nparseSnapshotArgs:');
test('parseSnapshotArgs recognizes --diff flag', () => {
  const { options, unknown } = parseSnapshotArgs(['--diff', '-i', '--json']);
  assert.strictEqual(options.diff, true);
  assert.strictEqual(options.interactiveOnly, true);
  assert.strictEqual(options.json, true);
  assert.strictEqual(unknown.length, 0);
});

test('parseSnapshotArgs defaults diff to false', () => {
  const { options } = parseSnapshotArgs(['-i']);
  assert.strictEqual(options.diff, false);
});

console.log('\nsnapshot diff logic:');
test('diff detects added and removed nodes', () => {
  const prev = [
    { ref: '@e1', role: 'button', name: 'Save', depth: 0 },
    { ref: '@e2', role: 'link', name: 'Home', depth: 0 },
  ];
  const curr = [
    { ref: '@e1', role: 'button', name: 'Save', depth: 0 },
    { ref: '@e3', role: 'textbox', name: 'Search', depth: 1 },
  ];
  const prevMap = new Map(prev.map(n => [`${n.role}:${n.name}`, n]));
  const currMap = new Map(curr.map(n => [`${n.role}:${n.name}`, n]));
  const added = curr.filter(n => !prevMap.has(`${n.role}:${n.name}`));
  const removed = prev.filter(n => !currMap.has(`${n.role}:${n.name}`));
  assert.strictEqual(added.length, 1);
  assert.strictEqual(added[0].name, 'Search');
  assert.strictEqual(removed.length, 1);
  assert.strictEqual(removed[0].name, 'Home');
});

test('diff detects changed depth', () => {
  const prev = [
    { ref: '@e1', role: 'button', name: 'Submit', depth: 0 },
  ];
  const curr = [
    { ref: '@e1', role: 'button', name: 'Submit', depth: 2 },
  ];
  const prevMap = new Map(prev.map(n => [`${n.role}:${n.name}`, n]));
  const changed = curr.filter(n => {
    const p = prevMap.get(`${n.role}:${n.name}`);
    return p && p.depth !== n.depth;
  });
  assert.strictEqual(changed.length, 1);
  assert.strictEqual(changed[0].name, 'Submit');
});

test('diff reports no changes for identical snapshots', () => {
  const prev = [
    { ref: '@e1', role: 'button', name: 'OK', depth: 0 },
  ];
  const curr = [
    { ref: '@e1', role: 'button', name: 'OK', depth: 0 },
  ];
  const prevMap = new Map(prev.map(n => [`${n.role}:${n.name}`, n]));
  const currMap = new Map(curr.map(n => [`${n.role}:${n.name}`, n]));
  const added = curr.filter(n => !prevMap.has(`${n.role}:${n.name}`));
  const removed = prev.filter(n => !currMap.has(`${n.role}:${n.name}`));
  const changed = curr.filter(n => {
    const p = prevMap.get(`${n.role}:${n.name}`);
    return p && p.depth !== n.depth;
  });
  assert.strictEqual(added.length, 0);
  assert.strictEqual(removed.length, 0);
  assert.strictEqual(changed.length, 0);
});

Promise.all(pendingTests)
  .finally(() => {
    resetSessionFile();
    console.log(`\n${pass} passed, ${fail} failed\n`);
    process.exit(fail > 0 ? 1 : 0);
  });
