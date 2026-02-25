#!/usr/bin/env node
// neo-exec.cjs — Execute API calls through Neo extension's page context via CDP
// Runs fetch() in the browser tab context, inheriting the user's auth cookies/tokens.
//
// Usage: node neo-exec.cjs <url> [options]
// Options:
//   --method GET|POST|PUT|DELETE|PATCH  (default: GET)
//   --header "Key: Value"              (repeatable)
//   --body '{"key": "value"}'
//   --tab-url <pattern>                (match tab by URL pattern, default: use active tab)
//   --auto-headers                     (auto-detect auth headers from Neo captures)
//   --eval <js>                        (evaluate JS in page context instead of fetch)

const WebSocket = require('ws');
const CDP_URL = 'http://localhost:9222';

async function findTab(pattern) {
  const res = await fetch(`${CDP_URL}/json/list`);
  const tabs = await res.json();
  if (pattern) {
    const tab = tabs.find(t => t.type === 'page' && t.url.includes(pattern));
    if (!tab) throw new Error(`No tab matching "${pattern}"`);
    return tab;
  }
  const pages = tabs.filter(t => t.type === 'page');
  if (!pages.length) throw new Error('No browser tabs found');
  return pages[0];
}

function connectAndEval(wsUrl, expression, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, timeout);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2, method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        }));
      }, 200);
    });
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === 2) {
        clearTimeout(timer);
        ws.close();
        if (msg.result?.exceptionDetails) {
          reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
        } else {
          resolve(msg.result?.result?.value);
        }
      }
    });
    ws.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

async function getAutoHeaders(domain) {
  // Query Neo's IndexedDB for auth headers used on this domain
  const tabs = await (await fetch(`${CDP_URL}/json/list`)).json();
  const sw = tabs.find(t => t.url.includes('ikikhldfkbfmcbandaagjomhchlehjap'));
  if (!sw) return {};
  
  const result = await connectAndEval(sw.webSocketDebuggerUrl, `
    new Promise(function(r) {
      var q = indexedDB.open('neo-capture-v01');
      q.onsuccess = function() {
        var db = q.result;
        var tx = db.transaction('capturedRequests', 'readonly');
        var cur = tx.objectStore('capturedRequests').openCursor(null, 'prev');
        cur.onsuccess = function(e) {
          var c = e.target.result;
          if (c) {
            var v = c.value;
            if (v.domain === '${domain}' && v.responseStatus >= 200 && v.responseStatus < 300 && Object.keys(v.requestHeaders).length > 2) {
              r(JSON.stringify(v.requestHeaders));
              return;
            }
            c.continue();
          } else {
            r('{}');
          }
        };
      };
      setTimeout(function() { r('{}'); }, 5000);
    })
  `);
  
  try {
    const headers = JSON.parse(result);
    // Filter to only auth-related headers
    const authKeys = ['authorization', 'x-csrf-token', 'x-twitter-auth-type', 'x-twitter-active-user',
      'x-twitter-client-language', 'x-client-transaction-id', 'x-requested-with', 'github-verified-fetch',
      'x-fetch-nonce', 'x-github-client-version', 'x-fetch-nonce-to-validate'];
    const filtered = {};
    for (const [k, v] of Object.entries(headers)) {
      if (authKeys.includes(k.toLowerCase()) || k.toLowerCase().startsWith('x-csrf') || k.toLowerCase().startsWith('x-twitter')) {
        filtered[k] = v;
      }
    }
    return filtered;
  } catch { return {}; }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { url: null, method: 'GET', headers: {}, body: null, tabUrl: null, autoHeaders: false, evalJs: null };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--method' && args[i + 1]) { opts.method = args[++i].toUpperCase(); }
    else if (args[i] === '--header' && args[i + 1]) {
      const h = args[++i]; const colon = h.indexOf(':');
      if (colon > 0) opts.headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim();
    }
    else if (args[i] === '--body' && args[i + 1]) { opts.body = args[++i]; }
    else if (args[i] === '--tab-url' && args[i + 1]) { opts.tabUrl = args[++i]; }
    else if (args[i] === '--auto-headers') { opts.autoHeaders = true; }
    else if (args[i] === '--eval' && args[i + 1]) { opts.evalJs = args[++i]; }
    else if (!args[i].startsWith('--') && !opts.url) { opts.url = args[i]; }
  }
  
  if (!opts.url && !opts.evalJs) {
    console.error('Usage: neo-exec <url> [--method POST] [--header "K: V"] [--body "{}"] [--tab-url pattern] [--auto-headers]');
    console.error('       neo-exec --eval "document.title" --tab-url pattern');
    process.exit(1);
  }
  return opts;
}

async function run() {
  const opts = parseArgs();
  const tab = await findTab(opts.tabUrl);
  
  // --eval mode: just evaluate JS in page context
  if (opts.evalJs) {
    console.error(`Evaluating in tab: ${tab.url.slice(0, 60)}...`);
    const result = await connectAndEval(tab.webSocketDebuggerUrl, `
      (async function() {
        try { var r = await (${opts.evalJs}); return typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r); }
        catch(e) { return 'Error: ' + e.message; }
      })()
    `);
    console.log(result);
    return;
  }
  
  // Auto-detect headers from captures
  if (opts.autoHeaders) {
    try {
      const domain = new URL(opts.url).hostname;
      const autoH = await getAutoHeaders(domain);
      if (Object.keys(autoH).length) {
        console.error(`Auto-detected ${Object.keys(autoH).length} auth headers from captures`);
        // User headers override auto headers
        opts.headers = { ...autoH, ...opts.headers };
      }
    } catch {}
  }
  
  console.error(`Executing ${opts.method} ${opts.url.slice(0, 70)}... in tab: ${tab.url.slice(0, 50)}...`);
  
  const fetchOpts = { method: opts.method, headers: opts.headers };
  if (opts.body && opts.method !== 'GET') {
    fetchOpts.body = opts.body;
    if (!fetchOpts.headers['content-type'] && !fetchOpts.headers['Content-Type']) {
      fetchOpts.headers['Content-Type'] = 'application/json';
    }
  }
  
  const expression = `
    (async function() {
      try {
        var resp = await fetch(${JSON.stringify(opts.url)}, ${JSON.stringify({ ...fetchOpts, credentials: 'include' })});
        var text = await resp.text();
        return JSON.stringify({
          status: resp.status,
          statusText: resp.statusText,
          headers: Object.fromEntries(resp.headers.entries()),
          body: text.length > 50000 ? text.slice(0, 50000) + '... [truncated]' : text
        });
      } catch (err) {
        return JSON.stringify({ error: err.message });
      }
    })()
  `;
  
  const result = await connectAndEval(tab.webSocketDebuggerUrl, expression);
  const parsed = JSON.parse(result);
  
  if (parsed.error) { console.error('Error:', parsed.error); process.exit(1); }
  
  console.log(`HTTP ${parsed.status} ${parsed.statusText}`);
  console.log('---');
  try { console.log(JSON.stringify(JSON.parse(parsed.body), null, 2)); }
  catch { console.log(parsed.body); }
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
