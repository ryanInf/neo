#!/usr/bin/env node
// neo-schema.js — Analyze Neo captures and generate API schema for a domain
// Usage: node neo-schema.cjs <domain>

const WebSocket = require('ws');

const CDP_URL = 'http://localhost:9222';
const DB_NAME = 'neo-capture-v01';
const STORE_NAME = 'capturedRequests';

async function findNeoSW() {
  const res = await fetch(`${CDP_URL}/json/list`);
  const tabs = await res.json();
  const sw = tabs.find(t => t.url.includes('ikikhldfkbfmcbandaagjomhchlehjap'));
  if (!sw) throw new Error('Neo SW not found');
  return sw.webSocketDebuggerUrl;
}

function cdpEval(wsUrl, expr) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 15000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      setTimeout(() => {
        ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
      }, 300);
    });
    ws.on('message', raw => {
      const msg = JSON.parse(raw.toString());
      if (msg.id === 2) { clearTimeout(timer); ws.close(); resolve(msg.result?.result?.value); }
    });
    ws.on('error', err => { clearTimeout(timer); reject(err); });
  });
}

// Parameterize URL paths: /4ier/neo/issues → /{owner}/{repo}/issues
function parameterizePath(paths) {
  if (paths.length <= 1) return paths[0] || '/';
  
  // Split each path into segments
  const segmented = paths.map(p => p.split('/').filter(Boolean));
  if (segmented.length < 2) return paths[0];
  
  // Find common structure
  const maxLen = Math.max(...segmented.map(s => s.length));
  const pattern = [];
  
  for (let i = 0; i < maxLen; i++) {
    const values = new Set(segmented.filter(s => s[i]).map(s => s[i]));
    if (values.size === 1) {
      pattern.push([...values][0]);
    } else if (values.size <= 3 && segmented.every(s => s[i])) {
      // Few unique values — likely an enum parameter
      pattern.push(`{param${i}}`);
    } else {
      pattern.push(`{param${i}}`);
    }
  }
  
  return '/' + pattern.join('/');
}

