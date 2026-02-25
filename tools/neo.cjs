#!/usr/bin/env node
// neo — CLI for Neo, the web app API discovery & execution tool
//
// Usage:
//   neo status                              Overview of captured data
//   neo capture list [domain] [--limit N]   List captured API calls
//   neo capture count                       Total capture count
//   neo capture domains                     List domains with counts
//   neo capture detail <id>                 Show full capture details
//   neo capture clear [domain]              Clear captures
//   neo capture export [domain]             Export captures as JSON
//   neo schema generate <domain>            Generate API schema from captures
//   neo schema show <domain>                Show cached schema
//   neo exec <url> [options]                Execute fetch in browser tab context
//   neo eval <js> --tab <pattern>           Evaluate JS in page context
//   neo open <url>                          Open URL in Chrome
//   neo read <tab-pattern>                  Extract readable text from page

const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CDP_URL = process.env.NEO_CDP_URL || 'http://localhost:9222';
const DB_NAME = 'neo-capture-v01';
const STORE_NAME = 'capturedRequests';
const NEO_EXTENSION_ID = process.env.NEO_EXTENSION_ID || 'ikikhldfkbfmcbandaagjomhchlehjap';
const SCHEMA_DIR = process.env.NEO_SCHEMA_DIR || path.join(process.env.HOME, 'clawd/skills/neo/schemas');

// ─── CDP Helpers ────────────────────────────────────────────────

async function findExtensionWs() {
  const tabs = await (await fetch(`${CDP_URL}/json/list`)).json();
  const sw = tabs.find(t => t.url.includes(NEO_EXTENSION_ID));
  if (!sw) throw new Error('Neo extension service worker not found. Is it installed and active?');
  return sw.webSocketDebuggerUrl;
}

async function findTab(pattern) {
  const tabs = await (await fetch(`${CDP_URL}/json/list`)).json();
  if (pattern) {
    const tab = tabs.find(t => t.type === 'page' && t.url.includes(pattern));
    if (!tab) throw new Error(`No tab matching "${pattern}"`);
    return tab;
  }
  const pages = tabs.filter(t => t.type === 'page');
  if (!pages.length) throw new Error('No browser tabs found');
  return pages[0];
}

function cdpEval(wsUrl, expression, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('CDP timeout')); }, timeout);
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

function dbEval(body) {
  return `new Promise(function(resolve) {
    var req = indexedDB.open("${DB_NAME}");
    req.onsuccess = function() {
      var db = req.result;
      var tx = db.transaction("${STORE_NAME}", "readonly");
      var store = tx.objectStore("${STORE_NAME}");
      ${body}
    };
    req.onerror = function() { resolve("Error: " + req.error); };
    setTimeout(function() { resolve("timeout"); }, 10000);
  })`;
}

// ─── CLI Parsing ────────────────────────────────────────────────

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { flags[key] = next; i++; }
      else { flags[key] = true; }
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, flags };
}

// ─── Commands ───────────────────────────────────────────────────

const commands = {};

// neo status
commands.status = async function() {
  const wsUrl = await findExtensionWs();
  const count = await cdpEval(wsUrl, dbEval(`
    store.count().onsuccess = function(e) { resolve(String(e.target.result)); };
  `));
  const domains = await cdpEval(wsUrl, dbEval(`
    var map = {};
    store.openCursor().onsuccess = function(e) {
      var c = e.target.result;
      if (c) { map[c.value.domain] = (map[c.value.domain] || 0) + 1; c.continue(); }
      else {
        var sorted = Object.entries(map).sort(function(a,b){ return b[1]-a[1]; });
        resolve(sorted.map(function(d){ return d[0] + ": " + d[1]; }).join("\\n"));
      }
    };
  `));
  console.log(`Total captures: ${count}\n`);
  console.log(domains || '(no captures)');
};

