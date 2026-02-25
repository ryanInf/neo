#!/usr/bin/env node
// neo-web.cjs — High-level "do something on a website" tool
// Combines Neo API execution with DOM evaluation for complete web app control.
//
// Usage:
//   node neo-web.cjs status                          # Show Neo status (domains, capture counts)
//   node neo-web.cjs open <url>                      # Open URL in Chrome
//   node neo-web.cjs read <tab-pattern>              # Extract readable content from page
//   node neo-web.cjs api <url> [options]              # Execute API call (delegates to neo-exec)
//   node neo-web.cjs schema <domain>                 # Generate API schema (delegates to neo-schema)
//   node neo-web.cjs captures [domain] [limit]       # List captures (delegates to neo-query)
//   node neo-web.cjs eval <js> --tab-url <pattern>   # Evaluate JS in page context

const { execSync } = require('child_process');
const WebSocket = require('ws');
const path = require('path');

const CDP_URL = 'http://localhost:9222';
const TOOLS_DIR = path.dirname(__filename || __dirname);

function neo(tool, args) {
  const cmd = `node ${path.join(TOOLS_DIR, tool)} ${args}`;
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000, env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '' } });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

async function cdpEval(tabPattern, expression) {
  const tabs = await (await fetch(`${CDP_URL}/json/list`)).json();
  const tab = tabPattern
    ? tabs.find(t => t.type === 'page' && t.url.includes(tabPattern))
    : tabs.find(t => t.type === 'page');
  if (!tab) throw new Error(`No tab matching "${tabPattern}"`);

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 15000);
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
      if (msg.id === 2) { clearTimeout(timer); ws.close(); resolve(msg.result?.result?.value); }
    });
    ws.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

async function openUrl(url) {
  const res = await fetch(`${CDP_URL}/json/new?${url}`, { method: 'PUT' });
  const tab = await res.json();
  console.log(`Opened: ${tab.url}`);
}

async function readPage(tabPattern) {
  const result = await cdpEval(tabPattern, `
    (function() {
      var main = document.querySelector('main, article, [role="main"], .content, #content');
      var el = main || document.body;
      
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
          var parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          var tag = parent.tagName.toLowerCase();
          if (['script','style','noscript','svg','path'].includes(tag)) return NodeFilter.FILTER_REJECT;
          if (parent.offsetHeight === 0 || parent.hidden) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      
      var texts = [];
      var node;
      while (node = walker.nextNode()) {
        var t = node.textContent.trim();
        if (t.length > 1) texts.push(t);
      }
      
      return 'Title: ' + document.title + '\\nURL: ' + location.href + '\\n\\n' + texts.join('\\n');
    })()
  `);
  console.log(result);
}

async function run() {
  const [,, cmd, ...args] = process.argv;
  
  switch (cmd) {
    case 'status':
      console.log(neo('neo-query.cjs', 'count'));
      console.log(neo('neo-query.cjs', 'domains'));
      break;
      
    case 'open':
      if (!args[0]) { console.error('Usage: neo-web open <url>'); process.exit(1); }
      await openUrl(args[0]);
      break;
      
    case 'read':
      if (!args[0]) { console.error('Usage: neo-web read <tab-pattern>'); process.exit(1); }
      await readPage(args[0]);
      break;
      
    case 'api':
      const execArgs = args.includes('--auto-headers') ? args.join(' ') : args.join(' ') + ' --auto-headers';
      console.log(neo('neo-exec.cjs', execArgs));
      break;
      
    case 'schema':
      if (!args[0]) { console.error('Usage: neo-web schema <domain>'); process.exit(1); }
      console.log(neo('neo-schema.cjs', args[0]));
      break;
      
    case 'captures':
      console.log(neo('neo-query.cjs', 'list ' + args.join(' ')));
      break;
      
    case 'eval':
      if (!args[0]) { console.error('Usage: neo-web eval "<js>" --tab-url <pattern>'); process.exit(1); }
      const tabIdx = args.indexOf('--tab-url');
      const tabPattern = tabIdx >= 0 ? args[tabIdx + 1] : null;
      const js = args.filter((a, i) => i !== tabIdx && i !== tabIdx + 1).join(' ');
      const result = await cdpEval(tabPattern, `
        (async function() {
          try { var r = await (${js}); return typeof r === 'object' ? JSON.stringify(r, null, 2) : String(r); }
          catch(e) { return 'Error: ' + e.message; }
        })()
      `);
      console.log(result);
      break;
      
    default:
      console.log(`Neo — Control any website from the command line

Commands:
  status                          Show Neo capture status
  open <url>                      Open URL in Chrome
  read <tab-pattern>              Extract readable content from a page
  api <url> [--method X] [--body] Execute API call with auto auth headers
  schema <domain>                 Generate API schema from captures
  captures [domain] [limit]       List captured API calls
  eval "<js>" --tab-url <pattern> Evaluate JavaScript in page context
`);
  }
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
