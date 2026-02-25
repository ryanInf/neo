#!/usr/bin/env node
// neo-exec.js — Execute API calls through Neo extension's page context via CDP
// This runs fetch() in the browser tab context, inheriting the user's auth cookies/tokens.
//
// Usage: node neo-exec.cjs <url> [options]
// Options:
//   --method GET|POST|PUT|DELETE|PATCH  (default: GET)
//   --header "Key: Value"              (repeatable)
//   --body '{"key": "value"}'
//   --tab-url <pattern>                (match tab by URL pattern, default: use active tab)

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
  
  // Find the active/focused page tab
  const pages = tabs.filter(t => t.type === 'page');
  if (!pages.length) throw new Error('No browser tabs found');
  return pages[0]; // CDP lists active tab first
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

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { url: null, method: 'GET', headers: {}, body: null, tabUrl: null };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--method' && args[i + 1]) { opts.method = args[++i].toUpperCase(); }
    else if (args[i] === '--header' && args[i + 1]) {
      const h = args[++i];
      const colon = h.indexOf(':');
      if (colon > 0) opts.headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim();
    }
    else if (args[i] === '--body' && args[i + 1]) { opts.body = args[++i]; }
    else if (args[i] === '--tab-url' && args[i + 1]) { opts.tabUrl = args[++i]; }
    else if (!args[i].startsWith('--') && !opts.url) { opts.url = args[i]; }
  }
  
  if (!opts.url) { console.error('Usage: neo-exec <url> [--method POST] [--header "K: V"] [--body "{}"] [--tab-url pattern]'); process.exit(1); }
  return opts;
}

async function run() {
  const opts = parseArgs();
  const tab = await findTab(opts.tabUrl);
  
  console.error(`Executing ${opts.method} ${opts.url} in tab: ${tab.url.slice(0, 60)}...`);
  
  const fetchOpts = {
    method: opts.method,
    headers: opts.headers,
  };
  if (opts.body && opts.method !== 'GET') {
    fetchOpts.body = opts.body;
    if (!fetchOpts.headers['content-type'] && !fetchOpts.headers['Content-Type']) {
      fetchOpts.headers['Content-Type'] = 'application/json';
    }
  }
  
  const expression = `
    (async function() {
      try {
        const resp = await fetch(${JSON.stringify(opts.url)}, ${JSON.stringify(fetchOpts)});
        const text = await resp.text();
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
  
  if (parsed.error) {
    console.error('Error:', parsed.error);
    process.exit(1);
  }
  
  // Output response
  console.log(`HTTP ${parsed.status} ${parsed.statusText}`);
  console.log('---');
  
  // Try to pretty-print JSON
  try {
    const json = JSON.parse(parsed.body);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(parsed.body);
  }
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