// neo capture <action>
commands.capture = async function(args) {
  const { positional, flags } = parseArgs(args);
  const action = positional[0];
  const wsUrl = await findExtensionWs();

  switch (action) {
    case 'count': {
      const r = await cdpEval(wsUrl, dbEval(`
        store.count().onsuccess = function(e) { resolve(String(e.target.result)); };
      `));
      console.log(r);
      break;
    }

    case 'domains': {
      const r = await cdpEval(wsUrl, dbEval(`
        var map = {};
        store.openCursor().onsuccess = function(e) {
          var c = e.target.result;
          if (c) { map[c.value.domain] = (map[c.value.domain] || 0) + 1; c.continue(); }
          else {
            var sorted = Object.entries(map).sort(function(a,b){ return b[1]-a[1]; });
            resolve(sorted.map(function(d){ return d[0] + ": " + d[1]; }).join("\\n"));
          }
        };
      `));
      console.log(r || '(no captures)');
      break;
    }

    case 'list': {
      const domain = positional[1];
      const limit = parseInt(flags.limit) || 20;
      const r = await cdpEval(wsUrl, dbEval(`
        var rows = [], domain = ${domain ? JSON.stringify(domain) : 'null'}, limit = ${limit};
        store.openCursor(null, "prev").onsuccess = function(e) {
          var c = e.target.result;
          if (c && rows.length < limit) {
            var v = c.value;
            if (!domain || v.domain === domain) {
              rows.push(v.method + " " + v.responseStatus + " " + v.url.slice(0, 100) + " (" + v.duration + "ms)");
            }
            c.continue();
          } else { resolve(rows.join("\\n")); }
        };
      `));
      console.log(r || '(no captures)');
      break;
    }

    case 'detail': {
      const id = positional[1];
      if (!id) { console.error('Usage: neo capture detail <id>'); process.exit(1); }
      const r = await cdpEval(wsUrl, dbEval(`
        store.get(${JSON.stringify(id)}).onsuccess = function(e) {
          var v = e.target.result;
          if (!v) { resolve("Not found"); return; }
          if (v.responseBody && typeof v.responseBody === "string" && v.responseBody.length > 5000)
            v.responseBody = v.responseBody.slice(0, 5000) + "... [truncated]";
          resolve(JSON.stringify(v, null, 2));
        };
      `));
      console.log(r);
      break;
    }

    case 'clear': {
      const domain = positional[1];
      if (domain) {
        const r = await cdpEval(wsUrl, `new Promise(function(resolve) {
          var req = indexedDB.open("${DB_NAME}");
          req.onsuccess = function() {
            var db = req.result;
            var tx = db.transaction("${STORE_NAME}", "readwrite");
            var store = tx.objectStore("${STORE_NAME}");
            var idx = store.index("domain");
            var deleted = 0;
            idx.openCursor(IDBKeyRange.only(${JSON.stringify(domain)})).onsuccess = function(e) {
              var c = e.target.result;
              if (c) { c.delete(); deleted++; c.continue(); }
              else { resolve("Deleted " + deleted + " captures for ${domain}"); }
            };
          };
          setTimeout(function() { resolve("timeout"); }, 10000);
        })`);
        console.log(r);
      } else {
        const r = await cdpEval(wsUrl, `new Promise(function(resolve) {
          var req = indexedDB.open("${DB_NAME}");
          req.onsuccess = function() {
            var db = req.result;
            var tx = db.transaction("${STORE_NAME}", "readwrite");
            tx.objectStore("${STORE_NAME}").clear().onsuccess = function() { resolve("Cleared all captures"); };
          };
          setTimeout(function() { resolve("timeout"); }, 5000);
        })`);
        console.log(r);
      }
      break;
    }

    case 'export': {
      const domain = positional[1];
      const r = await cdpEval(wsUrl, dbEval(`
        var rows = [], domain = ${domain ? JSON.stringify(domain) : 'null'};
        store.openCursor().onsuccess = function(e) {
          var c = e.target.result;
          if (c) {
            var v = c.value;
            if (!domain || v.domain === domain) {
              if (v.responseBody && typeof v.responseBody === "string" && v.responseBody.length > 2000)
                v.responseBody = v.responseBody.slice(0, 2000) + "...[truncated]";
              rows.push(v);
            }
            c.continue();
          } else { resolve(JSON.stringify(rows)); }
        };
      `), 60000);
      try {
        const parsed = JSON.parse(r);
        console.log(JSON.stringify(parsed, null, 2));
      } catch { console.log(r); }
      break;
    }

    default:
      console.log(`neo capture — Manage captured API traffic

  neo capture list [domain] [--limit N]   List recent captures
  neo capture count                       Total capture count
  neo capture domains                     List domains with counts
  neo capture detail <id>                 Show full capture details
  neo capture clear [domain]              Clear captures (all or by domain)
  neo capture export [domain]             Export captures as JSON`);
  }
};