// Group captures by endpoint pattern
function analyzeEndpoints(captures) {
  // Group by method + path pattern
  const groups = {};
  
  for (const cap of captures) {
    try {
      const url = new URL(cap.url);
      const key = `${cap.method} ${url.pathname}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(cap);
    } catch { continue; }
  }
  
  const endpoints = [];
  
  for (const [key, caps] of Object.entries(groups)) {
    const [method, path] = [key.split(' ')[0], key.slice(key.indexOf(' ') + 1)];
    const sample = caps[0];
    
    // Analyze query parameters across all requests
    const queryParams = new Set();
    for (const c of caps) {
      try {
        const url = new URL(c.url);
        for (const k of url.searchParams.keys()) queryParams.add(k);
      } catch {}
    }
    
    // Analyze request headers (find common non-standard headers)
    const headerFreq = {};
    for (const c of caps) {
      for (const h of Object.keys(c.requestHeaders || {})) {
        headerFreq[h] = (headerFreq[h] || 0) + 1;
      }
    }
    const commonHeaders = Object.entries(headerFreq)
      .filter(([, count]) => count >= caps.length * 0.5)
      .map(([h]) => h)
      .filter(h => !['accept', 'content-type', 'accept-language', 'accept-encoding'].includes(h.toLowerCase()));
    
    // Analyze response body structure
    let responseStructure = null;
    if (sample.responseBody && typeof sample.responseBody === 'object') {
      responseStructure = describeStructure(sample.responseBody);
    } else if (typeof sample.responseBody === 'string') {
      try {
        const parsed = JSON.parse(sample.responseBody);
        responseStructure = describeStructure(parsed);
      } catch {
        responseStructure = 'text';
      }
    }
    
    // Status code distribution
    const statusCodes = {};
    for (const c of caps) {
      statusCodes[c.responseStatus] = (statusCodes[c.responseStatus] || 0) + 1;
    }
    
    endpoints.push({
      method,
      path,
      queryParams: [...queryParams],
      requiredHeaders: commonHeaders,
      sampleHeaders: sample.requestHeaders,
      statusCodes,
      responseStructure,
      callCount: caps.length,
      avgDuration: Math.round(caps.reduce((sum, c) => sum + (c.duration || 0), 0) / caps.length),
      hasRequestBody: caps.some(c => c.requestBody != null && c.requestBody !== ''),
    });
  }
  
  return endpoints.sort((a, b) => b.callCount - a.callCount);
}

function describeStructure(obj, depth = 0) {
  if (depth > 3) return '...';
  if (obj === null) return 'null';
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    return [describeStructure(obj[0], depth + 1)];
  }
  if (typeof obj === 'object') {
    const result = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = typeof v === 'object' ? describeStructure(v, depth + 1) : typeof v;
    }
    return result;
  }
  return typeof obj;
}

async function run() {
  const domain = process.argv[2];
  if (!domain) { console.error('Usage: neo-schema <domain>'); process.exit(1); }
  
  const wsUrl = await findNeoSW();
  
  // Fetch all captures for this domain — in batches to avoid serialization issues
  const countStr = await cdpEval(wsUrl, `new Promise(function(r){var q=indexedDB.open("${DB_NAME}");q.onsuccess=function(){var db=q.result;var tx=db.transaction("${STORE_NAME}","readonly");var idx=tx.objectStore("${STORE_NAME}").index("domain");var c=idx.count("${domain}");c.onsuccess=function(){r(String(c.result));};};setTimeout(function(){r("0");},5e3);})`);
  
  const count = parseInt(countStr) || 0;
  console.error(`Found ${count} captures for ${domain}`);
  
  if (count === 0) {
    console.log(JSON.stringify({ domain, error: 'No captures found. Browse the site first.' }, null, 2));
    return;
  }
  
  // Fetch captures in small batches (to avoid CDP message size limits)
  const allCaptures = [];
  const batchSize = 5;
  
  for (let offset = 0; offset < count; offset += batchSize) {
    const batch = await cdpEval(wsUrl, `new Promise(function(r){var q=indexedDB.open("${DB_NAME}");q.onsuccess=function(){var db=q.result;var tx=db.transaction("${STORE_NAME}","readonly");var idx=tx.objectStore("${STORE_NAME}").index("domain");var cur=idx.openCursor("${domain}");var items=[];var skip=${offset};var limit=${batchSize};var i=0;cur.onsuccess=function(e){var c=e.target.result;if(c){if(i>=skip&&items.length<limit){var v=c.value;var safe={method:v.method,url:v.url,domain:v.domain,responseStatus:v.responseStatus,duration:v.duration,requestHeaders:v.requestHeaders,requestBody:typeof v.requestBody==="string"?v.requestBody.slice(0,500):v.requestBody,responseBody:typeof v.responseBody==="string"?v.responseBody.slice(0,500):v.responseBody,source:v.source,trigger:v.trigger};items.push(safe);}i++;c.continue();}else{r(JSON.stringify(items));}};};setTimeout(function(){r("[]");},8e3);})`);
    
    try {
      const parsed = JSON.parse(batch);
      allCaptures.push(...parsed);
    } catch {}
  }
  
  console.error(`Loaded ${allCaptures.length} captures`);
  
  // Analyze
  const endpoints = analyzeEndpoints(allCaptures);
  
  const schema = {
    domain,
    generatedAt: new Date().toISOString(),
    totalCaptures: allCaptures.length,
    uniqueEndpoints: endpoints.length,
    endpoints: endpoints.map(ep => ({
      method: ep.method,
      path: ep.path,
      queryParams: ep.queryParams.length ? ep.queryParams : undefined,
      requiredHeaders: ep.requiredHeaders.length ? ep.requiredHeaders : undefined,
      sampleHeaders: ep.sampleHeaders,
      statusCodes: ep.statusCodes,
      responseStructure: ep.responseStructure,
      avgDuration: ep.avgDuration + 'ms',
      callCount: ep.callCount,
      hasRequestBody: ep.hasRequestBody || undefined,
    })),
  };
  
  console.log(JSON.stringify(schema, null, 2));
}

run().catch(err => { console.error('Error:', err.message); process.exit(1); });
