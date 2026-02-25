#!/usr/bin/env node
// neo-query.js — Query Neo extension's captured API data via Chrome DevTools Protocol
// Usage: node neo-query.js [command] [args]
// Commands:
//   count                     - Count total captures
//   domains                   - List captured domains with counts  
//   list [domain] [limit]     - List captures, optionally filtered by domain
//   detail <id>               - Get full details of a capture by ID
//   clear                     - Clear all captures

const WebSocket = require('ws');

const CDP_URL = 'http://localhost:9222';
const NEO_EXT_ID = 'ikikhldfkbfmcbandaagjomhchlehjap';
const DB_NAME = 'neo-capture-v01';
const STORE_NAME = 'capturedRequests';

async function findNeoSW() {
  const res = await fetch(`${CDP_URL}/json/list`);
  const tabs = await res.json();
  const sw = tabs.find(t => t.url.includes(NEO_EXT_ID));
  if (!sw) throw new Error('Neo extension service worker not found. Is the extension installed and enabled?');
  return sw.webSocketDebuggerUrl;
}

function connectAndEval(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 10000);
    
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2, method: 'Runtime.evaluate',
          params: { expression, awaitPromise: true, returnByValue: true }
        }));
      }, 300);
    });
    
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === 2) {
        clearTimeout(timeout);
        ws.close();
        if (msg.result?.exceptionDetails) {
          reject(new Error(msg.result.exceptionDetails.text || 'eval error'));
        } else {
          resolve(msg.result?.result?.value);
        }
      }
    });
    
    ws.on('error', err => { clearTimeout(timeout); reject(err); });
  });
}

function dbEval(code) {
  // Wraps code in an IndexedDB open + transaction pattern
  return `new Promise(function(resolve) {
    var req = indexedDB.open("${DB_NAME}");
    req.onsuccess = function() {
      var db = req.result;
      var tx = db.transaction("${STORE_NAME}", "readonly");
      var store = tx.objectStore("${STORE_NAME}");
      ${code}
    };
    req.onerror = function() { resolve("DB open error"); };
    setTimeout(function() { resolve("timeout"); }, 8000);
  })`;
}

async function run() {
  const [,, cmd, ...args] = process.argv;
  const wsUrl = await findNeoSW();
  
  switch (cmd || 'count') {
    case 'count': {
      const result = await connectAndEval(wsUrl, dbEval(`
        var c = store.count();
        c.onsuccess = function() { resolve(String(c.result)); };
      `));
      console.log(`Total captures: ${result}`);
      break;
    }
    
    case 'domains': {
      const result = await connectAndEval(wsUrl, dbEval(`
        var cur = store.openCursor();
        var domains = {};
        cur.onsuccess = function(e) {
          var c = e.target.result;
          if (c) {
            var d = c.value.domain || "unknown";
            domains[d] = (domains[d] || 0) + 1;
            c.continue();
          } else {
            resolve(JSON.stringify(domains));
          }
        };
      `));
      const domains = JSON.parse(result);
      for (const [domain, count] of Object.entries(domains).sort((a, b) => b[1] - a[1])) {
        console.log(`${domain}: ${count}`);
      }
      break;
    }
    
    case 'list': {
      const domain = args[0];
      const limit = parseInt(args[1]) || 20;
      const result = await connectAndEval(wsUrl, dbEval(`
        var cur = store.openCursor();
        var rows = [];
        var domain = ${domain ? JSON.stringify(domain) : 'null'};
        var limit = ${limit};
        cur.onsuccess = function(e) {
          var c = e.target.result;
          if (c && rows.length < limit) {
            var v = c.value;
            if (!domain || v.domain === domain) {
              rows.push(v.method + " " + v.responseStatus + " " + v.url.slice(0, 80) + " " + v.duration + "ms");
            }
            c.continue();
          } else {
            resolve(rows.join("\\n"));
          }
        };
      `));
      console.log(result || '(no captures)');
      break;
    }
    
    case 'detail': {
      const id = args[0];
      if (!id) { console.error('Usage: neo-query detail <id>'); process.exit(1); }
      const result = await connectAndEval(wsUrl, dbEval(`
        var g = store.get(${JSON.stringify(id)});
        g.onsuccess = function() {
          if (g.result) {
            var v = g.result;
            if (v.responseBody && typeof v.responseBody === "string" && v.responseBody.length > 2000) {
              v.responseBody = v.responseBody.slice(0, 2000) + "... [truncated]";
            }
            resolve(JSON.stringify(v, null, 2));
          } else {
            resolve("Not found");
          }
        };
      `));
      console.log(result);
      break;
    }
    
    case 'clear': {
      const result = await connectAndEval(wsUrl, `new Promise(function(resolve) {
        var req = indexedDB.open("${DB_NAME}");
        req.onsuccess = function() {
          var db = req.result;
          var tx = db.transaction("${STORE_NAME}", "readwrite");
          tx.objectStore("${STORE_NAME}").clear().onsuccess = function() {
            resolve("Cleared all captures");
          };
        };
        setTimeout(function() { resolve("timeout"); }, 5000);
      })`);
      console.log(result);
      break;
    }
    
    default:
      console.log('Usage: neo-query [count|domains|list|detail|clear|export]');
      console.log('  export [domain]  — Export captures as JSON to stdout');
  }
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