// neo schema <action>
commands.schema = async function(args) {
  const { positional, flags } = parseArgs(args);
  const action = positional[0];

  switch (action) {
    case 'generate': {
      const domain = positional[1];
      if (!domain) { console.error('Usage: neo schema generate <domain>'); process.exit(1); }
      
      const wsUrl = await findExtensionWs();
      // Fetch captures for this domain
      const raw = await cdpEval(wsUrl, dbEval(`
        var rows = [];
        var idx = store.index("domain");
        idx.openCursor(IDBKeyRange.only(${JSON.stringify(domain)})).onsuccess = function(e) {
          var c = e.target.result;
          if (c) {
            var v = c.value;
            // Strip large bodies for schema analysis
            var entry = {
              method: v.method, url: v.url, domain: v.domain,
              requestHeaders: v.requestHeaders || {},
              responseStatus: v.responseStatus,
              responseHeaders: v.responseHeaders || {},
              duration: v.duration,
              requestBody: null, responseBody: null
            };
            // Keep small bodies for structure analysis
            if (v.requestBody) {
              var rb = typeof v.requestBody === "string" ? v.requestBody : JSON.stringify(v.requestBody);
              entry.requestBody = rb.length > 500 ? rb.slice(0, 500) : rb;
            }
            if (v.responseBody) {
              var rsb = typeof v.responseBody === "string" ? v.responseBody : JSON.stringify(v.responseBody);
              entry.responseBody = rsb.length > 500 ? rsb.slice(0, 500) : rsb;
            }
            rows.push(entry);
            c.continue();
          } else { resolve(JSON.stringify(rows)); }
        };
      `), 30000);
      
      let captures;
      try { captures = JSON.parse(raw); } catch { console.error('Failed to parse captures'); process.exit(1); }
      if (!captures.length) { console.error(`No captures for ${domain}`); process.exit(1); }
      
      // Analyze captures into schema
      const endpoints = new Map();
      for (const cap of captures) {
        const url = new URL(cap.url);
        const pathKey = `${cap.method} ${url.pathname}`;
        if (!endpoints.has(pathKey)) {
          endpoints.set(pathKey, {
            method: cap.method,
            path: url.pathname,
            queryParams: new Set(),
            statusCodes: {},
            headers: {},
            durations: [],
            count: 0,
            responseType: null,
          });
        }
        const ep = endpoints.get(pathKey);
        ep.count++;
        
        // Query params
        for (const k of url.searchParams.keys()) ep.queryParams.add(k);
        
        // Status codes
        ep.statusCodes[cap.responseStatus] = (ep.statusCodes[cap.responseStatus] || 0) + 1;
        
        // Auth-relevant headers
        const authHeaders = ['authorization', 'x-csrf-token', 'x-twitter-auth-type',
          'x-requested-with', 'x-github-client-version', 'cookie'];
        for (const [k, v] of Object.entries(cap.requestHeaders)) {
          if (authHeaders.some(ah => k.toLowerCase().includes(ah.toLowerCase().replace('-', '')))) {
            ep.headers[k] = v;
          }
        }
        
        // Duration
        if (cap.duration) ep.durations.push(cap.duration);
        
        // Response type
        const ct = cap.responseHeaders['content-type'] || '';
        if (ct.includes('json')) ep.responseType = 'json';
        else if (ct.includes('text')) ep.responseType = 'text';
        else if (ct.includes('html')) ep.responseType = 'html';
      }
      
      const schema = {
        domain,
        generatedAt: new Date().toISOString(),
        totalCaptures: captures.length,
        uniqueEndpoints: endpoints.size,
        endpoints: Array.from(endpoints.values())
          .sort((a, b) => b.count - a.count)
          .map(ep => ({
            method: ep.method,
            path: ep.path,
            callCount: ep.count,
            queryParams: Array.from(ep.queryParams),
            statusCodes: ep.statusCodes,
            avgDuration: ep.durations.length
              ? Math.round(ep.durations.reduce((a, b) => a + b, 0) / ep.durations.length) + 'ms'
              : null,
            authHeaders: Object.keys(ep.headers).length ? ep.headers : undefined,
            responseType: ep.responseType,
          }))
      };
      
      // Save to schema dir
      fs.mkdirSync(SCHEMA_DIR, { recursive: true });
      const outFile = path.join(SCHEMA_DIR, `${domain}.json`);
      fs.writeFileSync(outFile, JSON.stringify(schema, null, 2));
      console.error(`Schema saved to ${outFile}`);
      console.log(JSON.stringify(schema, null, 2));
      break;
    }

    case 'show': {
      const domain = positional[1];
      if (!domain) { console.error('Usage: neo schema show <domain>'); process.exit(1); }
      const file = path.join(SCHEMA_DIR, `${domain}.json`);
      if (!fs.existsSync(file)) {
        console.error(`No schema for ${domain}. Run: neo schema generate ${domain}`);
        process.exit(1);
      }
      console.log(fs.readFileSync(file, 'utf8'));
      break;
    }

    default:
      console.log(`neo schema — API schema management

  neo schema generate <domain>    Generate schema from captures (saves to skill dir)
  neo schema show <domain>        Show cached schema`);
  }
};

// neo exec <url> [options]
commands.exec = async function(args) {
  const { positional, flags } = parseArgs(args);
  const url = positional[0];
  if (!url) { console.error('Usage: neo exec <url> [--method POST] [--header "K: V"] [--body "{}"] [--tab pattern] [--auto-headers]'); process.exit(1); }

  const method = (flags.method || 'GET').toUpperCase();
  const tabPattern = flags.tab || flags['tab-url'] || null;
  const body = flags.body || null;
  const headers = {};

  // Parse --header flags (may appear multiple times in raw argv)
  const rawArgs = process.argv.slice(3); // skip node, script, 'exec'
  for (let i = 0; i < rawArgs.length; i++) {
    if (rawArgs[i] === '--header' && rawArgs[i + 1]) {
      const h = rawArgs[++i];
      const colon = h.indexOf(':');
      if (colon > 0) headers[h.slice(0, colon).trim()] = h.slice(colon + 1).trim();
    }
  }

  // Auto-detect auth headers from captures
  if (flags['auto-headers'] !== undefined || !Object.keys(headers).some(k => k.toLowerCase() === 'authorization')) {
    try {
      const domain = new URL(url).hostname;
      const wsUrl = await findExtensionWs();
      const raw = await cdpEval(wsUrl, dbEval(`
        var found = null;
        store.openCursor(null, "prev").onsuccess = function(e) {
          var c = e.target.result;
          if (c) {
            var v = c.value;
            if (v.domain === "${domain}" && v.responseStatus >= 200 && v.responseStatus < 300 && Object.keys(v.requestHeaders).length > 2) {
              found = v.requestHeaders;
              resolve(JSON.stringify(found));
              return;
            }
            c.continue();
          } else { resolve("{}"); }
        };
      `));
      const autoHeaders = JSON.parse(raw);
      const authKeys = ['authorization', 'x-csrf-token', 'x-twitter-auth-type', 'x-twitter-active-user',
        'x-twitter-client-language', 'x-client-transaction-id', 'x-requested-with',
        'github-verified-fetch', 'x-fetch-nonce'];
      for (const [k, v] of Object.entries(autoHeaders)) {
        if (authKeys.includes(k.toLowerCase()) || k.toLowerCase().startsWith('x-csrf') || k.toLowerCase().startsWith('x-twitter')) {
          if (!headers[k]) headers[k] = v;
        }
      }
      const autoCount = Object.keys(headers).length;
      if (autoCount > 0) console.error(`Auto-detected ${autoCount} auth headers from captures`);
    } catch {}
  }

  const tab = await findTab(tabPattern);
  console.error(`${method} ${url.slice(0, 80)}... → tab: ${tab.url.slice(0, 50)}...`);

  const fetchOpts = { method, headers, credentials: 'include' };
  if (body && method !== 'GET') {
    fetchOpts.body = body;
    if (!headers['content-type'] && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  const result = await cdpEval(tab.webSocketDebuggerUrl, `
    (async function() {
      try {
        var resp = await fetch(${JSON.stringify(url)}, ${JSON.stringify(fetchOpts)});
        var text = await resp.text();
        return JSON.stringify({
          status: resp.status, statusText: resp.statusText,
          headers: Object.fromEntries(resp.headers.entries()),
          body: text.length > 50000 ? text.slice(0, 50000) + '...[truncated]' : text
        });
      } catch (err) { return JSON.stringify({ error: err.message }); }
    })()
  `);

  const parsed = JSON.parse(result);
  if (parsed.error) { console.error('Error:', parsed.error); process.exit(1); }
  console.log(`HTTP ${parsed.status} ${parsed.statusText}`);
  console.log('---');
  try { console.log(JSON.stringify(JSON.parse(parsed.body), null, 2)); }
  catch { console.log(parsed.body); }
};

// neo eval <js> --tab <pattern>
commands.eval = async function(args) {
  const { positional, flags } = parseArgs(args);
  const js = positional.join(' ');
  if (!js) { console.error('Usage: neo eval "<js>" --tab <pattern>'); process.exit(1); }
  const tab = await findTab(flags.tab || flags['tab-url'] || null);
  console.error(`Evaluating in: ${tab.url.slice(0, 60)}...`);
  const result = await cdpEval(tab.webSocketDebuggerUrl, `
    (async function() {
      try { var r = await (${js}); return typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r); }
      catch(e) { return 'Error: ' + e.message; }
    })()
  `);
  console.log(result);
};

// neo open <url>
commands.open = async function(args) {
  const url = args[0];
  if (!url) { console.error('Usage: neo open <url>'); process.exit(1); }
  const res = await fetch(`${CDP_URL}/json/new?${url}`, { method: 'PUT' });
  const tab = await res.json();
  console.log(`Opened: ${tab.url}`);
};

// neo read <tab-pattern>
commands.read = async function(args) {
  const pattern = args[0];
  if (!pattern) { console.error('Usage: neo read <tab-pattern>'); process.exit(1); }
  const tab = await findTab(pattern);
  const result = await cdpEval(tab.webSocketDebuggerUrl, `
    (function() {
      var main = document.querySelector('main, article, [role="main"], .content, #content');
      var el = main || document.body;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
          var p = node.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          var t = p.tagName.toLowerCase();
          if (['script','style','noscript','svg','path'].includes(t)) return NodeFilter.FILTER_REJECT;
          if (p.offsetHeight === 0 || p.hidden) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var texts = [], n;
      while (n = walker.nextNode()) { var t = n.textContent.trim(); if (t.length > 1) texts.push(t); }
      return 'Title: ' + document.title + '\\nURL: ' + location.href + '\\n\\n' + texts.join('\\n');
    })()
  `);
  console.log(result);
};

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (commands[cmd]) {
    await commands[cmd](args);
  } else {
    console.log(`Neo — Turn any web app into an API

Commands:
  neo status                              Overview of captured data
  neo capture list|count|domains|detail|clear|export
                                          Manage captured API traffic
  neo schema generate|show <domain>       API schema management
  neo exec <url> [options]                Execute fetch in browser context
  neo eval "<js>" --tab <pattern>         Evaluate JS in page context
  neo open <url>                          Open URL in Chrome
  neo read <tab-pattern>                  Extract readable text from page

Options (for exec):
  --method GET|POST|PUT|DELETE            HTTP method (default: GET)
  --header "Key: Value"                   Request header (repeatable)
  --body '{"key": "value"}'              Request body
  --tab <pattern>                         Match tab by URL pattern
  --auto-headers                          Auto-detect auth headers from captures

Environment:
  NEO_CDP_URL        Chrome DevTools URL (default: http://localhost:9222)
  NEO_EXTENSION_ID   Neo extension ID
  NEO_SCHEMA_DIR     Schema storage directory`);
  }
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
